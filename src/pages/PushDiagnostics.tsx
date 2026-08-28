import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { BellRing, CheckCircle2, Loader2, RefreshCw, XCircle, Smartphone, Send } from 'lucide-react';
import { authStorage } from '@/lib/api';
import {
  repairAndTestPush,
  retestCurrentPush,
  showLocalNotificationTest,
  type PushRepairResult,
  type LocalNotificationResult,
} from '@/lib/pushNotifications';

export default function PushDiagnostics() {
  const [running, setRunning] = useState(false);
  const [retesting, setRetesting] = useState(false);
  const [localRunning, setLocalRunning] = useState(false);
  const [result, setResult] = useState<PushRepairResult | null>(null);
  const [localResult, setLocalResult] = useState<LocalNotificationResult | null>(null);

  const run = async () => {
    const token = authStorage.getToken();
    if (!token) return;
    setRunning(true);
    setResult(null);
    try {
      setResult(await repairAndTestPush(`Bearer ${token}`, false));
    } finally {
      setRunning(false);
    }
  };

  const retest = async () => {
    const token = authStorage.getToken();
    if (!token) return;
    setRetesting(true);
    setResult(null);
    try {
      setResult(await retestCurrentPush(`Bearer ${token}`, false));
    } finally {
      setRetesting(false);
    }
  };

  const runLocal = async () => {
    setLocalRunning(true);
    setLocalResult(null);
    try {
      setLocalResult(await showLocalNotificationTest());
    } finally {
      setLocalRunning(false);
    }
  };

  const row = (label: string, ok: boolean) => (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border/50 last:border-0">
      <span className="text-sm font-semibold">{label}</span>
      {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
    </div>
  );

  return (
    <Layout>
      <div className="max-w-xl mx-auto space-y-4 page-in" dir="rtl">
        <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black">فحص وإصلاح الإشعارات</h1>
              <p className="text-xs text-muted-foreground mt-1">يتأكد من الاشتراك الحالي، ثم يرسل Push حقيقي لهذا الجهاز ويتابع وصوله للـService Worker.</p>
            </div>
          </div>

          <Button onClick={run} disabled={running || retesting} className="w-full h-11 mt-4 rounded-2xl font-black gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {running ? 'جارٍ الإصلاح وتتبع وصول Push...' : 'إصلاح واختبار Push الحقيقي'}
          </Button>

          <Button variant="secondary" onClick={retest} disabled={running || retesting} className="w-full h-11 mt-3 rounded-2xl font-black gap-2">
            {retesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {retesting ? 'جارٍ الإرسال على نفس الاشتراك...' : 'إرسال Push مرة ثانية بدون تجديد الاشتراك'}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-2 leading-5">الزر الثاني لا يعمل unsubscribe أو subscribe؛ يستخدم نفس endpoint الموجود على الجهاز كما هو.</p>
        </div>

        <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black">اختبار عرض محلي</h2>
              <p className="text-xs text-muted-foreground mt-1">لا يستخدم FCM ولا السيرفر؛ يطلب من المتصفح عرض إشعار على هذا الجهاز مباشرة.</p>
            </div>
          </div>

          <Button variant="outline" onClick={runLocal} disabled={localRunning} className="w-full h-11 mt-4 rounded-2xl font-black gap-2">
            {localRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
            {localRunning ? 'جارٍ الاختبار المحلي...' : 'إظهار إشعار محلي الآن'}
          </Button>

          {localResult && (
            <div className="mt-4 rounded-2xl bg-muted/50 p-4 text-sm space-y-2">
              {row('إذن الإشعارات مسموح', localResult.permission === 'granted')}
              {row('Service Worker شغال', localResult.serviceWorker)}
              {row('المتصفح قبل أمر عرض الإشعار', localResult.ok)}
              {localResult.error ? (
                <div className="text-red-500 font-bold">❌ {localResult.error}</div>
              ) : (
                <div className="font-bold text-foreground leading-6">طبقة عرض الإشعارات المحلية سليمة على هذا الجهاز.</div>
              )}
            </div>
          )}
        </div>

        {result && (
          <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
            {row('المتصفح يدعم Web Push', result.supported)}
            {row('إذن الإشعارات مسموح', result.permission === 'granted')}
            {row('Service Worker شغال', result.serviceWorker)}
            {row(result.subscriptionCreated ? 'تم إنشاء Push Subscription جديد' : 'تم استخدام Push Subscription الحالي', result.subscribed)}
            {row('تم حفظ اشتراك هذا الجهاز على السيرفر', result.saved)}
            {row(`FCM قبل رسالة هذا الجهاز${result.statusCode ? ` — ${result.statusCode}` : ''}`, result.testAccepted && result.delivered === 1)}
            {row('Service Worker استلم push event فعليًا', result.swPushReceived === true)}

            <div className="mt-4 rounded-2xl bg-muted/50 p-4 text-sm space-y-2">
              {result.endpointHost && <div className="text-muted-foreground text-xs">مزود Push: {result.endpointHost}</div>}
              {result.swPushEvent?.receivedAt && <div className="text-muted-foreground text-xs">وقت وصول الحدث: {new Date(result.swPushEvent.receivedAt).toLocaleString('ar-SA')}</div>}
              {result.swPushEvent?.title && <div className="text-muted-foreground text-xs">عنوان الـpayload: {result.swPushEvent.title}</div>}

              {result.error ? (
                <div className="text-red-500 font-bold">❌ {result.error}</div>
              ) : result.swPushReceived ? (
                <div className="text-emerald-500 font-bold leading-6">✅ FCM قبل الرسالة والـService Worker استلمها فعلًا.</div>
              ) : (
                <div className="text-amber-500 font-bold leading-6">⚠️ FCM قبل الرسالة، لكن لم نسجل وصول push event للـService Worker خلال نافذة الانتظار. جرّب زر «إرسال Push مرة ثانية بدون تجديد الاشتراك»؛ لو كرر 201 بدون SW ACK، يبقى المشكلة في تسليم FCM للاشتراك الحالي نفسه.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
