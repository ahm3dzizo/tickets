import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Eye, Edit2, MessageSquare, Square, CheckSquare, Search, ChevronDown, X, Edit, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
  open:            'مفتوحة',
  'in-progress':   'قيد التنفيذ',
  pending:         'معلقة',
  completed:       'مكتملة',
  closed:          'مغلقة',
  'out-of-scope':  'خارج اختصاص',
};

export const statusColors: Record<string, string> = {
  open:            'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'in-progress':   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  pending:         'bg-purple-500/10 text-purple-400 border-purple-500/20',
  completed:       'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed:          'bg-slate-500/10 text-slate-400 border-slate-500/20',
  'out-of-scope':  'bg-rose-500/10 text-rose-400 border-rose-500/20',
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

// ─── BulkActionBar ────────────────────────────────────────────────────────
const DEFAULT_STATUS_OPTIONS = [
  { key: 'open',          label: 'مفتوحة' },
  { key: 'in-progress',   label: 'قيد التنفيذ' },
  { key: 'waiting',       label: 'بانتظار الموعد' },
  { key: 'pending',       label: 'معلقة' },
  { key: 'completed',     label: 'مكتملة' },
  { key: 'closed',        label: 'مغلقة' },
  { key: 'out-of-scope',  label: 'خارج اختصاص', danger: true },
];

export interface BulkActionBarProps {
  count: number;
  isMultiClient?: boolean;
  onStatusChange: (status: string) => void;
  onAppointment?: () => void;
  onClose?: () => void;
  onClear: () => void;
  statusOptions?: { key: string; label: string; danger?: boolean }[];
}

export function BulkActionBar({
  count,
  isMultiClient = false,
  onStatusChange,
  onAppointment,
  onClose,
  onClear,
  statusOptions = DEFAULT_STATUS_OPTIONS,
}: BulkActionBarProps) {
  return (
    <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 sm:gap-2.5 bg-slate-900/95 backdrop-blur-md border border-blue-500/30 rounded-2xl shadow-2xl shadow-black/60 px-2.5 sm:px-4 py-2 sm:py-2.5 w-fit max-w-[calc(100vw-1rem)] sm:max-w-2xl" dir="rtl">
      {/* Count */}
      <div className="flex items-center gap-1.5 pl-2.5 sm:pl-3 border-l border-white/10 shrink-0">
        <span className="text-base sm:text-lg font-black text-blue-400">{count}</span>
        <span className="text-[10px] font-bold text-slate-500 hidden sm:block">مختارة</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="outline" size="sm" className="border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold rounded-xl gap-1 sm:gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 text-xs sm:text-sm shrink-0">
              <Edit className="w-3.5 h-3.5" />
              الحالة
              <ChevronDown className="w-3 h-3" />
            </Button>
          } />
          <DropdownMenuContent className="bg-card border-border text-slate-200">
            {statusOptions.map(opt => (
              <DropdownMenuItem
                key={opt.key}
                className={cn('text-right justify-end hover:bg-white/5', opt.danger && 'hover:bg-rose-500/10 text-rose-400')}
                onClick={() => onStatusChange(opt.key)}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {onAppointment && !isMultiClient && (
          <Button
            variant="outline" size="sm"
            className="border-green-500/30 bg-green-500/10 text-green-400 font-bold rounded-xl gap-1 sm:gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 text-xs sm:text-sm shrink-0"
            onClick={onAppointment}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            موعد
          </Button>
        )}

        {onClose && !isMultiClient && (
          <Button
            variant="outline" size="sm"
            className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400 font-bold rounded-xl gap-1 sm:gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 text-xs sm:text-sm shrink-0"
            onClick={onClose}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            إغلاق
          </Button>
        )}
      </div>

      {/* Clear */}
      <Button
        variant="ghost" size="icon"
        className="shrink-0 text-slate-500 hover:text-white h-9 w-9 sm:h-10 sm:w-10"
        onClick={onClear}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

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
  /** Show a compact search/filter bar inside the table (for pages without their own filter bar) */
  showInlineFilters?: boolean;
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
  showInlineFilters = false,
}: TicketTableProps) {
  const navigate = useNavigate();

  // ── Local filter state (only active when showInlineFilters=true) ──────────
  const [localSearch, setLocalSearch] = useState('');
  const [localStatus, setLocalStatus] = useState('');
  const [localType, setLocalType] = useState<TicketType | ''>('');
  const [localProject, setLocalProject] = useState('');

  // Apply local filters when enabled
  const baseTickets = showInlineFilters
    ? tickets.filter(t => {
        const s = localSearch.toLowerCase();
        const matchSearch = !s ||
          t.villaNumber?.toLowerCase().includes(s) ||
          t.description?.toLowerCase().includes(s) ||
          t.clientName?.toLowerCase().includes(s) ||
          t.ticketId?.toLowerCase().includes(s) ||
          t.refNumber?.toLowerCase().includes(s);
        const matchStatus = !localStatus || t.status === localStatus;
        const matchType = !localType ||
          t.type === localType ||
          (t.detectedTypes as string[] | undefined)?.includes(localType);
        const matchProject = !localProject || t.projectId === localProject;
        return matchSearch && matchStatus && matchType && matchProject;
      })
    : tickets;

  // Closed tickets always sink to the bottom regardless of any other ordering
  const sortClosed = (arr: Ticket[]) =>
    [...arr].sort((a, b) => {
      const ac = a.status === 'closed' || a.status === 'out-of-scope' ? 1 : 0;
      const bc = b.status === 'closed' || b.status === 'out-of-scope' ? 1 : 0;
      return ac - bc;
    });

  // ── Client grouping: when tickets from a single client are selected,
  //    float all their tickets to the top of the list ───────────────────────
  const focalClientKey = (() => {
    if (!selectedIds || selectedIds.length === 0) return null;
    const sel = baseTickets.filter(t => selectedIds.includes(t.id));
    if (sel.length === 0) return null;
    const keys = new Set(sel.map(t => t.clientId || t.villaNumber || t.id));
    return keys.size === 1 ? [...keys][0] : null;
  })();

  const focalClientName = focalClientKey
    ? (baseTickets.find(t => (t.clientId || t.villaNumber || t.id) === focalClientKey)?.clientName ?? '')
    : '';

  const focalTickets  = focalClientKey
    ? sortClosed(baseTickets.filter(t => (t.clientId || t.villaNumber || t.id) === focalClientKey))
    : [];
  const otherTickets  = focalClientKey
    ? sortClosed(baseTickets.filter(t => (t.clientId || t.villaNumber || t.id) !== focalClientKey))
    : sortClosed(baseTickets);

  const displayTickets = focalClientKey ? [...focalTickets, ...otherTickets] : otherTickets;
  const focalCount     = focalTickets.length;

  const hasSelection = !!onSelectionChange;
  const allSelected  = hasSelection && baseTickets.length > 0 && baseTickets.every(t => selectedIds?.includes(t.id));
  const someSelected = hasSelection && baseTickets.some(t => selectedIds?.includes(t.id));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : baseTickets.map(t => t.id));
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

  // True when at least one ticket is selected — card taps toggle instead of navigate
  const inSelectionMode = hasSelection && !!selectedIds && selectedIds.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  // When inline filters are off the parent already handles empty state, guard here
  if (!showInlineFilters && displayTickets.length === 0) {
    return (
      <div className="py-16 text-center text-slate-500 text-sm font-medium">
        {emptyMessage}
      </div>
    );
  }

  const thCls = 'px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap';

  return (
    <>
      {/* ── INLINE FILTER BAR ──────────────────────────────────────── */}
      {showInlineFilters && (
        <div className="flex items-center gap-2 p-3 border-b border-border/50 flex-wrap" dir="rtl">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <Input
              placeholder="بحث..."
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              className="pr-9 h-9 bg-transparent border-border/50 rounded-xl text-sm text-white text-right"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="sm" className={cn(
                'h-9 border-border/50 rounded-xl gap-1.5 text-xs font-medium',
                localStatus ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'bg-transparent text-slate-400',
              )}>
                <ChevronDown className="w-3 h-3 opacity-60" />
                {localStatus ? statusTranslations[localStatus] : 'الحالة'}
              </Button>
            } />
            <DropdownMenuContent className="bg-card border-border text-slate-200">
              <DropdownMenuItem className="hover:bg-white/5 text-right justify-end" onClick={() => setLocalStatus('')}>كل الحالات</DropdownMenuItem>
              {Object.entries(statusTranslations).map(([k, v]) => (
                <DropdownMenuItem key={k} className="hover:bg-white/5 text-right justify-end" onClick={() => setLocalStatus(k)}>{v}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="sm" className={cn(
                'h-9 border-border/50 rounded-xl gap-1.5 text-xs font-medium',
                localType ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'bg-transparent text-slate-400',
              )}>
                <ChevronDown className="w-3 h-3 opacity-60" />
                {localType ? typeTranslations[localType] : 'التخصص'}
              </Button>
            } />
            <DropdownMenuContent className="bg-card border-border text-slate-200">
              <DropdownMenuItem className="hover:bg-white/5 text-right justify-end" onClick={() => setLocalType('')}>كل التخصصات</DropdownMenuItem>
              {Object.entries(typeTranslations).map(([k, v]) => (
                <DropdownMenuItem key={k} className="hover:bg-white/5 text-right justify-end" onClick={() => setLocalType(k as TicketType)}>{v}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Project filter — only when projects map provided and multi-project */}
          {!hideProjectColumn && projects && Object.keys(projects).length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" size="sm" className={cn(
                  'h-9 border-border/50 rounded-xl gap-1.5 text-xs font-medium',
                  localProject ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'bg-transparent text-slate-400',
                )}>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                  {localProject ? (projects[localProject]?.name ?? 'المشروع') : 'المشروع'}
                </Button>
              } />
              <DropdownMenuContent className="bg-card border-border text-slate-200">
                <DropdownMenuItem className="hover:bg-white/5 text-right justify-end" onClick={() => setLocalProject('')}>كل المشاريع</DropdownMenuItem>
                {Object.entries(projects).map(([id, p]) => (
                  <DropdownMenuItem key={id} className="hover:bg-white/5 text-right justify-end" onClick={() => setLocalProject(id)}>{p.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {(localSearch || localStatus || localType || localProject) && (
            <Button variant="ghost" size="sm" className="h-9 rounded-xl text-slate-500 hover:text-white text-xs gap-1 px-2"
              onClick={() => { setLocalSearch(''); setLocalStatus(''); setLocalType(''); setLocalProject(''); }}>
              <X className="w-3 h-3" /> مسح
            </Button>
          )}
          <span className="text-[10px] text-slate-600 font-medium mr-auto">
            {baseTickets.length} / {tickets.length}
          </span>
        </div>
      )}

      {/* Empty state (only reachable when showInlineFilters=true) */}
      {displayTickets.length === 0 && (
        <div className="py-16 text-center text-slate-500 text-sm font-medium">{emptyMessage}</div>
      )}
      {/* ── MOBILE CARD VIEW (hidden on md+) ────────────────────────── */}
      {displayTickets.length > 0 && (
      <div className="flex flex-col gap-2 p-2 md:hidden" dir="rtl">
        {displayTickets.map((ticket, index) => {
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
          const isClosed = ticket.status === 'closed' || ticket.status === 'out-of-scope';
          const isOverdue = !isClosed && daysOpen > 6;
          const canSelect = hasSelection && !isClosed;

          // In selection mode: tap = toggle (for non-closed). Outside: tap = navigate.
          const handleCardClick = () => {
            if (canSelect && inSelectionMode) { toggleOne(ticket.id); return; }
            if (!inSelectionMode) navigate(`/tickets/${ticket.id}`);
          };

          return (
            <React.Fragment key={ticket.id}>
              {/* Focal client group header */}
              {focalClientKey && index === 0 && (
                <div className="flex items-center gap-2 px-1 pb-0.5 pt-1">
                  <span className="text-[11px] font-bold text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20">
                    {focalClientName} — {focalCount} تذاكر
                  </span>
                </div>
              )}
              {/* Divider before "other tickets" */}
              {focalClientKey && index === focalCount && otherTickets.length > 0 && (
                <div className="px-1 py-1.5 mt-0.5 border-t border-border/40">
                  <span className="text-[10px] font-bold text-slate-500">باقي التذاكر ({otherTickets.length})</span>
                </div>
              )}

              <div
                className={cn(
                  'relative rounded-2xl border bg-card overflow-hidden transition-all',
                  canSelect && inSelectionMode && 'cursor-pointer active:scale-[0.99]',
                  !inSelectionMode && 'cursor-pointer active:scale-[0.99]',
                  isSelected && 'border-blue-500/60 bg-blue-500/5 ring-1 ring-blue-500/20',
                  !isSelected && focalClientKey && index < focalCount && 'border-blue-500/20',
                  !isSelected && !(focalClientKey && index < focalCount) && isOverdue && 'border-red-500/30',
                  !isSelected && !(focalClientKey && index < focalCount) && !isOverdue && 'border-border',
                  isClosed && 'opacity-40',
                )}
                onClick={handleCardClick}
              >
                {/* Overdue left accent */}
                {isOverdue && !isSelected && (
                  <div className="absolute top-0 right-0 h-full w-0.5 bg-red-500/50" />
                )}

                {/* ── Header: ref · id  |  status · days · priority ── */}
                <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2">
                  {/* Right: checkbox + ref number + ticket ID */}
                  <div className="flex items-center gap-2 leading-tight min-w-0">
                    {canSelect && (
                      <button
                        className="text-slate-600 hover:text-blue-400 transition-colors shrink-0 p-0.5"
                        onClick={e => { e.stopPropagation(); toggleOne(ticket.id); }}
                      >
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-blue-500" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    )}
                    <div className="flex flex-col leading-tight min-w-0">
                      <span className="font-black text-white text-[15px] truncate">{ticket.refNumber || '---'}</span>
                      {ticket.ticketId && (
                        <span className="text-[10px] text-slate-600 font-mono tracking-wide">#{ticket.ticketId}</span>
                      )}
                    </div>
                  </div>
                  {/* Left: badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                      statusColors[ticket.status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                    )}>
                      {statusTranslations[ticket.status] ?? ticket.status}
                    </span>
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', daysBg)}>
                      {daysOpen}ي
                    </span>
                    <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-md min-w-[20px] text-center', priorityCls)}>
                      {priorityNum}
                    </span>
                  </div>
                </div>

                {/* ── Description ── */}
                <div className="px-3 pb-2">
                  <p className="text-slate-300 text-[13px] leading-relaxed line-clamp-2">
                    {ticket.description}
                  </p>
                </div>

                {/* ── Footer: client/villa | types | supervisor | appointment ── */}
                <div className="flex items-end justify-between gap-2 px-3 pb-2.5 pt-1 border-t border-border/30">
                  {/* Right: client + supervisor + appointment */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    {ticket.clientName && (
                      <span className="text-[11px] text-slate-400 font-medium truncate">
                        {ticket.clientName}{ticket.villaNumber ? ` · فيلا ${ticket.villaNumber}` : ''}
                      </span>
                    )}
                    {supervisorList.length > 0 && (
                      <span className="text-[11px] text-amber-400/80 font-medium truncate">
                        {supervisorList.map(s => s.name).join('، ')}
                      </span>
                    )}
                    {ticket.appointmentTime && (
                      <span className="text-[11px] text-emerald-400 font-bold">
                        {ticket.appointmentTime}
                      </span>
                    )}
                  </div>
                  {/* Left: type tags + project */}
                  <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
                    {typeList.slice(0, 2).map((t, i) => (
                      <span key={i} className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md border', typeBg[t])}>
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
            </React.Fragment>
          );
        })}
      </div>
      )}

      {/* ── DESKTOP TABLE VIEW (hidden below md) ────────────────────── */}
      {displayTickets.length > 0 && (
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
          {displayTickets.map((ticket, index) => {
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
              <React.Fragment key={ticket.id}>
                {/* Focal client group header */}
                {focalClientKey && index === 0 && (
                  <tr>
                    <td colSpan={20} className="px-4 py-2 text-[11px] font-bold text-blue-300 bg-blue-500/5 text-right border-b border-blue-500/10">
                      📋 {focalClientName} — {focalCount} تذاكر
                    </td>
                  </tr>
                )}
                {/* Divider before "other tickets" */}
                {focalClientKey && index === focalCount && otherTickets.length > 0 && (
                  <tr>
                    <td colSpan={20} className="px-4 py-1.5 text-[10px] font-bold text-slate-500 bg-white/3 text-right border-b border-border/30">
                      باقي التذاكر ({otherTickets.length})
                    </td>
                  </tr>
                )}
              <tr
                className={cn(
                  'hover:bg-white/5 transition-colors cursor-pointer',
                  isSelected && 'bg-blue-500/5',
                  focalClientKey && index < focalCount && !isSelected && 'bg-blue-500/3',
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
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
      )}
    </>
  );
}
