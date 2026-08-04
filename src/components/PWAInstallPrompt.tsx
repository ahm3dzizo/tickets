import { useState, useEffect, useRef } from 'react';
import { Download, X, Share, BellRing, Check, MoreVertical, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const PROMPT_DISABLED_KEY = 'retal:onboarding-prompt-disabled';
const DRAG_DISMISS_THRESHOLD = 80;

function getPlatform() {
  const ua = navigator.userAgent;
  const isIOS       = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isSafari    = /^((?!chrome|android).)*safari/i.test(ua);
  const isMacSafari = !isIOS && isSafari && /Macintosh/.test(ua);
  const isAndroid   = /Android/.test(ua);
  const isChrome    = /Chrome/.test(ua) && !/Edg/.test(ua) && !/OPR/.test(ua);
  const isFirefox   = /Firefox/.test(ua);
  return { isIOS, isSafari: isIOS && isSafari, isMacSafari, isAndroid, isChrome, isFirefox };
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible]               = useState(false);
  const [platform, setPlatform]             = useState<ReturnType<typeof getPlatform> | null>(null);
  const [needsNotif, setNeedsNotif]         = useState(false);
  const [needsPWA, setNeedsPWA]             = useState(false);
  const [notifGranted, setNotifGranted]     = useState(false);

  /* ── Drag state ──────────────────────────────────────────────────────── */
  const cardRef    = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const [dragX, setDragX]           = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  /* ── Init ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const p = getPlatform();
    setPlatform(p);

    if (localStorage.getItem(PROMPT_DISABLED_KEY) === 'true') return;

    const isPWAInstalled  = window.matchMedia('(display-mode: standalone)').matches;
    const notifPermission = 'Notification' in window ? Notification.permission : 'denied';
    const notifNeeded     = notifPermission === 'default';

    setNeedsNotif(notifNeeded);
    setNeedsPWA(!isPWAInstalled);

    if (isPWAInstalled && !notifNeeded) return;

    // Pick up deferred prompt captured in main.tsx before React mounted
    const earlyPrompt = (window as any).__deferredPWAPrompt;
    if (earlyPrompt) setDeferredPrompt(earlyPrompt);

    // Listen for prompt arriving after mount
    const onCaptured = () => {
      const p2 = (window as any).__deferredPWAPrompt;
      if (p2) setDeferredPrompt(p2);
    };
    window.addEventListener('pwa-prompt-captured', onCaptured);

    // Native listener (fires if Chrome decides to offer install after mount)
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      (window as any).__deferredPWAPrompt = e;
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // Always show after a short delay — even without deferred prompt
    // (we'll show manual instructions instead)
    const delay = p.isIOS || p.isMacSafari ? 1500 : 2500;
    const timer = setTimeout(() => setVisible(true), delay);

    return () => {
      window.removeEventListener('pwa-prompt-captured', onCaptured);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      clearTimeout(timer);
    };
  }, []);

  /* ── Actions ─────────────────────────────────────────────────────────── */
  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setNeedsPWA(false);
      (window as any).__deferredPWAPrompt = null;
      if (!needsNotif || notifGranted) setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleEnableNotif = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      toast.success('تم تفعيل الإشعارات بنجاح 🎉');
      setNotifGranted(true);
      setNeedsNotif(false);
      if (!needsPWA) setTimeout(() => setVisible(false), 1200);
    } else {
      toast.error('لم يتم تفعيل الإشعارات');
    }
  };

  const handleClose    = () => setVisible(false);
  const handleDontShow = () => {
    localStorage.setItem(PROMPT_DISABLED_KEY, 'true');
    setVisible(false);
  };

  /* ── Drag ────────────────────────────────────────────────────────────── */
  const onDragStart = (x: number) => { dragStartX.current = x; setIsDragging(true); };
  const onDragMove  = (x: number) => {
    if (dragStartX.current === null) return;
    setDragX(x - dragStartX.current);
  };
  const onDragEnd = () => {
    if (Math.abs(dragX) >= DRAG_DISMISS_THRESHOLD) setVisible(false);
    setDragX(0); setIsDragging(false); dragStartX.current = null;
  };

  /* ── Render guards ───────────────────────────────────────────────────── */
  if (!platform || !visible) return null;

  // Show notif section if permission is default
  const showNotifSection = needsNotif;
  // Show PWA section whenever the app isn't installed in standalone mode
  // (with or without deferred prompt — we'll show manual instructions as fallback)
  const showPWASection = needsPWA;
  const shouldShow     = showNotifSection || showPWASection;

  if (!shouldShow) return null;

  /* ── Install mode ────────────────────────────────────────────────────── */
  // Can trigger native install dialog
  const hasNativePrompt = deferredPrompt !== null;
  // Show manual steps for these platforms
  const showManualSteps = !hasNativePrompt && !platform.isIOS && !platform.isMacSafari;

  const opacity = Math.max(0, 1 - Math.abs(dragX) / (DRAG_DISMISS_THRESHOLD * 1.5));
  const rotate  = dragX * 0.04;

  return (
    <div
      dir="rtl"
      ref={cardRef}
      onMouseDown={e  => onDragStart(e.clientX)}
      onMouseMove={e  => { if (isDragging) onDragMove(e.clientX); }}
      onMouseUp={() => { if (isDragging) onDragEnd(); }}
      onMouseLeave={() => { if (isDragging) onDragEnd(); }}
      onTouchStart={e => onDragStart(e.touches[0].clientX)}
      onTouchMove={e  => onDragMove(e.touches[0].clientX)}
      onTouchEnd={onDragEnd}
      style={{
        transform: `translateX(calc(-50% + ${dragX}px)) rotate(${rotate}deg)`,
        opacity,
        transition: isDragging ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className="fixed bottom-24 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm
                 bg-card border border-border rounded-2xl shadow-2xl shadow-black/40
                 px-4 py-3 animate-in slide-in-from-bottom-4 duration-300 select-none"
    >
      {/* Drag handle */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-border/60" />

      {/* Close */}
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={handleClose}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 mt-3 mb-4">
        <img
          src="/logo.png" alt="Tickets"
          className="w-10 h-10 object-contain shrink-0 rounded-xl shadow-sm border border-border/40"
        />
        <div className="flex-1 text-right">
          <p className="text-foreground font-bold text-sm leading-tight">إعدادات التطبيق</p>
          <p className="text-muted-foreground text-[11px] mt-0.5 leading-snug">
            نوصي بتفعيل الخيارات التالية لأفضل تجربة
          </p>
        </div>
      </div>

      <div className="space-y-2">

        {/* ── Notifications ── */}
        {showNotifSection && (
          <div className="bg-muted/40 border border-border/50 rounded-xl p-3 flex items-center gap-3">
            <Button
              size="sm"
              className="h-8 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shrink-0 gap-1.5"
              onMouseDown={e => e.stopPropagation()}
              onClick={handleEnableNotif}
            >
              <BellRing className="w-3.5 h-3.5" />
              تفعيل
            </Button>
            <div className="flex-1 text-right min-w-0">
              <p className="text-sm font-bold text-foreground leading-tight">إشعارات المتصفح</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">ليصلك كل جديد حول التذاكر</p>
            </div>
          </div>
        )}

        {notifGranted && !needsNotif && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">تم تفعيل الإشعارات بنجاح</p>
          </div>
        )}

        {/* ── PWA Install ── */}
        {showPWASection && (
          <div className="bg-muted/40 border border-border/50 rounded-xl p-3 space-y-2.5">

            {/* Title row + install button */}
            <div className="flex items-center gap-3">
              {hasNativePrompt && (
                <Button
                  size="sm"
                  className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0 gap-1.5"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={handleInstall}
                >
                  <Download className="w-3.5 h-3.5" />
                  تثبيت
                </Button>
              )}
              <div className="flex-1 text-right min-w-0">
                <p className="text-sm font-bold text-foreground leading-tight">تثبيت التطبيق</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">وصول سريع وتجربة أفضل بدون متصفح</p>
              </div>
            </div>

            {/* iOS Safari */}
            {platform.isIOS && (
              <div className="bg-background/70 border border-border/40 rounded-lg px-3 py-2.5 text-right space-y-1.5">
                <p className="text-[10px] text-muted-foreground font-bold">خطوات التثبيت على الآيفون:</p>
                <p className="text-[10px] text-foreground flex items-center justify-end gap-1">
                  اضغط على زر المشاركة
                  <Share className="w-3 h-3 text-blue-500 shrink-0" />
                  <span className="text-muted-foreground">١.</span>
                </p>
                <p className="text-[10px] text-foreground">
                  <span className="text-muted-foreground">٢. </span>
                  اختر <span className="font-bold">"إضافة إلى الشاشة الرئيسية"</span>
                </p>
              </div>
            )}

            {/* macOS Safari */}
            {platform.isMacSafari && (
              <div className="bg-background/70 border border-border/40 rounded-lg px-3 py-2.5 text-right space-y-1.5">
                <p className="text-[10px] text-muted-foreground font-bold">خطوات التثبيت على الماك:</p>
                <p className="text-[10px] text-foreground">
                  <span className="text-muted-foreground">١. </span>
                  من القائمة: <span className="font-bold">File ← Add to Dock</span>
                </p>
              </div>
            )}

            {/* Chrome / Edge desktop — no deferred prompt */}
            {showManualSteps && !platform.isAndroid && (
              <div className="bg-background/70 border border-border/40 rounded-lg px-3 py-2.5 text-right space-y-1.5">
                <p className="text-[10px] text-muted-foreground font-bold">خطوات التثبيت على الكمبيوتر:</p>
                <p className="text-[10px] text-foreground flex items-center justify-end gap-1">
                  افتح قائمة المتصفح
                  <MoreVertical className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">١.</span>
                </p>
                <p className="text-[10px] text-foreground">
                  <span className="text-muted-foreground">٢. </span>
                  اضغط على <span className="font-bold">"تثبيت التطبيق"</span> أو{' '}
                  <span className="font-bold">"Install App"</span>
                </p>
              </div>
            )}

            {/* Chrome Android — no deferred prompt */}
            {showManualSteps && platform.isAndroid && (
              <div className="bg-background/70 border border-border/40 rounded-lg px-3 py-2.5 text-right space-y-1.5">
                <p className="text-[10px] text-muted-foreground font-bold">خطوات التثبيت على الأندرويد:</p>
                <p className="text-[10px] text-foreground flex items-center justify-end gap-1">
                  افتح قائمة المتصفح
                  <Menu className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">١.</span>
                </p>
                <p className="text-[10px] text-foreground">
                  <span className="text-muted-foreground">٢. </span>
                  اضغط <span className="font-bold">"إضافة إلى الشاشة الرئيسية"</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-start">
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={handleDontShow}
          className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted"
        >
          عدم الإظهار مجددًا
        </button>
      </div>
    </div>
  );
}
