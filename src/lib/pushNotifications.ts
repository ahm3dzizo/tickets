// src/lib/pushNotifications.ts — Browser push subscription manager
const SW_PATH = '/sw.js';
const PUSH_DEBUG_CACHE = 'knot-push-debug-v1';
const PUSH_DEBUG_URL = '/__push-debug__/latest';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from({ length: raw.length }, (_, i) => raw.charCodeAt(i));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/', updateViaCache: 'none' });
  await reg.update().catch(() => {});
  await navigator.serviceWorker.ready;
  return reg;
}

async function subscribeFresh(reg: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe().catch(() => {});
  }
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

async function saveSubscription(sub: PushSubscription, authHeader: string, isTech: boolean): Promise<void> {
  const json = sub.toJSON();
  const endpoint = '/api/push/' + (isTech ? 'subscribe-tech' : 'subscribe');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }),
  });
  if (!response.ok) throw new Error(`Failed to save push subscription (${response.status})`);
}

export async function registerPush(authHeader: string, isTech = false): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  if (Notification.permission === 'denied') return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
    const { publicKey } = await keyRes.json();
    if (!publicKey) return false;

    const reg = await getRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await saveSubscription(sub, authHeader, isTech);
    return true;
  } catch (err) {
    console.warn('[push] Failed to register push:', err);
    return false;
  }
}

export type PushDebugEvent = {
  receivedAt: string;
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
};

export async function getLastPushDebugEvent(): Promise<PushDebugEvent | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(PUSH_DEBUG_CACHE);
    const response = await cache.match(PUSH_DEBUG_URL);
    if (!response) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function clearPushDebugEvent(): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(PUSH_DEBUG_CACHE);
    await cache.delete(PUSH_DEBUG_URL);
  } catch {}
}

export type PushRepairResult = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  serviceWorker: boolean;
  subscribed: boolean;
  saved: boolean;
  testAccepted: boolean;
  delivered: number;
  subscriptions: number;
  statusCode?: number;
  endpointHost?: string;
  swPushReceived?: boolean;
  swPushEvent?: PushDebugEvent | null;
  error?: string;
};

export type LocalNotificationResult = {
  ok: boolean;
  permission: NotificationPermission | 'unsupported';
  serviceWorker: boolean;
  error?: string;
};

export async function showLocalNotificationTest(): Promise<LocalNotificationResult> {
  const result: LocalNotificationResult = {
    ok: false,
    permission: 'unsupported',
    serviceWorker: false,
  };

  try {
    if (!isPushSupported()) throw new Error('المتصفح لا يدعم إشعارات Web Push');
    const permission = await Notification.requestPermission();
    result.permission = permission;
    if (permission !== 'granted') throw new Error('إذن الإشعارات غير مسموح');

    const reg = await getRegistration();
    result.serviceWorker = !!reg.active;
    if (!result.serviceWorker) throw new Error('Service Worker غير نشط');

    await reg.showNotification('🔔 اختبار محلي من Knot', {
      body: 'هذا الإشعار لا يستخدم FCM أو السيرفر. لو ظهر فطبقة عرض إشعارات المتصفح سليمة.',
      icon: '/logo-192.png',
      badge: '/logo-192.png',
      tag: `knot-local-test-${Date.now()}`,
      requireInteraction: true,
      dir: 'rtl',
      lang: 'ar',
      data: { url: '/push-test' },
    });

    result.ok = true;
    return result;
  } catch (err: any) {
    result.error = err?.message || String(err);
    return result;
  }
}

export async function repairAndTestPush(authHeader: string, isTech = false): Promise<PushRepairResult> {
  const result: PushRepairResult = {
    supported: false,
    permission: 'unsupported',
    serviceWorker: false,
    subscribed: false,
    saved: false,
    testAccepted: false,
    delivered: 0,
    subscriptions: 0,
    swPushReceived: false,
    swPushEvent: null,
  };

  try {
    if (!isPushSupported()) throw new Error('المتصفح لا يدعم Web Push');
    result.supported = true;

    const permission = await Notification.requestPermission();
    result.permission = permission;
    if (permission !== 'granted') throw new Error('إذن الإشعارات غير مسموح');

    const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
    if (!keyRes.ok) throw new Error('تعذر جلب مفتاح VAPID');
    const { publicKey } = await keyRes.json();
    if (!publicKey) throw new Error('مفتاح VAPID غير موجود');

    const reg = await getRegistration();
    result.serviceWorker = !!reg.active;

    const sub = await subscribeFresh(reg, publicKey);
    result.subscribed = !!sub;
    try { result.endpointHost = new URL(sub.endpoint).hostname; } catch {}

    await saveSubscription(sub, authHeader, isTech);
    result.saved = true;

    await clearPushDebugEvent();

    const testRes = await fetch('/api/push/' + (isTech ? 'test-self-tech' : 'test-self'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    const test = await testRes.json().catch(() => ({}));
    if (!testRes.ok) throw new Error(test?.error || `فشل اختبار الإشعار (${testRes.status})`);

    result.testAccepted = test.success === true;
    result.delivered = Number(test.delivered || 0);
    result.subscriptions = Number(test.subscriptions || 0);
    result.statusCode = Number(test?.result?.statusCode || 0) || undefined;

    if (!result.testAccepted) {
      throw new Error(test?.result?.error || 'السيرفر لم يتمكن من تسليم الاختبار لهذا الجهاز');
    }

    for (let i = 0; i < 8; i += 1) {
      await sleep(750);
      const debugEvent = await getLastPushDebugEvent();
      if (debugEvent) {
        result.swPushReceived = true;
        result.swPushEvent = debugEvent;
        break;
      }
    }

    return result;
  } catch (err: any) {
    result.error = err?.message || String(err);
    return result;
  }
}

export async function unregisterPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch('/api/push/unsubscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  } catch (err) {
    console.warn('[push] Failed to unregister push:', err);
  }
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getPushPermission(): NotificationPermission {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}
