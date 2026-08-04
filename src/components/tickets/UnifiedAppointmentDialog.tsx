import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarDays, Clock, AlertTriangle, AlertCircle, CheckCircle2, Eye, Send, Save,
  Loader2, ChevronDown, Search, Home, Building2, CalendarPlus, CalendarClock,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { appointmentsApi, whatsappApi, usersApi, ticketsApi, clientsApi, projectsApi, settingsApi } from '@/lib/api';
import { toast } from 'sonner';
import { useTicketTypes } from '@/contexts/TicketTypesContext';
import { renderTableDescription } from './TicketTable';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketLike {
  id: string;
  ticketId: string;
  clientName: string;
  villaNumber: string;
  projectId: string;
  clientId?: string;
  appointmentId?: string | null;
  appointmentTime?: string;
  appointmentNotes?: string;
  type?: string;
  detectedTypes?: string[];
  assignedSupervisorIds?: string[];
  status: string;
}

interface WorkHoursConfig {
  enabled: boolean;
  hasMorning?: boolean;
  morning: { start: string; end: string };
  hasBreak?: boolean;
  break: { start: string; end: string };
  hasAfternoon?: boolean;
  afternoon: { start: string; end: string };
}

interface TimeOption {
  label: string;
  value: string;
  startTime: string | null;
}

export interface UnifiedAppointmentDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // Ticket mode: pre-selected tickets (with optional WhatsApp if clientPhone set)
  tickets?: TicketLike[];
  clientPhone?: string;
  // Calendar add mode: date pre-selected, no tickets, client search shown
  dateStr?: string;
  initialProjectId?: string;
  // Edit mode: edit an existing appointment group from the calendar page
  editGroup?: any;
  editSupervisors?: any[];
  onSuccess?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RANGE_PRESETS = [
  { label: 'يوم واحد', days: 1 },
  { label: 'يومين', days: 2 },
  { label: '3 أيام', days: 3 },
  { label: '5 أيام', days: 5 },
];

const DEFAULT_WH: WorkHoursConfig = {
  enabled: true,
  hasMorning: true,
  morning: { start: '08:00', end: '12:00' },
  hasBreak: true,
  break: { start: '12:00', end: '13:00' },
  hasAfternoon: true,
  afternoon: { start: '13:00', end: '16:00' },
};

function todayStr(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

function addDays(dateStr: string, n: number): string {
  if (!dateStr) return todayStr();
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return todayStr();
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 5) added++; // skip Friday
  }
  return d.toISOString().split('T')[0];
}

function formatDateAr(ds: string): string {
  if (!ds) return '';
  return new Date(ds).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtTime(hhmm: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function toMins(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minsToHhmm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function inPeriod(mins: number, p: { start: string; end: string }): boolean {
  if (!p || !p.start || !p.end) return false;
  return mins >= toMins(p.start) && mins <= toMins(p.end);
}

function inWorkHours(mins: number, cfg: WorkHoursConfig): boolean {
  if (!cfg.enabled) return true;
  const hasMorning = cfg.hasMorning !== false;
  const hasBreak = cfg.hasBreak !== false;
  const hasAfternoon = cfg.hasAfternoon !== false;

  if (hasBreak && cfg.break && cfg.break.start && cfg.break.end) {
    const bs = toMins(cfg.break.start);
    const be = toMins(cfg.break.end);
    if (mins >= bs && mins < be) return false;
  }

  if (hasMorning && cfg.morning && inPeriod(mins, cfg.morning)) return true;
  if (hasAfternoon && cfg.afternoon && inPeriod(mins, cfg.afternoon)) return true;
  return false;
}

function autoCorrectMins(mins: number, cfg: WorkHoursConfig): number | null {
  if (inWorkHours(mins, cfg)) return mins;
  const hour = Math.floor(mins / 60);
  if (hour >= 1 && hour <= 11) {
    const pm = mins + 12 * 60;
    if (inWorkHours(pm, cfg)) return pm;
  } else if (hour >= 13 && hour <= 23) {
    const am = mins - 12 * 60;
    if (inWorkHours(am, cfg)) return am;
  }
  return null;
}

function getWorkHoursSummary(cfg: WorkHoursConfig): string {
  if (!cfg.enabled) return 'مفتوح (بدون قيود)';
  const parts: string[] = [];
  if (cfg.hasMorning !== false && cfg.morning) {
    parts.push(`صباحاً (${fmtTime(cfg.morning.start)} - ${fmtTime(cfg.morning.end)})`);
  }
  if (cfg.hasAfternoon !== false && cfg.afternoon) {
    parts.push(`مساءً (${fmtTime(cfg.afternoon.start)} - ${fmtTime(cfg.afternoon.end)})`);
  }
  return parts.join(' و ') || 'غير محددة';
}

function buildTimeOptions(wh: WorkHoursConfig): TimeOption[] {
  const opts: TimeOption[] = [];
  if (wh.hasMorning !== false && wh.morning) {
    opts.push({
      label: `الصباح (${fmtTime(wh.morning.start)} - ${fmtTime(wh.morning.end)})`,
      value: 'morning',
      startTime: wh.morning.start,
    });
  }
  if (wh.hasAfternoon !== false && wh.afternoon) {
    opts.push({
      label: `بعد الظهر (${fmtTime(wh.afternoon.start)} - ${fmtTime(wh.afternoon.end)})`,
      value: 'afternoon',
      startTime: wh.afternoon.start,
    });
  }
  opts.push({ label: 'وقت محدد', value: 'custom', startTime: null });
  return opts;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UnifiedAppointmentDialog({
  open,
  onOpenChange,
  tickets,
  clientPhone,
  dateStr,
  initialProjectId,
  editGroup,
  editSupervisors = [],
  onSuccess,
}: UnifiedAppointmentDialogProps) {
  const { typeTranslations, subTypeTranslations } = useTicketTypes();

  // ── Mode detection ─────────────────────────────────────────────────────────
  const isEditMode = !!editGroup;
  const isTicketMode = !isEditMode && (tickets?.length ?? 0) > 0;
  const isCalendarMode = !isEditMode && !isTicketMode;
  const canSendWhatsApp = isTicketMode && !!clientPhone;
  // Work-hours quick-select (الصباح/بعد الظهر) only makes sense when opened
  // from the tickets page — from المواعيد (calendar add) or تعديل موعد
  // (edit), just show a plain date + time picker instead.
  const showWorkHoursShortcuts = isTicketMode;

  const primaryTicket = tickets?.[0] ?? null;
  const multiIds = tickets?.map(t => t.id).join(',') ?? '';

  // ── State ──────────────────────────────────────────────────────────────────

  const [allWorkHours, setAllWorkHours] = useState<any>(null);

  // Common
  const [notes, setNotes] = useState('');
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [selectedSupIds, setSelectedSupIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Date / time
  const [startDate, setStartDate] = useState(todayStr()); // range start (WhatsApp mode)
  const [date, setDate] = useState(todayStr());           // single date (other modes)
  const [rangeDays, setRangeDays] = useState(2);
  const [timeMode, setTimeMode] = useState<string>('morning');
  const [customTime, setCustomTime] = useState('09:00');

  // WhatsApp preview
  const [showPreview, setShowPreview] = useState(false);
  const [dynamicPreview, setDynamicPreview] = useState('جاري تحميل الرسالة...');

  // Conflicts
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  // Edit mode — type selection
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  // Calendar mode — client search & project selection
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>(initialProjectId || '');
  const [clients, setClients] = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [isClientFocused, setIsClientFocused] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedVilla, setSelectedVilla] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId || '');
  const [clientName, setClientName] = useState('');
  const [loadedTickets, setLoadedTickets] = useState<any[]>([]);
  const [existingUnitAppointments, setExistingUnitAppointments] = useState<any[]>([]);
  const [fetchingTickets, setFetchingTickets] = useState(false);
  const [newTicketTypes, setNewTicketTypes] = useState<string[]>([]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const projectsMap = useMemo(() => {
    const map = new Map<string, any>();
    projects.forEach(p => map.set(p.id, p));
    return map;
  }, [projects]);

  const activeTickets: any[] = isCalendarMode ? loadedTickets : (tickets ?? []);
  const hasExistingTickets = activeTickets.length > 0;

  const currentProjectId = useMemo(() => {
    if (isTicketMode) {
      return primaryTicket?.projectId || tickets?.[0]?.projectId || '';
    }
    if (isEditMode) {
      return editGroup?.tickets?.[0]?.projectId || editGroup?.projectId || primaryTicket?.projectId || '';
    }
    if (isCalendarMode) {
      return (hasExistingTickets ? activeTickets[0]?.projectId : (projectId || projectFilter)) || '';
    }
    return '';
  }, [isTicketMode, isEditMode, isCalendarMode, primaryTicket, tickets, editGroup, hasExistingTickets, activeTickets, projectId, projectFilter]);

  const workHours = useMemo<WorkHoursConfig>(() => {
    if (!allWorkHours) return DEFAULT_WH;
    if (currentProjectId && allWorkHours.byProject?.[currentProjectId]) {
      return allWorkHours.byProject[currentProjectId];
    }
    return allWorkHours.default || DEFAULT_WH;
  }, [allWorkHours, currentProjectId]);

  const timeOptions = useMemo(() => buildTimeOptions(workHours), [workHours]);
  const endDate = addDays(startDate, rangeDays - 1);

  const preferredTimeLabel = useMemo(() => {
    if (timeMode === 'custom') return `الساعة ${customTime}`;
    return timeOptions.find(o => o.value === timeMode)?.label ?? timeMode;
  }, [timeMode, customTime, timeOptions]);

  const finalTime = timeMode === 'custom'
    ? customTime
    : (timeOptions.find(o => o.value === timeMode)?.startTime ?? '');

  const effectiveTime = timeMode === 'custom' ? customTime : (finalTime || customTime);
  const effectiveMins = useMemo(() => toMins(effectiveTime), [effectiveTime]);
  const isInsideWorkHours = useMemo(() => inWorkHours(effectiveMins, workHours), [effectiveMins, workHours]);
  const suggestedCorrectionMins = useMemo(() => {
    if (isInsideWorkHours || !workHours.enabled) return null;
    return autoCorrectMins(effectiveMins, workHours);
  }, [isInsideWorkHours, effectiveMins, workHours]);
  const isTimeDisallowed = workHours.enabled && !isInsideWorkHours && suggestedCorrectionMins === null;

  const mergedTypes: Record<string, string> = {
    electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب', paints: 'دهانات',
    ceramics: 'سيراميك', drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية',
    waterproofing: 'عزل مائي', pest_control: 'مكافحة حشرات', general: 'عام',
    carpentry: 'نجارة', civil: 'مدني', aluminum: 'ألمنيوم', gypsum: 'جبس',
    lighting: 'إضاءة', cracks: 'كراك', smart_home: 'نظام ذكي',
    swimming_pool: 'مسبح', landscaping: 'زراعة وحدائق', garage_door: 'باب جراج',
    ...typeTranslations,
    ...subTypeTranslations,
  };

  const checkDate = isCalendarMode ? dateStr : (canSendWhatsApp ? startDate : date);
  const hasConflict = useMemo(() => {
    if (!checkDate) return false;

    // Check open tickets for this villa
    const ticketConflict = loadedTickets.some(t => {
      if (isTicketMode && tickets?.some(sel => sel.id === t.id)) return false;
      return !!t.appointmentTime && t.appointmentTime.startsWith(checkDate);
    });
    if (ticketConflict) return true;

    // Check appointments for this villa
    const apptConflict = existingUnitAppointments.some(a => {
      if (isEditMode && editGroup?.appointmentId === a.id) return false;
      if (isTicketMode && tickets?.some(t => t.appointmentId === a.id)) return false;
      return a.date === checkDate && a.status !== 'cancelled' && a.status !== 'completed';
    });

    return apptConflict;
  }, [checkDate, loadedTickets, existingUnitAppointments, isTicketMode, tickets, isEditMode, editGroup]);

  const activeSupervisorsList = useMemo(() => {
    return isEditMode && editSupervisors && editSupervisors.length > 0 ? editSupervisors : supervisors;
  }, [isEditMode, editSupervisors, supervisors]);

  const availableSupervisors = useMemo(() => {
    if (!currentProjectId) return activeSupervisorsList;
    return activeSupervisorsList.filter((s: any) => {
      const pIds: string[] = s.projectIds || s.projects?.map((p: any) => p.id) || [];
      if (!pIds || pIds.length === 0) return true;
      return pIds.includes(currentProjectId);
    });
  }, [activeSupervisorsList, currentProjectId]);

  // ── Click-outside (calendar dropdown) ─────────────────────────────────────

  useEffect(() => {
    if (!isCalendarMode) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setIsClientFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isCalendarMode]);

  // ── Init on open ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    // Load work hours
    settingsApi.getWorkHours().then((wh: any) => {
      setAllWorkHours(wh);
    }).catch(() => {});

    // Load supervisors
    usersApi.getAll()
      .then((u: any[]) => setSupervisors(u.filter((x: any) => x.role === 'supervisor')))
      .catch(() => {});

    if (isEditMode && editGroup) {
      const [d, t] = (editGroup.appointmentTime || '').split(' ');
      setDate(d || todayStr());
      if (t) { setCustomTime(t); setTimeMode('custom'); } else setTimeMode('morning');
      setNotes(
        editGroup.notes ||
        (editGroup.tickets ?? []).find((tk: any) => tk.appointmentNotes)?.appointmentNotes ||
        ''
      );
      const typesSet: Set<string> = editGroup.types instanceof Set
        ? editGroup.types
        : new Set<string>(editGroup.types || []);
      if (typesSet.size === 0) {
        (editGroup.tickets ?? []).forEach((tk: any) => {
          if (tk.type) typesSet.add(tk.type);
          (tk.detectedTypes ?? []).forEach((dt: string) => typesSet.add(dt));
        });
      }
      setSelectedTypes(Array.from(typesSet));
      const supsSet: Set<string> = editGroup.sups instanceof Set
        ? editGroup.sups
        : new Set<string>(editGroup.supervisorIds || []);
      if (supsSet.size === 0) {
        (editGroup.tickets ?? []).forEach((tk: any) => {
          (tk.assignedSupervisorIds ?? []).forEach((s: string) => supsSet.add(s));
        });
      }
      setSelectedSupIds(Array.from(supsSet));

    } else if (isTicketMode && primaryTicket) {
      const existing = primaryTicket.appointmentTime;
      if (existing) {
        const [d, t] = existing.split(' ');
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime())) {
          setStartDate(d); setDate(d);
          if (t) { setCustomTime(t); setTimeMode('custom'); }
        } else {
          setStartDate(todayStr()); setDate(todayStr()); setTimeMode('morning');
        }
      } else {
        setStartDate(todayStr()); setDate(todayStr()); setTimeMode('morning');
      }
      setNotes(primaryTicket.appointmentNotes || '');
      setRangeDays(2);
      setShowPreview(false);
      setConflicts([]);
      setSelectedSupIds(primaryTicket.assignedSupervisorIds?.length
        ? [...primaryTicket.assignedSupervisorIds]
        : []);

    } else if (isCalendarMode) {
      setDate(dateStr || todayStr());
      setTimeMode('morning');
      setCustomTime('09:00');
      setNotes('');
      setSelectedClientId(''); setSelectedVilla('');
      setProjectId(initialProjectId || '');
      setProjectFilter(initialProjectId || '');
      setClientName('');
      setClientSearch(''); setLoadedTickets([]);
      setNewTicketTypes([]); setSelectedSupIds([]);
      projectsApi.getAll().then(setProjects).catch(() => {});
      clientsApi.getAll().then(setClients).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Adjust timeMode if morning is disabled
  useEffect(() => {
    if (!open || isEditMode || primaryTicket?.appointmentTime) return;
    if (workHours.hasMorning === false && workHours.hasAfternoon !== false) {
      setTimeMode('afternoon');
    } else if (workHours.hasMorning === false && workHours.hasAfternoon === false) {
      setTimeMode('custom');
    }
  }, [open, isEditMode, primaryTicket?.appointmentTime, workHours]);

  // Keep startDate in sync with date when WhatsApp mode is off
  useEffect(() => {
    if (!canSendWhatsApp) setStartDate(date);
  }, [date, canSendWhatsApp]);

  // ── Load tickets & appointments for conflict checking ───────────────────────

  useEffect(() => {
    const pId = isCalendarMode ? projectId : primaryTicket?.projectId;
    const vNum = isCalendarMode ? selectedVilla : primaryTicket?.villaNumber;

    if (!pId || !vNum) {
      if (isCalendarMode) setLoadedTickets([]);
      setExistingUnitAppointments([]);
      return;
    }
    
    setFetchingTickets(true);
    ticketsApi.getAll({ projectId: pId, includeDirectAppts: true })
      .then((res: any[]) => {
        const tks = res.filter(
          (t: any) =>
            String(t.villaNumber) === String(vNum) &&
            !['closed', 'out-of-scope', 'completed'].includes(t.status),
        );
        setLoadedTickets(tks);
        if (isCalendarMode) {
          const supIds = new Set<string>();
          tks.forEach((t: any) => (t.assignedSupervisorIds ?? []).forEach((s: string) => supIds.add(s)));
          setSelectedSupIds(Array.from(supIds));
        }
      })
      .catch(() => {})
      .finally(() => setFetchingTickets(false));

    appointmentsApi.getByUnit(pId, vNum)
      .then((res: any[]) => {
        setExistingUnitAppointments(res || []);
      })
      .catch(() => {
        setExistingUnitAppointments([]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCalendarMode, projectId, selectedVilla, primaryTicket?.projectId, primaryTicket?.villaNumber]);

  // ── Conflict check ─────────────────────────────────────────────────────────

  const checkConflicts = useCallback(async () => {
    if (!canSendWhatsApp) return;
    const supIds = selectedSupIds.length > 0
      ? selectedSupIds
      : (primaryTicket?.assignedSupervisorIds || []);
    if (supIds.length === 0 || !startDate) return;
    setCheckingConflicts(true);
    try {
      const result = await appointmentsApi.getConflicts({
        supervisorIds: supIds,
        startDate,
        endDate,
        excludeTicketId: primaryTicket?.id,
      });
      setConflicts(result.conflicts || []);
    } catch {
      setConflicts([]);
    } finally {
      setCheckingConflicts(false);
    }
  }, [startDate, endDate, primaryTicket?.id, selectedSupIds, canSendWhatsApp]);

  useEffect(() => {
    if (!open || !canSendWhatsApp) return;
    const timer = setTimeout(checkConflicts, 400);
    return () => clearTimeout(timer);
  }, [checkConflicts, open, canSendWhatsApp]);

  // ── WhatsApp preview ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!open || !canSendWhatsApp) return;
    const fetch = async () => {
      try {
        const result = await whatsappApi.previewAppointmentRange(multiIds, {
          startDate,
          endDate: addDays(startDate, rangeDays - 1),
          preferredTime: preferredTimeLabel,
          notes: notes || undefined,
          phone: clientPhone || '966500000000',
          clientName: primaryTicket?.clientName || '',
          villaNumber: primaryTicket?.villaNumber || '',
        });
        if (result.text) setDynamicPreview(result.text);
      } catch {}
    };
    const timer = setTimeout(fetch, 500);
    return () => clearTimeout(timer);
  }, [open, startDate, rangeDays, preferredTimeLabel, notes, multiIds, clientPhone, canSendWhatsApp]);

  // ── Save (internal) ────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      let saveTime = timeMode === 'custom' ? customTime : (finalTime || undefined);
      if (saveTime && workHours.enabled) {
        const mins = toMins(saveTime);
        if (!inWorkHours(mins, workHours)) {
          const corrected = autoCorrectMins(mins, workHours);
          if (corrected !== null) {
            saveTime = minsToHhmm(corrected);
          }
        }
      }

      const resolvedClientPhone: string | undefined = isEditMode
        ? (editGroup?.clientPhone || undefined)
        : isTicketMode
        ? (clientPhone || undefined)
        : (clients.find(c => c.id === selectedClientId)?.phone || undefined);

      const assignedSupervisors = activeSupervisorsList
        .filter((s: any) => selectedSupIds.includes(s.uid || s.id))
        .map((s: any) => ({ id: s.uid || s.id, name: s.displayName || s.name, specialty: 'general' }));

      if (isEditMode) {
        if (editGroup.appointmentId) {
          await appointmentsApi.update(editGroup.appointmentId, {
            date,
            time: saveTime,
            notes: notes || undefined,
            supervisorIds: selectedSupIds,
            supervisors: assignedSupervisors,
            types: selectedTypes,
            clientPhone: resolvedClientPhone,
          });
        } else {
          const apptTime = `${date} ${saveTime || '08:00'}`;
          await Promise.all((editGroup.tickets ?? []).map((t: any) =>
            ticketsApi.update(t.id, {
              appointmentTime: apptTime,
              appointmentNotes: notes,
              appointmentAwaitingReply: false,
              isDirectAppointment: true,
              assignedSupervisorIds: selectedSupIds,
              assignedSupervisors,
              status: t.status === 'waiting' ? 'pending' : t.status,
            })
          ));
        }
        toast.success('تم تعديل الموعد بنجاح');

      } else if (isTicketMode) {
        const allTypes = new Set<string>();
        tickets?.forEach(t => {
          if (t.type) allTypes.add(t.type);
          (t.detectedTypes ?? []).forEach((dt: string) => allTypes.add(dt));
        });
        const saveDate = canSendWhatsApp ? startDate : date;
        const existingApptId = tickets?.find(t => t.appointmentId)?.appointmentId;

        if (existingApptId) {
          await appointmentsApi.update(existingApptId, {
            date: saveDate, time: saveTime,
            notes: notes || undefined,
            supervisorIds: selectedSupIds, supervisors: assignedSupervisors,
            types: Array.from(allTypes),
            clientPhone: resolvedClientPhone,
          });
        } else {
          const first = tickets![0];
          await appointmentsApi.create({
            projectId: first.projectId,
            villaNumber: first.villaNumber,
            clientId: first.clientId || undefined,
            clientName: first.clientName,
            clientPhone: resolvedClientPhone,
            date: saveDate, time: saveTime,
            notes: notes || undefined,
            supervisorIds: selectedSupIds, supervisors: assignedSupervisors,
            types: Array.from(allTypes),
            ticketIds: tickets!.map(t => t.id),
          });
        }
        toast.success('تم حفظ الموعد بنجاح');

      } else if (isCalendarMode) {
        const effectiveDate = dateStr ?? date;

        if (hasExistingTickets) {
          const existingApptId: string | undefined = activeTickets.find((t: any) => t.appointmentId)?.appointmentId;
          const allTypes = new Set<string>();
          activeTickets.forEach((t: any) => {
            if (t.type) allTypes.add(t.type);
            (t.detectedTypes ?? []).forEach((dt: string) => allTypes.add(dt));
          });
          if (existingApptId) {
            await appointmentsApi.update(existingApptId, {
              date: effectiveDate, time: saveTime,
              notes: notes || undefined,
              supervisorIds: selectedSupIds, supervisors: assignedSupervisors,
              types: Array.from(allTypes),
              clientPhone: resolvedClientPhone,
            });
          } else {
            await appointmentsApi.create({
              projectId, villaNumber: selectedVilla,
              clientId: selectedClientId || undefined, clientName,
              clientPhone: resolvedClientPhone,
              date: effectiveDate, time: saveTime,
              notes: notes || undefined,
              supervisorIds: selectedSupIds, supervisors: assignedSupervisors,
              types: Array.from(allTypes),
              ticketIds: activeTickets.map((t: any) => t.id),
            });
          }
        } else {
          // No open ticket for this villa — save the appointment on its own
          await appointmentsApi.create({
            projectId, villaNumber: selectedVilla,
            clientId: selectedClientId || undefined, clientName,
            clientPhone: resolvedClientPhone,
            date: effectiveDate, time: saveTime,
            notes: notes || undefined,
            supervisorIds: selectedSupIds, supervisors: assignedSupervisors,
            types: newTicketTypes,
          });
        }
        toast.success('تم حفظ الموعد بنجاح');
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || err?.message || 'فشل حفظ الموعد';
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  // ── Send WhatsApp ──────────────────────────────────────────────────────────

  const handleSendWhatsApp = async () => {
    if (!clientPhone) return;
    setSending(true);
    try {
      const result = await whatsappApi.sendAppointmentRange(multiIds, {
        startDate,
        endDate,
        preferredTime: preferredTimeLabel,
        notes: notes || undefined,
        phone: clientPhone,
        clientName: primaryTicket?.clientName || '',
        villaNumber: primaryTicket?.villaNumber || '',
      });
      if (result.sent) {
        toast.success('تم إرسال الرسالة للعميل عبر واتساب');
      } else {
        toast.info('تم الحفظ (الواتساب غير متصل)');
      }
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error('فشل إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  // ── Can save ───────────────────────────────────────────────────────────────

  const isBusy = saving || sending;
  const canSave = !isBusy && !isTimeDisallowed && (
    isEditMode
      ? (!!date && selectedTypes.length > 0)
      : isTicketMode
      ? (!!(canSendWhatsApp ? startDate : date) && !hasConflict)
      : isCalendarMode
      ? (!!selectedClientId && !hasConflict && (hasExistingTickets || newTicketTypes.length > 0))
      : false
  );

  // ── Title ──────────────────────────────────────────────────────────────────

  const dialogTitle = isEditMode
    ? `تعديل موعد — فيلا ${editGroup?.villaNumber}`
    : isCalendarMode
    ? 'إضافة موعد'
    : canSendWhatsApp
    ? `تحديد موعد ${tickets!.length > 1 ? `لـ${tickets!.length} تذاكر` : 'الزيارة'}`
    : 'إضافة موعد داخلي';

  const TitleIcon = isEditMode
    ? CalendarClock
    : isCalendarMode
    ? CalendarPlus
    : CalendarDays;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border text-foreground sm:max-w-[500px] rounded-3xl shadow-2xl shadow-black/20 dark:shadow-black/50 max-h-[90vh] overflow-y-auto overflow-x-hidden"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2 break-words">
            <TitleIcon className={cn('w-5 h-5 shrink-0', isEditMode ? 'text-amber-400' : 'text-blue-400')} />
            {dialogTitle}
          </DialogTitle>

          {/* Ticket info */}
          {isTicketMode && primaryTicket && (
            <div className="text-right mt-1">
              <h3 className="font-bold text-foreground break-words">{primaryTicket.clientName}</h3>
              <p className="text-xs text-muted-foreground break-words">
                {tickets!.length > 1
                  ? `تذاكر: ${tickets!.map(t => t.ticketId).join(', ')}`
                  : `تذكرة #${primaryTicket.ticketId}`
                } — فيلا {primaryTicket.villaNumber}
              </p>
              {!canSendWhatsApp && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  سيتم حفظ الموعد داخلياً دون إرسال رسائل للعميل.
                </p>
              )}
            </div>
          )}

          {/* Calendar add mode: show date */}
          {isCalendarMode && dateStr && (
            <p className="text-sm text-muted-foreground text-right mt-1">
              {new Date(dateStr).toLocaleDateString('ar-EG', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* ── CLIENT SEARCH (calendar mode) ───────────────────────────── */}
          {isCalendarMode && (
            <div className="space-y-3 relative" ref={dropdownRef}>
              {/* فلتر المشروع إذا وُجد أكثر من مشروع */}
              {projects.length > 1 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block">
                      المشروع
                    </Label>
                    {projectFilter && (
                      <button
                        type="button"
                        onClick={() => {
                          setProjectFilter('');
                          if (!selectedClientId) setProjectId('');
                        }}
                        className="text-[11px] text-blue-500 hover:underline font-medium"
                      >
                        عرض كل المشاريع
                      </button>
                    )}
                  </div>
                  <select
                    value={projectFilter}
                    onChange={e => {
                      const pId = e.target.value;
                      setProjectFilter(pId);
                      setSelectedClientId('');
                      setSelectedVilla('');
                      setProjectId(pId);
                      setClientName('');
                      setLoadedTickets([]);
                    }}
                    className="w-full bg-background border border-input rounded-xl h-10 px-3 text-foreground text-xs text-right font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">جميع المشاريع</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.code ? `(${p.code})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block">
                  العميل أو الفيلا
                </Label>
                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="ابحث بالاسم، رقم الفيلا، أو اسم المشروع..."
                    value={isClientFocused ? clientSearch : (selectedClientId ? `${clientName} - فيلا ${selectedVilla}` : clientSearch)}
                    onChange={e => {
                      setClientSearch(e.target.value);
                      setIsClientFocused(true);
                      if (selectedClientId) {
                        setSelectedClientId(''); setSelectedVilla('');
                        setProjectId(projectFilter || ''); setClientName(''); setLoadedTickets([]);
                      }
                    }}
                    onFocus={() => setIsClientFocused(true)}
                    className="w-full bg-background border border-input rounded-xl h-12 pr-10 pl-3 text-foreground text-sm text-right"
                  />
                </div>
              </div>

              {/* Selected client card preview */}
              {selectedClientId && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-3 flex items-center justify-between gap-3 text-right">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-foreground truncate">{clientName}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-300">
                        <Home className="w-3.5 h-3.5" />
                        فيلا {selectedVilla}
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                        <Building2 className="w-3.5 h-3.5 text-blue-500" />
                        {clients.find(c => c.id === selectedClientId)?.projectName || projectsMap.get(projectId)?.name || 'المشروع'}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5 shrink-0"
                    onClick={() => {
                      setSelectedClientId('');
                      setSelectedVilla('');
                      setProjectId(projectFilter || '');
                      setClientName('');
                      setClientSearch('');
                      setLoadedTickets([]);
                    }}
                  >
                    تغيير
                  </Button>
                </div>
              )}

              {/* Search dropdown results */}
              {isClientFocused && (
                <div className="absolute top-[100%] left-0 right-0 mt-1 bg-card border border-border rounded-2xl shadow-2xl z-50 max-h-[280px] overflow-y-auto no-scrollbar">
                  {clients.length === 0
                    ? <div className="p-4 text-sm text-muted-foreground text-center">جارٍ التحميل...</div>
                    : (() => {
                        const s = clientSearch.trim().toLowerCase();
                        const filtered = clients.filter(c => {
                          if (projectFilter && c.projectId && c.projectId !== projectFilter) {
                            return false;
                          }
                          if (!s) return true;
                          
                          const isShortNumber = /^\d{1,4}$/.test(s);
                          
                          const pName = c.projectName || projectsMap.get(c.projectId)?.name || '';
                          const pCode = c.projectCode || projectsMap.get(c.projectId)?.code || '';
                          const nameMatch = c.name && String(c.name).toLowerCase().includes(s);
                          const villaMatch = c.villaNumber != null && String(c.villaNumber).toLowerCase().includes(s);
                          const phoneMatch = c.phone && !isShortNumber && String(c.phone).toLowerCase().includes(s);
                          const projMatch = pName.toLowerCase().includes(s) || pCode.toLowerCase().includes(s);
                          
                          return nameMatch || villaMatch || phoneMatch || projMatch;
                        }).slice(0, 50);

                        if (!filtered.length)
                          return <div className="p-4 text-sm text-muted-foreground text-center">لا يوجد نتائج تطابق البحث</div>;

                        return filtered.map(c => {
                          const pObj = projectsMap.get(c.projectId);
                          const projDisplayName = c.projectName || pObj?.name || (c.projectId ? `مشروع #${c.projectId.slice(0, 6)}` : 'بدون مشروع');

                          return (
                            <div
                              key={`${c.id}-${c.projectId || ''}-${c.villaNumber || ''}`}
                              className="px-4 py-3 hover:bg-muted/70 cursor-pointer text-sm text-right transition-colors border-b border-border/50 last:border-0 flex items-center justify-between gap-3"
                              onClick={() => {
                                setSelectedClientId(c.id);
                                setSelectedVilla(c.villaNumber);
                                setProjectId(c.projectId);
                                setClientName(c.name);
                                setClientSearch('');
                                setIsClientFocused(false);
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-foreground block text-sm">{c.name}</span>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                                  <span className="inline-flex items-center gap-1 font-semibold text-foreground/90 bg-muted/90 px-2 py-0.5 rounded-md">
                                    <Home className="w-3.5 h-3.5 text-blue-500" />
                                    فيلا {c.villaNumber}
                                  </span>
                                  {c.blockNumber && (
                                    <span className="text-[11px] text-muted-foreground">
                                      بلوك {c.blockNumber}
                                    </span>
                                  )}
                                  {c.phone && (
                                    <span className="text-[11px] text-muted-foreground/80 font-mono">
                                      {c.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* اسم المشروع في شارة واضحة ومميزة */}
                              <div className="shrink-0 text-left">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 max-w-[150px] truncate shadow-sm">
                                  <Building2 className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                                  <span className="truncate">{projDisplayName}</span>
                                </span>
                              </div>
                            </div>
                          );
                        });
                      })()
                  }
                </div>
              )}
            </div>
          )}

          {/* ── Conflict / tickets info ── */}
          {hasConflict && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-right">
              <p className="text-sm text-red-500 font-bold mb-1">تنبيه: العميل لديه موعد مسبق اليوم</p>
              <p className="text-xs text-red-500/70">لا يمكن إنشاء موعد مكرر لنفس الفيلا في نفس اليوم.</p>
            </div>
          )}
          {isCalendarMode && fetchingTickets && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> جلب بيانات التذاكر...
            </div>
          )}
          {isCalendarMode && hasExistingTickets && !fetchingTickets && !hasConflict && (
            <div className="space-y-2">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-right">
                <p className="text-sm text-blue-500 font-bold mb-1">يوجد {activeTickets.length} تذاكر مفتوحة</p>
                <p className="text-xs text-blue-500/70">سيتم ربط الموعد بهذه التذاكر تلقائياً.</p>
              </div>
              <div className="bg-muted/30 border border-border/50 rounded-2xl p-3 max-h-28 overflow-y-auto text-right no-scrollbar">
                {activeTickets.map((t: any) => (
                  <div key={t.id} className="mb-1.5 last:mb-0 border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
                    <span className="text-[10px] text-blue-400 font-bold ml-2">#{t.ticketId || t.id?.slice(0, 6)}</span>
                    <p className="text-xs text-foreground leading-relaxed break-words">{renderTableDescription(t.description)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isCalendarMode && selectedClientId && !fetchingTickets && !hasExistingTickets && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-right">
              <p className="text-sm text-amber-500 font-bold mb-1">لا توجد تذاكر مفتوحة</p>
              <p className="text-xs text-amber-500/70">سيتم إنشاء تذكرة جديدة بالتخصصات المختارة.</p>
            </div>
          )}

          {/* ── CALENDAR MODE + no tickets: type picker ── */}
          {isCalendarMode && selectedClientId && !fetchingTickets && !hasExistingTickets && (
            <div className="space-y-2">
              <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block">
                تخصصات الصيانة المطلوبة
              </Label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                {Object.entries(mergedTypes).map(([k, v]) => {
                  const isSel = newTicketTypes.includes(k);
                  return (
                    <button
                      key={k}
                      onClick={() => setNewTicketTypes(prev =>
                        isSel ? prev.filter(x => x !== k) : [...prev, k]
                      )}
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                        isSel
                          ? 'bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-300'
                          : 'bg-muted/50 border-input text-muted-foreground hover:border-foreground/30',
                      )}
                    >
                      {v as React.ReactNode}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── WHATSAPP MODE: date range ─────────────────────────────── */}
          {canSendWhatsApp && (
            <>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block">
                  تاريخ بداية الفترة المقترحة للعميل
                </Label>
                <input
                  type="date"
                  value={startDate}
                  min={todayStr()}
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) return;
                    const d = new Date(val);
                    if (d.getDay() === 5) {
                      toast.error('لا يمكن اختيار يوم الجمعة، تم التحويل للسبت تلقائياً.');
                      d.setDate(d.getDate() + 1);
                      setStartDate(d.toISOString().split('T')[0]);
                    } else {
                      setStartDate(val);
                    }
                  }}
                  className="w-full bg-background border border-input rounded-xl h-11 px-3 text-foreground text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block">
                  مدة الفترة المُرسَلة للعميل
                </Label>
                <div className="flex gap-2">
                  {RANGE_PRESETS.map(p => (
                    <button
                      key={p.days}
                      onClick={() => setRangeDays(p.days)}
                      className={cn(
                        'flex-1 h-10 rounded-xl text-xs font-bold border transition-all',
                        rangeDays === p.days
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-300'
                          : 'bg-muted/50 border-input text-muted-foreground hover:border-foreground/30'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 text-sm">
                  <CalendarDays className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-amber-700 dark:text-amber-300 font-bold">
                    {formatDateAr(startDate)} ← {formatDateAr(endDate)}
                  </span>
                </div>
              </div>

              {(checkingConflicts || conflicts.length > 0) && (
                <div className={cn(
                  'rounded-xl border p-3 space-y-2',
                  conflicts.length > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-slate-500/10 border-border'
                )}>
                  <div className="flex items-center gap-2">
                    {checkingConflicts
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
                    }
                    <span className={cn('text-xs font-bold', conflicts.length > 0 ? 'text-orange-600 dark:text-orange-300' : 'text-muted-foreground')}>
                      {checkingConflicts
                        ? 'جارٍ فحص التعارضات...'
                        : `${conflicts.length} موعد آخر في نفس الفترة`}
                    </span>
                  </div>
                  {conflicts.length > 0 && (
                    <div className="space-y-1">
                      {conflicts.slice(0, 3).map((c: any, i) => (
                        <div key={i} className="text-[11px] text-orange-800 dark:text-orange-200/80 bg-orange-500/10 rounded-lg px-2 py-1">
                          تذكرة #{c.ticketId} — {c.clientName} | {c.appointmentTime?.split(' ')[0]}
                        </div>
                      ))}
                      {conflicts.length > 3 && (
                        <p className="text-[10px] text-orange-600 dark:text-orange-400">... و{conflicts.length - 3} أخرى</p>
                      )}
                      <p className="text-[10px] text-orange-600/70 dark:text-orange-400/70 mt-1">
                        يمكن المتابعة — التحذير للمعلومية فقط
                      </p>
                    </div>
                  )}
                  {!checkingConflicts && conflicts.length === 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      لا توجد تعارضات في هذه الفترة
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── DATE PICKER (non-WhatsApp modes) ─────────────────────── */}
          {!canSendWhatsApp && !isCalendarMode && (
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold block">التاريخ</Label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-background border border-input rounded-xl h-11 px-3 text-foreground text-sm"
              />
            </div>
          )}

          {/* ── TIME OPTIONS (from work hours — ALL MODES) ────────────── */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block">
              {canSendWhatsApp ? 'الوقت المفضل للعميل' : 'وقت الموعد'}
            </Label>
            {showWorkHoursShortcuts && timeOptions.filter(opt => opt.value !== 'custom').length > 0 && (
              <div className={cn(
                "grid gap-2",
                timeOptions.filter(opt => opt.value !== 'custom').length > 1 ? "grid-cols-2" : "grid-cols-1"
              )}>
                {timeOptions.filter(opt => opt.value !== 'custom').map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTimeMode(opt.value)}
                    className={cn(
                      'h-10 rounded-xl text-xs font-bold border transition-all px-2',
                      timeMode === opt.value
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-700 dark:text-blue-300'
                        : 'bg-muted/50 border-input text-muted-foreground hover:border-foreground/30'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {/* الوقت المحدد ظاهر دايماً — مش محتاج تدوس على زرار عشان يظهر */}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="time"
                value={timeMode === 'custom' ? customTime : (finalTime || customTime)}
                onChange={e => { setCustomTime(e.target.value); setTimeMode('custom'); }}
                className={cn(
                  "w-full bg-background border rounded-xl h-11 px-3 text-foreground text-sm transition-colors",
                  workHours.enabled && !isInsideWorkHours
                    ? (suggestedCorrectionMins !== null ? "border-amber-500/60 focus:border-amber-500" : "border-red-500/60 focus:border-red-500")
                    : "border-input"
                )}
              />
            </div>

            {/* تنبيه وقيود أوقات الدوام */}
            {workHours.enabled && !isInsideWorkHours && (
              <div className="pt-1">
                {suggestedCorrectionMins !== null ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between gap-3 text-xs text-amber-700 dark:text-amber-300">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                      <span className="truncate">يبدو أنك تقصد الفترة المسائية ({fmtTime(minsToHhmm(suggestedCorrectionMins))})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomTime(minsToHhmm(suggestedCorrectionMins));
                        setTimeMode('custom');
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow-sm"
                    >
                      تصحيح تلقائي
                    </button>
                  </div>
                ) : (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-bold">الوقت المحدد ({fmtTime(effectiveTime)}) خارج أوقات الدوام المعتمدة</p>
                      <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-0.5 leading-normal">
                        أوقات العمل المتاحة: {getWorkHoursSummary(workHours)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── EDIT MODE: type selector ────────────────────────────────── */}
          {isEditMode && (
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold block">
                التخصصات المطلوبة
              </Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(mergedTypes).map(([k, v]) => {
                  const isSel = selectedTypes.includes(k);
                  return (
                    <button
                      key={k}
                      onClick={() => setSelectedTypes(prev =>
                        isSel ? prev.filter(x => x !== k) : [...prev, k]
                      )}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5',
                        isSel
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm'
                          : 'bg-muted/30 border-border text-muted-foreground hover:border-slate-400 hover:bg-muted/80'
                      )}
                    >
                      <div className={cn('w-2 h-2 rounded-full shrink-0', isSel ? 'bg-amber-500' : 'bg-muted-foreground/30')} />
                      {v as React.ReactNode}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SUPERVISORS (ALL MODES) ───────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold block text-right">
              المشرفين
            </Label>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto no-scrollbar">
              {availableSupervisors.map((s: any) => {
                const sId = s.uid || s.id;
                const sName = s.displayName || s.name;
                const isSel = selectedSupIds.includes(sId);
                return (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => setSelectedSupIds(prev =>
                      prev.includes(sId) ? prev.filter(x => x !== sId) : [...prev, sId]
                    )}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5',
                      isSel
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-slate-400 hover:bg-muted/80'
                    )}
                  >
                    <div className={cn(
                      'w-3 h-3 rounded-[4px] border flex items-center justify-center shrink-0',
                      isSel ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40'
                    )} />
                    {sName}
                  </button>
                );
              })}
              {availableSupervisors.length === 0 && (
                <div className="text-xs text-muted-foreground">لا يوجد مشرفين مسندين لهذا المشروع</div>
              )}
            </div>
          </div>

          {/* ── NOTES (ALL MODES) ─────────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block">
              ملاحظات (اختياري)
            </Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="أي تعليمات للفني أو العميل..."
              className="w-full bg-background border border-input rounded-xl p-3 text-right text-foreground text-sm resize-none h-20 placeholder:text-muted-foreground"
            />
          </div>

          {/* ── WHATSAPP PREVIEW ──────────────────────────────────────── */}
          {canSendWhatsApp && (
            <>
              <button
                onClick={() => setShowPreview(v => !v)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors font-bold w-full"
              >
                <Eye className="w-3.5 h-3.5" />
                {showPreview ? 'إخفاء' : 'معاينة'} رسالة واتساب
                <ChevronDown className={cn('w-3 h-3 transition-transform', showPreview && 'rotate-180')} />
              </button>
              {showPreview && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-[10px] text-emerald-400 font-bold mb-2 uppercase tracking-wider">معاينة الرسالة</p>
                  <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
                    {dynamicPreview}
                  </pre>
                </div>
              )}
            </>
          )}

          {/* ── ACTION BUTTONS ────────────────────────────────────────── */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={!canSave}
              variant={canSendWhatsApp ? 'outline' : 'default'}
              className={cn(
                'flex-1 rounded-xl h-12 font-bold text-sm',
                canSendWhatsApp
                  ? 'border-input bg-background text-foreground hover:bg-muted'
                  : isEditMode
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
              )}
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4 me-1.5" />
              }
              {isEditMode ? 'حفظ التعديلات' : 'حفظ الموعد'}
            </Button>

            {canSendWhatsApp && (
              <Button
                onClick={handleSendWhatsApp}
                disabled={isBusy || !startDate || hasConflict}
                className="flex-1 rounded-xl h-12 font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
              >
                {sending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4 me-1.5" />
                }
                إرسال رسالة للعميل
              </Button>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
