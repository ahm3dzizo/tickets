/**
 * Stale-while-revalidate ticket cache.
 *
 * - Returns cached data instantly while fetching fresh data in the background.
 * - Cache entries expire after CACHE_TTL_MS; background revalidation starts
 *   after STALE_AFTER_MS even if data is still considered "fresh".
 * - Call invalidate() (or pass a key wildcard) after any mutation so the next
 *   getAll() always fetches fresh data.
 */

const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 min — hard expiry
const STALE_AFTER_MS = 60 * 1000;     // 1 min — trigger background refresh

type CacheKey = string;

interface CacheEntry {
  data: any[];
  fetchedAt: number;
  /** in-flight promise so multiple callers share one request */
  inflight?: Promise<any[]>;
}

const store = new Map<CacheKey, CacheEntry>();

function buildKey(params?: Record<string, string | string[] | boolean | undefined>): CacheKey {
  if (!params) return '__all__';
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`)
    .join('&');
  return sorted || '__all__';
}

/** Invalidate cache entries. Pass a key prefix to target specific param sets. */
export function invalidateTicketCache(keyPrefix?: string) {
  if (!keyPrefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) store.delete(key);
  }
}

/**
 * Wrap ticketsApi.getAll with stale-while-revalidate caching.
 *
 * @param fetchFn   The real fetch function (ticketsApi.getAll bound to params)
 * @param params    Query params — used to build the cache key
 * @param onUpdate  Called with fresh data when background revalidation completes
 * @returns         Cached data if available, else waits for first fetch
 */
export async function getCachedTickets(
  fetchFn: () => Promise<any[]>,
  params?: Record<string, string | string[] | boolean | undefined>,
  onUpdate?: (data: any[]) => void,
): Promise<any[]> {
  const key = buildKey(params);
  const now = Date.now();
  const entry = store.get(key);

  if (entry) {
    const age = now - entry.fetchedAt;

    if (age < CACHE_TTL_MS) {
      // Cache is still within hard expiry — return immediately
      if (age > STALE_AFTER_MS && !entry.inflight) {
        // Trigger background revalidation without blocking the caller
        const promise = fetchFn().then(fresh => {
          store.set(key, { data: fresh, fetchedAt: Date.now() });
          onUpdate?.(fresh);
          return fresh;
        }).catch(() => entry.data).finally(() => {
          const current = store.get(key);
          if (current) delete (current as any).inflight;
        });
        store.set(key, { ...entry, inflight: promise });
      }
      return entry.data;
    }
  }

  // No valid cache — if there's an in-flight request share it
  if (entry?.inflight) return entry.inflight;

  // Fresh fetch
  const promise = fetchFn().then(data => {
    store.set(key, { data, fetchedAt: Date.now() });
    return data;
  });

  store.set(key, { data: entry?.data ?? [], fetchedAt: entry?.fetchedAt ?? 0, inflight: promise });

  const data = await promise;
  const current = store.get(key);
  if (current) delete (current as any).inflight;
  return data;
}

/** Peek at cached data synchronously without triggering a fetch. */
export function peekCachedTickets(
  params?: Record<string, string | string[] | boolean | undefined>,
): any[] | null {
  const key = buildKey(params);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
  return entry.data;
}
