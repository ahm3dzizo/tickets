import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { BellRing, CheckCircle2, Loader2, RefreshCw, XCircle, Smartphone } from 'lucide-react';
import { authStorage } from '@/lib/api';
import {
  repairAndTestPush,
  showLocalNotificationTest,
  type PushRepairResult,
  type LocalNotificationResult,
} from '@/lib/pushNotifications';

export default function PushDiagnostics() {
  const [running, setRunning] = useState(false);
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
              <p className="text-xs text-muted-foreground mt-1">يجدد اشتراك هذا الجهاز ثم يرسل Push حقيقي له فقط.</p>
            </div>
          </div>

          <Button onClick={run} disabled={running} className="w-full h-11 mt-4 rounded-2xl font-black gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {running ? 'جارٍ الإصلاح والاختبار...' : 'إصلاح واختبار Push الحقيقي'}
          </Button>
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
                <div className="font-bold text-foreground leading-6">
                  لو ما ظهرش إشعار بعنوان «اختبار محلي من Knot» بعد نجاح الخطوات دي، فالمشكلة من إعدادات إشعارات Android/المتصفح وليست من السيرفر أو FCM.
                </div>
              )}
            </div>
          )}
        </div>

        {result && (
          <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
            {row('المتصفح يدعم Web Push', result.supported)}
            {row('إذن الإشعارات مسموح', result.permission === 'granted')}
            {row('Service Worker شغال', result.serviceWorker)}
            {row('تم إنشاء Push Subscription جديد', result.subscribed)}
            {row('تم حفظ اشتراك هذا الجهاز على السيرفر', result.saved)}
            {row(`FCM قبل رسالة هذا الجهاز${result.statusCode ? ` — ${result.statusCode}` : ''}`, result.testAccepted && result.delivered === 1)}

            <div className="mt-4 rounded-2xl bg-muted/50 p-4 text-sm space-y-1">
              {result.endpointHost && <div className="text-muted-foreground text-xs">مزود Push: {result.endpointHost}</div>}
              {result.error ? (
                <div className="text-red-500 font-bold">❌ {result.error}</div>
              ) : (
                <div className="text-emerald-500 font-bold">✅ تم اختبار هذا الجهاز فقط، وFCM قبل الرسالة{result.statusCode ? ` بحالة ${result.statusCode}` : ''}.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
