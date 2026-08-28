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
