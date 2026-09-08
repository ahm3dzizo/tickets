import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../auth.js";

const DEFAULT_TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 12;
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const TICKET_MUTATION_PREFIXES = [
  "/api/tickets",
  "/api/appointments",
  "/api/import-excel",
  "/api/classify",
  "/api/whatsapp",
  "/api/whatsapp-bot",
  "/api/users",
  "/api/shift",
  "/api/tech/appointments",
];

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const TTL_MS = parsePositiveInt(process.env.TICKET_SERVER_CACHE_TTL_MS, DEFAULT_TTL_MS);

interface TicketListCacheEntry {
  data: unknown[];
  createdAt: number;
  expiresAt: number;
}

const ticketListCache = new Map<string, TicketListCacheEntry>();

function normalizedQuery(req: AuthRequest): string {
  const pairs: string[] = [];
  for (const [key, rawValue] of Object.entries(req.query)) {
    if (rawValue === undefined) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value === undefined) continue;
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return pairs.sort().join("&");
}

function cacheKey(req: AuthRequest): string {
  return `${req.uid || "anonymous"}|${normalizedQuery(req) || "__all__"}`;
}

function touch(key: string, entry: TicketListCacheEntry) {
  ticketListCache.delete(key);
  ticketListCache.set(key, entry);
}

function enforceMaxEntries() {
  while (ticketListCache.size > MAX_ENTRIES) {
    const oldest = ticketListCache.keys().next().value as string | undefined;
    if (!oldest) break;
    ticketListCache.delete(oldest);
  }
}

export function invalidateTicketListResponseCache(): void {
  if (ticketListCache.size > 0) {
    ticketListCache.clear();
  }
}

export function getTicketListCacheStats() {
  return {
    entries: ticketListCache.size,
    ttlMs: TTL_MS,
    maxEntries: MAX_ENTRIES,
  };
}

/**
 * Clears the ticket-list response cache after successful mutations from any
 * API surface that can indirectly change ticket list data.
 */
export function invalidateTicketCacheAfterRelevantMutation(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!MUTATION_METHODS.has(req.method)) {
    next();
    return;
  }

  const pathname = req.originalUrl.split("?", 1)[0] || "";
  if (!TICKET_MUTATION_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    next();
    return;
  }

  res.once("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      invalidateTicketListResponseCache();
    }
  });

  next();
}

/**
 * Server-side cache for GET /api/tickets only.
 *
 * requireAuth must run before this middleware so cached responses are still
 * protected by normal JWT validation. Cache keys are scoped by uid + query.
 */
export function ticketListResponseCache(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const isListGet = req.method === "GET" && (req.path === "/" || req.path === "");

  if (!isListGet) {
    next();
    return;
  }

  if (!req.uid) {
    next();
    return;
  }

  const key = cacheKey(req);
  const now = Date.now();
  const cached = ticketListCache.get(key);

  if (cached && cached.expiresAt > now) {
    touch(key, cached);
    res.setHeader("X-Tickets-Cache", "HIT");
    res.setHeader("X-Tickets-Cache-Age", String(Math.max(0, Math.floor((now - cached.createdAt) / 1000))));
    res.json(cached.data);
    return;
  }

  if (cached) ticketListCache.delete(key);

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (
      res.statusCode >= 200 &&
      res.statusCode < 300 &&
      Array.isArray(body)
    ) {
      const entry: TicketListCacheEntry = {
        data: body,
        createdAt: Date.now(),
        expiresAt: Date.now() + TTL_MS,
      };
      touch(key, entry);
      enforceMaxEntries();
    }
    return originalJson(body);
  }) as typeof res.json;

  res.setHeader("X-Tickets-Cache", "MISS");
  next();
}
