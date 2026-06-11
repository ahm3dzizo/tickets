import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ticketsApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, Ticket as TicketIcon, Save } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ClientTicketsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  villaNumber: string;
  projectId: string;
  initialNotes?: string;
  onSuccess?: () => void;
}

export function ClientTicketsModal({
  open,
  onOpenChange,
  villaNumber,
  projectId,
  initialNotes = '',
  onSuccess
}: ClientTicketsModalProps) {
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);
  const [notes, setNotes] = useState(initialNotes);

  useEffect(() => {
    if (open && villaNumber) {
      setNotes(initialNotes);
      setFetching(true);
      ticketsApi.getAll({ projectId, status: 'open', includeDirectAppts: true })
        .then(res => {
          const tks = res.filter((t: any) => t.villaNumber === villaNumber && !['closed', 'out-of-scope', 'completed'].includes(t.status));
          setTickets(tks);
          // Auto-fill notes if not provided but exists in tickets
          if (!initialNotes && tks.length > 0 && tks[0].appointmentNotes) {
            setNotes(tks[0].appointmentNotes);
          }
        })
        .catch(() => {})
        .finally(() => setFetching(false));
    }
  }, [open, villaNumber, projectId]);

  const handleSaveNotes = async () => {
    if (tickets.length === 0) return;
    setLoading(true);
    try {
      const promises = tickets.map(t => ticketsApi.update(t.id, { appointmentNotes: notes }));
      await Promise.all(promises);
      toast.success('تم حفظ الملاحظات بنجاح');
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error('فشل حفظ الملاحظات');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-[450px] rounded-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground text-right flex items-center gap-2">
            <TicketIcon className="w-5 h-5 text-blue-400" />
            التذاكر المفتوحة (فيلا {villaNumber})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {fetching ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : tickets.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">لا توجد تذاكر مفتوحة حالياً.</p>
          ) : (
            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {tickets.map(t => (
                <div key={t.id} className="bg-background border border-input p-3 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-500 dark:text-blue-400">#{t.ticketId || t.id.slice(0,6)}</span>
                    <Link to={`/tickets/${t.id}`} className="text-[10px] bg-muted hover:bg-muted/80 text-foreground px-2 py-1 rounded transition-colors">
                      عرض التفاصيل
                    </Link>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{t.description}</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block text-right">
              ملاحظات للموعد
            </Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="تعديل الملاحظات الفنية لهذا الموعد..."
              className="w-full bg-background border border-input rounded-xl p-3 text-foreground text-sm h-20 resize-none text-right placeholder:text-muted-foreground focus:border-blue-500/50"
            />
          </div>
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button
            onClick={handleSaveNotes}
            disabled={loading || fetching || tickets.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-bold flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ الملاحظات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
