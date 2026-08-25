// server/pushService.ts — Web Push notification sender
// VAPID keys are stored in SystemSetting (DB) so they survive server restarts
// and never change between deploys, preventing subscription invalidation.
import webpush from 'web-push';
import prisma from './db.js';

const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@knot-sys.com';
const DB_KEY = 'vapidKeys';

let _publicKey  = '';
let _privateKey = '';
let _ready      = false;

/**
 * Called once at server startup (from main.ts).
 * Loads keys from DB; generates & stores them if they don't exist yet.
 * After this resolves, getVapidPublicKey() and all send* functions are safe to call.
 */
export async function initVapid(): Promise<void> {
  const row = await prisma.systemSetting.findUnique({ where: { key: DB_KEY } });
  if (row) {
    const v = row.value as { publicKey: string; privateKey: string };
    _publicKey  = v.publicKey;
    _privateKey = v.privateKey;
  } else {
    // First boot — generate a fresh pair and persist it forever
    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    _publicKey  = publicKey;
    _privateKey = privateKey;
    await prisma.systemSetting.create({
      data: { key: DB_KEY, value: { publicKey, privateKey } },
    });
    console.log('[push] Generated and stored new VAPID keys in DB');
  }

  webpush.setVapidDetails(VAPID_EMAIL, _publicKey, _privateKey);
  _ready = true;
  console.log('[push] VAPID initialised — public key:', _publicKey.slice(0, 20) + '…');
}

/** Returns the VAPID public key (safe to expose to clients). */
export function getVapidPublicKey(): string {
  if (!_ready) throw new Error('VAPID not initialised — call initVapid() first');
  return _publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;
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
  if (!_ready) return;
  const subs = await prisma.pushSubscription.findMany({ where: { uid } });
  await Promise.allSettled(subs.map(s => _send(s.endpoint, s.p256dh, s.auth, s.id, payload)));
}

export async function sendPushToRole(role: string, payload: PushPayload) {
  if (!_ready) return;
  const subs = await prisma.pushSubscription.findMany({ where: { role } });
  await Promise.allSettled(subs.map(s => _send(s.endpoint, s.p256dh, s.auth, s.id, payload)));
}

export async function sendPushToRoles(roles: string[], payload: PushPayload) {
  if (!_ready) return;
  const subs = await prisma.pushSubscription.findMany({ where: { role: { in: roles } } });
  await Promise.allSettled(subs.map(s => _send(s.endpoint, s.p256dh, s.auth, s.id, payload)));
}
