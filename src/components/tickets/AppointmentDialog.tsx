import React, { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Clock, AlertTriangle, CheckCircle2, Eye, Send, Save, Loader2, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { appointmentsApi, whatsappApi, ticketsApi, settingsApi } from '@/lib/api';
import { toast } from 'sonner';

// ── أنواع ─────────────────────────────────────────────────────────────────────
interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: {
    id: string;
    ticketId: string;
    clientName: string;
    villaNumber: string;
    appointmentTime?: string;
    appointmentNotes?: string;
    assignedSupervisorIds?: string[];
    status: string;
  };
  clientPhone?: string;
  onSuccess?: () => void;
}

const DEFAULT_TIME_OPTIONS = [
  { label: 'الصباح (8 ص - 12 م)', value: 'الصباح (8 ص - 12 م)' },
  { label: 'الظهر (12 م - 3 م)', value: 'الظهر (12 م - 3 م)' },
  { label: 'المساء (3 م - 6 م)', value: 'المساء (3 م - 6 م)' },
  { label: 'وقت محدد', value: 'custom' },
];

const RANGE_PRESETS = [
  { label: '3 أيام', days: 3 },
  { label: '5 أيام', days: 5 },
  { label: '7 أيام', days: 7 },
];

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function formatDateAr(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ── الكومبوننت الرئيسي ────────────────────────────────────────────────────────
export function AppointmentDialog({ open, onOpenChange, ticket, clientPhone, onSuccess }: AppointmentDialogProps) {
  // State
  const [startDate, setStartDate] = useState(todayStr());
  const [rangeDays, setRangeDays] = useState(3);
  const [timeOptions, setTimeOptions] = useState([...DEFAULT_TIME_OPTIONS, { label: 'وقت محدد', value: 'custom' }]);
  const [timeMode, setTimeMode] = useState(DEFAULT_TIME_OPTIONS[0].value);
  const [customTime, setCustomTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [dynamicPreview, setDynamicPreview] = useState<string>('جاري تحميل الرسالة...');

  const [conflicts, setConflicts] = useState<any[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const endDate = addDays(startDate, rangeDays - 1);

  // ── تهيئة القيم عند فتح الـ Dialog ──
  useEffect(() => {
    if (!open) return;
    const existing = ticket.appointmentTime;
    if (existing) {
      const parts = existing.split(' ');
      setStartDate(parts[0] || todayStr());
    } else {
      setStartDate(todayStr());
    }
    setNotes(ticket.appointmentNotes || '');
    setRangeDays(3);
    setCustomTime('09:00');
    setShowPreview(false);
    setConflicts([]);

    settingsApi.getWorkHours().then(hours => {
      const opts = hours && hours.length > 0 ? hours : DEFAULT_TIME_OPTIONS;
      const finalOpts = [...opts, { label: 'وقت محدد', value: 'custom' }];
      setTimeOptions(finalOpts);
      setTimeMode(finalOpts[0].value);
    }).catch(() => {
      const finalOpts = [...DEFAULT_TIME_OPTIONS, { label: 'وقت محدد', value: 'custom' }];
      setTimeOptions(finalOpts);
      setTimeMode(finalOpts[0].value);
    });
  }, [open]);

  // ── فحص التعارضات ──
  const checkConflicts = useCallback(async () => {
    const supIds = ticket.assignedSupervisorIds || [];
    if (supIds.length === 0 || !startDate) return;
    setCheckingConflicts(true);
    try {
      const result = await appointmentsApi.getConflicts({
        supervisorIds: supIds,
        startDate,
        endDate,
        excludeTicketId: ticket.id,
      });
      setConflicts(result.conflicts || []);
    } catch {
      setConflicts([]);
    } finally {
      setCheckingConflicts(false);
    }
  }, [startDate, endDate, ticket.id, ticket.assignedSupervisorIds]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(checkConflicts, 400);
    return () => clearTimeout(timer);
  }, [checkConflicts, open]);

  // ── الوقت النهائي ──
  const finalTime = timeMode === 'custom' ? customTime : '';
  const appointmentTime = `${startDate}${finalTime ? ' ' + finalTime : ''}`;

  // ── الوصف المُختصَر للرسالة ──
  const preferredTimeLabel = timeMode === 'custom'
    ? `الساعة ${customTime}`
    : timeOptions.find(o => o.value === timeMode)?.label.replace(/^[^ ]+ /, '') || timeMode;

  // Fetch dynamic preview when parameters change
  useEffect(() => {
    if (!open) return;
    const fetchPreview = async () => {
      try {
        const result = await whatsappApi.previewAppointmentRange(ticket.id, {
          startDate,
          endDate: addDays(startDate, rangeDays - 1),
          preferredTime: preferredTimeLabel,
          notes: notes || undefined,
          phone: clientPhone || '966500000000',
          clientName: ticket.clientName,
          villaNumber: ticket.villaNumber,
        });
        if (result.text) {
          setDynamicPreview(result.text);
        }
      } catch (err) {
        console.error('Failed to fetch preview', err);
      }
    };
    const timer = setTimeout(fetchPreview, 500);
    return () => clearTimeout(timer);
  }, [open, startDate, rangeDays, preferredTimeLabel, notes, ticket, clientPhone]);

  // ── حفظ فقط ──
  const handleSave = async () => {
    setSaving(true);
    try {
      await ticketsApi.update(ticket.id, {
        appointmentTime,
        appointmentNotes: notes,
        status: ticket.status === 'open' ? 'pending' : ticket.status,
      });
      toast.success('تم حفظ الموعد بنجاح');
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error('فشل حفظ الموعد');
    } finally {
      setSaving(false);
    }
  };

  // ── حفظ وإرسال ──
  const handleSaveAndSend = async () => {
    if (!clientPhone) {
      toast.error('لا يوجد رقم هاتف للعميل');
      return;
    }
    setSending(true);
    try {
      // حفظ الموعد أولاً
      await ticketsApi.update(ticket.id, {
        appointmentTime,
        appointmentNotes: notes,
        status: ticket.status === 'open' ? 'pending' : ticket.status,
      });

      // إرسال رسالة WhatsApp بالـ Range
      const result = await whatsappApi.sendAppointmentRange(ticket.id, {
        startDate,
        endDate,
        preferredTime: preferredTimeLabel,
        notes: notes || undefined,
        phone: clientPhone,
        clientName: ticket.clientName,
        villaNumber: ticket.villaNumber,
      });

      if (result.sent) {
        toast.success('تم تأكيد الموعد وإرسال الرسالة للعميل عبر واتساب');
      } else {
        toast.success('تم حفظ الموعد (الواتساب غير متصل)');
      }
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error('فشل حفظ أو إرسال الموعد');
    } finally {
      setSending(false);
    }
  };


  const isBusy = saving || sending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border text-slate-200 sm:max-w-[500px] rounded-3xl shadow-2xl shadow-black/50 max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-amber-400" />
            تحديد موعد الزيارة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* ── تاريخ البداية ── */}
          <div className="space-y-2">
            <Label className="text-slate-400 text-[11px] uppercase font-bold tracking-wider block">
              تاريخ بداية الفترة
            </Label>
            <input
              type="date"
              value={startDate}
              min={todayStr()}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-white/5 border border-border rounded-xl h-11 px-3 text-slate-200 text-sm [color-scheme:dark]"
            />
          </div>

          {/* ── مدة الرانج ── */}
          <div className="space-y-2">
            <Label className="text-slate-400 text-[11px] uppercase font-bold tracking-wider block">
              مدة الرانج المُرسَلة للعميل
            </Label>
            <div className="flex gap-2">
              {RANGE_PRESETS.map(p => (
                <button
                  key={p.days}
                  onClick={() => setRangeDays(p.days)}
                  className={cn(
                    'flex-1 h-10 rounded-xl text-sm font-bold border transition-all',
                    rangeDays === p.days
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-white/5 border-border text-slate-500 hover:border-slate-400'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* عرض الرانج */}
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 text-sm">
              <CalendarDays className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-amber-300 font-bold">
                {formatDateAr(startDate)} ← {formatDateAr(endDate)}
              </span>
            </div>
          </div>

          {/* ── الوقت المفضل ── */}
          <div className="space-y-2">
            <Label className="text-slate-400 text-[11px] uppercase font-bold tracking-wider block">
              الوقت المفضل للزيارة
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {timeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTimeMode(opt.value)}
                  className={cn(
                    'h-10 rounded-xl text-xs font-bold border transition-all px-2',
                    timeMode === opt.value
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                      : 'bg-white/5 border-border text-slate-500 hover:border-slate-400'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {timeMode === 'custom' && (
              <input
                type="time"
                value={customTime}
                onChange={e => setCustomTime(e.target.value)}
                className="w-full bg-white/5 border border-border rounded-xl h-11 px-3 text-slate-200 text-sm [color-scheme:dark]"
              />
            )}
          </div>

          {/* ── التعارضات ── */}
          {(checkingConflicts || conflicts.length > 0) && (
            <div className={cn(
              'rounded-xl border p-3 space-y-2',
              conflicts.length > 0
                ? 'bg-orange-500/10 border-orange-500/30'
                : 'bg-slate-500/10 border-border'
            )}>
              <div className="flex items-center gap-2">
                {checkingConflicts
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />}
                <span className={cn('text-xs font-bold', conflicts.length > 0 ? 'text-orange-300' : 'text-slate-400')}>
                  {checkingConflicts
                    ? 'جارٍ فحص التعارضات...'
                    : `${conflicts.length} موعد آخر في نفس الفترة`}
                </span>
              </div>
              {conflicts.length > 0 && (
                <div className="space-y-1">
                  {conflicts.slice(0, 3).map((c: any, i) => (
                    <div key={i} className="text-[11px] text-orange-200/80 bg-orange-500/10 rounded-lg px-2 py-1">
                      تذكرة #{c.ticketId} — {c.clientName} (فيلا {c.villaNumber}) | {c.appointmentTime?.split(' ')[0]}
                    </div>
                  ))}
                  {conflicts.length > 3 && (
                    <p className="text-[10px] text-orange-400">... و{conflicts.length - 3} أخرى</p>
                  )}
                  <p className="text-[10px] text-orange-400/70 mt-1">يمكن المتابعة — التحذير للمعلومية فقط</p>
                </div>
              )}
              {!checkingConflicts && conflicts.length === 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  لا توجد تعارضات في هذه الفترة
                </div>
              )}
            </div>
          )}

          {/* ── ملاحظات ── */}
          <div className="space-y-2">
            <Label className="text-slate-400 text-[11px] uppercase font-bold tracking-wider block">
              ملاحظات (اختياري)
            </Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="أي تعليمات للفني أو العميل..."
              className="w-full bg-white/5 border border-border rounded-xl p-3 text-right text-slate-200 text-sm resize-none h-20 placeholder:text-slate-600"
            />
          </div>

          {/* ── Preview رسالة WhatsApp ── */}
          <button
            onClick={() => setShowPreview(v => !v)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors font-bold w-full"
          >
            <Eye className="w-3.5 h-3.5" />
            {showPreview ? 'إخفاء' : 'معاينة'} رسالة WhatsApp
            <ChevronDown className={cn('w-3 h-3 transition-transform', showPreview && 'rotate-180')} />
          </button>

          {showPreview && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-[10px] text-emerald-400 font-bold mb-2 uppercase tracking-wider">معاينة الرسالة</p>
              <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                {dynamicPreview}
              </pre>
            </div>
          )}

          {/* ── أزرار الإجراء ── */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={isBusy || !startDate}
              variant="outline"
              className="flex-1 border-border bg-white/5 text-slate-300 hover:text-white rounded-xl h-12 font-bold text-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 me-1.5" />}
              حفظ فقط
            </Button>
            <Button
              onClick={handleSaveAndSend}
              disabled={isBusy || !startDate || !clientPhone}
              className={cn(
                'flex-1 rounded-xl h-12 font-bold text-sm shadow-lg',
                clientPhone
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              )}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 me-1.5" />}
              {clientPhone ? 'تأكيد وإرسال واتساب' : 'لا يوجد هاتف'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
