import type { NextFunction, Request, Response } from 'express';
import type { TechAuthRequest } from '../routes/tech-auth.js';

/**
 * Small server-side stale-safe cache for the technician app's hot GET endpoints.
 *
 * The mobile/PWA UI refreshes frequently. These payloads only change after a
 * known mutation, so repeatedly rebuilding them from Prisma wastes DB capacity.
 * We keep successful JSON responses in RAM and invalidate them immediately after
 * relevant writes. Authentication still runs before this middleware, so cached
 * data is always scoped to the authenticated technician.
 */

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 500;

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const cache = new Map<string, CacheEntry>();

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
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function invalidateTechReadCache(technicianId?: string | null) {
  if (!technicianId) {
    cache.clear();
    return;
  }
  const prefix = `${technicianId}|`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * Mount only after requireTechAuth. A cache HIT never reaches Prisma-backed
 * route handlers; a MISS lets the normal handler execute and captures its JSON.
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
 * technician's assignment list.
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
