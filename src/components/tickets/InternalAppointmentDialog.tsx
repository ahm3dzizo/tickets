import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ticketsApi, clientsApi, usersApi, appointmentsApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, CalendarPlus, Save, Search, Clock, Home, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTicketTypes } from '@/contexts/TicketTypesContext';
import { Ticket } from '@/types';

interface InternalAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected tickets — if provided, skip client search */
  tickets?: Ticket[];
  /** Pre-selected date from calendar (e.g. "2026-06-11") — if provided, show it read-only */
  dateStr?: string;
  onSuccess?: () => void;
}

export function InternalAppointmentDialog({
  open,
  onOpenChange,
  tickets: propTickets,
  dateStr,
  onSuccess,
}: InternalAppointmentDialogProps) {
  const { typeTranslations, subTypeTranslations, subTypeBg, typeBg } = useTicketTypes();

  // ── state ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [selectedSupIds, setSelectedSupIds] = useState<string[]>([]);
  const [time, setTime] = useState('09:00');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  // Client search (only when no propTickets)
  const [clients, setClients] = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [isClientFocused, setIsClientFocused] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedVilla, setSelectedVilla] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientName, setClientName] = useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Loaded open tickets (when client is selected from search)
  const [loadedTickets, setLoadedTickets] = useState<any[]>([]);
  const [fetchingTickets, setFetchingTickets] = useState(false);

  // Type picker — only shown when creating a brand-new ticket (no existing open tickets)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [customType, setCustomType] = useState('');
  const [addingType, setAddingType] = useState(false);
  const [dynamicTypes, setDynamicTypes] = useState<Record<string, string>>({});

  const { refresh: refreshTicketTypes } = useTicketTypes();

  const mergedTypeLabels: Record<string, string> = {
    electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب', paints: 'دهانات',
    ceramics: 'سيراميك', drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية',
    waterproofing: 'عزل مائي', pest_control: 'مكافحة حشرات', general: 'عام',
    ...typeTranslations,
    ...dynamicTypes,
  };

  // ── derived ────────────────────────────────────────────────────────────────
  const calendarMode = !propTickets; // true → client search + date from dateStr
  const activeTickets: any[] = propTickets ?? loadedTickets;
  const hasExistingTickets = activeTickets.length > 0;

  /** Build the read-only type chip list from existing tickets */
  const ticketTypeChips: { label: string; bg: string }[] = React.useMemo(() => {
    const chips: { label: string; bg: string }[] = [];
    const seen = new Set<string>();

    for (const t of activeTickets) {
      const subIds: string[] = (t as any).detectedSubTypeIds ?? [];
      if (subIds.length > 0) {
        for (const id of subIds) {
          if (!seen.has(id)) {
            seen.add(id);
            chips.push({
              label: subTypeTranslations[id] ?? id,
              bg: subTypeBg[id] ?? 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            });
          }
        }
      } else {
        const types: string[] = t.detectedTypes ?? (t.type ? [t.type] : []);
        for (const k of types) {
          if (!seen.has(k)) {
            seen.add(k);
            chips.push({
              label: mergedTypeLabels[k] ?? k,
              bg: typeBg[k] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20',
            });
          }
        }
      }
    }
    return chips;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTickets, subTypeTranslations, subTypeBg, typeTranslations, typeBg]);

  // ── click outside (client dropdown) ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsClientFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── init on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    usersApi.getAll()
      .then((u: any[]) => setSupervisors(u.filter((x: any) => x.role === 'supervisor')))
      .catch(() => {});

    if (calendarMode) {
      clientsApi.getAll().then(setClients).catch(() => {});
      setDate(dateStr ?? '');
      setTime('09:00');
      setNotes('');
      setSelectedClientId('');
      setSelectedVilla('');
      setProjectId('');
      setClientName('');
      setClientSearch('');
      setLoadedTickets([]);
      setSelectedTypes([]);
      setSelectedSupIds([]);
    } else {
      // Pre-fill from propTickets
      const tks = propTickets!;
      if (tks.length > 0 && tks[0].appointmentTime) {
        const parts = tks[0].appointmentTime.split(' ');
        setDate(parts[0] ?? '');
        setTime(parts[1] ?? '09:00');
      } else {
        const today = new Date();
        const offset = today.getTimezoneOffset() * 60000;
        setDate(new Date(today.getTime() - offset).toISOString().split('T')[0]);
        setTime('09:00');
      }
      setNotes(tks[0]?.appointmentNotes ?? '');
      const supIds = new Set<string>();
      tks.forEach((t: any) => {
        (t.assignedSupervisorIds ?? []).forEach((s: string) => supIds.add(s));
      });
      setSelectedSupIds(Array.from(supIds));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── load tickets when client selected ─────────────────────────────────────
  useEffect(() => {
    if (!calendarMode || !selectedClientId || !selectedVilla) return;
    setFetchingTickets(true);
    ticketsApi.getAll({ projectId, includeDirectAppts: true })
      .then((res: any[]) => {
        const tks = res.filter(
          (t: any) =>
            String(t.villaNumber) === String(selectedVilla) &&
            !['closed', 'out-of-scope', 'completed'].includes(t.status),
        );
        setLoadedTickets(tks);

        const supIds = new Set<string>();
        tks.forEach((t: any) => (t.assignedSupervisorIds ?? []).forEach((s: string) => supIds.add(s)));
        setSelectedSupIds(Array.from(supIds));
      })
      .catch(() => {})
      .finally(() => setFetchingTickets(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, selectedVilla, projectId]);

  // ── add custom type ────────────────────────────────────────────────────────
  const handleAddCustomType = async () => {
    if (!customType.trim()) return;
    setAddingType(true);
    try {
      const key = `type_${Date.now()}`;
      const token = localStorage.getItem('retal_auth_token') || localStorage.getItem('token');
      const res = await fetch('/api/admin/ticket-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ key, nameAr: customType.trim() }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'فشل إنشاء التخصص الجديد');
      }
      const newType = await res.json();
      setDynamicTypes(prev => ({ ...prev, [newType.key]: newType.nameAr }));
      setSelectedTypes(prev => [...prev, newType.key]);
      refreshTicketTypes();
      setCustomType('');
      toast.success('تمت إضافة التخصص');
    } catch (err: any) {
      toast.error(err.message || 'فشل إضافة التخصص');
    } finally {
      setAddingType(false);
    }
  };

  // ── save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!date || !time) {
      toast.error('الرجاء تحديد التاريخ والوقت');
      return;
    }
    if (calendarMode && !selectedClientId) {
      toast.error('الرجاء اختيار العميل/الفيلا');
      return;
    }
    if (!hasExistingTickets && selectedTypes.length === 0) {
      toast.error('الرجاء تحديد تخصص واحد على الأقل');
      return;
    }

    const effectiveDate = calendarMode ? (dateStr ?? date) : date;

    // Conflict check in calendar mode
    if (calendarMode && loadedTickets.some(t => !!t.appointmentTime && t.appointmentTime.startsWith(effectiveDate))) {
      toast.error('هذا العميل لديه موعد مجدول بالفعل في هذا اليوم');
      return;
    }

    setLoading(true);
    try {
      const assignedSupervisors = supervisors
        .filter(s => selectedSupIds.includes(s.uid || s.id))
        .map(s => ({ id: s.uid || s.id, name: s.displayName || s.name, specialty: 'general' }));

      const allTypes = new Set<string>();
      for (const t of activeTickets) {
        if (t.type) allTypes.add(t.type);
        if (t.detectedTypes) t.detectedTypes.forEach((dt: string) => allTypes.add(dt));
      }

      if (hasExistingTickets) {
        // Check if tickets already belong to an appointment
        const existingApptId: string | undefined = (activeTickets[0] as any).appointmentId;

        if (existingApptId) {
          await appointmentsApi.update(existingApptId, {
            date: effectiveDate,
            time,
            notes: notes || undefined,
            supervisorIds: selectedSupIds,
            supervisors: assignedSupervisors,
            types: Array.from(allTypes),
          });
        } else {
          const firstTicket = activeTickets[0];
          await appointmentsApi.create({
            projectId: firstTicket.projectId || projectId,
            villaNumber: firstTicket.villaNumber || selectedVilla,
            clientId: firstTicket.clientId || selectedClientId || undefined,
            clientName: firstTicket.clientName || clientName,
            date: effectiveDate,
            time,
            notes: notes || undefined,
            supervisorIds: selectedSupIds,
            supervisors: assignedSupervisors,
            types: Array.from(allTypes),
            ticketIds: activeTickets.map((t: any) => t.id),
          });
        }
      } else {
        // Create new ticket first, then create appointment
        const appointmentTime = `${effectiveDate} ${time}`;
        const nextId = await ticketsApi.getNextId(projectId);
        const ticketPayload: any = {
          ticketId: nextId,
          refNumber: selectedVilla,
          projectId,
          clientId: selectedClientId,
          clientName,
          villaNumber: selectedVilla,
          description: `موعد صيانة مجدول يدوياً للمشرف (${selectedTypes.map(k => mergedTypeLabels[k] ?? k).join('، ')})`,
          type: selectedTypes[0],
          detectedTypes: selectedTypes,
          status: 'pending',
          appointmentAwaitingReply: false,
          priority: 3,
          appointmentTime,
          isDirectAppointment: true,
          createdAt: new Date().toISOString(),
        };
        if (notes) ticketPayload.appointmentNotes = notes;
        if (selectedSupIds.length > 0) {
          ticketPayload.assignedSupervisorIds = selectedSupIds;
          ticketPayload.assignedSupervisorId = selectedSupIds[0];
          ticketPayload.assignedSupervisors = assignedSupervisors;
        }
        const newTicket = await ticketsApi.create(ticketPayload);
        await appointmentsApi.create({
          projectId,
          villaNumber: selectedVilla,
          clientId: selectedClientId || undefined,
          clientName,
          date: effectiveDate,
          time,
          notes: notes || undefined,
          supervisorIds: selectedSupIds,
          supervisors: assignedSupervisors,
          types: selectedTypes,
          ticketIds: [newTicket.id],
        });
      }

      toast.success('تم حفظ الموعد بنجاح');
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error('فشل حفظ الموعد');
    } finally {
      setLoading(false);
    }
  };

  // ── display ────────────────────────────────────────────────────────────────
  const displayDateStr = dateStr
    ? new Date(dateStr).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const selectedClientDisplay = selectedVilla ? `${clientName} - فيلا ${selectedVilla}` : '';

  const hasConflict = calendarMode && dateStr
    ? loadedTickets.some(t => !!t.appointmentTime && t.appointmentTime.startsWith(dateStr))
    : false;

  const canSave =
    !loading &&
    !!date && !!time &&
    (!calendarMode || !!selectedClientId) &&
    !hasConflict &&
    (hasExistingTickets || selectedTypes.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border text-foreground sm:max-w-[420px] max-h-[90vh] flex flex-col rounded-3xl p-4 sm:p-6"
        dir="rtl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg font-bold text-foreground text-right flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-blue-400" />
            {calendarMode ? 'إضافة موعد مباشر' : 'إضافة موعد (داخلي)'}
          </DialogTitle>
          {calendarMode && displayDateStr && (
            <p className="text-sm text-muted-foreground text-right mt-1">{displayDateStr}</p>
          )}
          {!calendarMode && (
            <p className="text-sm text-muted-foreground text-right mt-1">
              سيتم حفظ الموعد مباشرةً دون إرسال رسائل للعميل.
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-5 px-1 -mx-1 py-2">

          {/* ── Client Search (calendar mode only) ── */}
          {calendarMode && (
            <div className="space-y-2 relative" ref={dropdownRef}>
              <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block text-right">
                العميل أو الفيلا
              </Label>
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="ابحث بالاسم أو رقم الفيلا..."
                  value={isClientFocused ? clientSearch : (selectedClientId ? selectedClientDisplay : clientSearch)}
                  onChange={e => {
                    setClientSearch(e.target.value);
                    setIsClientFocused(true);
                    if (selectedClientId) {
                      setSelectedClientId('');
                      setSelectedVilla('');
                      setProjectId('');
                      setClientName('');
                      setLoadedTickets([]);
                    }
                  }}
                  onFocus={() => setIsClientFocused(true)}
                  className="w-full bg-background border border-input rounded-xl h-12 pr-10 pl-3 text-foreground text-sm text-right"
                />
              </div>
              {isClientFocused && (
                <div className="absolute top-[100%] left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 max-h-[250px] overflow-y-auto no-scrollbar">
                  {clients.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">جارٍ التحميل...</div>
                  ) : (() => {
                    const s = clientSearch.toLowerCase();
                    const filtered = clients
                      .filter(c =>
                        (c.name && String(c.name).toLowerCase().includes(s)) ||
                        (c.villaNumber != null && String(c.villaNumber).toLowerCase().includes(s)),
                      )
                      .slice(0, 50);
                    if (filtered.length === 0) {
                      return <div className="p-4 text-sm text-muted-foreground text-center">لا يوجد نتائج</div>;
                    }
                    return filtered.map(c => (
                      <div
                        key={c.id}
                        className="px-4 py-3 hover:bg-muted cursor-pointer text-sm text-right transition-colors border-b border-border/50 last:border-0"
                        onClick={() => {
                          setSelectedClientId(c.id);
                          setSelectedVilla(c.villaNumber);
                          setProjectId(c.projectId);
                          setClientName(c.name);
                          setClientSearch('');
                          setIsClientFocused(false);
                        }}
                      >
                        <span className="font-bold text-foreground block">{c.name}</span>
                        <span className="text-muted-foreground text-xs mt-0.5 block flex items-center gap-1">
                          <Home className="w-3 h-3 inline" /> فيلا {c.villaNumber}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── Conflict warning ── */}
          {calendarMode && hasConflict && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-right">
              <p className="text-sm text-red-500 font-bold mb-1">تنبيه: العميل لديه موعد مسبق اليوم</p>
              <p className="text-xs text-red-500/70">لا يمكن إنشاء موعد مكرر في نفس اليوم.</p>
            </div>
          )}

          {/* ── Fetching spinner ── */}
          {fetchingTickets && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> جلب بيانات التذاكر...
            </div>
          )}

          {/* ── Tickets preview ── */}
          {hasExistingTickets && !fetchingTickets && (
            <div className="space-y-2">
              {calendarMode && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-right">
                  <p className="text-sm text-blue-500 font-bold mb-1">يوجد {activeTickets.length} تذاكر مفتوحة</p>
                  <p className="text-xs text-blue-500/70">سيتم ربط الموعد بهذه التذاكر تلقائياً.</p>
                </div>
              )}
              <div className="bg-muted/30 border border-border/50 rounded-2xl p-3 max-h-32 overflow-y-auto text-right no-scrollbar">
                {activeTickets.map((t: any) => (
                  <div key={t.id} className="mb-2 last:mb-0 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <span className="text-[10px] text-blue-400 font-bold ml-2">#{t.ticketId || t.id?.slice(0, 6)}</span>
                    {t.villaNumber && <span className="text-[10px] text-muted-foreground">فيلا {t.villaNumber}</span>}
                    <p className="text-xs text-foreground mt-1 leading-relaxed">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── No tickets notice (calendar mode) ── */}
          {calendarMode && selectedClientId && !fetchingTickets && !hasExistingTickets && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-right">
              <p className="text-sm text-amber-500 font-bold mb-1">لا توجد تذاكر مفتوحة للعميل</p>
              <p className="text-xs text-amber-500/70">سيتم إنشاء تذكرة جديدة بالتخصصات المختارة.</p>
            </div>
          )}

          {/* ── Date/Time ── */}
          <div className={cn('grid gap-3', calendarMode && dateStr ? 'grid-cols-1' : 'grid-cols-2')}>
            {!calendarMode && (
              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold text-right block">التاريخ</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="bg-background h-11 rounded-xl"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block text-right">الوقت</Label>
              <div className="relative">
                <Clock className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl h-11 pr-10 pl-3 text-foreground text-sm"
                />
              </div>
            </div>
          </div>

          {/* ── Type chips ── */}
          {hasExistingTickets && ticketTypeChips.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block text-right">
                تخصصات الموعد
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {ticketTypeChips.map((chip, i) => (
                  <span
                    key={i}
                    className={cn('px-2.5 py-1 rounded-lg text-[11px] font-bold border', chip.bg)}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Type picker (only when no existing tickets — creating new) ── */}
          {!hasExistingTickets && calendarMode && selectedClientId && !fetchingTickets && (
            <div className="space-y-2">
              <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block text-right">
                تخصصات الصيانة المطلوبة
              </Label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                {Object.entries(mergedTypeLabels).map(([k, v]) => {
                  const isSelected = selectedTypes.includes(k);
                  return (
                    <button
                      key={k}
                      onClick={() => setSelectedTypes(prev => isSelected ? prev.filter(x => x !== k) : [...prev, k])}
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                        isSelected
                          ? 'bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-300'
                          : 'bg-muted/50 border-input text-muted-foreground hover:border-foreground/30',
                      )}
                    >
                      {v as React.ReactNode}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  placeholder="إضافة تخصص جديد..."
                  value={customType}
                  onChange={e => setCustomType(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomType(); } }}
                  className="h-9 text-xs bg-background border-border/50 rounded-xl flex-1 text-right"
                />
                <Button
                  type="button"
                  onClick={handleAddCustomType}
                  disabled={addingType || !customType.trim()}
                  className="h-9 px-3 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20"
                >
                  {addingType ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* ── Supervisors ── */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold block text-right">
              المشرفين
            </Label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto no-scrollbar pb-1">
              {supervisors.map(s => {
                const sId = s.uid || s.id;
                const sName = s.displayName || s.name;
                const isSelected = selectedSupIds.includes(sId);
                return (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => setSelectedSupIds(prev => prev.includes(sId) ? prev.filter(x => x !== sId) : [...prev, sId])}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5',
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-slate-400 hover:bg-muted/80',
                    )}
                  >
                    <div className={cn('w-3 h-3 rounded-[4px] border flex items-center justify-center shrink-0', isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40')} />
                    {sName}
                  </button>
                );
              })}
              {supervisors.length === 0 && <div className="text-xs text-muted-foreground">لا يوجد مشرفين</div>}
            </div>
          </div>

          {/* ── Notes ── */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block text-right">
              ملاحظات إضافية (تظهر للفنيين)
            </Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="أي تفاصيل تخص الموعد..."
              className="w-full bg-background border border-input rounded-xl p-3 text-foreground text-sm h-20 resize-none text-right placeholder:text-muted-foreground"
            />
          </div>

        </div>

        <DialogFooter className="shrink-0 pt-2 border-t border-border/50">
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-bold flex items-center justify-center gap-2 shadow-md"
          >
            {loading
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <Save className="w-5 h-5" />
            }
            تأكيد وحفظ الموعد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
