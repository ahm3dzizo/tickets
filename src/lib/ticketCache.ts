/**
 * Persistent stale-while-revalidate ticket cache.
 *
 * Goals:
 * - Show cached tickets quickly, including after a page/app reload.
 * - Revalidate in the background instead of blocking the whole page.
 * - Scope persisted cache by authenticated user so data is never reused across accounts.
 * - Keep stale data briefly after invalidation, then replace it when the fresh request finishes.
 */

const FRESH_FOR_MS       = 60 * 1000;            // 1 min — no refresh needed
const MAX_STALE_AGE_MS   = 24 * 60 * 60 * 1000; // 24h — usable instantly while revalidating
const DB_NAME            = 'retal-ticket-cache-v2';
const DB_VERSION         = 1;
const DB_STORE           = 'entries';
const CACHE_VERSION      = 'v2';

type CacheKey = string;

interface CacheEntry {
  data: any[];
  fetchedAt: number;
  inflight?: Promise<any[]>;
}

interface PersistedCacheEntry {
  key: string;
  data: any[];
  fetchedAt: number;
}

const store = new Map<CacheKey, CacheEntry>();

function buildParamKey(params?: Record<string, string | string[] | boolean | undefined>): string {
  if (!params) return '__all__';
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`)
    .join('&');
  return sorted || '__all__';
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function decodeJwtUserId(token: string): string | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    const id = payload?.uid || payload?.sub || payload?.userId;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

function currentUserScope(): string {
  if (typeof window === 'undefined') return 'server';
  const token = localStorage.getItem('retal_auth_token') || localStorage.getItem('token') || '';
  if (!token) return 'anonymous';
  return decodeJwtUserId(token) || `token-${simpleHash(token)}`;
}

function buildKey(params?: Record<string, string | string[] | boolean | undefined>): CacheKey {
  return `${CACHE_VERSION}:${currentUserScope()}:${buildParamKey(params)}`;
}

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openCacheDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

async function readPersisted(key: string): Promise<PersistedCacheEntry | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writePersisted(key: string, data: any[], fetchedAt: number): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({ key, data, fetchedAt } satisfies PersistedCacheEntry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function markPersistedStale(keyPrefix?: string): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  const scopePrefix = `${CACHE_VERSION}:${currentUserScope()}:`;
  const wantedPrefix = keyPrefix ? `${scopePrefix}${keyPrefix}` : scopePrefix;

  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const storeRef = tx.objectStore(DB_STORE);
      const cursorReq = storeRef.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const value = cursor.value as PersistedCacheEntry;
        if (typeof value?.key === 'string' && value.key.startsWith(wantedPrefix)) {
          cursor.update({ ...value, fetchedAt: 0 });
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function startRevalidation(
  key: string,
  entry: CacheEntry,
  fetchFn: () => Promise<any[]>,
  onUpdate?: (data: any[]) => void,
): void {
  if (entry.inflight) return;

  const promise = fetchFn()
    .then(fresh => {
      const fetchedAt = Date.now();
      store.set(key, { data: fresh, fetchedAt });
      void writePersisted(key, fresh, fetchedAt);
      onUpdate?.(fresh);
      return fresh;
    })
    .catch(() => entry.data)
    .finally(() => {
      const current = store.get(key);
      if (current?.inflight === promise) delete current.inflight;
    });

  store.set(key, { ...entry, inflight: promise });
}

/** Mark cached ticket data stale after a mutation without discarding it. */
export function invalidateTicketCache(keyPrefix?: string) {
  const scopePrefix = `${CACHE_VERSION}:${currentUserScope()}:`;
  const wantedPrefix = keyPrefix ? `${scopePrefix}${keyPrefix}` : scopePrefix;

  for (const [key, entry] of store.entries()) {
    if (key.startsWith(wantedPrefix)) {
      store.set(key, { ...entry, fetchedAt: 0 });
    }
  }

  void markPersistedStale(keyPrefix);
}

/**
 * Memory cache is immediate. IndexedDB survives refresh/app restart.
 * Cached values up to 24h old are rendered first, then refreshed in background.
 */
export async function getCachedTickets(
  fetchFn: () => Promise<any[]>,
  params?: Record<string, string | string[] | boolean | undefined>,
  onUpdate?: (data: any[]) => void,
): Promise<any[]> {
  const key = buildKey(params);
  const now = Date.now();

  let entry = store.get(key);
  if (entry) {
    const age = now - entry.fetchedAt;
    if (age <= MAX_STALE_AGE_MS || entry.fetchedAt === 0) {
      if (age > FRESH_FOR_MS || entry.fetchedAt === 0) {
        startRevalidation(key, entry, fetchFn, onUpdate);
      }
      return entry.data;
    }
  }

  const persisted = await readPersisted(key);
  if (persisted?.data && Array.isArray(persisted.data)) {
    const age = now - persisted.fetchedAt;
    if (age <= MAX_STALE_AGE_MS || persisted.fetchedAt === 0) {
      entry = { data: persisted.data, fetchedAt: persisted.fetchedAt };
      store.set(key, entry);
      if (age > FRESH_FOR_MS || persisted.fetchedAt === 0) {
        startRevalidation(key, entry, fetchFn, onUpdate);
      }
      return persisted.data;
    }
  }

  if (entry?.inflight) return entry.inflight;

  const promise = fetchFn().then(data => {
    const fetchedAt = Date.now();
    store.set(key, { data, fetchedAt });
    void writePersisted(key, data, fetchedAt);
    return data;
  });

  store.set(key, { data: entry?.data ?? [], fetchedAt: entry?.fetchedAt ?? 0, inflight: promise });

  try {
    return await promise;
  } finally {
    const current = store.get(key);
    if (current?.inflight === promise) delete current.inflight;
  }
}

/** Peek at memory cache synchronously without triggering a fetch. */
export function peekCachedTickets(
  params?: Record<string, string | string[] | boolean | undefined>,
): any[] | null {
  const key = buildKey(params);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > MAX_STALE_AGE_MS && entry.fetchedAt !== 0) return null;
  return entry.data;
}
