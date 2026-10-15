import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supervisorClosureApi, type SupervisorClosureRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function SupervisorClosureApprovals({ ticketId }: { ticketId?: string }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<SupervisorClosureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    if (!user || !['admin', 'engineer', 'supervisor'].includes(user.role)) return;
    try { setRequests(await supervisorClosureApi.list(ticketId)); }
    catch (e) { console.error('[ClosureApprovals] load error', e); }
    finally { setLoading(false); }
  }, [ticketId, user?.uid, user?.role]);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 20000);
    window.addEventListener('focus', reload);
    return () => {window.clearInterval(t); window.removeEventListener('focus', reload);};
  }, [reload]);

  const decide = async (request: SupervisorClosureRequest, decision: 'approve' | 'reject') => {
    const reason = (notes[request.id] || '').trim();
    if (decision === 'reject' && !reason) {
      toast.error('اكتب سبب الرفض لحفظه في سجل التذكرة.');
      return;
    }
    setBusy(request.id);
    try {
      const result = await supervisorClosureApi.decide(request.id, decision, reason);
      toast.success(result.status === 'approved'
        ? 'وافق جميع المشرفين. تم إغلاق التذاكر وجدولة التقرير النهائي.'
        : result.status === 'rejected'
          ? 'تم رفض الإغلاق الشامل. سيتم إرسال تقرير أعمال المشرف الطالب فقط.'
          : 'تم حفظ موافقتك. التقرير ينتظر باقي المشرفين.');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر تسجيل القرار');
    } finally { setBusy(null); }
  };

  const cancel = async (request: SupervisorClosureRequest) => {
    const reason = (notes[request.id] || '').trim();
    if (!reason) {toast.error('اكتب سبب الإلغاء قبل إنهاء الطلب.'); return;}
    setBusy(request.id);
    try {
      await supervisorClosureApi.cancel(request.id, reason);
      toast.success('تم إلغاء الطلب. تقرير أعمالك الجزئي في طابور الإرسال.');
      await reload();
    } catch (e) {toast.error(e instanceof Error ? e.message : 'تعذّر إلغاء الطلب');}
    finally {setBusy(null);}
  };

  if (!user || !['admin', 'engineer', 'supervisor'].includes(user.role)) return null;
  const visible = requests.filter(r => r.status === 'pending' || ticketId);
  if (!visible.length && !loading) return ticketId ? null : (
    <p className="rounded-xl border border-border p-4 text-center text-muted-foreground" dir="rtl">
      لا توجد طلبات موافقة معلّقة حاليًا.
    </p>
  );

  return (
    <section className="space-y-3 rounded-2xl border border-amber-500/20 bg-card p-3 sm:p-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-foreground">موافقات إغلاق التذاكر المشتركة</h2>
          <p className="text-xs text-muted-foreground">كل مشرف يقرر عن دوره فقط. لا يُرسل التقرير النهائي قبل موافقة الجميع.</p>
        </div>
        <Link to="/closure-approvals" className="shrink-0 text-xs text-blue-600 underline dark:text-blue-400">
          كل الطلبات
        </Link>
      </div>
      {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      {visible.map(request => {
        const askedMe = request.approverUids.includes(user.uid);
        const myVote = request.votes?.[user.uid];
        const mayVote = askedMe && !myVote && request.status === 'pending';
        const waiting = request.approverUids.filter(uid => !request.votes?.[uid]);
        const ticketLabels = request.ticketIds.map(id => request.ticketNames?.[id] || id);
        const myTickets = request.ticketIds.filter(id => (request.expectedRoles?.[id] || []).includes(user.uid));
        return (
          <div key={request.id} className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 text-right">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-foreground">تذاكر {ticketLabels.map(n => '#' + n).join('، ')}</strong>
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600">
                {request.status === 'approved' ? 'تم الإغلاق النهائي' :
                  request.status === 'rejected' ? 'تقرير جزئي بعد الرفض' :
                    request.status === 'canceled' ? 'تم إلغاء الطلب (تقرير جزئي)' :
                    'بانتظار الموافقات'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              مقدّم الطلب: <b>{request.people?.[request.requesterUid] || request.requesterUid}</b>
            </p>
            {askedMe && myTickets.length > 0 && (
              <p className="rounded-lg bg-blue-500/10 px-2 py-1.5 text-xs text-blue-700 dark:text-blue-300">
                موافقتك مطلوبة عن تذاكرك: {myTickets.map(id => '#' + (request.ticketNames?.[id] || id)).join('، ')}
              </p>
            )}
            <p className="text-xs text-foreground">
              أعمال مقدّم الطلب: {Array.isArray(request.items)
                ? request.items.map(item => `${item.description} (${item.status})`).join('، ') : 'غير محددة'}
            </p>
            {!!request.notes && <p className="text-xs text-muted-foreground">ملاحظات: {request.notes}</p>}
            <div className="flex flex-wrap gap-1.5">
              {request.approverUids.map(uid => {
                const vote = request.votes?.[uid];
                return (
                  <span key={uid} className="rounded-lg border border-border px-2 py-1 text-[11px]">
                    {request.people?.[uid] || uid}
                    {' — '}
                    {(request.ticketIds.filter(id => (request.expectedRoles?.[id] || []).includes(uid))
                      .map(id => '#' + (request.ticketNames?.[id] || id)).join('، '))}
                    {' — '}
                    {vote?.decision === 'approve' ? 'وافق' : vote?.decision === 'reject' ? 'رفض' : 'بانتظار الرد'}
                  </span>
                );
              })}
            </div>
            {request.status === 'pending' && !mayVote && waiting.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" /> في انتظار {waiting.map(uid => request.people?.[uid] || uid).join('، ')}
              </p>
            )}
            {request.status === 'pending' &&
              (user.uid === request.requesterUid || user.role === 'admin' || user.role === 'engineer') && (
              <div className="space-y-2 rounded-xl border border-amber-500/30 p-2">
                <textarea value={notes[request.id] || ''} onChange={e =>
                  setNotes(previous => ({...previous, [request.id]:e.target.value}))}
                  placeholder="سبب إلغاء طلب الموافقات (مطلوب)"
                  className="min-h-14 w-full rounded-lg border border-input bg-background p-2 text-xs text-foreground" />
                <Button type="button" variant="outline" disabled={busy === request.id}
                  className="border-amber-500/50 text-amber-700 dark:text-amber-400"
                  onClick={() => void cancel(request)}>
                  {request.requesterUid === user.uid
                    ? 'إلغاء الطلب وإرسال تقرير أعمالي فقط'
                    : 'إلغاء الطلب نيابة عن مقدم الطلب (مع تسجيل السبب)'}
                </Button>
              </div>
            )}
            {mayVote && (
              <div className="space-y-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-2">
                <p className="text-xs font-bold">هل توافق على إغلاق دورك بالنيابة عنك وإرسال التقرير عند اكتمال الموافقات؟</p>
                <textarea
                  value={notes[request.id] || ''}
                  onChange={e => setNotes(previous => ({...previous, [request.id]: e.target.value}))}
                  placeholder="ملاحظات الموافقة (اختياري) أو سبب الرفض (إلزامي)"
                  className="min-h-16 w-full rounded-lg border border-input bg-background p-2 text-xs text-foreground"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" disabled={busy === request.id} onClick={() => void decide(request, 'approve')}
                    className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> أوافق على الإغلاق
                  </Button>
                  <Button type="button" variant="outline" disabled={busy === request.id}
                    onClick={() => void decide(request, 'reject')} className="gap-1.5 border-red-500/40 text-red-600">
                    <XCircle className="h-4 w-4" /> أرفض الإغلاق
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
