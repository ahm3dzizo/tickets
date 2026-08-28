// server/pushService.ts — Web Push notification sender
import webpush from 'web-push';
import prisma from './db.js';

const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@knot-sys.com';
const DB_KEY = 'vapidKeys';
const DEFAULT_PUSH_ICON = '/icon.png';
const DEFAULT_PUSH_BADGE = '/logo-192.png';

let _publicKey = '';
let _privateKey = '';
let _ready = false;

function cleanNotificationText(value: string): string {
  return String(value || '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function normalizePayload(payload: PushPayload) {
  return {
    ...payload,
    title: cleanNotificationText(payload.title),
    body: cleanNotificationText(payload.body),
    icon: payload.icon || DEFAULT_PUSH_ICON,
    badge: DEFAULT_PUSH_BADGE,
    dir: 'rtl',
    lang: 'ar',
  };
}

export async function initVapid(): Promise<void> {
  const row = await prisma.systemSetting.findUnique({ where: { key: DB_KEY } });
  if (row) {
    const v = row.value as { publicKey: string; privateKey: string };
    _publicKey = v.publicKey;
    _privateKey = v.privateKey;
  } else {
    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    _publicKey = publicKey;
    _privateKey = privateKey;
    await prisma.systemSetting.create({ data: { key: DB_KEY, value: { publicKey, privateKey } } });
    console.log('[push] Generated and stored new VAPID keys in DB');
  }
  webpush.setVapidDetails(VAPID_EMAIL, _publicKey, _privateKey);
  _ready = true;
  console.log('[push] VAPID initialised — public key:', _publicKey.slice(0, 20) + '…');
}

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

export interface PushDeliveryResult {
  id: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
}

async function _send(endpoint: string, p256dh: string, auth: string, subId: string, payload: PushPayload): Promise<PushDeliveryResult> {
  try {
    const result = await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify(normalizePayload(payload)),
      { TTL: 120 },
    );
    return { id: subId, ok: true, statusCode: result.statusCode };
  } catch (err: any) {
    const statusCode = err?.statusCode;
    const body = String(err?.body || err?.message || 'Push failed');
    const invalid = statusCode === 404 || statusCode === 410 ||
      (statusCode === 403 && /VAPID credentials/i.test(body));
    if (invalid) {
      await prisma.pushSubscription.delete({ where: { id: subId } }).catch(() => {});
    }
    console.warn(`[push] delivery failed sub=${subId} status=${statusCode || 'unknown'}: ${body}`);
    return { id: subId, ok: false, statusCode, error: body };
  }
}

async function _sendEmpty(endpoint: string, p256dh: string, auth: string, subId: string): Promise<PushDeliveryResult> {
  try {
    const result = await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      undefined,
      { TTL: 120 },
    );
    return { id: subId, ok: true, statusCode: result.statusCode };
  } catch (err: any) {
    const statusCode = err?.statusCode;
    const body = String(err?.body || err?.message || 'Empty push failed');
    console.warn(`[push] empty delivery failed sub=${subId} status=${statusCode || 'unknown'}: ${body}`);
    return { id: subId, ok: false, statusCode, error: body };
  }
}

export async function sendPushToSubscriptionDetailed(
  uid: string,
  endpoint: string,
  payload: PushPayload,
): Promise<PushDeliveryResult | null> {
  if (!_ready) return null;
  const sub = await prisma.pushSubscription.findFirst({ where: { uid, endpoint } });
  if (!sub) return null;
  return _send(sub.endpoint, sub.p256dh, sub.auth, sub.id, payload);
}

export async function sendEmptyPushToSubscriptionDetailed(
  uid: string,
  endpoint: string,
): Promise<PushDeliveryResult | null> {
  if (!_ready) return null;
  const sub = await prisma.pushSubscription.findFirst({ where: { uid, endpoint } });
  if (!sub) return null;
  return _sendEmpty(sub.endpoint, sub.p256dh, sub.auth, sub.id);
}

export async function sendPushToUserDetailed(uid: string, payload: PushPayload): Promise<PushDeliveryResult[]> {
  if (!_ready) return [];
  const subs = await prisma.pushSubscription.findMany({ where: { uid } });
  return Promise.all(subs.map(s => _send(s.endpoint, s.p256dh, s.auth, s.id, payload)));
}

export async function sendPushToUser(uid: string, payload: PushPayload) {
  await sendPushToUserDetailed(uid, payload);
}

export async function sendPushToRole(role: string, payload: PushPayload) {
  if (!_ready) return;
  const subs = await prisma.pushSubscription.findMany({ where: { role } });
  await Promise.all(subs.map(s => _send(s.endpoint, s.p256dh, s.auth, s.id, payload)));
}

export async function sendPushToRoles(roles: string[], payload: PushPayload) {
  if (!_ready) return;
  const subs = await prisma.pushSubscription.findMany({ where: { role: { in: roles } } });
  await Promise.all(subs.map(s => _send(s.endpoint, s.p256dh, s.auth, s.id, payload)));
}
