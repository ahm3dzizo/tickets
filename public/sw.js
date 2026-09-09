// public/sw.js — Service Worker: push notifications + Workbox precache
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

// ── Workbox precache (manifest injected by vite-plugin-pwa at build time) ─────
self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST || []);

// ── Firestore runtime cache ───────────────────────────────────────────────────
registerRoute(
  ({ url }) => url.hostname === 'firestore.googleapis.com',
  new NetworkFirst({ cacheName: 'firestore-cache', networkTimeoutSeconds: 10 })
);

// ── Technician PWA hot-read cache ─────────────────────────────────────────────
// Keep operational reads auth-scoped in the service worker. Fresh reads avoid
// needless network traffic; stale reads can keep appointments/ticket details
// visible through a temporary outage without ever crossing technician accounts.
const TECH_RUNTIME_CACHE = 'retal-tech-runtime-v1';
const TECH_FRESH_MS = 60 * 1000;
const TECH_MAX_STALE_MS = 24 * 60 * 60 * 1000;
const TECH_READ_PATHS = new Set([
  '/api/tech/appointments',
  '/api/tech/me/active-session',
  '/api/shift/today',
]);

function isTechReadPath(pathname) {
  return TECH_READ_PATHS.has(pathname) || /^\/api\/tech\/tickets\/[^/]+$/.test(pathname);
}

function simpleHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function techAuthScope(request) {
  const auth = request.headers.get('authorization') || '';
  return auth ? simpleHash(auth) : 'anonymous';
}

function techCacheRequest(request) {
  const url = new URL(request.url);
  const key = new URL(self.location.origin);
  key.pathname = `/__tech-runtime-cache__${url.pathname}`;
  for (const [name, value] of url.searchParams.entries()) key.searchParams.append(name, value);
  key.searchParams.set('__scope', techAuthScope(request));
  return new Request(key.toString(), { method: 'GET' });
}

async function storeTechResponse(cache, key, response) {
  const copy = response.clone();
  const body = await copy.blob();
  const headers = new Headers(copy.headers);
  headers.set('X-Tech-Cached-At', String(Date.now()));
  await cache.put(key, new Response(body, {
    status: copy.status,
    statusText: copy.statusText,
    headers,
  }));
}

async function techReadHandler({ request }) {
  const cache = await caches.open(TECH_RUNTIME_CACHE);
  const key = techCacheRequest(request);
  const cached = await cache.match(key);
  const cachedAt = Number(cached?.headers.get('X-Tech-Cached-At') || 0);
  const age = cachedAt > 0 ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;

  if (cached && age <= TECH_FRESH_MS) return cached;

  try {
    const response = await fetch(request);

    // Never allow an old cached payload to hide a revoked/expired technician
    // session or an authorization change.
    if (response.status === 401 || response.status === 403) {
      await cache.delete(key);
      return response;
    }

    if (response.ok) {
      await storeTechResponse(cache, key, response);
      return response;
    }

    if (cached && age <= TECH_MAX_STALE_MS && response.status >= 500) return cached;
    return response;
  } catch (error) {
    if (cached && age <= TECH_MAX_STALE_MS) return cached;
    throw error;
  }
}

registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    isTechReadPath(url.pathname),
  techReadHandler,
);

async function invalidateTechRuntimeScope(request) {
  const scope = techAuthScope(request);
  if (scope === 'anonymous') return;
  const cache = await caches.open(TECH_RUNTIME_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.map(key => {
    try {
      const url = new URL(key.url);
      return url.searchParams.get('__scope') === scope ? cache.delete(key) : Promise.resolve(false);
    } catch {
      return Promise.resolve(false);
    }
  }));
}

// Own technician mutations invalidate the local PWA copies immediately. Admin /
// supervisor changes are still picked up on the next 60-second revalidation.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const relevant =
    url.pathname.startsWith('/api/tech/') ||
    url.pathname.startsWith('/api/shift/');
  if (!relevant) return;

  event.respondWith((async () => {
    const response = await fetch(request);
    if (response.ok) await invalidateTechRuntimeScope(request);
    return response;
  })());
});

// ── Push debug helpers ────────────────────────────────────────────────────────
const PUSH_DEBUG_CACHE = 'knot-push-debug-v1';
const PUSH_DEBUG_URL = '/__push-debug__/latest';

async function savePushDebug(data) {
  try {
    const cache = await caches.open(PUSH_DEBUG_CACHE);
    await cache.put(
      new Request(PUSH_DEBUG_URL),
      new Response(JSON.stringify({
        receivedAt: new Date().toISOString(),
        title: data?.title || '',
        body: data?.body || '',
        tag: data?.tag || '',
        url: data?.url || '/',
      }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    );
  } catch (err) {
    console.warn('[sw] failed to persist push debug event', err);
  }
}

async function ackPushToServer(data) {
  try {
    let endpointHost = '';
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub?.endpoint) endpointHost = new URL(sub.endpoint).hostname;
    } catch {}

    await fetch('/api/push/sw-ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag: data?.tag || '',
        title: data?.title || '',
        receivedAt: new Date().toISOString(),
        endpointHost,
        href: self.location.href,
      }),
      keepalive: true,
    });
  } catch (err) {
    console.warn('[sw] failed to ack push event to server', err);
  }
}

// ── Push handler ──────────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}

  const title = data.title || 'إشعار';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon.png',
    badge: data.badge || '/logo-192.png',
    tag: data.tag || 'notification',
    requireInteraction: data.requireInteraction || false,
    dir: 'rtl',
    lang: 'ar',
    data: { url: data.url || '/' },
  };

  event.waitUntil(Promise.all([
    savePushDebug(data),
    ackPushToServer(data),
    self.registration.showNotification(title, options),
  ]));
});

// ── Notification click — navigate to url ──────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
