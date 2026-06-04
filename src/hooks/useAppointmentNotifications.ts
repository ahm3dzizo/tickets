import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { appointmentsApi } from '@/lib/api';

// ── VAPID public key placeholder (يجب إنشاؤه في البيئة الإنتاجية)
// للبيئة الحالية سنستخدم browser Notification API مباشرة
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// ── إرسال Push Notification محلية (للمتصفح) ──────────────────────────────
function sendLocalPush(title: string, body: string, icon = '/logo-192.png') {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    // محاولة عبر Service Worker (أفضل للجوال)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(sw => {
        sw.showNotification(title, {
          body,
          icon,
          badge: icon,
          tag: 'appointment',
          renotify: true,
          vibrate: [200, 100, 200],
          dir: 'rtl',
          lang: 'ar',
        } as any);
      }).catch(() => {
        // Fallback لـ Notification API
        new Notification(title, { body, icon, dir: 'rtl', lang: 'ar' });
      });
    } else {
      new Notification(title, { body, icon, dir: 'rtl', lang: 'ar' });
    }
  } catch {}
}

// ── طلب إذن الإشعارات ────────────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ── تسجيل Push Subscription في السيرفر ──────────────────────────────────────
export async function subscribePushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator) || !VAPID_KEY) return;
  try {
    const sw = await navigator.serviceWorker.ready;
    const existing = await sw.pushManager.getSubscription();
    if (existing) {
      await appointmentsApi.subscribePush(existing.toJSON() as PushSubscriptionJSON);
      return;
    }
    const sub = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
    });
    await appointmentsApi.subscribePush(sub.toJSON() as PushSubscriptionJSON);
  } catch (err) {
    console.warn('[Push] Subscribe error:', err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// ── Hook الرئيسي: يستمع لـ Socket.io ويعرض إشعارات ──────────────────────────
export function useAppointmentNotifications(socket: any) {
  const { user } = useAuth();
  const uid = user?.uid;

  useEffect(() => {
    if (!socket || !uid) return;

    const eventName = `notification:supervisor:${uid}`;

    const handler = (data: {
      type: string;
      ticketRef: string;
      clientName: string;
      villaNumber: string;
      appointmentTime: string;
      setBy: string;
      setByUid: string;
      isShared: boolean;
    }) => {
      if (data.type !== 'appointment_set') return;

      const [datePart] = (data.appointmentTime || '').split(' ');
      const fmtDate = datePart
        ? new Date(datePart).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })
        : data.appointmentTime;

      const isSelf = data.setByUid === uid;

      // Toast في التطبيق
      if (!isSelf) {
        // إشعار للمشرف المشارك
        toast.info(
          data.isShared
            ? `📅 ${data.setBy} حدّد موعداً مشتركاً`
            : `📅 تم تحديد موعد جديد`,
          {
            description: `تذكرة #${data.ticketRef} — ${data.clientName} (فيلا ${data.villaNumber})\n${fmtDate}`,
            duration: 8000,
            action: {
              label: 'عرض',
              onClick: () => window.location.href = `/tickets`,
            },
          }
        );

        // Push notification خارج التطبيق
        const title = data.isShared
          ? `📅 موعد مشترك جديد — ${data.setBy}`
          : `📅 موعد محدد`;
        const body = `تذكرة #${data.ticketRef} | ${data.clientName} — فيلا ${data.villaNumber}\n${fmtDate}`;
        sendLocalPush(title, body);
      }
    };

    socket.on(eventName, handler);
    return () => {
      socket.off(eventName, handler);
    };
  }, [socket, uid]);
}

// ── Hook لتهيئة إذن الإشعارات عند أول تشغيل ─────────────────────────────────
export function useInitNotifications() {
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      subscribePushNotifications().catch(() => {});
      requested.current = true;
    }
  }, []);
}
