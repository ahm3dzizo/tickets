import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ticketsApi, appointmentsApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, CalendarClock, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTicketTypes } from '@/contexts/TicketTypesContext';

interface EditAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: any;
  supervisors?: any[];
  onSuccess?: () => void;
}

export function EditAppointmentDialog({ open, onOpenChange, group, supervisors = [], onSuccess }: EditAppointmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedSupIds, setSelectedSupIds] = useState<string[]>([]);
  
  const { typeTranslations } = useTicketTypes();
  const mergedTypes: Record<string, string> = {
    electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب', paints: 'دهانات',
    ceramics: 'سيراميك', drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية',
    waterproofing: 'عزل مائي', pest_control: 'مكافحة حشرات', general: 'عام',
    ...typeTranslations
  };

  useEffect(() => {
    if (open && group) {
      // date/time
      const [d, t] = (group.appointmentTime || '').split(' ');
      setDate(d || '');
      setTime(t || '');

      // notes: prefer appointment-level notes, fall back to any ticket note
      setNotes(
        group.notes ||
        (group.tickets || []).find((tk: any) => tk.appointmentNotes)?.appointmentNotes ||
        ''
      );

      // types: use pre-computed group.types Set (from appointment + tickets)
      const typesSource: Set<string> =
        group.types instanceof Set
          ? group.types
          : new Set<string>(group.types || []);
      if (typesSource.size === 0) {
        (group.tickets || []).forEach((tk: any) => {
          if (tk.type) typesSource.add(tk.type);
          if (tk.detectedTypes) tk.detectedTypes.forEach((dt: string) => typesSource.add(dt));
        });
      }
      setSelectedTypes(Array.from(typesSource));

      // supervisors: use pre-computed group.sups Set
      const supsSource: Set<string> =
        group.sups instanceof Set
          ? group.sups
          : new Set<string>(group.supervisorIds || []);
      if (supsSource.size === 0) {
        (group.tickets || []).forEach((tk: any) => {
          if (tk.assignedSupervisorIds) tk.assignedSupervisorIds.forEach((s: string) => supsSource.add(s));
        });
      }
      setSelectedSupIds(Array.from(supsSource));
    }
  }, [open, group]);

  const toggleType = (t: string) => {
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const toggleSup = (sId: string) => {
    setSelectedSupIds(prev => prev.includes(sId) ? prev.filter(x => x !== sId) : [...prev, sId]);
  };

  const handleSave = async () => {
    if (!date || !time) {
      toast.error('يرجى تحديد التاريخ والوقت');
      return;
    }

    if (selectedTypes.length === 0) {
      toast.error('يجب اختيار تخصص واحد على الأقل للموعد');
      return;
    }

    setLoading(true);

    const assignedSupervisors = supervisors
      .filter(s => selectedSupIds.includes(s.uid || s.id))
      .map(s => ({ id: s.uid || s.id, name: s.displayName || s.name, specialty: 'general' }));

    try {
      const appointmentId: string | undefined = group?.appointmentId;

      if (appointmentId) {
        // Use the new Appointment API — server syncs all linked tickets automatically
        await appointmentsApi.update(appointmentId, {
          date,
          time,
          notes,
          supervisorIds: selectedSupIds,
          supervisors: assignedSupervisors,
          types: selectedTypes,
        });
      } else {
        // Fallback: legacy direct ticket update (for old appointments without appointmentId)
        const newAppointmentTime = `${date} ${time}`;
        const promises = (group?.tickets || []).map((t: any) =>
          ticketsApi.update(t.id, {
            appointmentTime: newAppointmentTime,
            appointmentNotes: notes,
            appointmentAwaitingReply: false,
            isDirectAppointment: true,
            assignedSupervisorId: selectedSupIds.length > 0 ? selectedSupIds[0] : null,
            assignedSupervisorIds: selectedSupIds,
            assignedSupervisors,
            status: t.status === 'waiting' ? 'pending' : t.status,
          })
        );
        await Promise.all(promises);
      }

      toast.success('تم تعديل الموعد بنجاح');
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error('فشل تعديل الموعد');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground w-[95%] max-w-lg rounded-3xl p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="p-5 border-b bg-muted/30">
          <DialogTitle className="text-lg font-bold text-foreground text-right flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-amber-500" />
            تعديل موعد شامل (فيلا {group?.villaNumber})
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar">
          
          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">التاريخ</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-background h-10 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">الوقت</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-background h-10 rounded-xl" />
            </div>
          </div>

          {/* Specialties */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold block text-right">
              التخصصات المطلوبة (حدد لإضافة أو إزالة)
            </Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(mergedTypes).map(([k, v]) => {
                const isSelected = selectedTypes.includes(k);
                return (
                  <button
                    key={k}
                    onClick={() => toggleType(k)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5',
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-slate-400 hover:bg-muted/80'
                    )}
                  >
                    <div className={cn('w-2 h-2 rounded-full shrink-0', isSelected ? 'bg-amber-500' : 'bg-muted-foreground/30')} />
                    {v as React.ReactNode}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Supervisors */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold block text-right">
              المشرفين (اختياري)
            </Label>
            <div className="flex flex-wrap gap-2">
              {supervisors?.map(s => {
                const sId = s.uid || s.id;
                const sName = s.displayName || s.name;
                const isSelected = selectedSupIds.includes(sId);
                return (
                  <button
                    key={sId}
                    onClick={() => toggleSup(sId)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5',
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-300 shadow-sm'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-slate-400 hover:bg-muted/80'
                    )}
                  >
                    <div className={cn('w-3 h-3 rounded-[4px] border flex items-center justify-center shrink-0', isSelected ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground/40')} />
                    {sName}
                  </button>
                );
              })}
              {supervisors?.length === 0 && <div className="text-xs text-muted-foreground">لا يوجد مشرفين</div>}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold block text-right">
              ملاحظات إضافية للموعد
            </Label>
            <textarea
              className="w-full bg-background border border-input rounded-xl p-3 text-sm focus:outline-none focus:border-amber-500 transition-colors resize-none h-24"
              placeholder="اكتب أي ملاحظات خاصة بالزيارة هنا..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

        </div>

        <DialogFooter className="p-4 border-t bg-muted/10 gap-2">
          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-12 font-bold flex items-center justify-center gap-2 shadow-md"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            حفظ التعديلات الشاملة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
