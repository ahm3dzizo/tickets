import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Eye, Edit2, MessageSquare, Square, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Ticket, TicketType } from '@/types';
import { format, differenceInDays, parse, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Helpers ────────────────────────────────────────────────────────────────

export function parseIssuedAt(raw: string | number): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = Number(raw);
  if (!isNaN(num) && num > 1000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    return isValid(d) ? d : null;
  }
  const str = String(raw).trim();
  const formats = ['d/M/yyyy', 'M/d/yyyy', 'yyyy-MM-dd', 'd-M-yyyy', 'dd/MM/yyyy'];
  for (const fmt of formats) {
    const d = parse(str, fmt, new Date());
    if (isValid(d)) return d;
  }
  const d = new Date(str);
  return isValid(d) ? d : null;
}

export const typeTranslations: Record<TicketType, string> = {
  electricity:     'كهرباء',
  plumbing:        'سباكة',
  doors:           'أبواب',
  paints:          'دهانات',
  cracks:          'تشققات',
  ceramics:        'سيراميك',
  tank_insulation: 'عزل خزان',
};

export const statusTranslations: Record<string, string> = {
  open:        'مفتوحة',
  'in-progress': 'قيد التنفيذ',
  pending:     'معلقة',
  completed:   'مكتملة',
  closed:      'مغلقة',
};

export const statusColors: Record<string, string> = {
  open:          'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'in-progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  pending:       'bg-purple-500/10 text-purple-400 border-purple-500/20',
  completed:     'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed:        'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const priorityBgMap: Record<number, string> = {
  9: 'bg-red-600 text-white',
  7: 'bg-orange-500 text-white',
  6: 'bg-blue-700 text-white',
  4: 'bg-sky-500 text-white',
  3: 'bg-emerald-600 text-white',
  2: 'bg-teal-600 text-white',
  1: 'bg-slate-500 text-white',
  0: 'bg-slate-700 text-white',
};

const typeBg: Record<TicketType, string> = {
  plumbing:        'bg-blue-500/10 text-blue-400 border-blue-500/20',
  electricity:     'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  tank_insulation: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  doors:           'bg-purple-500/10 text-purple-400 border-purple-500/20',
  cracks:          'bg-red-500/10 text-red-400 border-red-500/20',
  paints:          'bg-orange-500/10 text-orange-400 border-orange-500/20',
  ceramics:        'bg-teal-500/10 text-teal-400 border-teal-500/20',
};

// ─── Component ──────────────────────────────────────────────────────────────

interface TicketTableProps {
  tickets: Ticket[];
  loading?: boolean;
  emptyMessage?: string;
  /** Controlled selection — pass both to enable checkboxes */
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Hide the "المسؤول" column (useful for supervisor role) */
  hideSupervisorColumn?: boolean;
  /** Override the max-height of the scroll container */
  maxHeight?: string;
  /** Hide the project column when user only has one project */
  hideProjectColumn?: boolean;
  /** Project name map for displaying project names in the column */
  projects?: Record<string, { name: string; abbreviation?: string }>;
}

export function TicketTable({
  tickets,
  loading = false,
  emptyMessage = 'لا توجد تذاكر',
  selectedIds,
  onSelectionChange,
  hideSupervisorColumn = false,
  maxHeight = 'calc(100vh - 260px)',
  hideProjectColumn = false,
  projects,
}: TicketTableProps) {
  const navigate = useNavigate();

  const hasSelection = !!onSelectionChange;
  const allSelected = hasSelection && tickets.length > 0 && tickets.every(t => selectedIds?.includes(t.id));
  const someSelected = hasSelection && tickets.some(t => selectedIds?.includes(t.id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : tickets.map(t => t.id));
  };

  const toggleOne = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
    );
  };

  const handleWhatsApp = (ticket: Ticket) => {
    const phone = '966500000000';
    const message = `السلام عليكم، بخصوص بلاغ الصيانة رقم ${ticket.ticketId || ticket.id} للفيلا رقم ${ticket.villaNumber}. نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="py-16 text-center text-slate-500 text-sm font-medium">
        {emptyMessage}
      </div>
    );
  }

  const thCls = 'px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap';

  return (
    <>
      {/* ── MOBILE CARD VIEW (hidden on md+) ────────────────────────── */}
      <div className="flex flex-col gap-2 p-2 md:hidden" dir="rtl">
        {tickets.map((ticket) => {
          const createdAt = (ticket.createdAt as any)?.toDate
            ? (ticket.createdAt as any).toDate()
            : new Date(ticket.createdAt as any);
          const openDate = (ticket.issuedAt ? parseIssuedAt(ticket.issuedAt) : null) ?? createdAt;
          const daysOpen = differenceInDays(new Date(), openDate);
          const daysBg =
            daysOpen > 30 ? 'bg-red-500/15 text-red-400 border-red-500/20' :
            daysOpen > 14 ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
            daysOpen > 6  ? 'bg-orange-500/15 text-orange-400 border-orange-500/20' :
                            'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';

          const priorityNum = typeof ticket.priority === 'number' ? ticket.priority : 3;
          const priorityCls = priorityBgMap[priorityNum] ?? 'bg-slate-700 text-white';

          const typeList: TicketType[] =
            ticket.detectedTypes?.length
              ? ticket.detectedTypes as TicketType[]
              : ticket.type ? [ticket.type as TicketType] : [];

          const supervisorList: { id: string; name: string }[] =
            ticket.assignedSupervisors?.length
              ? ticket.assignedSupervisors
              : ticket.assigneeName && ticket.assigneeName !== '---'
                ? [{ id: ticket.assignedSupervisorId || '', name: ticket.assigneeName }]
                : [];

          const isSelected = selectedIds?.includes(ticket.id) ?? false;
          const isClosed = ticket.status === 'closed';
          const isOverdue = !isClosed && daysOpen > 6;

          return (
            <div
              key={ticket.id}
              className={cn(
                'relative rounded-2xl border border-border bg-card overflow-hidden cursor-pointer transition-all active:scale-[0.99]',
                isSelected && 'border-blue-500/50 bg-blue-500/5',
                isOverdue && 'border-red-500/40',
                isClosed && 'opacity-50',
              )}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                navigate(`/tickets/${ticket.id}`);
              }}
            >
              {/* Overdue accent stripe */}
              {isOverdue && (
                <div className="absolute top-0 right-0 h-full w-1 bg-red-500/60 rounded-r-2xl" />
              )}

              {/* Card header */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/40">
                {/* Left side: priority + days */}
                <div className="flex items-center gap-2">
                  {hasSelection && (
                    <button
                      onClick={e => { e.stopPropagation(); toggleOne(ticket.id); }}
                      className="text-slate-600 hover:text-blue-400 transition-colors"
                    >
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-blue-500" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  )}
                  <span className={cn('text-[11px] font-black px-2 py-0.5 rounded-lg min-w-[22px] text-center', priorityCls)}>
                    {priorityNum}
                  </span>
                  <span className={cn('text-[11px] font-bold px-2.5 py-0.5 rounded-full border', daysBg)}>
                    {daysOpen} يوم
                  </span>
                  <span className={cn(
                    'text-[10px] font-bold px-2.5 py-0.5 rounded-full border',
                    statusColors[ticket.status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                  )}>
                    {statusTranslations[ticket.status] ?? ticket.status}
                  </span>
                </div>
                {/* Right side: ref + ticketId */}
                <div className="text-right leading-tight">
                  <div className="font-black text-white text-sm">{ticket.refNumber || '---'}</div>
                  {ticket.ticketId && (
                    <div className="text-[10px] text-slate-600 font-mono"># {ticket.ticketId}</div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="px-4 py-2.5">
                <p className="text-slate-200 text-[13px] leading-relaxed line-clamp-2">
                  {ticket.description}
                </p>
              </div>

              {/* Footer: meta info */}
              <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1.5 px-4 pb-3">
                {/* Right: client + supervisor */}
                <div className="flex flex-col items-end gap-0.5">
                  {ticket.clientName && (
                    <span className="text-[11px] text-slate-400 font-medium">
                      🏠 {ticket.clientName}
                      {ticket.villaNumber ? ` · فيلا ${ticket.villaNumber}` : ''}
                    </span>
                  )}
                  {supervisorList.length > 0 && (
                    <span className="text-[11px] text-amber-400 font-medium">
                      👷 {supervisorList.map(s => s.name).join('، ')}
                    </span>
                  )}
                  {ticket.appointmentTime && (
                    <span className="text-[11px] text-emerald-400 font-bold">
                      📅 {ticket.appointmentTime}
                    </span>
                  )}
                </div>
                {/* Left: types */}
                <div className="flex items-center gap-1 flex-wrap justify-start">
                  {typeList.slice(0, 3).map((t, i) => (
                    <span key={i} className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg border', typeBg[t])}>
                      {typeTranslations[t] ?? t}
                    </span>
                  ))}
                  {!hideProjectColumn && ticket.projectId && projects?.[ticket.projectId] && (
                    <span className="text-[10px] text-slate-600 font-medium">
                      {projects[ticket.projectId].abbreviation || projects[ticket.projectId].name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── DESKTOP TABLE VIEW (hidden below md) ────────────────────── */}
      <div className="hidden md:block overflow-auto" style={{ maxHeight }}>
      <table className="w-full text-right border-collapse">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border bg-white/5">
            {hasSelection && (
              <th className={cn(thCls, 'w-10 text-center')}>
                <button
                  onClick={toggleAll}
                  className="text-slate-500 hover:text-blue-400 transition-colors"
                >
                  {allSelected
                    ? <CheckSquare className="w-4 h-4 text-blue-500" />
                    : someSelected
                      ? <CheckSquare className="w-4 h-4 text-blue-400/50" />
                      : <Square className="w-4 h-4" />}
                </button>
              </th>
            )}
            <th className={thCls}>ID</th>
            <th className={thCls}>المرجع</th>
            <th className={thCls}>العميل</th>
            {!hideProjectColumn && <th className={thCls}>المشروع</th>}
            <th className={thCls}>التاريخ</th>
            <th className={cn(thCls, 'min-w-[200px]')}>وصف المشكلة</th>
            <th className={cn(thCls, 'text-center')}>ف</th>
            <th className={cn(thCls, 'text-center')}>الأيام</th>
            {!hideSupervisorColumn && (
              <th className={cn(thCls, 'text-center')}>المسؤول</th>
            )}
            <th className={cn(thCls, 'text-center')}>التخصص</th>
            <th className={cn(thCls, 'text-center')}>الحالة</th>
            <th className={cn(thCls, 'text-center')}>موعد / ملاحظات</th>
            <th className={cn(thCls, 'text-center border-r border-border/20')}>إجراءات</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {tickets.map((ticket) => {
            const createdAt = (ticket.createdAt as any)?.toDate
              ? (ticket.createdAt as any).toDate()
              : new Date(ticket.createdAt as any);
            const openDate = (ticket.issuedAt ? parseIssuedAt(ticket.issuedAt) : null) ?? createdAt;
            const daysOpen = differenceInDays(new Date(), openDate);
            const daysBg = daysOpen > 30
              ? 'text-red-400 font-bold'
              : daysOpen > 14
                ? 'text-amber-400 font-bold'
                : daysOpen > 6
                  ? 'text-orange-400 font-bold'
                  : 'text-emerald-400';

            const priorityNum = typeof ticket.priority === 'number' ? ticket.priority : 3;
            const priorityCls = priorityBgMap[priorityNum] ?? 'bg-slate-700 text-white';

            const supervisorList: { id: string; name: string }[] =
              ticket.assignedSupervisors?.length
                ? ticket.assignedSupervisors
                : ticket.assigneeName && ticket.assigneeName !== '---'
                  ? [{ id: ticket.assignedSupervisorId || '', name: ticket.assigneeName }]
                  : [];

            const typeList: TicketType[] =
              ticket.detectedTypes?.length
                ? ticket.detectedTypes as TicketType[]
                : ticket.type
                  ? [ticket.type as TicketType]
                  : [];

            const isSelected = selectedIds?.includes(ticket.id) ?? false;
            const isClosed = ticket.status === 'closed';
            const isOverdue = !isClosed && daysOpen > 6;

            return (
              <tr
                key={ticket.id}
                className={cn(
                  'hover:bg-white/5 transition-colors cursor-pointer',
                  isSelected && 'bg-blue-500/5',
                  isOverdue && 'bg-red-500/5 border-l-2 border-l-red-500/60',
                  isClosed && 'opacity-50',
                )}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  navigate(`/tickets/${ticket.id}`);
                }}
              >
                {/* Checkbox */}
                {hasSelection && (
                  <td
                    className="px-4 py-3 text-center"
                    onClick={e => { e.stopPropagation(); toggleOne(ticket.id); }}
                  >
                    <button className="text-slate-600 hover:text-blue-500 transition-colors">
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-blue-500" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                )}

                {/* ID */}
                <td className="px-4 py-3 text-sm font-medium text-slate-400 whitespace-nowrap">
                  {ticket.ticketId || ticket.id.slice(0, 6)}
                </td>

                {/* Ref */}
                <td className="px-4 py-3 text-sm font-bold text-slate-200 whitespace-nowrap">
                  {ticket.refNumber || '---'}
                </td>

                {/* Client */}
                <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">
                  {ticket.clientName || '---'}
                </td>

                {/* Project */}
                {!hideProjectColumn && (
                  <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">
                    {(projects && ticket.projectId && projects[ticket.projectId]?.name) ||
                      ticket.projectAbbr || '---'}
                  </td>
                )}

                {/* Date */}
                <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">
                  {format(openDate, 'd/M/yyyy')}
                </td>

                {/* Description */}
                <td className="px-4 py-3 text-sm text-slate-300 max-w-[280px] leading-relaxed">
                  <span className="line-clamp-2">{ticket.description}</span>
                </td>

                {/* Priority */}
                <td className={cn('px-3 py-3 text-center font-bold text-sm w-10 border-x border-border/20', priorityCls)}>
                  {priorityNum}
                </td>

                {/* Days open */}
                <td className={cn('px-3 py-3 text-center text-sm w-12', daysBg)}>
                  {daysOpen}
                </td>

                {/* Supervisors — conditionally hidden */}
                {!hideSupervisorColumn && (
                  <td className="px-4 py-3 text-center w-28">
                    {supervisorList.length > 0 ? (
                      <div className="flex flex-col gap-1 items-center">
                        {supervisorList.map((s, i) => (
                          <span
                            key={i}
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap',
                              i === 0 ? 'bg-amber-200/20 text-amber-200' : 'bg-blue-200/15 text-blue-300',
                            )}
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-600">---</span>
                    )}
                  </td>
                )}

                {/* Types */}
                <td className="px-4 py-3 text-center">
                  {typeList.length > 0 ? (
                    <div className="flex flex-col gap-1 items-center">
                      {typeList.map((t, i) => (
                        <span
                          key={i}
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-lg border whitespace-nowrap',
                            typeBg[t] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                          )}
                        >
                          {typeTranslations[t] ?? t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-600">---</span>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-3 text-center">
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-lg border',
                    statusColors[ticket.status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                  )}>
                    {statusTranslations[ticket.status] ?? ticket.status}
                  </span>
                </td>

                {/* Appointment / notes */}
                <td className="px-4 py-3 text-center max-w-[130px]">
                  {ticket.appointmentTime ? (
                    <span className="text-[11px] text-emerald-400 font-bold">{ticket.appointmentTime}</span>
                  ) : ticket.closureNotes ? (
                    <span className="text-[10px] text-slate-500 line-clamp-1">{ticket.closureNotes}</span>
                  ) : (
                    <span className="text-[10px] text-slate-600">---</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-white rounded-lg bg-white/5"
                          />
                        }
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border text-slate-200 w-48">
                        <DropdownMenuItem
                          className="hover:bg-white/5 cursor-pointer gap-2 text-right justify-end"
                          onClick={() => navigate(`/tickets/${ticket.id}`)}
                        >
                          عرض التفاصيل <Eye className="w-4 h-4" />
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="hover:bg-white/5 cursor-pointer gap-2 text-right justify-end text-green-400"
                          onClick={() => handleWhatsApp(ticket)}
                        >
                          واتساب <MessageSquare className="w-4 h-4" />
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="hover:bg-white/5 cursor-pointer gap-2 text-right justify-end"
                          onClick={() => navigate(`/tickets/${ticket.id}`)}
                        >
                          تعديل <Edit2 className="w-4 h-4" />
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
