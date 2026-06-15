import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ticketsApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, CalendarPlus, Save } from 'lucide-react';
import { usersApi } from '@/lib/api';
import { useTicketTypes } from '@/contexts/TicketTypesContext';
import { cn } from '@/lib/utils';
import { Ticket } from '@/types';

interface SaveInternalAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: Ticket[];
  onSuccess?: () => void;
}

export function SaveInternalAppointmentDialog({
  open,
  onOpenChange,
  tickets,
  onSuccess
}: SaveInternalAppointmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [selectedSupIds, setSelectedSupIds] = useState<string[]>([]);

  const { typeTranslations } = useTicketTypes();
  const mergedTypes: Record<string, string> = {
    electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب', paints: 'دهانات',
    ceramics: 'سيراميك', drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية',
    waterproofing: 'عزل مائي', pest_control: 'مكافحة حشرات', general: 'عام',
    ...typeTranslations
  };

  useEffect(() => {
    usersApi.getAll().then((u: any[]) => {
      setSupervisors(u.filter((x: any) => x.role === 'supervisor'));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      // Set default date to today
      const today = new Date();
      const offset = today.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(today.getTime() - offset)).toISOString().split('T')[0];
      setDate(localISOTime);
      setTime('09:00');
      
      // If there's an existing appointment time from the first ticket, pre-fill it
      if (tickets.length > 0 && tickets[0].appointmentTime) {
         const parts = tickets[0].appointmentTime.split(' ');
         if (parts[0]) setDate(parts[0]);
         if (parts[1]) setTime(parts[1]);
      }
      
      // Pre-fill notes if available
      if (tickets.length > 0 && tickets[0].appointmentNotes) {
         setNotes(tickets[0].appointmentNotes);
      } else {
         setNotes('');
      }

      const types = new Set<string>();
      tickets.forEach((t: any) => {
        if (t.type) types.add(t.type);
        if (t.detectedTypes) t.detectedTypes.forEach((dt: string) => types.add(dt));
      });
      setSelectedTypes(Array.from(types));

      const supIds = new Set<string>();
      tickets.forEach((t: any) => {
        if (t.assignedSupervisorIds) t.assignedSupervisorIds.forEach((s: string) => supIds.add(s));
      });
      setSelectedSupIds(Array.from(supIds));
    }
  }, [open, tickets]);

  const handleSave = async () => {
    if (!date || !time) {
      toast.error('الرجاء تحديد التاريخ والوقت');
      return;
    }

    setLoading(true);
    try {
      const appointmentTime = `${date} ${time}`;
      
      const assignedSupervisors = supervisors
        .filter(s => selectedSupIds.includes(s.uid || s.id))
        .map(s => ({ id: s.uid || s.id, name: s.displayName || s.name, specialty: 'general' }));

      const promises = tickets.map(t => {
        const payload: any = {
          appointmentTime,
          status: 'pending',
          appointmentAwaitingReply: false,
          isDirectAppointment: true,
          appointmentNotes: notes || null,
        };

        if (selectedTypes.length > 0) {
           payload.detectedTypes = selectedTypes;
           payload.type = selectedTypes[0];
        }

        if (selectedSupIds.length > 0) {
           payload.assignedSupervisorIds = selectedSupIds;
           payload.assignedSupervisorId = selectedSupIds[0];
           payload.assignedSupervisors = assignedSupervisors;
        } else {
           payload.assignedSupervisorIds = [];
           payload.assignedSupervisorId = null;
           payload.assignedSupervisors = [];
        }

        return ticketsApi.update(t.id, payload);
      });

      await Promise.all(promises);
      toast.success('تم حفظ الموعد بنجاح');
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error('فشل حفظ الموعد');
    } finally {
      setLoading(false);
    }
  };

  if (!tickets || tickets.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-[420px] rounded-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground text-right flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-blue-500" />
            إضافة موعد (داخلي)
          </DialogTitle>
          <p className="text-sm text-muted-foreground text-right mt-1">
            سيتم حفظ الموعد بشكل مباشر وتأكيده دون إرسال رسائل للعميل.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold text-right block">التاريخ</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-background h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold text-right block">الوقت</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-background h-11 rounded-xl" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold block text-right">
              التخصصات المطلوبة
            </Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(mergedTypes).map(([k, v]) => {
                const isSelected = selectedTypes.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedTypes(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5',
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-slate-400 hover:bg-muted/80'
                    )}
                  >
                    <div className={cn('w-2 h-2 rounded-full shrink-0', isSelected ? 'bg-blue-500' : 'bg-muted-foreground/30')} />
                    {v as React.ReactNode}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold block text-right">
              المشرفين
            </Label>
            <div className="flex flex-wrap gap-2">
              {supervisors.map(s => {
                const sId = s.uid || s.id;
                const sName = s.displayName || s.name;
                const isSelected = selectedSupIds.includes(sId);
                return (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => setSelectedSupIds(prev => prev.includes(sId) ? prev.filter(x => x !== sId) : [...prev, sId])}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5',
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-slate-400 hover:bg-muted/80'
                    )}
                  >
                    <div className={cn('w-3 h-3 rounded-[4px] border flex items-center justify-center shrink-0', isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40')} />
                    {sName}
                  </button>
                );
              })}
              {supervisors.length === 0 && <div className="text-xs text-muted-foreground">لا يوجد مشرفين</div>}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold text-right block">
              ملاحظات إضافية (تظهر للفنيين)
            </Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="أي تفاصيل تخص الموعد..."
              className="w-full bg-background border border-input rounded-xl p-3 text-foreground text-sm h-24 resize-none text-right placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            onClick={handleSave}
            disabled={loading || !date || !time}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-bold flex items-center justify-center gap-2 shadow-md"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            تأكيد وحفظ الموعد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
