import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ticketsApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, CalendarClock, Save } from 'lucide-react';

interface EditAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: any;
  onSuccess?: () => void;
}

export function EditAppointmentDialog({ open, onOpenChange, group, onSuccess }: EditAppointmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    if (open && group) {
      const apptTime = group.appointmentTime || '';
      const [d, t] = apptTime.split(' ');
      setDate(d || '');
      setTime(t || '');
    }
  }, [open, group]);

  const handleSave = async () => {
    if (!date || !time) {
      toast.error('يرجى تحديد التاريخ والوقت');
      return;
    }

    setLoading(true);
    const newAppointmentTime = `${date} ${time}`;

    try {
      const promises = group.tickets.map((t: any) => 
        ticketsApi.update(t.id, { 
          appointmentTime: newAppointmentTime,
          appointmentAwaitingReply: false,
          status: t.status === 'waiting' ? 'pending' : t.status
        })
      );
      await Promise.all(promises);
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
      <DialogContent className="bg-card border-border text-foreground sm:max-w-[400px] rounded-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground text-right flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-amber-500" />
            تعديل وتأجيل الموعد (فيلا {group?.villaNumber})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">التاريخ الجديد</Label>
            <Input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="bg-background border-input text-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">الوقت الجديد</Label>
            <Input 
              type="time" 
              value={time} 
              onChange={e => setTime(e.target.value)} 
              className="bg-background border-input text-foreground"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-11 font-bold flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ التعديل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
