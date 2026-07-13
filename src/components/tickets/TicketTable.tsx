import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router-dom';
import { CheckSquare, Square, MoreHorizontal, Eye, Edit2, AlertCircle, Clock, Search, Briefcase, FileImage, ShieldAlert, Check, ChevronDown, ChevronUp, ChevronsUpDown, X, Edit, MessageCircle, Download, Sparkles, Loader2, MessageSquare, CalendarDays, HardHat, ArrowUpDown, User } from 'lucide-react';
import { formatAppointmentDayTime } from '@/lib/utils';
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

export const renderTableDescription = (text?: string) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex) || [];
  const cleanText = text.replace(urlRegex, '').trim();
  
  return (
    <>
      {cleanText}
      {urls.length > 0 && (
        <span className="inline-flex items-center gap-1 text-blue-400 mr-2 bg-blue-500/10 px-1.5 py-0.5 rounded text-[11px] font-bold" dir="rtl">
          <FileImage className="w-3 h-3" />
          مرفقات
        </span>
      )}
    </>
  );
};

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
  'in_progress':   'قيد التنفيذ',
  pending:         'معلقة',
  completed:       'مكتملة',
  closed:          'مغلقة',
  'out-of-scope':  'خارج اختصاص',
  'out_of_scope':  'خارج الاختصاص',
  absent:          'عدم تواجد',
  contractor:      'مقاول',
};

export const statusColors: Record<string, string> = {
  open:            'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'in-progress':   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'in_progress':   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  pending:         'bg-purple-500/10 text-purple-400 border-purple-500/20',
  completed:       'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed:          'bg-slate-500/10 text-slate-400 border-slate-500/20',
  'out-of-scope':  'bg-rose-500/10 text-rose-400 border-rose-500/20',
  'out_of_scope':  'bg-rose-500/10 text-rose-400 border-rose-500/20',
  absent:          'bg-amber-500/10 text-amber-400 border-amber-500/20',
  contractor:      'bg-blue-500/10 text-blue-400 border-blue-500/20',
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
  { key: 'contractor',    label: 'مقاول' },
  { key: 'completed',     label: 'مكتملة' },
  { key: 'closed',        label: 'مغلقة' },
  { key: 'out_of_scope',  label: 'خارج اختصاص', danger: true },
  { key: 'absent',        label: 'عدم تواجد', danger: true },
];

export interface BulkActionBarProps {
  count: number;
  isMultiClient?: boolean;
  onStatusChange: (status: string) => void;
  onAppointment?: () => void;
  onInternalAppointment?: () => void;
  onContractor?: () => void;
  onClose: () => void;
  onClear: () => void;
  hidden?: boolean;
  statusOptions?: { key: string; label: string; danger?: boolean }[];
}

export function BulkActionBar({
  count,
  isMultiClient = false,
  onStatusChange,
  onAppointment,
  onInternalAppointment,
  onContractor,
  onClose,
  onClear,
  hidden = false,
  statusOptions = DEFAULT_STATUS_OPTIONS,
}: BulkActionBarProps) {
  if (hidden) return null;
  const content = (
    <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-slate-900/95 backdrop-blur-md border border-blue-500/30 rounded-2xl shadow-2xl shadow-black/60 px-2 py-2 w-[calc(100vw-1rem)] sm:w-fit sm:max-w-2xl sm:gap-2.5 sm:px-4 sm:py-2.5" dir="rtl">
      {/* Count */}
      <div className="flex items-center gap-1 pl-2 sm:pl-3 border-l border-white/10 shrink-0">
        <span className="text-base sm:text-lg font-black text-blue-400">{count}</span>
        <span className="text-[10px] font-bold text-slate-500 hidden sm:block">مختارة</span>
      </div>

      {/* Status change */}
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button variant="outline" size="sm" className="border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold rounded-xl gap-1 h-9 px-2.5 text-xs shrink-0">
            <Edit className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">لحالة</span>
            <ChevronDown className="w-3 h-3" />
          </Button>
        } />
        <DropdownMenuContent className="bg-card border-border text-slate-200">
          {statusOptions.map(opt => (
            <DropdownMenuItem
              key={opt.key}
              className={cn('text-start justify-start hover:bg-white/5', opt.danger && 'hover:bg-rose-500/10 text-rose-400')}
              onClick={() => {
                if (opt.key === 'contractor' && onContractor) {
                  onContractor();
                } else {
                  onStatusChange(opt.key);
                }
              }}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Primary: Schedule appointment (most common) */}
      {onAppointment && !isMultiClient && (
        <Button variant="outline" size="sm"
          className="border-green-500/30 bg-green-500/10 text-green-400 font-bold rounded-xl gap-1 h-9 px-2.5 text-xs shrink-0"
          onClick={onAppointment}>
          <MessageCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">ترتيب موعد</span>
        </Button>
      )}

      {/* Secondary actions */}
      {(!isMultiClient && onInternalAppointment) && (
        <Button variant="outline" size="sm"
          className="border-sky-500/30 bg-sky-500/10 text-sky-400 font-bold rounded-xl gap-1 h-9 px-2.5 text-xs shrink-0 flex"
          onClick={onInternalAppointment}>
          <CalendarDays className="w-3.5 h-3.5" />
          <span>إضافة موعد</span>
        </Button>
      )}
      {(!isMultiClient && onClose) && (
        <Button variant="outline" size="sm"
          className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400 font-bold rounded-xl gap-1 h-9 px-2.5 text-xs shrink-0 flex"
          onClick={onClose}>
          <CheckSquare className="w-3.5 h-3.5" />
          <span>إغلاق</span>
        </Button>
      )}

      {/* Clear */}
      <Button variant="ghost" size="icon"
        className="shrink-0 text-slate-500 hover:text-white h-9 w-9 mr-auto sm:mr-0"
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
  stateKey?: string;
  defaultShowClosed?: boolean;
  exportOpen?: boolean;
  onExportOpenChange?: (open: boolean) => void;
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
  defaultShowClosed = false,
  onRefresh,
  stateKey,
  exportOpen: controlledExportOpen,
  onExportOpenChange,
}: TicketTableProps) {
  const navigate = useNavigate();
  const [showMobileSort, setShowMobileSort] = useState(false);

  // ── جلب الأنواع من DB (live) ──────────────────────────────────────────────
  const {
    typeTranslations: dbTypeTranslations,
    typeBg: dbTypeBg,
    subTypeTranslations,
    subTypeBg,
  } = useTicketTypes();

  // دمج: DB أولاً ثم الـ static fallback
  const mergedTranslations: Record<string, string> = { ...typeTranslations, ...dbTypeTranslations };
  const mergedTypeBg: Record<string, string>        = { ...typeBgStatic,    ...dbTypeBg };

  // ── Local filter state ────────────────────────────────────────────────────
  const [localSearch,  setLocalSearch]  = useState(() => stateKey ? sessionStorage.getItem(`${stateKey}_search`) || '' : '');
  const [localStatus,  setLocalStatus]  = useState(() => stateKey ? sessionStorage.getItem(`${stateKey}_status`) || '' : '');
  const [localType,    setLocalType]    = useState<string>(() => stateKey ? sessionStorage.getItem(`${stateKey}_type`) || '' : '');
  const [localProject, setLocalProject] = useState(() => stateKey ? sessionStorage.getItem(`${stateKey}_project`) || '' : '');
  const [showClosed,   setShowClosed]   = useState(() => stateKey ? sessionStorage.getItem(`${stateKey}_closed`) === 'true' : defaultShowClosed);
  const [localSupervisor, setLocalSupervisor] = useState(() => stateKey ? sessionStorage.getItem(`${stateKey}_supervisor`) || '' : '');
  const [internalExportOpen, setInternalExportOpen] = useState(false);
  const exportModalOpen = controlledExportOpen !== undefined ? controlledExportOpen : internalExportOpen;
  const setExportModalOpen = (v: boolean) => {
    if (onExportOpenChange) onExportOpenChange(v);
    else setInternalExportOpen(v);
  };

  useEffect(() => { if (stateKey) sessionStorage.setItem(`${stateKey}_search`, localSearch); }, [localSearch, stateKey]);
  useEffect(() => { if (stateKey) sessionStorage.setItem(`${stateKey}_status`, localStatus); }, [localStatus, stateKey]);
  useEffect(() => { if (stateKey) sessionStorage.setItem(`${stateKey}_type`, localType); }, [localType, stateKey]);
  useEffect(() => { if (stateKey) sessionStorage.setItem(`${stateKey}_project`, localProject); }, [localProject, stateKey]);
  useEffect(() => { if (stateKey) sessionStorage.setItem(`${stateKey}_closed`, String(showClosed)); }, [showClosed, stateKey]);
  useEffect(() => { if (stateKey) sessionStorage.setItem(`${stateKey}_supervisor`, localSupervisor); }, [localSupervisor, stateKey]);

  const uniqueSupervisors = useMemo(() => {
    const map = new Map<string, string>();
    tickets.forEach(t => {
      const sups = t.assignedSupervisors;
      if (Array.isArray(sups)) {
        sups.forEach(s => {
          if (s && s.id && s.name) map.set(s.id, s.name);
        });
      } else if (sups && typeof sups === 'object') {
        Object.values(sups).forEach((s: any) => {
          if (s && s.id && s.name) map.set(s.id, s.name);
        });
      } else if (t.assignedSupervisorId && t.assigneeName && t.assigneeName !== '---') {
        map.set(t.assignedSupervisorId, t.assigneeName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [tickets]);

  // ── Sort state (default: oldest first) ───────────────────────────────────
  type SortKey = 'date' | 'days' | 'priority' | 'status' | 'ref' | 'client';
  const [sortKey, setSortKey] = useState<SortKey>(() => (stateKey ? (sessionStorage.getItem(`${stateKey}_sortKey`) as SortKey) : null) || 'date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (stateKey ? (sessionStorage.getItem(`${stateKey}_sortDir`) as 'asc'|'desc') : null) || 'asc');

  useEffect(() => { if (stateKey) sessionStorage.setItem(`${stateKey}_sortKey`, sortKey); }, [sortKey, stateKey]);
  useEffect(() => { if (stateKey) sessionStorage.setItem(`${stateKey}_sortDir`, sortDir); }, [sortDir, stateKey]);

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
    const isClosed = t.status === 'closed' || t.status === 'out-of-scope' || t.status === 'out_of_scope' || t.status === 'absent';
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

  const closedStatuses = useMemo(() => new Set(['closed', 'out-of-scope', 'out_of_scope', 'absent']), []);

  const baseTickets = useMemo(() => {
    if (!showInlineFilters) return tickets;
    const s = localSearch.toLowerCase();
    return tickets.filter(t => {
      const isClosed = closedStatuses.has(t.status);
      if (!showClosed && isClosed) return false;
      const matchSearch = !s ||
        t.villaNumber?.toLowerCase().includes(s) ||
        t.description?.toLowerCase().includes(s) ||
        t.clientName?.toLowerCase().includes(s) ||
        t.ticketId?.toLowerCase().includes(s) ||
        t.refNumber?.toLowerCase().includes(s);
      const matchStatus  = !localStatus  || t.status === localStatus;
      const matchType    = !localType    || t.type === localType || (t.detectedTypes as string[] | undefined)?.includes(localType);
      const matchProject = !localProject || t.projectId === localProject;
      const matchSupervisor = !localSupervisor || t.assignedSupervisorId === localSupervisor || (t.assignedSupervisorIds as string[] | undefined)?.includes(localSupervisor);
      return matchSearch && matchStatus && matchType && matchProject && matchSupervisor;
    });
  }, [tickets, showInlineFilters, showClosed, localSearch, localStatus, localType, localProject, localSupervisor, closedStatuses]);

  const focalClientKey = useMemo(() => {
    if (!selectedIds || selectedIds.length === 0) return null;
    const sel = baseTickets.filter(t => selectedIds?.includes(t.id));
    if (sel.length === 0) return null;
    const keys = new Set(sel.map(t => t.clientId || t.villaNumber || t.id));
    return keys.size === 1 ? [...keys][0] : null;
  }, [selectedIds, baseTickets]);

  const focalClientName = useMemo(() => focalClientKey
    ? (baseTickets.find(t => (t.clientId || t.villaNumber || t.id) === focalClientKey)?.clientName ?? '')
    : '', [focalClientKey, baseTickets]);

  const displayTickets = useMemo(() => {
    const s = localSearch.toLowerCase();
    
    // Pre-compute sort values to avoid O(N log N) date parsing overhead (Schwartzian transform)
    const mapped = baseTickets.map(t => {
      const av = getTicketSortVal(t, sortKey);
      let isExact = false;
      let isStarts = false;
      if (s) {
        isExact = String(t.villaNumber) === s || String(t.ticketId) === s || String(t.refNumber) === s || String(t.clientName || '').toLowerCase() === s;
        if (!isExact) {
          isStarts = String(t.villaNumber).startsWith(s) || String(t.ticketId).startsWith(s) || String(t.refNumber).startsWith(s);
        }
      }
      return { ticket: t, val: av, isExact, isStarts };
    });

    const cmp = (a: typeof mapped[0], b: typeof mapped[0]) => {
      if (s) {
        if (a.isExact && !b.isExact) return -1;
        if (!a.isExact && b.isExact) return 1;
        if (a.isStarts && !b.isStarts) return -1;
        if (!a.isStarts && b.isStarts) return 1;
      }
      const diff = typeof a.val === 'number' && typeof b.val === 'number'
        ? a.val - b.val
        : String(a.val).localeCompare(String(b.val), 'ar');
      return sortDir === 'asc' ? diff : -diff;
    };

    const applySortAndGroupMapped = (arr: typeof mapped) => {
      const open = arr.filter(m => !closedStatuses.has(m.ticket.status));
      const closed = arr.filter(m => closedStatuses.has(m.ticket.status));
      return [...open].sort(cmp).concat([...closed].sort(cmp)).map(m => m.ticket);
    };

    if (focalClientKey) {
      const focal = mapped.filter(m => (m.ticket.clientId || m.ticket.villaNumber || m.ticket.id) === focalClientKey);
      const other = mapped.filter(m => (m.ticket.clientId || m.ticket.villaNumber || m.ticket.id) !== focalClientKey);
      return [...applySortAndGroupMapped(focal), ...applySortAndGroupMapped(other)];
    }
    return applySortAndGroupMapped(mapped);
  }, [baseTickets, focalClientKey, localSearch, sortKey, sortDir, closedStatuses]);

  const focalCount = useMemo(() => {
    if (!focalClientKey) return 0;
    return baseTickets.filter(t => (t.clientId || t.villaNumber || t.id) === focalClientKey).length;
  }, [baseTickets, focalClientKey]);

  const otherTicketsCount = baseTickets.length - focalCount;

  const [visibleCount, setVisibleCount] = useState(20);
  useEffect(() => {
    setVisibleCount(20);
  }, [localSearch, localStatus, localType, localProject, showClosed, sortKey, sortDir, focalClientKey, baseTickets.length]);

  const observer = useRef<IntersectionObserver | null>(null);
  const observerRef = useCallback((node: HTMLDivElement | null) => {
    if (!observer.current) {
      observer.current = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) {
          setVisibleCount(prev => prev + 20);
        }
      });
    }
    if (node) {
      observer.current.observe(node);
    }
  }, []);

  const renderedTickets = displayTickets.slice(0, visibleCount);

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
      selectedIds?.includes(id) ? selectedIds.filter(x => x !== id) : [...(selectedIds || []), id]
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
    if (ticket.status === 'contractor') {
      return [ticket.assigneeName || 'مقاول غير محدد'];
    }
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
      if (rawSups && typeof rawSups === 'object' && !Array.isArray(rawSups)) {
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
        <div className="flex flex-col border-b border-border/50 p-2 sm:p-3" dir="rtl">
          {/* ── Search & Mobile Actions ── */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="بحث برقم التذكرة أو الفيلا أو التفاصيل..."
                value={localSearch}
                onChange={e => setLocalSearch(e.target.value)}
                className={cn("pr-9 h-10 bg-card border-border/50 rounded-xl text-sm text-foreground text-right", localSearch && "pl-9")}
              />
              {localSearch && (
                <button
                  onClick={() => setLocalSearch('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" className={cn("h-10 px-3 rounded-xl gap-2 md:hidden transition-all", showMobileSort ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-card border-border/50 text-slate-400")}>
                  <ArrowUpDown className="w-4 h-4" />
                </Button>
              } />
              <DropdownMenuContent className="bg-card border-border text-foreground min-w-[140px]" align="end">
                <div className="px-2 py-1.5 text-xs font-bold text-slate-500">ترتيب حسب:</div>
                {([
                  { key: 'date' as SortKey,     label: 'التاريخ'   },
                  { key: 'days' as SortKey,     label: 'الأيام'    },
                  { key: 'priority' as SortKey, label: 'الأولوية'  },
                  { key: 'status' as SortKey,   label: 'الحالة'    },
                  { key: 'client' as SortKey,   label: 'العميل'    },
                  { key: 'ref' as SortKey,      label: 'المرجع'    },
                ]).map(({ key, label }) => (
                  <DropdownMenuItem 
                    key={key} 
                    onClick={() => handleSort(key)}
                    className={cn("flex items-center justify-between cursor-pointer", sortKey === key && "text-blue-400 font-bold bg-blue-500/10")}
                  >
                    {label}
                    {sortKey === key && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

          </div>

          {/* ── Filters ── */}
          <div className="flex flex-wrap items-center gap-2 mt-3 w-full">
            {/* فلتر الحالة */}
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" size="sm" className={cn(
                  'h-9 border-border/50 rounded-xl gap-1.5 text-xs font-medium',
                  localStatus ? 'border-blue-500/50 bg-blue-500/10 text-blue-500 dark:text-blue-300' : 'bg-transparent text-slate-500 dark:text-slate-400',
                )}>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                  {localStatus ? statusTranslations[localStatus] : 'الحالة'}
                </Button>
              } />
              <DropdownMenuContent className="bg-card border-border text-foreground">
                <DropdownMenuItem className="hover:bg-muted text-start justify-start cursor-pointer" onClick={() => setLocalStatus('')}>كل الحالات</DropdownMenuItem>
                {Object.entries(statusTranslations).map(([k, v]) => (
                  <DropdownMenuItem key={k} className="hover:bg-muted text-start justify-start cursor-pointer" onClick={() => setLocalStatus(k)}>{v}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* فلتر التخصص */}
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" size="sm" className={cn(
                  'h-9 border-border/50 rounded-xl gap-1.5 text-xs font-medium',
                  localType ? 'border-blue-500/50 bg-blue-500/10 text-blue-500 dark:text-blue-300' : 'bg-transparent text-slate-500 dark:text-slate-400',
                )}>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                  {localType ? (mergedTranslations[localType] ?? localType) : 'التخصص'}
                </Button>
              } />
              <DropdownMenuContent className="bg-card border-border text-foreground max-h-72 overflow-y-auto">
                <DropdownMenuItem className="hover:bg-muted text-start justify-start cursor-pointer" onClick={() => setLocalType('')}>كل التخصصات</DropdownMenuItem>
                {Object.entries(mergedTranslations).map(([k, v]) => (
                  <DropdownMenuItem key={k} className="hover:bg-muted text-start justify-start cursor-pointer" onClick={() => setLocalType(k)}>{v}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* فلتر المشروع */}
            {!hideProjectColumn && projects && Object.keys(projects).length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="outline" size="sm" className={cn(
                    'h-9 border-border/50 rounded-xl gap-1.5 text-xs font-medium',
                    localProject ? 'border-blue-500/50 bg-blue-500/10 text-blue-500 dark:text-blue-300' : 'bg-transparent text-slate-500 dark:text-slate-400',
                  )}>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                    {localProject ? (projects[localProject]?.name ?? 'المشروع') : 'المشروع'}
                  </Button>
                } />
                <DropdownMenuContent className="bg-card border-border text-foreground">
                  <DropdownMenuItem className="hover:bg-muted text-start justify-start cursor-pointer" onClick={() => setLocalProject('')}>كل المشاريع</DropdownMenuItem>
                  {Object.entries(projects).map(([id, p]) => (
                    <DropdownMenuItem key={id} className="hover:bg-muted text-start justify-start cursor-pointer" onClick={() => setLocalProject(id)}>{p.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* فلتر المشرف */}
            {!hideSupervisorColumn && uniqueSupervisors.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="outline" size="sm" className={cn(
                    'h-9 border-border/50 rounded-xl gap-1.5 text-xs font-medium',
                    localSupervisor ? 'border-blue-500/50 bg-blue-500/10 text-blue-500 dark:text-blue-300' : 'bg-transparent text-slate-500 dark:text-slate-400',
                  )}>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                    {localSupervisor ? (uniqueSupervisors.find(s => s.id === localSupervisor)?.name ?? 'المشرف') : 'المشرف'}
                  </Button>
                } />
                <DropdownMenuContent className="bg-card border-border text-foreground max-h-72 overflow-y-auto">
                  <DropdownMenuItem className="hover:bg-muted text-start justify-start cursor-pointer" onClick={() => setLocalSupervisor('')}>كل المشرفين</DropdownMenuItem>
                  {uniqueSupervisors.map((s) => (
                    <DropdownMenuItem key={s.id} className="hover:bg-muted text-start justify-start cursor-pointer" onClick={() => setLocalSupervisor(s.id)}>{s.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button variant="outline" size="sm"
              onClick={() => setShowClosed(prev => !prev)}
              className={cn(
                'h-9 rounded-xl gap-1.5 text-xs font-medium',
                showClosed ? 'border-slate-500/50 bg-slate-500/10 text-slate-700 dark:text-slate-300' : 'border-border/50 bg-transparent text-slate-500',
              )}>
              <span className="text-[11px]">{showClosed ? '🟢' : '⚪'}</span>
              المغلقة
            </Button>

            <span className="text-[10px] text-slate-500 font-bold px-2 mr-auto hidden sm:block">
              {baseTickets.length} / {tickets.length}
            </span>
          </div>
        </div>
      )}

      {/* ── MOBILE CARD VIEW ─────────────────────────────────────────────── */}
      {displayTickets.length > 0 && (
        <div className="flex flex-col gap-2 p-2 md:hidden" dir="rtl">
          {renderedTickets.map((ticket, index) => {
            const createdAt = (ticket.createdAt as any)?.toDate
              ? (ticket.createdAt as any).toDate()
              : new Date(ticket.createdAt as any);
            const openDate  = (ticket.issuedAt ? parseIssuedAt(ticket.issuedAt) : null) ?? createdAt;
            const closeDate = ticket.closedAt ? new Date(ticket.closedAt) : null;
            const isClosed  = ticket.status === 'closed' || ticket.status === 'out-of-scope' || ticket.status === 'out_of_scope' || ticket.status === 'absent';
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
            // Sub-types: show specific sub-type names when available, otherwise fall back to type names
            const subTypeIds: string[] = (ticket as any).detectedSubTypeIds ?? [];
            const displayLabels: { label: string; bg: string }[] = subTypeIds.length > 0
              ? subTypeIds.map(id => ({ label: subTypeTranslations[id] ?? id, bg: subTypeBg[id] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20' }))
              : typeList.map(t => ({ label: mergedTranslations[t] ?? t, bg: mergedTypeBg[t] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20' }));
            const supervisorNames = getSupervisorNames(ticket);
            const isSelected  = selectedIds?.includes(ticket.id) ?? false;
            const isOverdue   = !isClosed && daysOpen > 6;
            const canSelect   = hasSelection;

            const handleCardClick = () => {
              if (canSelect && inSelectionMode) { toggleOne(ticket.id); return; }
              if (!inSelectionMode) {
                sessionStorage.setItem('ticketsListScrollY', window.scrollY.toString());
                navigate(`/tickets/${ticket.id}`);
              }
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
                {focalClientKey && index === focalCount && otherTicketsCount > 0 && (
                  <div className="px-1 py-1.5 mt-0.5 border-t border-border/40">
                    <span className="text-[10px] font-bold text-slate-500">باقي التذاكر ({otherTicketsCount})</span>
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
                  <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                    <div className="flex items-center gap-2 leading-tight min-w-0">
                      {canSelect && (
                        <button className="text-muted-foreground hover:text-blue-500 transition-colors shrink-0 p-0.5"
                          onClick={e => { e.stopPropagation(); toggleOne(ticket.id); }}>
                          {isSelected
                            ? <CheckSquare className="w-5 h-5 text-blue-500" />
                            : <Square className="w-5 h-5 opacity-50" />}
                        </button>
                      )}
                      <div className="flex flex-col leading-tight min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-black text-foreground text-[15px] truncate">
                            {ticket.villaNumber || ticket.refNumber || '---'}
                          </span>
                          {ticket.clientName && (
                            <span className="text-[12px] text-muted-foreground truncate font-medium">
                              - {ticket.clientName.split(' ')[0]}
                            </span>
                          )}
                        </div>
                        {ticket.ticketId && (
                          <span className="text-[10px] text-muted-foreground font-mono tracking-wide">#{ticket.ticketId}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', statusColors[ticket.status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20')}>
                        {statusTranslations[ticket.status] ?? ticket.status}
                      </span>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', daysBg)}>{daysOpen}ي</span>
                    </div>
                  </div>
                  <div className="px-3 pb-2">
                    <p className="text-muted-foreground text-[13px] leading-relaxed line-clamp-2">{renderTableDescription(ticket.description)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-2 border-t border-border/30">
                    {/* Left: meta info in one line */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      {supervisorNames.length > 0 && (
                        <span className="text-[11px] text-amber-500 dark:text-amber-400 font-medium truncate flex items-center gap-1">
                          <HardHat className="w-3 h-3 opacity-70 shrink-0" />
                          {supervisorNames[0]}
                        </span>
                      )}
                      {ticket.appointmentAwaitingReply && ticket.status === 'waiting' ? (
                        <>
                          {supervisorNames.length > 0 && <span className="text-muted-foreground/30 text-xs shrink-0">·</span>}
                          <span className="text-[11px] text-orange-400 font-bold flex items-center gap-0.5 shrink-0">
                            <Clock className="w-3 h-3 animate-pulse" /> بانتظار رد
                          </span>
                        </>
                      ) : ticket.appointmentTime ? (
                        <>
                          {supervisorNames.length > 0 && <span className="text-muted-foreground/30 text-xs shrink-0">·</span>}
                          <span className="text-[11px] text-emerald-500 font-bold shrink-0">{ticket.appointmentTime}</span>
                        </>
                      ) : null}
                    </div>
                    {/* Right: type/subtype tags */}
                    <div className="flex items-center gap-1 shrink-0">
                      {displayLabels.length === 0 ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border bg-orange-500/10 text-orange-400 border-orange-500/20">
                          غير مصنف
                        </span>
                      ) : displayLabels.slice(0, 2).map((item, i) => (
                        <span key={i} className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md border', item.bg)}>
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </React.Fragment>

            );
          })}
          {visibleCount < displayTickets.length && (
            <div className="h-10 flex items-center justify-center text-slate-500" ref={observerRef}>
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
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
              {renderedTickets.map((ticket, index) => {
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
                const subTypeIdsRow: string[] = (ticket as any).detectedSubTypeIds ?? [];
                const displayLabelsRow: { label: string; bg: string }[] = subTypeIdsRow.length > 0
                  ? subTypeIdsRow.map(id => ({ label: subTypeTranslations[id] ?? id, bg: subTypeBg[id] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20' }))
                  : typeList.map(t => ({ label: mergedTranslations[t] ?? t, bg: mergedTypeBg[t] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20' }));
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
                    {focalClientKey && index === focalCount && otherTicketsCount > 0 && (
                      <tr>
                        <td colSpan={20} className="px-4 py-1.5 text-[10px] font-bold text-slate-500 bg-white/3 text-right border-b border-border/30">
                          باقي التذاكر ({otherTicketsCount})
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
                        if ((e.target as HTMLElement).closest('a')) return;
                        sessionStorage.setItem('ticketsListScrollY', window.scrollY.toString());
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
                        {ticket.clientId ? (
                          <Link to={`/clients/${ticket.clientId}`} className="hover:text-blue-400 hover:underline transition-colors block truncate" onClick={e => e.stopPropagation()}>
                            {(ticket.clientName || '---').split(' ')[0]}
                          </Link>
                        ) : (
                          (ticket.clientName || '---').split(' ')[0]
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap w-20">
                        {format(openDate, 'd/M/yyyy')}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 min-w-[260px] max-w-[400px] leading-relaxed">
                        <span className="line-clamp-3">{renderTableDescription(ticket.description)}</span>
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
                              {supervisorNames.map((name, i) => {
                                const isContractor = ticket.status === 'contractor' && ticket.contractorId;
                                const linkId = isContractor ? ticket.contractorId : (ticket.assignedSupervisorIds?.[i] || ticket.assignedSupervisorId);
                                const path = isContractor ? `/contractors/${linkId}` : `/team/${linkId}`;
                                return linkId ? (
                                  <Link key={i} to={path} onClick={e => e.stopPropagation()} className={cn('hover:underline text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap',
                                    i === 0 ? 'bg-green-350/20 text-red-500 hover:text-red-400' : 'bg-blue-200/15 text-blue-500 hover:text-blue-400')}>
                                    {name}
                                  </Link>
                                ) : (
                                  <span key={i} className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap',
                                    i === 0 ? 'bg-green-350/20 text-red-500' : 'bg-blue-200/15 text-blue-500')}>
                                    {name}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-600">---</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center w-20">
                        {displayLabelsRow.length > 0 ? (
                          <div className="flex flex-col gap-1 items-center">
                            {displayLabelsRow.map((item, i) => (
                              <span key={i} className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg border whitespace-nowrap', item.bg)}>
                                {item.label}
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
                        {ticket.appointmentAwaitingReply && ticket.status === 'waiting' ? (
                          <span className="text-[10px] text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded flex items-center gap-1 justify-center whitespace-nowrap">
                            <Clock className="w-3 h-3 animate-pulse" /> بانتظار رد العميل
                          </span>
                        ) : ticket.appointmentTime ? (
                          <span className="text-[11px] text-emerald-400 font-bold">{formatAppointmentDayTime(ticket.appointmentTime)}</span>
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
          
          {visibleCount < displayTickets.length && (
            <div className="h-14 flex items-center justify-center text-slate-500" ref={observerRef}>
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
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