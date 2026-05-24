import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { whatsappApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  MessageSquare, Phone, X, Loader2, CheckCircle2, Copy, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Phase =
  | 'idle'       // initial — checking
  | 'hidden'     // wa not running, already connected, or dismissed
  | 'banner'     // wa running but not connected → show floating banner
  | 'modal'      // modal open, step 1: enter phone
  | 'requesting' // calling /pair API
  | 'code'       // code shown, auto-polling
  | 'connected'; // just connected → brief success then hide

export function WhatsAppConnectPrompt() {
  const { user, requiresProfileCompletion } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || requiresProfileCompletion) return;
    setPhone(normalizeDisplayPhone(user.phoneNumber ?? ''));
    checkStatus('init');
    return () => stopPolling();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function checkStatus(origin: 'init' | 'manual' = 'manual') {
    try {
      const s = await whatsappApi.getStatus();
      if (!s.running || s.connected) {
        stopPolling();
        setPhase(s.connected && origin === 'manual' && phase === 'code'
          ? 'connected'
          : 'hidden');
        if (s.connected && origin === 'manual' && phase === 'code') {
          toast.success('تم ربط واتساب بنجاح 🎉');
          setTimeout(() => setPhase('hidden'), 2500);
        }
        return;
      }
      setPhase('banner');
    } catch {
      setPhase('hidden');
    }
  }

  async function requestCode() {
    if (!phone.trim()) { toast.error('أدخل رقم الواتساب أولاً'); return; }
    setPhase('requesting');
    try {
      const data = await whatsappApi.pairByPhone(phone.trim());
      setCode(formatCode(data.code));
      setPhase('code');
      startPolling();
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذّر طلب كود الربط');
      setPhase('modal');
    }
  }

  function startPolling() {
    stopPolling();
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      try {
        const s = await whatsappApi.getStatus();
        if (s.connected) {
          stopPolling();
          setPhase('connected');
          toast.success('تم ربط واتساب بنجاح 🎉');
          setTimeout(() => setPhase('hidden'), 2500);
        }
      } catch {}
      if (count >= 20) stopPolling(); // give up after 60 s
    }, 3000);
  }

  function dismiss() {
    stopPolling();
    setPhase('hidden');
  }

  function openModal() {
    setCode(null);
    setPhase('modal');
  }

  // ── Nothing to render ─────────────────────────────────────────────────────
  if (phase === 'idle' || phase === 'hidden') return null;

  // ── Floating banner ───────────────────────────────────────────────────────
  if (phase === 'banner') {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50 animate-in slide-in-from-bottom-3 duration-300">
        <div className="bg-card border border-emerald-500/30 rounded-2xl shadow-2xl shadow-black/30 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 text-right min-w-0">
            <p className="text-foreground font-bold text-sm leading-tight">واتساب غير مرتبط</p>
            <p className="text-muted-foreground text-xs mt-0.5 truncate">اربط واتسابك للإرسال التلقائي</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              onClick={openModal}
              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
            >
              ربط الآن
            </Button>
            <button
              onClick={dismiss}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Modal (all modal phases) ──────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        className="bg-card border border-border rounded-3xl w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/40">
          <button
            onClick={dismiss}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <h2 className="font-bold text-foreground text-base">ربط واتساب تلقائي</h2>
              <p className="text-muted-foreground text-xs">بدون مسح رمز QR</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-5 space-y-5">

          {/* ── Step 1: Phone input ─────────────────────────────────────── */}
          {(phase === 'modal' || phase === 'requesting') && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground block">
                  رقم واتساب
                </label>
                <div className="relative">
                  <Input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                    disabled={phase === 'requesting'}
                    className="h-12 rounded-xl text-left bg-background/70 border-border text-foreground pl-4 pr-11"
                  />
                  <Phone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-xs text-muted-foreground">
                  الرقم الذي تستخدمه على واتساب (بدون مفتاح الدولة)
                </p>
              </div>

              <Button
                onClick={requestCode}
                disabled={phase === 'requesting'}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold gap-2 text-sm"
              >
                {phase === 'requesting' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />جاري طلب الكود...</>
                ) : (
                  <><MessageSquare className="w-4 h-4" />طلب كود الربط</>
                )}
              </Button>
            </div>
          )}

          {/* ── Step 2: Show code + instructions ───────────────────────── */}
          {(phase === 'code' || phase === 'connected') && code && (
            <div className="space-y-4">

              {/* Code box */}
              <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-5 text-center">
                <p className="text-xs text-muted-foreground mb-3">كود الربط (صالح لدقيقتين)</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(code.replace('-', ''));
                      toast.success('تم نسخ الكود');
                    }}
                    className="p-2 rounded-lg hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400 transition-colors"
                    title="نسخ الكود"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <span className="text-4xl font-black text-emerald-400 tracking-[0.25em] font-mono select-all">
                    {code}
                  </span>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-muted/50 rounded-2xl p-4 space-y-2.5">
                <p className="text-xs font-bold text-foreground mb-1">الخطوات على تليفونك:</p>
                {[
                  'افتح واتساب على تليفونك',
                  'اضغط ⋮ ← الإعدادات (أو iPhone: الإعدادات)',
                  'اختر الأجهزة المرتبطة',
                  'اضغط ربط جهاز',
                  'اختر استخدام رقم الهاتف بدلاً من رمز QR',
                  `أدخل الكود: ${code}`,
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-px">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>

              {/* Status row */}
              <div className="flex items-center justify-center gap-2 py-1">
                {phase === 'connected' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-400">تم الربط بنجاح!</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">في انتظار إدخال الكود على تليفونك...</span>
                  </>
                )}
              </div>

              {/* Manual check */}
              {phase === 'code' && (
                <Button
                  onClick={() => checkStatus('manual')}
                  variant="outline"
                  className="w-full h-10 rounded-xl text-sm gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  تحقق من الاتصال يدوياً
                </Button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCode(raw: string): string {
  const clean = raw.replace(/\W/g, '').toUpperCase();
  return clean.length >= 8 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}` : raw.toUpperCase();
}

function normalizeDisplayPhone(phone: string): string {
  return phone.replace(/^\+/, '').replace(/^00/, '');
}
