import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // Don't show if dismissed this session
    if (sessionStorage.getItem('pwa-prompt-dismissed')) return;

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
    setVisible(false);
    sessionStorage.setItem('pwa-prompt-dismissed', '1');
  };

  if (!visible) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm
                 bg-card border border-border rounded-2xl shadow-2xl shadow-black/50
                 flex items-center gap-3 px-4 py-3 animate-in slide-in-from-bottom-4 duration-300"
    >
      <img src="/logo.jpg" alt="Retal" className="w-10 h-10 object-contain shrink-0" />

      <div className="flex-1 text-right">
        <p className="text-white font-bold text-sm">تثبيت التطبيق</p>
        <p className="text-slate-400 text-xs mt-0.5">ثبّت Retal على جهازك للوصول السريع</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5"
          onClick={handleInstall}
        >
          <Download className="w-3.5 h-3.5" />
          تثبيت
        </Button>
        <button
          onClick={handleDismiss}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
