
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Eye, Edit2, MessageSquare, Square, CheckSquare, Search, ChevronDown, ChevronUp, ChevronsUpDown, X, Edit, MessageCircle, Download, Sparkles, Loader2, Clock } from 'lucide-react';
import { classifyOnServer } from '@/services/classificationApi';
import { ticketsApi } from '@/lib/api';
import { toast } from 'sonner';
import { ClassifyDialog } from './ClassifyDialog';
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
import { ExportTicketsModal } from './ExportTicketsModal';
import { useTicketTypes } from '@/contexts/TicketTypesContext';

// ─── Helpers ────────────────────────────────────────────────────────────────

export function parseIssuedAt(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
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

// ─── Static fallback translations (للأنواع القديمة / backward compat) ────────
// هذا الـ object يُستخدم كـ fallback فقط — الأنواع الحديثة تجي من DB عبر useTicketTypes
export const typeTranslations: Record<string, string> = {
  'electricity':     'كهرباء',
  'plumbing':        'سباكة',
  'doors':           'أبواب',
  'paints':          'دهانات',
  'cracks':          'تشققات',
  'ceramics':        'سيراميك',
  'tank_insulation': 'عزل خزان',
  'drainage':        'صرف صحي',
  'ac_ventilation':  'تكييف وتهوية',
  'pumps':           'مضخات',
  'doors_windows':   'أبواب ونوافذ',
  'waterproofing':   'عزل مائي',
  'grading':         'ميول وترويبة',
  'pest_control':    'مكافحة حشرات',
  'cleaning':        'تنظيف',
  'structural':      'إنشائي',
  'painting':        'دهانات',
  'tiles':           'سيراميك',
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

// Static fallback colors للأنواع القديمة فقط
const typeBgStatic: Record<string, string> = {
  plumbing:        'bg-blue-500/10 text-blue-400 border-blue-500/20',
  electricity:     'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  tank_insulation: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  doors:           'bg-purple-500/10 text-purple-400 border-purple-500/20',
  cracks:          'bg-red-500/10 text-red-400 border-red-500/20',
  paints:          'bg-orange-500/10 text-orange-400 border-orange-500/20',
  ceramics:        'bg-teal-500/10 text-teal-400 border-teal-500/20',
  drainage:        'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  ac_ventilation:  'bg-sky-500/10 text-sky-400 border-sky-500/20',
  pumps:           'bg-rose-500/10 text-rose-400 border-rose-500/20',
  doors_windows:   'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
  waterproofing:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  grading:         'bg-amber-500/10 text-amber-400 border-amber-500/20',
  pest_control:    'bg-lime-500/10 text-lime-400 border-lime-500/20',
  cleaning:        'bg-stone-500/10 text-stone-400 border-stone-500/20',
  structural:      'bg-gray-500/10 text-gray-400 border-gray-500/20',
  painting:        'bg-orange-500/10 text-orange-400 border-orange-500/20',
  tiles:           'bg-teal-500/10 text-teal-400 border-teal-500/20',
};

// ─── BulkActionBar ────────────────────────────────────────────────────────────
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
  hidden?: boolean;
  statusOptions?: { key: string; label: string; danger?: boolean }[];
}

export function BulkActionBar({
  count,
  isMultiClient = false,
  onStatusChange,
  onAppointment,
  onClose,
  onClear,
  hidden = false,
  statusOptions = DEFAULT_STATUS_OPTIONS,
}: BulkActionBarProps) {
  if (hidden) return null;
  const content = (
    <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 sm:gap-2.5 bg-slate-900/95 backdrop-blur-md border border-blue-500/30 rounded-2xl shadow-2xl shadow-black/60 px-2.5 sm:px-4 py-2 sm:py-2.5 w-fit max-w-[calc(100vw-1rem)] sm:max-w-2xl" dir="rtl">
      <div className="flex items-center gap-1.5 pl-2.5 sm:pl-3 border-l border-white/10 shrink-0">
        <span className="text-base sm:text-lg font-black text-blue-400">{count}</span>
        <span className="text-[10px] font-bold text-slate-500 hidden sm:block">مختارة</span>
      </div>
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
                className={cn('text-start justify-start hover:bg-white/5', opt.danger && 'hover:bg-rose-500/10 text-rose-400')}
                onClick={() => onStatusChange(opt.key)}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {onAppointment && !isMultiClient && (
          <Button variant="outline" size="sm"
            className="border-green-500/30 bg-green-500/10 text-green-400 font-bold rounded-xl gap-1 sm:gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 text-xs sm:text-sm shrink-0"
            onClick={onAppointment}>
            <MessageCircle className="w-3.5 h-3.5" />
            موعد
          </Button>
        )}
        {onClose && !isMultiClient && (
          <Button variant="outline" size="sm"
            className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400 font-bold rounded-xl gap-1 sm:gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 text-xs sm:text-sm shrink-0"
            onClick={onClose}>
            <CheckSquare className="w-3.5 h-3.5" />
            إغلاق
          </Button>
        )}
      </div>
      <Button variant="ghost" size="icon"
        className="shrink-0 text-slate-500 hover:text-white h-9 w-9 sm:h-10 sm:w-10"
        onClick={onClear}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

// ─── TicketTable ──────────────────────────────────────────────────────────────

interface TicketTableProps {
  tickets: Ticket[];
  loading?: boolean;
  emptyMessage?: string;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  hideSupervisorColumn?: boolean;
  maxHeight?: string;
  hideProjectColumn?: boolean;
  projects?: Record<string, { name: string; abbreviation?: string }>;
  showInlineFilters?: boolean;
  onRefresh?: () => void;
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
  onRefresh,
}: TicketTableProps) {
  const navigate = useNavigate();

  // ── جلب الأنواع من DB (live) ──────────────────────────────────────────────
  const {
    typeTranslations: dbTypeTranslations,
    typeBg: dbTypeBg,
  } = useTicketTypes();

  // دمج: DB أولاً ثم الـ static fallback
  const mergedTranslations: Record<string, string> = { ...typeTranslations, ...dbTypeTranslations };
  const mergedTypeBg: Record<string, string>        = { ...typeBgStatic,    ...dbTypeBg };

  // ── Local filter state ────────────────────────────────────────────────────
  const [localSearch,  setLocalSearch]  = useState('');
  const [localStatus,  setLocalStatus]  = useState('');
  const [localType,    setLocalType]    = useState<string>('');
  const [localProject, setLocalProject] = useState('');
  const [showClosed,   setShowClosed]   = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // ── Sort state (default: oldest first) ───────────────────────────────────
  type SortKey = 'date' | 'days' | 'priority' | 'status' | 'ref' | 'client';
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30 inline shrink-0" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-400 inline shrink-0" />
      : <ChevronDown className="w-3 h-3 text-blue-400 inline shrink-0" />;
  };

  const getTicketSortVal = (t: Ticket, key: SortKey): number | string => {
    const ca = (t.createdAt as any)?.toDate ? (t.createdAt as any).toDate() : new Date(t.createdAt as any);
    const openDate = (t.issuedAt ? parseIssuedAt(t.issuedAt) : null) ?? ca;
    const closeDate = t.closedAt ? new Date(t.closedAt) : null;
    const isClosed = t.status === 'closed' || t.status === 'out-of-scope';
    const endDate = (isClosed && closeDate) ? closeDate : new Date();
    switch (key) {
      case 'date':     return openDate.getTime();
      case 'days':     return differenceInDays(endDate, openDate);
      case 'priority': return typeof t.priority === 'number' ? t.priority : 3;
      case 'status':   return t.status ?? '';
      case 'ref':      return t.refNumber ?? t.ticketId ?? '';
      case 'client':   return t.clientName ?? '';
    }
  };

  const applySortAndGroup = (arr: Ticket[]) => {
    const closedSet = new Set(['closed', 'out-of-scope']);
    const open   = arr.filter(t => !closedSet.has(t.status));
    const closed = arr.filter(t =>  closedSet.has(t.status));
    const cmp = (a: Ticket, b: Ticket) => {
      const av = getTicketSortVal(a, sortKey);
      const bv = getTicketSortVal(b, sortKey);
      const diff = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'ar');
      return sortDir === 'asc' ? diff : -diff;
    };
    return [...open].sort(cmp).concat([...closed].sort(cmp));
  };

  const closedStatuses = new Set(['closed', 'out-of-scope']);

  const baseTickets = showInlineFilters
    ? tickets.filter(t => {
        const isClosed = closedStatuses.has(t.status);
        if (!showClosed && isClosed) return false;
        const s = localSearch.toLowerCase();
        const matchSearch = !s ||
          t.villaNumber?.toLowerCase().includes(s) ||
          t.description?.toLowerCase().includes(s) ||
          t.clientName?.toLowerCase().includes(s) ||
          t.ticketId?.toLowerCase().includes(s) ||
          t.refNumber?.toLowerCase().includes(s);
        const matchStatus  = !localStatus  || t.status === localStatus;
        const matchType    = !localType    || t.type === localType || (t.detectedTypes as string[] | undefined)?.includes(localType);
        const matchProject = !localProject || t.projectId === localProject;
        return matchSearch && matchStatus && matchType && matchProject;
      })
    : tickets;


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

  const focalTickets = focalClientKey
    ? applySortAndGroup(baseTickets.filter(t => (t.clientId || t.villaNumber || t.id) === focalClientKey))
    : [];
  const otherTickets = focalClientKey
    ? applySortAndGroup(baseTickets.filter(t => (t.clientId || t.villaNumber || t.id) !== focalClientKey))
    : applySortAndGroup(baseTickets);

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

  // ── Classify Dialog ───────────────────────────────────────────────────────
  const [classifyTicket, setClassifyTicket] = useState<Ticket | null>(null);

  const handleWhatsApp = (ticket: Ticket) => {
    const phone   = '966500000000';
    const message = `السلام عليكم، بخصوص بلاغ الصيانة رقم ${ticket.ticketId || ticket.id} للفيلا رقم ${ticket.villaNumber}. نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const inSelectionMode = hasSelection && !!selectedIds && selectedIds.length > 0;

  const getSupervisorNames = (ticket: Ticket): string[] => {
    const map = (ticket as any).supervisorByType as Record<string, { name: string }[]> | undefined;
    if (map) {
      const namesSet = new Set<string>();
      Object.values(map).forEach(sups => sups.forEach(s => namesSet.add(s.name)));
      if (namesSet.size > 0) return Array.from(namesSet);
    }
    const rawSups = ticket.assignedSupervisors;
    if (rawSups) {
      if (Array.isArray(rawSups)) {
        const names = rawSups.map((s: any) => s?.name).filter(Boolean);
        if (names.length > 0) return names;
      }
      if (typeof rawSups === 'object' && !Array.isArray(rawSups)) {
        const names = Object.values(rawSups as Record<string, { name: string }>)
          .map(s => s?.name).filter(Boolean);
        if (names.length > 0) return names;
      }
    }
    if (ticket.assigneeName && ticket.assigneeName !== '---') return [ticket.assigneeName];
    return [];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!showInlineFilters && displayTickets.length === 0) {
    return (
      <div className="py-16 text-center text-slate-500 text-sm font-medium">{emptyMessage}</div>
    );
  }

  const thCls = 'px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap';

  return (
    <>
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

          {/* فلتر الحالة */}
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
              <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => setLocalStatus('')}>كل الحالات</DropdownMenuItem>
              {Object.entries(statusTranslations).map(([k, v]) => (
                <DropdownMenuItem key={k} className="hover:bg-white/5 text-start justify-start" onClick={() => setLocalStatus(k)}>{v}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* فلتر التخصص — يعرض الأنواع من DB تلقائياً */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="sm" className={cn(
                'h-9 border-border/50 rounded-xl gap-1.5 text-xs font-medium',
                localType ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'bg-transparent text-slate-400',
              )}>
                <ChevronDown className="w-3 h-3 opacity-60" />
                {localType ? (mergedTranslations[localType] ?? localType) : 'التخصص'}
              </Button>
            } />
            <DropdownMenuContent className="bg-card border-border text-slate-200 max-h-72 overflow-y-auto">
              <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => setLocalType('')}>كل التخصصات</DropdownMenuItem>
              {Object.entries(mergedTranslations).map(([k, v]) => (
                <DropdownMenuItem key={k} className="hover:bg-white/5 text-start justify-start" onClick={() => setLocalType(k)}>{v}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* فلتر المشروع */}
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
                <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => setLocalProject('')}>كل المشاريع</DropdownMenuItem>
                {Object.entries(projects).map(([id, p]) => (
                  <DropdownMenuItem key={id} className="hover:bg-white/5 text-start justify-start" onClick={() => setLocalProject(id)}>{p.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button variant="outline" size="sm"
            onClick={() => setShowClosed(prev => !prev)}
            className={cn(
              'h-9 rounded-xl gap-1.5 text-xs font-medium',
              showClosed ? 'border-slate-500/50 bg-slate-500/10 text-slate-300' : 'border-border/50 bg-transparent text-slate-500',
            )}>
            <span className="text-[11px]">{showClosed ? '🟢' : '⚪'}</span>
            المغلقة
          </Button>

          {(localSearch || localStatus || localType || localProject) && (
            <Button variant="ghost" size="sm" className="h-9 rounded-xl text-slate-500 hover:text-white text-xs gap-1 px-2"
              onClick={() => { setLocalSearch(''); setLocalStatus(''); setLocalType(''); setLocalProject(''); }}>
              <X className="w-3 h-3" /> مسح
            </Button>
          )}

          <Button variant="outline" size="sm"
            onClick={() => setExportModalOpen(true)}
            className="h-9 rounded-xl gap-1.5 text-xs font-medium border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10">
            <Download className="w-3.5 h-3.5" />
            تصدير
          </Button>

          <span className="text-[10px] text-slate-600 font-medium mr-auto">
            {baseTickets.length} / {tickets.length}
          </span>
        </div>
      )}

      {displayTickets.length === 0 && (
        <div className="py-16 text-center text-slate-500 text-sm font-medium">{emptyMessage}</div>
      )}

      {/* ── MOBILE SORT BAR ──────────────────────────────────────────────── */}
      {displayTickets.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-2 overflow-x-auto no-scrollbar border-b border-border/30 md:hidden" dir="rtl">
          <span className="text-[10px] text-slate-500 font-bold shrink-0">ترتيب:</span>
          {([
            { key: 'date' as SortKey,     label: 'التاريخ'   },
            { key: 'days' as SortKey,     label: 'الأيام'    },
            { key: 'priority' as SortKey, label: 'الأولوية'  },
            { key: 'status' as SortKey,   label: 'الحالة'    },
            { key: 'client' as SortKey,   label: 'العميل'    },
            { key: 'ref' as SortKey,      label: 'المرجع'    },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSort(key)}
              className={cn(
                'shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors',
                sortKey === key
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : 'bg-transparent text-slate-500 border-border/30 hover:text-slate-300',
              )}
            >
              {label}
              {sortKey === key && (
                sortDir === 'asc'
                  ? <ChevronUp className="w-2.5 h-2.5" />
                  : <ChevronDown className="w-2.5 h-2.5" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── MOBILE CARD VIEW ─────────────────────────────────────────────── */}
      {displayTickets.length > 0 && (
        <div className="flex flex-col gap-2 p-2 md:hidden" dir="rtl">
          {displayTickets.map((ticket, index) => {
            const createdAt = (ticket.createdAt as any)?.toDate
              ? (ticket.createdAt as any).toDate()
              : new Date(ticket.createdAt as any);
            const openDate  = (ticket.issuedAt ? parseIssuedAt(ticket.issuedAt) : null) ?? createdAt;
            const closeDate = ticket.closedAt ? new Date(ticket.closedAt) : null;
            const isClosed  = ticket.status === 'closed' || ticket.status === 'out-of-scope';
            const endDate   = (isClosed && closeDate) ? closeDate : new Date();
            const daysOpen  = differenceInDays(endDate, openDate);
            const daysBg    =
              daysOpen > 30 ? 'bg-red-500/15 text-red-400 border-red-500/20' :
              daysOpen > 14 ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
              daysOpen > 6  ? 'bg-orange-500/15 text-orange-400 border-orange-500/20' :
                              'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';

            const priorityNum = typeof ticket.priority === 'number' ? ticket.priority : 3;
            const priorityCls = priorityBgMap[priorityNum] ?? 'bg-slate-700 text-white';
            const typeList: string[] =
              ticket.detectedTypes?.length
                ? ticket.detectedTypes as string[]
                : ticket.type ? [ticket.type as string] : [];
            const supervisorNames = getSupervisorNames(ticket);
            const isSelected  = selectedIds?.includes(ticket.id) ?? false;
            const isOverdue   = !isClosed && daysOpen > 6;
            const canSelect   = hasSelection; // التذاكر المغلقة قابلة للتحديد كمان

            const handleCardClick = () => {
              if (canSelect && inSelectionMode) { toggleOne(ticket.id); return; }
              if (!inSelectionMode) navigate(`/tickets/${ticket.id}`);
            };

            return (
              <React.Fragment key={ticket.id}>
                {focalClientKey && index === 0 && (
                  <div className="flex items-center gap-2 px-1 pb-0.5 pt-1">
                    <span className="text-[11px] font-bold text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20">
                      📋 {focalClientName} — {focalCount} تذاكر
                    </span>
                  </div>
                )}
                {focalClientKey && index === focalCount && otherTickets.length > 0 && (
                  <div className="px-1 py-1.5 mt-0.5 border-t border-border/40">
                    <span className="text-[10px] font-bold text-slate-500">باقي التذاكر ({otherTickets.length})</span>
                  </div>
                )}
                <div
                  className={cn(
                    'relative rounded-2xl border bg-card overflow-hidden transition-all',
                    canSelect && inSelectionMode ? 'cursor-pointer active:scale-[0.99]' : '',
                    !inSelectionMode ? 'cursor-pointer active:scale-[0.99]' : '',
                    isSelected ? 'border-blue-500/60 bg-blue-500/5 ring-1 ring-blue-500/20' : '',
                    !isSelected && focalClientKey && index < focalCount ? 'border-blue-500/20' : '',
                    !isSelected && !(focalClientKey && index < focalCount) && isOverdue ? 'border-red-500/30' : '',
                    !isSelected && !(focalClientKey && index < focalCount) && !isOverdue ? 'border-border' : '',
                    isClosed ? 'opacity-40' : '',
                  )}
                  onClick={handleCardClick}
                >
                  {isOverdue && !isSelected && <div className="absolute top-0 right-0 h-full w-0.5 bg-red-500/50" />}
                  <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2">
                    <div className="flex items-center gap-2 leading-tight min-w-0">
                      {canSelect && (
                        <button className="text-slate-600 hover:text-blue-400 transition-colors shrink-0 p-0.5"
                          onClick={e => { e.stopPropagation(); toggleOne(ticket.id); }}>
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
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', statusColors[ticket.status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20')}>
                        {statusTranslations[ticket.status] ?? ticket.status}
                      </span>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', daysBg)}>{daysOpen}ي</span>
                      <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-md min-w-[20px] text-center', priorityCls)}>{priorityNum}</span>
                    </div>
                  </div>
                  <div className="px-3 pb-2">
                    <p className="text-slate-300 text-[13px] leading-relaxed line-clamp-2">{ticket.description}</p>
                  </div>
                  <div className="flex items-end justify-between gap-2 px-3 pb-2.5 pt-1 border-t border-border/30">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      {ticket.clientName && (
                        <span className="text-[11px] text-slate-400 font-medium truncate">
                          {ticket.clientName.split(' ')[0]}{ticket.villaNumber ? ` · فيلا ${ticket.villaNumber}` : ''}
                        </span>
                      )}
                      {supervisorNames.length > 0 && (
                        <span className="text-[11px] text-amber-400/80 font-medium truncate">{supervisorNames.join('، ')}</span>
                      )}
                      {ticket.appointmentAwaitingReply ? (
                        <span className="text-[11px] text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded flex items-center gap-1 w-max">
                          <Clock className="w-3 h-3 animate-pulse" /> بانتظار رد العميل
                        </span>
                      ) : ticket.appointmentTime && (
                        <span className="text-[11px] text-emerald-400 font-bold">{ticket.appointmentTime}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
                      {typeList.length === 0 ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border bg-orange-500/10 text-orange-400 border-orange-500/20">
                          غير مصنف
                        </span>
                      ) : typeList.slice(0, 2).map((t, i) => (
                        <span key={i} className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md border', mergedTypeBg[t] || 'bg-slate-500/10 text-slate-400 border-slate-500/20')}>
                          {mergedTranslations[t] ?? t}
                        </span>
                      ))}
                      {(ticket as any).subTypeName && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md border bg-slate-600/20 text-slate-400 border-slate-600/20">
                          {(ticket as any).subTypeName}
                        </span>
                      )}
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

      {/* ── DESKTOP TABLE VIEW ───────────────────────────────────────────── */}
      {displayTickets.length > 0 && (
        <div className="hidden md:block overflow-auto" style={{ maxHeight }}>
          <table className="w-full text-right border-collapse">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border bg-white/5">
                {hasSelection && (
                  <th className={cn(thCls, 'w-10 text-center')}>
                    <button onClick={toggleAll} className="text-slate-500 hover:text-blue-400 transition-colors">
                      {allSelected
                        ? <CheckSquare className="w-4 h-4 text-blue-500" />
                        : someSelected
                          ? <CheckSquare className="w-4 h-4 text-blue-400/50" />
                          : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                )}
                <th className={cn(thCls, 'w-20')}>ID</th>
                <th
                  className={cn(thCls, 'w-24 cursor-pointer hover:text-slate-200 select-none')}
                  onClick={() => handleSort('ref')}
                >
                  <span className="flex items-center gap-1">المرجع <SortIcon col="ref" /></span>
                </th>
                <th
                  className={cn(thCls, 'w-28 max-w-[100px] cursor-pointer hover:text-slate-200 select-none')}
                  onClick={() => handleSort('client')}
                >
                  <span className="flex items-center gap-1">العميل <SortIcon col="client" /></span>
                </th>

                <th
                  className={cn(thCls, 'w-20 cursor-pointer hover:text-slate-200 select-none')}
                  onClick={() => handleSort('date')}
                >
                  <span className="flex items-center gap-1">التاريخ <SortIcon col="date" /></span>
                </th>
                <th className={cn(thCls, 'min-w-[180px]')}>وصف المشكلة</th>
                <th
                  className={cn(thCls, 'w-8 text-center cursor-pointer hover:text-slate-200 select-none')}
                  onClick={() => handleSort('status')}
                  title="الحالة"
                >
                  <span className="flex items-center justify-center">●</span>
                </th>
                <th
                  className={cn(thCls, 'w-12 text-center cursor-pointer hover:text-slate-200 select-none')}
                  onClick={() => handleSort('days')}
                >
                  <span className="flex items-center justify-center gap-1">الأيام <SortIcon col="days" /></span>
                </th>
                {!hideSupervisorColumn && <th className={cn(thCls, 'w-24 text-center')}>المسؤول</th>}
                <th className={cn(thCls, 'w-20 text-center')}>التخصص</th>
                <th className={cn(thCls, 'w-24 text-center')}>موعد</th>
                <th className={cn(thCls, 'w-14 text-center border-r border-border/20')}>...</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {displayTickets.map((ticket, index) => {
                const createdAt = (ticket.createdAt as any)?.toDate
                  ? (ticket.createdAt as any).toDate()
                  : new Date(ticket.createdAt as any);
                const openDate  = (ticket.issuedAt ? parseIssuedAt(ticket.issuedAt) : null) ?? createdAt;
                const closeDate = ticket.closedAt ? new Date(ticket.closedAt) : null;
                const isClosed  = ticket.status === 'closed' || ticket.status === 'out-of-scope';
                const endDate   = (isClosed && closeDate) ? closeDate : new Date();
                const daysOpen  = differenceInDays(endDate, openDate);
                const daysBg    =
                  daysOpen > 30 ? 'text-red-400 font-bold' :
                  daysOpen > 14 ? 'text-amber-400 font-bold' :
                  daysOpen > 6  ? 'text-orange-400 font-bold' :
                                  'text-emerald-400';

                const priorityNum = typeof ticket.priority === 'number' ? ticket.priority : 3;
                const priorityCls = priorityBgMap[priorityNum] ?? 'bg-slate-700 text-white';
                const typeList: string[] =
                  ticket.detectedTypes?.length
                    ? ticket.detectedTypes as string[]
                    : ticket.type ? [ticket.type as string] : [];
                const supervisorNames = getSupervisorNames(ticket);
                const isSelected = selectedIds?.includes(ticket.id) ?? false;
                const isOverdue  = !isClosed && daysOpen > 6;

                return (
                  <React.Fragment key={ticket.id}>
                    {focalClientKey && index === 0 && (
                      <tr>
                        <td colSpan={20} className="px-4 py-2 text-[11px] font-bold text-blue-300 bg-blue-500/5 text-right border-b border-blue-500/10">
                          📋 {focalClientName} — {focalCount} تذاكر
                        </td>
                      </tr>
                    )}
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
                      onClick={e => {
                        if ((e.target as HTMLElement).closest('button')) return;
                        navigate(`/tickets/${ticket.id}`);
                      }}
                    >
                      {hasSelection && (
                        <td className="px-4 py-3 text-center" onClick={e => { e.stopPropagation(); toggleOne(ticket.id); }}>
                          <button className="text-slate-600 hover:text-blue-500 transition-colors">
                            {isSelected ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm font-medium text-slate-400 whitespace-nowrap w-20">
                        {ticket.ticketId || ticket.id.slice(0, 6)}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-200 whitespace-nowrap w-24">
                        {ticket.refNumber || '---'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 truncate w-28 max-w-[100px]" title={ticket.clientName}>
                        {(ticket.clientName || '---').split(' ')[0]}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap w-20">
                        {format(openDate, 'd/M/yyyy')}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 min-w-[260px] max-w-[400px] leading-relaxed">
                        <span className="line-clamp-3">{ticket.description}</span>
                      </td>
                      <td className="px-3 py-3 text-center w-8">
                        <span
                          title={statusTranslations[ticket.status] ?? ticket.status}
                          className={cn(
                            'inline-block w-2.5 h-2.5 rounded-full',
                          ticket.status === 'closed' || ticket.status === 'out-of-scope'
                              ? 'bg-emerald-500'
                              : ticket.status === 'in-progress'
                              ? 'bg-blue-500'
                              : ticket.status === 'pending' || ticket.status === 'waiting'
                              ? 'bg-amber-400'
                              : 'bg-red-500'
                          )}
                        />
                      </td>
                      <td className={cn('px-3 py-3 text-center text-sm w-12', daysBg)}>
                        {daysOpen}
                      </td>
                      {!hideSupervisorColumn && (
                        <td className="px-4 py-3 text-center w-24">
                          {supervisorNames.length > 0 ? (
                            <div className="flex flex-col gap-1 items-center">
                              {supervisorNames.map((name, i) => (
                                <span key={i} className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap',
                                  i === 0 ? 'bg-green-350/20 text-red-500' : 'bg-blue-200/15 text-blue-500')}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-600">---</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center w-20">
                        {typeList.length > 0 ? (
                          <div className="flex flex-col gap-1 items-center">
                            {typeList.map((t, i) => (
                              <span key={i} className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg border whitespace-nowrap',
                                mergedTypeBg[t] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20')}>
                                {mergedTranslations[t] ?? t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-orange-500/10 text-orange-400 border-orange-500/20 whitespace-nowrap">
                            غير مصنف
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center w-24">
                        {ticket.appointmentAwaitingReply ? (
                          <span className="text-[10px] text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded flex items-center gap-1 justify-center whitespace-nowrap">
                            <Clock className="w-3 h-3 animate-pulse" /> بانتظار رد العميل
                          </span>
                        ) : ticket.appointmentTime ? (
                          <span className="text-[11px] text-emerald-400 font-bold">{ticket.appointmentTime}</span>
                        ) : ticket.closureNotes ? (
                          <span className="text-[10px] text-slate-500 line-clamp-1">{ticket.closureNotes}</span>
                        ) : (
                          <span className="text-[10px] text-slate-600">---</span>
                        )}
                      </td>
                      <td className="px-4 py-3 w-14">
                        <div className="flex justify-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white rounded-lg bg-white/5">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            } />
                            <DropdownMenuContent align="end" className="bg-card border-border text-slate-200 w-52">
                              <DropdownMenuItem className="hover:bg-white/5 cursor-pointer gap-2 text-start justify-start"
                                onClick={() => navigate(`/tickets/${ticket.id}`)}>
                                عرض التفاصيل <Eye className="w-4 h-4" />
                              </DropdownMenuItem>
                              <DropdownMenuItem className="hover:bg-white/5 cursor-pointer gap-2 text-start justify-start"
                                onClick={() => navigate(`/tickets/${ticket.id}`)}>
                                تعديل <Edit2 className="w-4 h-4" />
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="hover:bg-orange-500/10 cursor-pointer gap-2 text-start justify-start text-orange-400"
                                onClick={() => setClassifyTicket(ticket)}
                              >
                                <Sparkles className="w-4 h-4" /> تصنيف
                              </DropdownMenuItem>
                              <DropdownMenuItem className="hover:bg-white/5 cursor-pointer gap-2 text-start justify-start text-green-400"
                                onClick={() => handleWhatsApp(ticket)}>
                                واتساب <MessageSquare className="w-4 h-4" />
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

      {/* ── Export Modal ─────────────────────────────────────────────────── */}
      <ExportTicketsModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        tickets={baseTickets}
        projects={projects}
      />

      {/* ── Classify Dialog ──────────────────────────────────────────────── */}
      {classifyTicket && (
        <ClassifyDialog
          ticket={classifyTicket}
          open={!!classifyTicket}
          onClose={() => setClassifyTicket(null)}
          onDone={() => { setClassifyTicket(null); onRefresh?.(); }}
        />
      )}
    </>
  );
}