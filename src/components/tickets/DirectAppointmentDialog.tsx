import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ticketsApi, clientsApi } from '@/lib/api';
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
  
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedVilla, setSelectedVilla] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientName, setClientName] = useState('');
  
  const [openTickets, setOpenTickets] = useState<any[]>([]);
  const [fetchingTickets, setFetchingTickets] = useState(false);
  
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');

  const { typeTranslations } = useTicketTypes();
  const mergedTypes = Object.keys(typeTranslations).length > 0 ? typeTranslations : {
    electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب', paints: 'دهانات',
    ceramics: 'سيراميك', drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية',
    waterproofing: 'عزل مائي', pest_control: 'مكافحة حشرات'
  };

  useEffect(() => {
    if (open) {
      clientsApi.getAll().then(setClients).catch(() => {});
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
  };

  // Fetch open tickets when a client is selected
  useEffect(() => {
    if (!selectedClientId || !selectedVilla) return;
    setFetchingTickets(true);
    // Fetch all tickets for this project and filter
    ticketsApi.getAll({ projectId })
      .then(res => {
         const tks = res.filter((t: any) => t.villaNumber === selectedVilla && !['closed', 'out-of-scope'].includes(t.status));
         setOpenTickets(tks);
         
         // Pre-select existing types
         const types = new Set<string>();
         tks.forEach((t: any) => {
           if (t.type) types.add(t.type);
           if (t.detectedTypes) t.detectedTypes.forEach((dt: string) => types.add(dt));
         });
         setSelectedTypes(Array.from(types));
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

    setLoading(true);
    try {
      const appointmentTime = `${dateStr} ${time}`;
      const promises: Promise<any>[] = [];

      const existingTypes = new Set<string>();
      openTickets.forEach(t => {
        if (t.type) existingTypes.add(t.type);
        if (t.detectedTypes) t.detectedTypes.forEach((dt: string) => existingTypes.add(dt));
      });

      if (openTickets.length > 0) {
        // Update all open tickets with the appointment time
        const first = openTickets[0];
        const updatedDetectedTypes = Array.from(new Set([...(first.detectedTypes || []), ...selectedTypes.filter(t => !existingTypes.has(t))]));
        
        for (let i = 0; i < openTickets.length; i++) {
          const t = openTickets[i];
          const payload: any = { appointmentTime, status: 'waiting' };
          if (notes) payload.appointmentNotes = notes;
          
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
          status: 'waiting',
          priority: 3,
          appointmentTime,
          createdAt: new Date().toISOString()
        };
        if (notes) payload.appointmentNotes = notes;
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
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[420px] rounded-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-white text-right flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-blue-400" />
            إضافة موعد مباشر
          </DialogTitle>
          <p className="text-sm text-slate-400 text-right mt-1">{displayDateStr}</p>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Client Selection */}
          <div className="space-y-2">
            <Label className="text-slate-500 text-[11px] uppercase font-bold tracking-widest block text-right">العميل</Label>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12">
                    <Home className="w-4 h-4 opacity-50" />
                    <span className="truncate mx-2">{selectedClientDisplay}</span>
                  </Button>
                }
              />
              <DropdownMenuContent className="bg-card border-border text-slate-200 w-[450px] max-h-[300px] overflow-y-auto">
                <div className="p-2 border-b border-white/10 sticky top-0 bg-card z-10 flex items-center gap-2 px-3">
                  <Search className="w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="ابحث بالاسم أو الفيلا..."
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    onKeyDown={e => e.stopPropagation()}
                    className="h-8 bg-transparent border-none text-right focus-visible:ring-0 px-0"
                  />
                </div>
                {clients.length === 0 ? (
                  <DropdownMenuItem disabled className="text-slate-500 text-start justify-start">جارٍ التحميل...</DropdownMenuItem>
                ) : (
                  clients
                    .filter(c => c.name.includes(clientSearch) || c.villaNumber.includes(clientSearch))
                    .slice(0, 50) // limit for performance
                    .map(c => (
                    <DropdownMenuItem
                      key={c.id}
                      className="hover:bg-white/5 cursor-pointer text-start justify-start"
                      onClick={() => {
                        setSelectedClientId(c.id);
                        setSelectedVilla(c.villaNumber);
                        setProjectId(c.projectId);
                        setClientName(c.name);
                      }}
                    >
                      {c.name} - {c.villaNumber}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Open Tickets Info */}
          {selectedVilla && !fetchingTickets && openTickets.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-right">
              <p className="text-sm text-blue-300 font-bold mb-1">يوجد {openTickets.length} تذاكر مفتوحة</p>
              <p className="text-xs text-blue-300/70">سيتم ربط الموعد بهذه التذاكر تلقائياً.</p>
            </div>
          )}

          {selectedVilla && !fetchingTickets && openTickets.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-right">
              <p className="text-sm text-amber-300 font-bold mb-1">لا توجد تذاكر مفتوحة للعميل</p>
              <p className="text-xs text-amber-300/70">سيتم إنشاء تذكرة جديدة تلقائياً لتوثيق الموعد بالتخصصات المختارة.</p>
            </div>
          )}

          {fetchingTickets && (
            <div className="flex items-center gap-2 text-slate-500 text-sm justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> جلب بيانات التذاكر...
            </div>
          )}

          {/* Time Selection */}
          <div className="space-y-2">
            <Label className="text-slate-500 text-[11px] uppercase font-bold tracking-widest block text-right">الوقت</Label>
            <div className="relative">
              <Clock className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full bg-white/5 border border-border rounded-xl h-11 pr-10 pl-3 text-slate-200 text-sm [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Specialties Selection */}
          <div className="space-y-2">
            <Label className="text-slate-500 text-[11px] uppercase font-bold tracking-widest block text-right">
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
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                        : 'bg-white/5 border-border text-slate-400 hover:border-slate-300'
                    )}
                  >
                    {v as React.ReactNode}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes Selection */}
          <div className="space-y-2">
            <Label className="text-slate-500 text-[11px] uppercase font-bold tracking-widest block text-right">
              ملاحظات إضافية (تظهر للفنيين)
            </Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="اكتب ملاحظات إضافية بخصوص الموعد..."
              className="w-full bg-white/5 border border-border rounded-xl p-3 text-slate-200 text-sm h-20 resize-none text-right placeholder:text-slate-600"
            />
          </div>

        </div>

        <DialogFooter className="pt-2 gap-3">
          <Button
            onClick={handleSave}
            disabled={loading || !selectedClientId}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-bold"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تأكيد وحفظ המوعد'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
