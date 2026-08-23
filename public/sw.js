// public/sw.js — Service Worker for push notifications
const ICON  = '/logo-192.png';
const BADGE = '/logo-192.png';

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// ── Push handler ─────────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}

  const title   = data.title   || 'إشعار';
  const options = {
    body:               data.body               || '',
    icon:               data.icon               || ICON,
    badge:              BADGE,
    tag:                data.tag                || 'notification',
    requireInteraction: data.requireInteraction || false,
    dir:                'rtl',
    lang:               'ar',
    data:               { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click — navigate to url ─────────────────────────────────────
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
