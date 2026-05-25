import { useState, useEffect, useRef } from 'react';
import { Download, X, Share, Bell, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const PROMPT_DISABLED_KEY = 'retal:onboarding-prompt-disabled';
const DRAG_DISMISS_THRESHOLD = 80;

function getPlatform() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isMacSafari = !isIOS && isSafari && /Macintosh/.test(ua);
  return { isIOS, isSafari: isIOS && isSafari, isMacSafari };
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<ReturnType<typeof getPlatform> | null>(null);
  
  const [needsNotif, setNeedsNotif] = useState(false);
  const [needsPWA, setNeedsPWA] = useState(false);

  /* ── Drag state ───────────────────────────────────────── */
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const p = getPlatform();
    setPlatform(p);

    if (localStorage.getItem(PROMPT_DISABLED_KEY) === 'true') return;

    const isPWAInstalled = window.matchMedia('(display-mode: standalone)').matches;
    const notifNeeded = 'Notification' in window && Notification.permission === 'default';

    setNeedsNotif(notifNeeded);
    setNeedsPWA(!isPWAInstalled);

    if (isPWAInstalled && !notifNeeded) return; // All good

    // iOS Safari / Mac Safari don't fire beforeinstallprompt. Just show the prompt after a short delay
    if (p.isIOS || p.isMacSafari) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }

    if (!isPWAInstalled) {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setVisible(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      
      // Fallback: If event doesn't fire but we still need notif, show it anyway after 3s
      const t = setTimeout(() => {
        setVisible(true);
      }, 3000);
      
      return () => {
        window.removeEventListener('beforeinstallprompt', handler);
        clearTimeout(t);
      };
    } else if (notifNeeded) {
      // Just show it for notifications
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  /* ── Actions ──────────────────────────────────────────── */
  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setNeedsPWA(false);
        if (!needsNotif) setVisible(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleEnableNotif = async () => {
    if ('Notification' in window) {
      const p = await Notification.requestPermission();
      if (p === 'granted') {
        toast.success('تم تفعيل الإشعارات بنجاح');
        setNeedsNotif(false);
        if (!needsPWA) setVisible(false);
      }
    }
  };

  const handleClose = () => setVisible(false);

  const handleDontShow = () => {
    localStorage.setItem(PROMPT_DISABLED_KEY, 'true');
    setVisible(false);
  };

  /* ── Drag handlers ────────────────────────────────────── */
  const onDragStart = (clientX: number) => {
    dragStartX.current = clientX;
    setIsDragging(true);
  };

  const onDragMove = (clientX: number) => {
    if (dragStartX.current === null) return;
    setDragX(clientX - dragStartX.current);
  };

  const onDragEnd = () => {
    if (Math.abs(dragX) >= DRAG_DISMISS_THRESHOLD) {
      setVisible(false);
    }
    setDragX(0);
    setIsDragging(false);
    dragStartX.current = null;
  };

  /* ── Mouse events ─────────────────────────────────────── */
  const onMouseDown = (e: React.MouseEvent) => onDragStart(e.clientX);
  const onMouseMove = (e: React.MouseEvent) => { if (isDragging) onDragMove(e.clientX); };
  const onMouseUp = () => { if (isDragging) onDragEnd(); };

  /* ── Touch events ─────────────────────────────────────── */
  const onTouchStart = (e: React.TouchEvent) => onDragStart(e.touches[0].clientX);
  const onTouchMove = (e: React.TouchEvent) => onDragMove(e.touches[0].clientX);
  const onTouchEnd = () => onDragEnd();

  /* ── Computed style ───────────────────────────────────── */
  const opacity = Math.max(0, 1 - Math.abs(dragX) / (DRAG_DISMISS_THRESHOLD * 1.5));
  const rotate = dragX * 0.04;

  if (!visible || !platform || (!needsNotif && !needsPWA)) return null;

  const isNativePrompt = !platform.isIOS && !platform.isMacSafari;

  return (
    <div
      dir="rtl"
      ref={cardRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: `translateX(calc(-50% + ${dragX}px)) rotate(${rotate}deg)`,
        opacity,
        transition: isDragging ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className="fixed bottom-6 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm
                 bg-card border border-border rounded-2xl shadow-2xl shadow-black/50
                 px-4 py-3 animate-in slide-in-from-bottom-4 duration-300
                 select-none"
    >
      {/* Drag hint bar */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-border opacity-60" />

      {/* X close button */}
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={handleClose}
        className="absolute top-3 left-3 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="إغلاق مؤقت"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 mt-2 mb-3">
        <img src="/logo.jpg" alt="Retal" className="w-10 h-10 object-contain shrink-0 rounded-xl shadow-sm" />
        <div className="flex-1 text-right">
          <p className="text-foreground font-bold text-sm">إعدادات التطبيق</p>
          <p className="text-muted-foreground text-[11px] mt-0.5 leading-tight">
            نوصي بتفعيل هذه الخيارات للحصول على أفضل تجربة
          </p>
        </div>
      </div>

      <div className="space-y-2 mt-2">
        {/* Notifications */}
        {needsNotif && (
          <div className="bg-muted/40 border border-border/50 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="flex-1 text-right">
              <p className="text-sm font-bold text-foreground">إشعارات المتصفح</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">ليصلك كل جديد حول التذاكر والمواعيد</p>
            </div>
            <Button
              size="sm"
              className="h-8 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shrink-0 shadow-sm"
              onMouseDown={e => e.stopPropagation()}
              onClick={handleEnableNotif}
            >
              <BellRing className="w-3.5 h-3.5 mr-1" />
              تفعيل
            </Button>
          </div>
        )}

        {/* PWA Install */}
        {needsPWA && (
          <div className="bg-muted/40 border border-border/50 rounded-xl p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex-1 text-right">
                <p className="text-sm font-bold text-foreground">تثبيت التطبيق</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">للوصول السريع وتجربة استخدام أفضل</p>
              </div>
              {isNativePrompt && (
                <Button
                  size="sm"
                  className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0 shadow-sm"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={handleInstall}
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  تثبيت
                </Button>
              )}
            </div>

            {/* Safari manual instructions */}
            {(platform.isIOS || platform.isMacSafari) && (
              <div className="bg-background rounded-lg px-3 py-2 text-right space-y-1 mt-1 border border-border/40">
                {platform.isIOS ? (
                  <>
                    <p className="text-[10px] text-muted-foreground font-bold mb-1">خطوات التثبيت للآيفون:</p>
                    <p className="text-[10px] text-foreground">
                      ١. اضغط على زرار <span className="font-bold">المشاركة</span>{' '}
                      <Share className="inline w-3 h-3 mb-0.5 text-blue-500" /> بالأسفل
                    </p>
                    <p className="text-[10px] text-foreground">
                      ٢. اختر <span className="font-bold">"إضافة إلى الشاشة الرئيسية"</span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] text-muted-foreground font-bold mb-1">خطوات التثبيت للماك:</p>
                    <p className="text-[10px] text-foreground">
                      ١. اضغط على <span className="font-bold">File → Add to Dock</span>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
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