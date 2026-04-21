import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PWA_PROMPT_DISABLED_KEY = 'retal:pwa-prompt-disabled';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // Don't show if user disabled it permanently
    if (localStorage.getItem(PWA_PROMPT_DISABLED_KEY) === 'true') return;

    // In dev mode: show after 2s for testing
    if (import.meta.env.DEV) {
      const t = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // Dev mode: just close
      setVisible(false);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    if (!dontShowAgain) return;
    localStorage.setItem(PWA_PROMPT_DISABLED_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm
                 bg-card border border-border rounded-2xl shadow-2xl shadow-black/50
                 px-4 py-3 animate-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex items-center gap-3">
        <img src="/logo.jpg" alt="Retal" className="w-10 h-10 object-contain shrink-0" />

        <div className="flex-1 text-right">
          <p className="text-foreground font-bold text-sm">تثبيت التطبيق</p>
          <p className="text-muted-foreground text-xs mt-0.5">ثبّت Retal على جهازك للوصول السريع</p>
        </div>
      </div>

      <label className="mt-3 flex items-center justify-end gap-2 text-right cursor-pointer select-none">
        <span className="text-xs text-muted-foreground">عدم إظهار هذه الرسالة مجددًا</span>
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          className="h-4 w-4 rounded border-border text-blue-600 focus:ring-2 focus:ring-blue-500/20"
        />
      </label>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          onClick={handleDismiss}
          disabled={!dontShowAgain}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="w-4 h-4" />
          عدم الإظهار مجددًا
        </button>
        <Button
          size="sm"
          className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5"
          onClick={handleInstall}
        >
          <Download className="w-3.5 h-3.5" />
          تثبيت
        </Button>
      </div>
    </div>
  );
}
