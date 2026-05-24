import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, X, Loader2, CheckCircle2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { whatsappApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type BannerState = 'hidden' | 'visible' | 'dismissed';
type DialogStep = 'phone' | 'code' | 'verifying' | 'connected';

const DISMISS_KEY = 'wa_banner_dismissed';

export function WhatsAppBanner() {
  const [banner, setBanner] = useState<BannerState>('hidden');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>('phone');
  const [phone, setPhone] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check WA status once on mount
  const checkStatus = useCallback(async () => {
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    try {
      const s = await whatsappApi.getStatus();
      if (s.running && !s.connected) setBanner('visible');
      // If not running or already connected → keep hidden
    } catch {
      // wa-automate not reachable → keep hidden
    }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setBanner('dismissed');
  };

  const openDialog = () => {
    setStep('phone');
    setPhone('');
    setPairingCode('');
    setDialogOpen(true);
  };

  const requestCode = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const data = await whatsappApi.pairByPhone(phone.trim());
      setPairingCode(data.code);
      setStep('code');
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذّر طلب كود الربط — تأكد من تشغيل خدمة الواتساب');
    } finally {
      setLoading(false);
    }
  };

  const verifyConnection = async () => {
    setStep('verifying');
    try {
      // Use /verify endpoint which polls for up to 30s until API comes up
      const result = await whatsappApi.verify();
      if (result.connected) {
        setStep('connected');
        setBanner('dismissed');
        sessionStorage.setItem(DISMISS_KEY, '1');
        toast.success('تم ربط واتسابك بنجاح 🎉');
      } else {
        toast.error('لم يتم الربط بعد — أدخل الكود في واتساب أولاً ثم حاول مجدداً');
        setStep('code');
      }
    } catch {
      toast.error('تعذّر التحقق — حاول مرة أخرى');
      setStep('code');
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(pairingCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (banner !== 'visible') return null;

  return (
    <>
      {/* ── Banner ─────────────────────────────────────────────────────── */}
      <div className="fixed top-0 inset-x-0 z-50 bg-emerald-600/95 backdrop-blur-sm border-b border-emerald-500/40 shadow-lg shadow-emerald-900/30">
        <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          {/* Left: dismiss */}
          <button
            onClick={dismiss}
            className="text-emerald-200 hover:text-white transition-colors shrink-0 p-1"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Center: message */}
          <div className="flex items-center gap-2 flex-1 justify-center text-center">
            <MessageSquare className="w-4 h-4 text-emerald-200 shrink-0" />
            <span className="text-white text-sm font-bold">
              واتسابك غير مرتبط — الرسائل التلقائية لن ترسل حتى تقوم بالربط
            </span>
          </div>

          {/* Right: CTA */}
          <Button
            size="sm"
            onClick={openDialog}
            className="bg-white text-emerald-700 hover:bg-emerald-50 font-bold rounded-xl h-8 px-4 text-xs shrink-0 shadow-sm"
          >
            ربط الآن
          </Button>
        </div>
      </div>

      {/* ── Dialog ─────────────────────────────────────────────────────── */}
      {dialogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => step !== 'verifying' && setDialogOpen(false)}
          />

          {/* Panel */}
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setDialogOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <h2 className="text-foreground font-bold text-lg">ربط واتساب</h2>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
            </div>

            {/* ── Step: phone ── */}
            {step === 'phone' && (
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm text-right leading-relaxed">
                  أدخل رقم هاتفك المرتبط بواتساب، وسنرسل لك كود ربط مكون من 8 أرقام.
                </p>

                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs font-bold text-right block">رقم الهاتف</Label>
                  <Input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && requestCode()}
                    placeholder="01xxxxxxxxx أو 201xxxxxxxxx"
                    dir="ltr"
                    className="bg-background/70 border-border rounded-xl h-11 text-foreground text-left"
                  />
                </div>

                <Button
                  onClick={requestCode}
                  disabled={loading || !phone.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 font-bold gap-2"
                >
                  {loading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <MessageSquare className="w-4 h-4" />}
                  طلب كود الربط
                </Button>
              </div>
            )}

            {/* ── Step: code ── */}
            {step === 'code' && (
              <div className="space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center space-y-2">
                  <p className="text-emerald-400 text-xs font-bold">كود الربط</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={copyCode}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="نسخ"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <span className="font-mono text-3xl font-black text-foreground tracking-[0.25em]">
                      {pairingCode}
                    </span>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-2xl p-4 space-y-2 text-right">
                  <p className="text-foreground font-bold text-sm">خطوات الربط:</p>
                  <ol className="text-muted-foreground text-sm space-y-1 list-decimal list-inside">
                    <li>افتح واتساب على هاتفك</li>
                    <li>اضغط على ⋮ ← الأجهزة المرتبطة</li>
                    <li>اختر «ربط جهاز»</li>
                    <li>اضغط «ربط عبر رقم الهاتف»</li>
                    <li>أدخل الكود أعلاه</li>
                  </ol>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep('phone')}
                    className="flex-1 rounded-xl h-10 text-sm"
                  >
                    رقم مختلف
                  </Button>
                  <Button
                    onClick={verifyConnection}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 font-bold text-sm"
                  >
                    تم الربط ✓
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step: verifying ── */}
            {step === 'verifying' && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <p className="text-muted-foreground text-sm">جاري التحقق من الاتصال…</p>
              </div>
            )}

            {/* ── Step: connected ── */}
            {step === 'connected' && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-foreground font-bold">تم الربط بنجاح!</p>
                <p className="text-muted-foreground text-sm text-center">
                  الرسائل التلقائية ستنطلق من واتسابك الآن.
                </p>
                <Button
                  onClick={() => setDialogOpen(false)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 px-8 font-bold"
                >
                  رائع!
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
