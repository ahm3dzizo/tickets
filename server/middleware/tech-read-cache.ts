import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { APP_JWT_SECRET } from '../config.js';
import type { TechAuthRequest } from '../routes/tech-auth.js';

/**
 * Small server-side stale-safe cache for the technician app's hot GET endpoints.
 *
 * The mobile/PWA UI refreshes frequently. These payloads only change after a
 * known mutation, so repeatedly rebuilding them from Prisma wastes DB capacity.
 * Successful responses are kept in RAM and invalidated immediately after
 * relevant writes. Hot-read authentication is also cached briefly so a true
 * cache HIT can be served with zero Prisma queries while JWT verification still
 * happens on every request.
 */

const TTL_MS = 5 * 60_000;
const AUTH_TTL_MS = 60_000;
const MAX_ENTRIES = 500;
const DEFAULT_APPOINTMENT_PAST_DAYS = 14;
const DEFAULT_APPOINTMENT_FUTURE_DAYS = 45;

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

type AuthStateEntry = {
  expiresAt: number;
  isActive: boolean;
  profileCompleted: boolean;
};

const cache = new Map<string, CacheEntry>();
const authStateCache = new Map<string, AuthStateEntry>();

function normalizedQuery(req: Request): string {
  return Object.entries(req.query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const rendered = Array.isArray(value) ? value.join(',') : String(value ?? '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(rendered)}`;
    })
    .join('&');
}

function requestPath(req: Request): string {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function cacheKey(req: TechAuthRequest): string | null {
  if (!req.technicianId) return null;
  return `${req.technicianId}|${requestPath(req)}|${normalizedQuery(req)}`;
}

function pruneExpired(now = Date.now()) {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  for (const [key, entry] of authStateCache.entries()) {
    if (entry.expiresAt <= now) authStateCache.delete(key);
  }
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function invalidateTechReadCache(technicianId?: string | null) {
  if (!technicianId) {
    cache.clear();
    authStateCache.clear();
    return;
  }
  const prefix = `${technicianId}|`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  authStateCache.delete(technicianId);
}

/**
 * Lightweight auth for the three high-frequency read routes only.
 * JWT integrity is checked on every request. Database account state is cached
 * for at most 60 seconds and is invalidated immediately by technician/admin
 * mutations passing through this process.
 */
export async function requireCachedTechReadAuth(
  req: TechAuthRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = jwt.verify(header.slice(7), APP_JWT_SECRET) as any;
    if (payload.role !== 'technician' || !payload.technicianId) {
      res.status(403).json({ error: 'Forbidden: Technician only' });
      return;
    }

    const technicianId = String(payload.technicianId);
    const now = Date.now();
    let state = authStateCache.get(technicianId);

    if (!state || state.expiresAt <= now) {
      const tech = await prisma.technician.findUnique({
        where: { id: technicianId },
        select: { isActive: true, profileCompleted: true },
      });
      state = {
        expiresAt: now + AUTH_TTL_MS,
        isActive: Boolean(tech?.isActive),
        profileCompleted: Boolean(tech?.profileCompleted),
      };
      authStateCache.set(technicianId, state);
    }

    if (!state.isActive) {
      res.status(403).json({ code: 'TECHNICIAN_DISABLED', error: 'حساب الفني غير نشط.' });
      return;
    }
    if (!state.profileCompleted) {
      res.status(403).json({ code: 'PROFILE_INCOMPLETE', error: 'أكمل الملف الشخصي أولاً قبل استخدام تطبيق الفني.' });
      return;
    }

    req.technicianId = technicianId;
    next();
  } catch (err: any) {
    if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    console.error('[tech-read-cache] auth error:', err);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

function riyadhDateString(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDateDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * The old tech client omitted date filters and therefore downloaded every
 * historical/future appointment (plus nested tickets) every refresh. Keep a
 * useful operational window by default while preserving explicit date/from/to
 * queries for future history screens.
 */
export function applyDefaultTechAppointmentWindow(
  req: TechAuthRequest,
  _res: Response,
  next: NextFunction,
) {
  if (!req.query.date && !req.query.from && !req.query.to) {
    const today = riyadhDateString();
    req.query.from = addDateDays(today, -DEFAULT_APPOINTMENT_PAST_DAYS);
    req.query.to = addDateDays(today, DEFAULT_APPOINTMENT_FUTURE_DAYS);
  }
  next();
}

/**
 * Mount only after requireCachedTechReadAuth. A cache HIT never reaches
 * Prisma-backed route handlers; a MISS lets the normal handler execute and
 * captures its JSON.
 */
export function techReadResponseCache(req: TechAuthRequest, res: Response, next: NextFunction) {
  if (req.method !== 'GET') {
    next();
    return;
  }

  const key = cacheKey(req);
  if (!key) {
    next();
    return;
  }

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    res.setHeader('X-Tech-Read-Cache', 'HIT');
    res.json(hit.payload);
    return;
  }
  if (hit) cache.delete(key);

  const originalJson = res.json.bind(res);
  res.json = ((payload: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(key, { payload, expiresAt: Date.now() + TTL_MS });
      pruneExpired();
      res.setHeader('X-Tech-Read-Cache', 'MISS');
    }
    return originalJson(payload);
  }) as Response['json'];

  next();
}

/**
 * Invalidate cached technician views after writes that can change appointments,
 * tickets, work sessions, shifts, technician assignments, or technician state.
 * For technician-authenticated writes we invalidate only that technician. Admin /
 * supervisor writes invalidate the small shared cache because they may affect any
 * technician's assignment list or account state.
 */
export function invalidateTechReadCacheAfterMutation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    next();
    return;
  }

  const path = requestPath(req);
  const relevant =
    path.startsWith('/api/shift/') ||
    path.startsWith('/api/tech/appointments') ||
    path.startsWith('/api/tech/profile') ||
    path.startsWith('/api/tech/language') ||
    path.startsWith('/api/appointments') ||
    path.startsWith('/api/tickets') ||
    path.startsWith('/api/technicians');

  if (!relevant) {
    next();
    return;
  }

  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    const technicianId = (req as TechAuthRequest).technicianId;
    if (path.startsWith('/api/shift/') || path.startsWith('/api/tech/')) {
      invalidateTechReadCache(technicianId || null);
    } else {
      invalidateTechReadCache();
    }
  });

  next();
}
