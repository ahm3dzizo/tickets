import { useEffect, useState } from 'react';
import { BriefcaseBusiness, MessageCircle, X } from 'lucide-react';
import {
  launchWhatsAppApp,
  parseWhatsAppLink,
  WHATSAPP_PICKER_EVENT,
  type WhatsAppOpenRequest,
  type WhatsAppAppTarget,
} from '@/lib/whatsappLauncher';

export function WhatsAppAppPicker() {
  const [request, setRequest] = useState<WhatsAppOpenRequest | null>(null);

  useEffect(() => {
    const handlePickerRequest = (event: Event) => {
      const detail = (event as CustomEvent<WhatsAppOpenRequest>).detail;
      if (detail?.phone) setRequest(detail);
    };

    const handleWaLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const parsed = parseWhatsAppLink(anchor.href);
      if (!parsed) return;

      event.preventDefault();
      event.stopPropagation();
      setRequest(parsed);
    };

    window.addEventListener(WHATSAPP_PICKER_EVENT, handlePickerRequest as EventListener);
    document.addEventListener('click', handleWaLink, true);

    return () => {
      window.removeEventListener(WHATSAPP_PICKER_EVENT, handlePickerRequest as EventListener);
      document.removeEventListener('click', handleWaLink, true);
    };
  }, []);

  if (!request) return null;

  const open = (target: WhatsAppAppTarget) => {
    const current = request;
    setRequest(null);
    launchWhatsAppApp(target, current.phone, current.message);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center" dir="rtl">
      <button
        type="button"
        aria-label="إغلاق"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={() => setRequest(null)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-app-picker-title"
        className="relative w-full max-w-md rounded-t-[28px] border border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/20 sm:hidden" />

        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="whatsapp-app-picker-title" className="text-base font-black text-foreground">
              فتح المحادثة باستخدام
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              اختر تطبيق واتساب الذي تريد استخدامه لهذه المحادثة.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRequest(null)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground transition hover:bg-muted"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => open('whatsapp')}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-right transition active:scale-[0.99] hover:bg-emerald-500/12"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-black text-foreground">WhatsApp</span>
              <span className="block text-xs text-muted-foreground">واتساب العادي</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => open('business')}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-right transition active:scale-[0.99] hover:bg-emerald-500/12"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <BriefcaseBusiness className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-black text-foreground">WhatsApp Business</span>
              <span className="block text-xs text-muted-foreground">واتساب الأعمال</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
