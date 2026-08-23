// server/pushService.ts — Web Push notification sender
import webpush from 'web-push';
import prisma from './db.js';

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || 'BMWDl1Dl_jviKVSD-i_6UyN8_iRixXJX1JiV6-4C4_UV7m0VNgi5XzS5Ysz0jPcb3ACLW3haF4z_f8p1pEh9hIY';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'sPhJWz9Aix8gVBhVDn2vlIMxj1yFCyNAVnfEnB-gIX8';
const VAPID_EMAIL   = process.env.VAPID_EMAIL       || 'mailto:admin@knot-sys.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

export { VAPID_PUBLIC };

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;   // where to navigate on click
  requireInteraction?: boolean;
}

async function _send(endpoint: string, p256dh: string, auth: string, subId: string, payload: PushPayload) {
  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify({ ...payload, icon: payload.icon || '/logo-192.png', badge: '/logo-192.png', dir: 'rtl', lang: 'ar' }),
    );
  } catch (err: any) {
    // Remove expired/invalid subscriptions
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      await prisma.pushSubscription.delete({ where: { id: subId } }).catch(() => {});
    }
  }
}

export async function sendPushToUser(uid: string, payload: PushPayload) {
  const subs = await prisma.pushSubscription.findMany({ where: { uid } });
  await Promise.allSettled(subs.map(s => _send(s.endpoint, s.p256dh, s.auth, s.id, payload)));
}

export async function sendPushToRole(role: string, payload: PushPayload) {
  const subs = await prisma.pushSubscription.findMany({ where: { role } });
  await Promise.allSettled(subs.map(s => _send(s.endpoint, s.p256dh, s.auth, s.id, payload)));
}

export async function sendPushToRoles(roles: string[], payload: PushPayload) {
  const subs = await prisma.pushSubscription.findMany({ where: { role: { in: roles } } });
  await Promise.allSettled(subs.map(s => _send(s.endpoint, s.p256dh, s.auth, s.id, payload)));
}
