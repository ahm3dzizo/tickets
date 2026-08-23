import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ticketsApi, clientsApi, projectsApi } from '@/lib/api';
import { Loader2, FileImage, ExternalLink, Wrench, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';

interface ClientTicketsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  projectId: string;
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
  unitId,
  projectId,
  onSuccess,
}: ClientTicketsModalProps) {
  const [tickets, setTickets]   = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);
  const [ticketToClose, setTicketToClose] = useState<any | null>(null);

  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any>({});

  const fetchTickets = () => {
    if (!open || !unitId) return;
    setFetching(true);
    Promise.all([
      ticketsApi.getAll({ projectId, includeDirectAppts: true }),
      clientsApi.getAll(),
      projectsApi.getAll()
    ]).then(([resTickets, resClients, resProjects]) => {
        const tks = resTickets.filter(
          (t: any) =>
            String(t.unitId || '').trim() === String(unitId || '').trim() &&
            !['closed', 'out_of_scope', 'completed'].includes(t.status),
        );
        setTickets(tks);
        setClients(resClients);
        
        const projMap: any = {};
        resProjects.forEach((p: any) => { projMap[p.id] = p; });
        setProjects(projMap);

      })
      .catch(() => {})
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    fetchTickets();
  }, [open, unitId, projectId]);


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
            <span className="text-muted-foreground font-normal">— وحدة {tickets[0]?.unitNumber || '---'}</span>
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTicketToClose(t);
                        }}
                        className="mr-auto flex items-center gap-1 text-[11px] text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg font-bold transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        إغلاق التذكرة
                      </button>
                      <Link
                        to={`/tickets/${t.id}`}
                        onClick={() => onOpenChange(false)}
                        className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-400 font-bold transition-colors"
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

        </div>

      </DialogContent>

      {ticketToClose && (
        <CloseTicketDialog
          open={!!ticketToClose}
          onOpenChange={(v) => !v && setTicketToClose(null)}
          selectedTickets={[ticketToClose]}
          clients={clients}
          projects={projects}
          onSuccess={() => {
            setTicketToClose(null);
            fetchTickets();
            onSuccess?.();
          }}
        />
      )}
    </Dialog>
  );
}
