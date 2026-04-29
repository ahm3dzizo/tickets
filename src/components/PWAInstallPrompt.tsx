import { useState, useEffect, useRef } from 'react';
import { Download, X, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PWA_PROMPT_DISABLED_KEY = 'retal:pwa-prompt-disabled';
const DRAG_DISMISS_THRESHOLD = 80; // px

/* ── Browser / platform detection ───────────────────────── */
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
  const [dontShowAgain, setDontShowAgain] = useState(false);

  /* ── Drag state ───────────────────────────────────────── */
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  /* ── Init ─────────────────────────────────────────────── */
  useEffect(() => {
    const p = getPlatform();
    setPlatform(p);

    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (localStorage.getItem(PWA_PROMPT_DISABLED_KEY) === 'true') return;

    // iOS Safari — no beforeinstallprompt, show manual instructions
    if (p.isIOS || p.isMacSafari) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }

    // Dev mode
    if (import.meta.env.DEV) {
      const t = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(t);
    }

    // Chrome / Edge — listen for native prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  /* ── Actions ──────────────────────────────────────────── */
  const handleInstall = async () => {
    if (!deferredPrompt) {
      setVisible(false);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
    setDeferredPrompt(null);
  };

  const handleClose = () => setVisible(false); // temporary

  const handleDontShow = () => {
    localStorage.setItem(PWA_PROMPT_DISABLED_KEY, 'true');
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

  if (!visible || !platform) return null;

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
      <div className="flex items-center gap-3 mt-2">
        <img src="/logo.jpg" alt="Retal" className="w-10 h-10 object-contain shrink-0 rounded-xl" />
        <div className="flex-1 text-right">
          <p className="text-foreground font-bold text-sm">تثبيت التطبيق</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            {platform.isIOS
              ? 'أضف Retal لشاشتك الرئيسية'
              : platform.isMacSafari
              ? 'أضف Retal لـ Dock'
              : 'ثبّت Retal على جهازك للوصول السريع'}
          </p>
        </div>
      </div>

      {/* Safari manual instructions */}
      {(platform.isIOS || platform.isMacSafari) && (
        <div className="mt-3 bg-muted/50 rounded-xl px-3 py-2.5 text-right space-y-1">
          {platform.isIOS ? (
            <>
              <p className="text-xs text-muted-foreground font-medium">اتبع الخطوات:</p>
              <p className="text-xs text-foreground">
                ١. اضغط على زرار <span className="font-bold">المشاركة</span>{' '}
                <Share className="inline w-3.5 h-3.5 mb-0.5" /> في أسفل المتصفح
              </p>
              <p className="text-xs text-foreground">
                ٢. اختر <span className="font-bold">"إضافة إلى الشاشة الرئيسية"</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground font-medium">اتبع الخطوات:</p>
              <p className="text-xs text-foreground">
                ١. اضغط على <span className="font-bold">File → Add to Dock</span> من القائمة
              </p>
              <p className="text-xs text-foreground">
                ٢. أو استخدم <span className="font-bold">Chrome / Edge</span> للتثبيت التلقائي
              </p>
            </>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={handleDontShow}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
        >
          عدم الإظهار مجددًا
        </button>

        {isNativePrompt && (
          <Button
            size="sm"
            className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5"
            onMouseDown={e => e.stopPropagation()}
            onClick={handleInstall}
          >
            <Download className="w-3.5 h-3.5" />
            تثبيت
          </Button>
        )}
      </div>
    </div>
  );
}