import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ticketsApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, Save, FileImage, ExternalLink, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface ClientTicketsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  villaNumber: string;
  projectId: string;
  initialNotes?: string;
  onSuccess?: () => void;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function cleanDescription(text?: string): { text: string; hasAttachments: boolean } {
  if (!text) return { text: '', hasAttachments: false };
  const urls = text.match(URL_REGEX) || [];
  const clean = text.replace(URL_REGEX, '').replace(/\s+/g, ' ').trim();
  return { text: clean, hasAttachments: urls.length > 0 };
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  'open':         { label: 'مفتوحة',       color: 'bg-blue-500/15 text-blue-500' },
  'in-progress':  { label: 'قيد التنفيذ',  color: 'bg-amber-500/15 text-amber-500' },
  'pending':      { label: 'معلقة',         color: 'bg-slate-500/15 text-slate-400' },
  'waiting':      { label: 'بانتظار موعد', color: 'bg-purple-500/15 text-purple-500' },
  'contractor':   { label: 'مقاول',         color: 'bg-cyan-500/15 text-cyan-500' },
};

export function ClientTicketsModal({
  open,
  onOpenChange,
  villaNumber,
  projectId,
  initialNotes = '',
  onSuccess,
}: ClientTicketsModalProps) {
  const [loading, setLoading]   = useState(false);
  const [tickets, setTickets]   = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);
  const [notes, setNotes]       = useState(initialNotes);

  useEffect(() => {
    if (!open || !villaNumber) return;
    setNotes(initialNotes);
    setFetching(true);
    ticketsApi
      .getAll({ projectId, includeDirectAppts: true })
      .then(res => {
        const tks = res.filter(
          (t: any) =>
            String(t.villaNumber || '').trim() === String(villaNumber || '').trim() &&
            !['closed', 'out_of_scope', 'completed'].includes(t.status),
        );
        setTickets(tks);
        if (!initialNotes && tks.length > 0 && tks[0].appointmentNotes) {
          setNotes(tks[0].appointmentNotes);
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [open, villaNumber, projectId]);

  const handleSaveNotes = async () => {
    if (tickets.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(tickets.map(t => ticketsApi.update(t.id, { appointmentNotes: notes })));
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
      <DialogContent
        className="bg-card border-border text-foreground sm:max-w-[480px] rounded-2xl p-0 overflow-hidden gap-0"
        dir="rtl"
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/60">
          <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <Wrench className="w-4 h-4 text-blue-500" />
            </div>
            <span>التذاكر المفتوحة</span>
            <span className="text-muted-foreground font-normal">— فيلا {villaNumber}</span>
            {tickets.length > 0 && (
              <span className="mr-auto text-xs font-bold bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full">
                {tickets.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 max-h-[55vh] overflow-y-auto">
          {/* Tickets list */}
          {fetching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              لا توجد تذاكر مفتوحة حالياً
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => {
                const { text, hasAttachments } = cleanDescription(t.description);
                const status = STATUS_MAP[t.status] ?? { label: t.status, color: 'bg-muted text-muted-foreground' };
                return (
                  <div
                    key={t.id}
                    className="bg-background border border-border/60 rounded-xl p-3.5 space-y-2"
                  >
                    {/* Top row */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-blue-500">
                        #{t.ticketId || t.id.slice(0, 6)}
                      </span>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', status.color)}>
                        {status.label}
                      </span>
                      {hasAttachments && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                          <FileImage className="w-3 h-3" />
                          مرفقات
                        </span>
                      )}
                      <Link
                        to={`/tickets/${t.id}`}
                        onClick={() => onOpenChange(false)}
                        className="mr-auto flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-400 font-bold transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        التفاصيل
                      </Link>
                    </div>

                    {/* Description */}
                    {text && (
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                        {text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2 pt-1 border-t border-border/50">
            <Label className="text-xs font-bold text-muted-foreground tracking-wide block">
              ملاحظات الموعد
            </Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="أضف ملاحظات فنية لهذا الموعد..."
              rows={3}
              className="w-full bg-background border border-border/60 rounded-xl px-3.5 py-2.5 text-sm text-foreground resize-none text-right placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10 transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-4 border-t border-border/60 bg-muted/30">
          <Button
            onClick={handleSaveNotes}
            disabled={loading || fetching || tickets.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 font-bold gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ الملاحظات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
