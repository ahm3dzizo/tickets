import { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, Settings2, ShieldAlert } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { authStorage } from '@/lib/api';
import { getPushPermission, isPushSupported, registerPush } from '@/lib/pushNotifications';
import { cn } from '@/lib/utils';

function permissionLabel(permission: NotificationPermission | 'unsupported') {
  if (permission === 'granted') return 'الإشعارات مفعّلة';
  if (permission === 'denied') return 'الإشعارات محظورة';
  if (permission === 'default') return 'الإشعارات غير مفعّلة';
  return 'الإشعارات غير مدعومة';
}

export function NotificationPermissionBanner() {
  const location = useLocation();
  const inSettings = location.pathname.startsWith('/settings');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !isPushSupported()) return 'unsupported';
    return getPushPermission();
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (!isPushSupported()) setPermission('unsupported');
      else setPermission(getPushPermission());
    };

    sync();
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const visible = inSettings || permission !== 'granted';
  const statusClass = useMemo(() => {
    if (permission === 'granted') return 'border-emerald-500/25 bg-emerald-500/8';
    if (permission === 'denied') return 'border-amber-500/30 bg-amber-500/10';
    return 'border-blue-500/25 bg-blue-500/8';
  }, [permission]);

  if (!visible) return null;

  const handleEnable = async () => {
    if (!isPushSupported()) {
      toast.error('المتصفح الحالي لا يدعم إشعارات Web Push');
      return;
    }

    const current = getPushPermission();
    setPermission(current);

    if (current === 'denied') {
      toast.error('الإشعارات محظورة من المتصفح. افتح إعدادات الموقع بجوار عنوان الموقع وغيّر الإشعارات إلى سماح.');
      return;
    }

    const token = authStorage.getToken();
    if (!token) {
      toast.error('انتهت الجلسة — سجّل الدخول مرة أخرى');
      return;
    }

    setBusy(true);
    try {
      // This runs directly from the button click, so Chrome/Android can display
      // the native Notification.requestPermission() prompt reliably.
      const enabled = await registerPush(`Bearer ${token}`);
      const next = getPushPermission();
      setPermission(next);

      if (enabled && next === 'granted') {
        toast.success('تم تفعيل إشعارات التطبيق');
      } else if (next === 'denied') {
        toast.error('تم رفض إذن الإشعارات من المتصفح');
      } else {
        toast.error('لم يكتمل تفعيل الإشعارات. حاول مرة أخرى.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      dir="rtl"
      className={cn(
        'mb-4 w-full rounded-2xl border shadow-sm',
        inSettings ? 'p-4 sm:p-5' : 'px-3 py-2.5',
        statusClass,
      )}
      aria-label="إعدادات إشعارات المتصفح"
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'shrink-0 rounded-xl flex items-center justify-center',
          inSettings ? 'w-11 h-11' : 'w-9 h-9',
          permission === 'granted'
            ? 'bg-emerald-500/15 text-emerald-600'
            : permission === 'denied'
              ? 'bg-amber-500/15 text-amber-600'
              : 'bg-blue-500/15 text-blue-600',
        )}>
          {permission === 'granted'
            ? <CheckCircle2 className="w-5 h-5" />
            : permission === 'denied'
              ? <ShieldAlert className="w-5 h-5" />
              : <BellRing className="w-5 h-5" />}
        </div>

        <div className="flex-1 min-w-0 text-right">
          <p className={cn('font-extrabold text-foreground', inSettings ? 'text-base' : 'text-sm')}>
            {permissionLabel(permission)}
          </p>
          <p className={cn('text-muted-foreground mt-0.5', inSettings ? 'text-xs' : 'text-[10px]')}>
            {permission === 'granted'
              ? 'هذا الجهاز مشترك في إشعارات Tickets.'
              : permission === 'denied'
                ? 'السماح موقوف من Chrome. غيّره من إعدادات الموقع ثم ارجع هنا.'
                : permission === 'unsupported'
                  ? 'المتصفح الحالي لا يدعم Web Push.'
                  : 'اضغط تفعيل ليظهر طلب السماح الأصلي من Chrome/Android.'}
          </p>
        </div>

        {permission !== 'granted' && permission !== 'unsupported' && (
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className={cn(
              'shrink-0 rounded-xl font-bold transition-colors disabled:opacity-60',
              inSettings ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-xs',
              permission === 'denied'
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {busy ? 'جاري التفعيل…' : permission === 'denied' ? 'طريقة السماح' : 'تفعيل'}
          </button>
        )}

        {permission === 'granted' && inSettings && (
          <div className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-emerald-600">
            <Settings2 className="w-4 h-4" />
            جاهز
          </div>
        )}
      </div>
    </section>
  );
}
