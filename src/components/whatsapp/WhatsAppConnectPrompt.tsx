import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { whatsappApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  MessageSquare, X, Loader2, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type Phase =
  | 'idle'       // initial — checking
  | 'hidden'     // wa not running, already connected, or dismissed
  | 'banner'     // wa running but not connected → show floating banner
  | 'modal'      // modal open, show QR
  | 'connected'; // just connected → brief success then hide

export function WhatsAppConnectPrompt() {
  const { user, requiresProfileCompletion } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [waQR, setWaQR] = useState<string | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || requiresProfileCompletion) return;
    checkStatus('init');
    return () => stopPolling();
  }, [user?.uid, requiresProfileCompletion]);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function checkStatus(origin: 'init' | 'manual' = 'manual') {
    try {
      const s = await whatsappApi.getStatus();
      if (!s.running || s.connected) {
        stopPolling();
        setPhase(s.connected && origin === 'manual' && phase === 'modal'
          ? 'connected'
          : 'hidden');
        if (s.connected && origin === 'manual' && phase === 'modal') {
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

  async function fetchQR() {
    setLoadingQR(true);
    try {
      const data = await whatsappApi.getQR();
      const qr = data?.qr;
      if (qr && typeof qr === 'string') {
        setWaQR(qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`);
      } else {
        setWaQR(null);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذّر جلب رمز QR');
    } finally {
      setLoadingQR(false);
    }
    startPolling();
  }

  function startPolling() {
    stopPolling();
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      try {
        const data = await whatsappApi.getQR();
        if (data?.qr && typeof data.qr === 'string') {
          const qr = data.qr;
          setWaQR(qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`);
        }
        const s = await whatsappApi.getStatus();
        if (s.connected) {
          stopPolling();
          setPhase('connected');
          toast.success('تم ربط واتساب بنجاح 🎉');
          setTimeout(() => setPhase('hidden'), 2500);
        }
      } catch {}
      if (count >= 30) stopPolling(); // give up after 60 s
    }, 2000);
  }

  function dismiss() {
    stopPolling();
    setPhase('hidden');
  }

  function openModal() {
    setWaQR(null);
    setPhase('modal');
    fetchQR();
  }

  if (phase === 'idle' || phase === 'hidden') return null;

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        className="bg-card border border-border rounded-3xl w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
        dir="rtl"
      >
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
              <p className="text-muted-foreground text-xs">امسح رمز QR للاتصال</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-5 space-y-5">
          {phase === 'modal' && (
            <div className="space-y-4">
              {loadingQR ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                  <p className="text-xs text-muted-foreground">جاري توليد رمز QR...</p>
                </div>
              ) : waQR ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-white p-3 rounded-2xl shadow-lg">
                      <img src={waQR} alt="QR Code" className="w-48 h-48 object-contain" />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      افتح واتساب ← الأجهزة المرتبطة ← ربط جهاز ← امسح الرمز
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={fetchQR}
                      variant="outline"
                      className="flex-1 h-11 rounded-xl text-xs gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      تحديث الرمز
                    </Button>
                    <Button
                      onClick={() => checkStatus('manual')}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 gap-1.5 text-xs font-bold"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      فحص الاتصال
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-muted-foreground">تعذر تحميل رمز QR تلقائياً.</p>
                  <Button
                    onClick={fetchQR}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 px-6 font-bold text-xs"
                  >
                    توليد رمز QR
                  </Button>
                </div>
              )}

              {waQR && !loadingQR && (
                <div className="flex items-center justify-center gap-2 py-1 mt-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">في انتظار مسح الرمز على هاتفك...</span>
                </div>
              )}
            </div>
          )}

          {phase === 'connected' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-foreground text-lg">تم الربط بنجاح!</h3>
                <p className="text-muted-foreground text-sm mt-1">الرسائل التلقائية تعمل الآن</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
