import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ticketsApi, clientsApi, usersApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, CalendarPlus, Search, Clock, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTicketTypes } from '@/contexts/TicketTypesContext';

interface DirectAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateStr: string; // e.g. "2026-06-11"
  onSuccess?: () => void;
}

export function DirectAppointmentDialog({
  open,
  onOpenChange,
  dateStr,
  onSuccess
}: DirectAppointmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [isClientFocused, setIsClientFocused] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsClientFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedVilla, setSelectedVilla] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientName, setClientName] = useState('');
  
  const [openTickets, setOpenTickets] = useState<any[]>([]);
  const [fetchingTickets, setFetchingTickets] = useState(false);
  
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [selectedSupIds, setSelectedSupIds] = useState<string[]>([]);

  const { typeTranslations } = useTicketTypes();
  const mergedTypes = Object.keys(typeTranslations).length > 0 ? typeTranslations : {
    electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب', paints: 'دهانات',
    ceramics: 'سيراميك', drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية',
    waterproofing: 'عزل مائي', pest_control: 'مكافحة حشرات'
  };

  useEffect(() => {
    if (open) {
      clientsApi.getAll().then(setClients).catch(() => {});
      usersApi.getAll().then((u: any[]) => setSupervisors(u.filter((x: any) => x.role === 'supervisor'))).catch(() => {});
      reset();
    }
  }, [open]);

  const reset = () => {
    setSelectedClientId('');
    setSelectedVilla('');
    setProjectId('');
    setClientName('');
    setClientSearch('');
    setOpenTickets([]);
    setSelectedTypes([]);
    setTime('09:00');
    setNotes('');
    setSelectedSupIds([]);
  };

  // Fetch open tickets when a client is selected
  useEffect(() => {
    if (!selectedClientId || !selectedVilla) return;
    setFetchingTickets(true);
    // Fetch all tickets for this project and filter
    ticketsApi.getAll({ projectId, includeDirectAppts: true })
      .then(res => {
         const tks = res.filter((t: any) => String(t.villaNumber) === String(selectedVilla) && !['closed', 'out-of-scope', 'completed'].includes(t.status));
         setOpenTickets(tks);
         
         // Pre-select existing types
         const types = new Set<string>();
         tks.forEach((t: any) => {
           if (t.type) types.add(t.type);
           if (t.detectedTypes) t.detectedTypes.forEach((dt: string) => types.add(dt));
         });
         setSelectedTypes(Array.from(types));

         // Pre-select existing supervisors
         const supIds = new Set<string>();
         tks.forEach((t: any) => {
           if (t.assignedSupervisorIds) t.assignedSupervisorIds.forEach((s: string) => supIds.add(s));
         });
         setSelectedSupIds(Array.from(supIds));
      })
      .catch(() => {})
      .finally(() => setFetchingTickets(false));
  }, [selectedClientId, selectedVilla, projectId]);

  const handleSave = async () => {
    if (!selectedClientId) {
      toast.error('الرجاء اختيار العميل/الفيلا');
      return;
    }
    if (!time) {
      toast.error('الرجاء تحديد وقت الموعد');
      return;
    }
    if (selectedTypes.length === 0) {
      toast.error('الرجاء تحديد تخصص واحد على الأقل');
      return;
    }

    const existingAppt = openTickets.find(t => !!t.appointmentTime && t.appointmentTime.startsWith(dateStr));
    if (existingAppt) {
      toast.error(`هذا العميل لديه موعد مجدول بالفعل في هذا اليوم (${existingAppt.appointmentTime}) ولا يمكن تكرار الموعد.`);
      return;
    }

    setLoading(true);
    try {
      const appointmentTime = `${dateStr} ${time}`;
      const promises: Promise<any>[] = [];

      const existingTypes = new Set<string>();
      openTickets.forEach(t => {
        if (t.type) existingTypes.add(t.type);
        if (t.detectedTypes) t.detectedTypes.forEach((dt: string) => existingTypes.add(dt));
      });

      const assignedSupervisors = supervisors
        .filter(s => selectedSupIds.includes(s.uid || s.id))
        .map(s => ({ id: s.uid || s.id, name: s.displayName || s.name, specialty: 'general' }));

      if (openTickets.length > 0) {
        // Update all open tickets with the appointment time
        const first = openTickets[0];
        const updatedDetectedTypes = Array.from(new Set([...(first.detectedTypes || []), ...selectedTypes.filter(t => !existingTypes.has(t))]));
        
        for (let i = 0; i < openTickets.length; i++) {
          const t = openTickets[i];
          const payload: any = { appointmentTime, appointmentAwaitingReply: false, isDirectAppointment: true };
          if (t.status !== 'closed') {
            payload.status = 'pending';
          }
          if (notes) payload.appointmentNotes = notes;

          if (selectedSupIds.length > 0) {
            payload.assignedSupervisorIds = selectedSupIds;
            payload.assignedSupervisorId = selectedSupIds[0];
            payload.assignedSupervisors = assignedSupervisors;
          } else {
            payload.assignedSupervisorIds = [];
            payload.assignedSupervisorId = null;
            payload.assignedSupervisors = [];
          }
          
          // Append new types to the first ticket only
          if (i === 0 && updatedDetectedTypes.length > (first.detectedTypes?.length || 0)) {
            payload.detectedTypes = updatedDetectedTypes;
          }
          promises.push(ticketsApi.update(t.id, payload));
        }
      } else {
        // No open tickets => Create a new one
        const nextId = await ticketsApi.getNextId(projectId);
        const payload: any = {
          ticketId: nextId,
          refNumber: selectedVilla,
          projectId,
          clientId: selectedClientId,
          clientName,
          villaNumber: selectedVilla,
          description: `موعد صيانة مجدول يدوياً للمشرف (${selectedTypes.map(t => mergedTypes[t] || t).join('، ')})`,
          type: selectedTypes[0],
          detectedTypes: selectedTypes,
          status: 'pending',
          appointmentAwaitingReply: false,
          priority: 3,
          appointmentTime,
          isDirectAppointment: true,
          createdAt: new Date().toISOString()
        };
        if (notes) payload.appointmentNotes = notes;
        if (selectedSupIds.length > 0) {
          payload.assignedSupervisorIds = selectedSupIds;
          payload.assignedSupervisorId = selectedSupIds[0];
          payload.assignedSupervisors = assignedSupervisors;
        }
        promises.push(ticketsApi.create(payload));
      }

      await Promise.all(promises);
      toast.success('تم جدولة الموعد بنجاح');
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error('فشل حفظ الموعد');
    } finally {
      setLoading(false);
    }
  };

  const selectedClientDisplay = selectedVilla ? `${clientName} - فيلا ${selectedVilla}` : 'ابحث عن العميل أو الفيلا...';
  
  const displayDateStr = new Date(dateStr).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-[420px] max-h-[90vh] flex flex-col rounded-3xl p-4 sm:p-6" dir="rtl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg font-bold text-foreground text-right flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-blue-400" />
            إضافة موعد مباشر
          </DialogTitle>
          <p className="text-sm text-muted-foreground text-right mt-1">{displayDateStr}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 px-1 -mx-1 py-2">
          <div className="space-y-2 relative" ref={dropdownRef}>
            <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block text-right">العميل أو الفيلا</Label>
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
                ) : (
                  (() => {
                    const s = clientSearch.toLowerCase();
                    const filtered = clients.filter(c => (c.name && String(c.name).toLowerCase().includes(s)) || (c.villaNumber != null && String(c.villaNumber).toLowerCase().includes(s))).slice(0, 50);
                    if (filtered.length === 0) return <div className="p-4 text-sm text-muted-foreground text-center">لا يوجد نتائج</div>;
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
                          <Home className="w-3 h-3" /> فيلا {c.villaNumber}
                        </span>
                      </div>
                    ));
                  })()
                )}
              </div>
            )}
          </div>

          {/* Open Tickets Info */}
          {selectedVilla && !fetchingTickets && openTickets.length > 0 && openTickets.some(t => !!t.appointmentTime && t.appointmentTime.startsWith(dateStr)) && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-right">
              <p className="text-sm text-red-500 font-bold mb-1">تنبيه: العميل لديه موعد مسبق اليوم</p>
              <p className="text-xs text-red-500/70">
                هذا العميل لديه موعد مجدول بالفعل في هذا اليوم ({openTickets.find(t => !!t.appointmentTime && t.appointmentTime.startsWith(dateStr))?.appointmentTime}) ولا يمكن تكراره هنا.
              </p>
            </div>
          )}

          {selectedVilla && !fetchingTickets && openTickets.length > 0 && !openTickets.some(t => !!t.appointmentTime && t.appointmentTime.startsWith(dateStr)) && (
            <div className="space-y-2">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-right">
                <p className="text-sm text-blue-500 font-bold mb-1">يوجد {openTickets.length} تذاكر مفتوحة</p>
                <p className="text-xs text-blue-500/70">سيتم ربط الموعد بهذه التذاكر تلقائياً.</p>
              </div>
              <div className="bg-muted/30 border border-border/50 rounded-2xl p-3 max-h-32 overflow-y-auto text-right no-scrollbar shrink-0">
                {openTickets.map(t => (
                  <div key={t.id} className="mb-2 last:mb-0 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <span className="text-[10px] text-blue-400 font-bold ml-2">#{t.ticketId || t.id.slice(0, 6)}</span>
                    {t.villaNumber && <span className="text-[10px] text-muted-foreground">فيلا {t.villaNumber}</span>}
                    <p className="text-xs text-foreground mt-1 leading-relaxed">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedVilla && !fetchingTickets && openTickets.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-right">
              <p className="text-sm text-amber-500 font-bold mb-1">لا توجد تذاكر مفتوحة للعميل</p>
              <p className="text-xs text-amber-500/70">سيتم إنشاء تذكرة جديدة تلقائياً لتوثيق الموعد بالتخصصات المختارة.</p>
            </div>
          )}

          {fetchingTickets && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> جلب بيانات التذاكر...
            </div>
          )}

          {/* Time Selection */}
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

          {/* Specialties Selection */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block text-right">
              تخصصات الصيانة المطلوبة
            </Label>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
              {Object.entries(mergedTypes).map(([k, v]) => {
                const isSelected = selectedTypes.includes(k);
                return (
                  <button
                    key={k}
                    onClick={() => setSelectedTypes(prev => isSelected ? prev.filter(x => x !== k) : [...prev, k])}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5',
                      isSelected
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-300'
                        : 'bg-muted/50 border-input text-muted-foreground hover:border-foreground/30'
                    )}
                  >
                    {v as React.ReactNode}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Supervisors Selection */}
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
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-slate-400 hover:bg-muted/80'
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

          {/* Notes Selection */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-wider block text-right">
              ملاحظات إضافية (تظهر للفنيين)
            </Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="اكتب ملاحظات إضافية بخصوص الموعد..."
              className="w-full bg-background border border-input rounded-xl p-3 text-foreground text-sm h-20 resize-none text-right placeholder:text-muted-foreground"
            />
          </div>

        </div>

        <DialogFooter className="shrink-0 pt-2 border-t border-border/50 gap-3">
          <Button
            onClick={handleSave}
            disabled={loading || !selectedClientId || openTickets.some(t => !!t.appointmentTime && t.appointmentTime.startsWith(dateStr))}
            className={cn(
              "w-full text-white rounded-xl h-11 font-bold",
              openTickets.some(t => !!t.appointmentTime && t.appointmentTime.startsWith(dateStr)) 
                ? "bg-muted text-muted-foreground cursor-not-allowed opacity-100"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            )}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تأكيد وحفظ الموعد'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
