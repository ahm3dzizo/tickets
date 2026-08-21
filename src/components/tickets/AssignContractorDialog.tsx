// src/components/tickets/AssignContractorDialog.tsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { HardHat, Loader2, Search, Check, CalendarPlus, StickyNote } from 'lucide-react';
import { contractorsApi } from '@/lib/contractorsApi';
import { ticketsApi } from '@/lib/api';
import { Contractor, Ticket } from '@/types';
import { cn } from '@/lib/utils';
import { UnifiedAppointmentDialog } from './UnifiedAppointmentDialog';

interface AssignContractorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: Ticket[];
  projectId: string;
  onSuccess: () => void;
}

export function AssignContractorDialog({
  open,
  onOpenChange,
  tickets,
  projectId,
  onSuccess,
}: AssignContractorDialogProps) {
  const [mode, setMode] = useState<'contractor' | 'note'>('contractor');
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [suggested, setSuggested] = useState<Contractor[]>([]);
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);
  const [search, setSearch] = useState('');
  const [loadingContractors, setLoadingContractors] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [assignedTickets, setAssignedTickets] = useState<Ticket[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('');

  // Get the common villa number and block for suggestion
  const villaNumber = tickets.length === 1 ? tickets[0].villaNumber : undefined;
  const blockNumber = tickets.length === 1 ? (tickets[0] as any).blockNumber : undefined;

  useEffect(() => {
    if (!open || !projectId) return;

    setMode('contractor');
    setNoteText('');
    setLoadingContractors(true);
    setSelectedContractor(null);
    setSelectedSpecialty('');

    Promise.all([
      contractorsApi.getAll(projectId),
      villaNumber
        ? contractorsApi.suggest({ projectId, villaNumber, blockNumber })
        : Promise.resolve([]),
    ])
      .then(([all, sugg]) => {
        setContractors(all);
        setSuggested(sugg);
      })
      .catch(() => toast.error('فشل تحميل المقاولين'))
      .finally(() => setLoadingContractors(false));
  }, [open, projectId, villaNumber]);

  const availableSpecialties = React.useMemo(() => {
    const map = new Map<string, string>();
    contractors.forEach(c => {
      c.specialties?.forEach(s => {
        const name = s.specialtyKey === 'aluminum' ? 'ألمنيوم' :
                     s.specialtyKey === 'doors' ? 'أبواب' :
                     s.specialtyKey === 'plumbing' ? 'سباكة' :
                     s.specialtyKey === 'electricity' ? 'كهرباء' : s.specialtyKey;
        map.set(s.specialtyKey, name);
      });
    });
    return Array.from(map.entries()).map(([key, name]) => ({ key, name }));
  }, [contractors]);

  const displaySuggested = React.useMemo(() => {
    if (!selectedSpecialty) return [];
    return suggested.filter(c => c.specialties?.some(s => s.specialtyKey === selectedSpecialty));
  }, [suggested, selectedSpecialty]);

  useEffect(() => {
    if (selectedSpecialty && displaySuggested.length > 0) {
      setSelectedContractor(displaySuggested[0]);
    } else {
      setSelectedContractor(null);
    }
  }, [selectedSpecialty, displaySuggested]);

  const handleAssign = async () => {
    if (mode === 'contractor') {
      if (!selectedContractor) {
        toast.error('الرجاء اختيار مقاول');
        return;
      }
      setLoading(true);
      try {
        await Promise.all(
          tickets.map(t =>
            ticketsApi.update(t.id, {
              status: 'contractor',
              contractorId: selectedContractor.id,
              contractorName: selectedContractor.name,
              assigneeName: selectedContractor.name,
              contractorNote: null,
            })
          )
        );
        toast.success(`تم إسناد ${tickets.length} تذكرة لـ ${selectedContractor.name}`);
        setAssignedTickets(tickets.map(t => ({
          ...t,
          contractorName: selectedContractor.name,
          assigneeName: selectedContractor.name,
          status: 'contractor' as any,
        })));
        setShowAppointment(true);
      } catch {
        toast.error('فشل إسناد المقاول');
      } finally {
        setLoading(false);
      }
    } else {
      // note mode
      if (!noteText.trim()) {
        toast.error('الرجاء كتابة الملاحظة');
        return;
      }
      setLoading(true);
      try {
        await Promise.all(
          tickets.map(t =>
            ticketsApi.update(t.id, {
              status: 'note',
              contractorNote: noteText.trim(),
              assigneeName: 'ملاحظة',
              contractorId: null,
              contractorName: null,
            })
          )
        );
        toast.success(`تم تعيين الملاحظة لـ ${tickets.length} تذكرة`);
        setAssignedTickets(tickets.map(t => ({
          ...t,
          contractorNote: noteText.trim(),
          assigneeName: 'ملاحظة',
          status: 'note' as any,
        })));
        setShowAppointment(true);
      } catch {
        toast.error('فشل حفظ الملاحظة');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAppointmentSuccess = () => {
    setShowAppointment(false);
    onOpenChange(false);
    onSuccess();
  };

  const handleSkipAppointment = () => {
    setShowAppointment(false);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <>
      <Dialog open={open && !showAppointment && !showAppointmentDialog} onOpenChange={onOpenChange}>
        <DialogContent
          className="bg-card border-border text-foreground sm:max-w-[460px] flex flex-col rounded-3xl p-0 overflow-hidden"
          dir="rtl"
        >
          {/* ── Header ─────────────────────────────────────────── */}
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/50 shrink-0">
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2.5">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', mode === 'note' ? 'bg-violet-500/10' : 'bg-blue-500/10')}>
                {mode === 'note'
                  ? <StickyNote className="w-5 h-5 text-violet-400" />
                  : <HardHat className="w-5 h-5 text-blue-400" />}
              </div>
              {mode === 'note' ? 'إضافة ملاحظة' : 'إسناد لمقاول'}
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {tickets.length === 1
                ? `فيلا ${tickets[0].villaNumber} — ${tickets[0].clientName}`
                : `${tickets.length} تذاكر محددة`}
            </p>
            {/* Mode toggle */}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setMode('contractor')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold border transition-all',
                  mode === 'contractor'
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                    : 'bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground'
                )}
              >
                <HardHat className="w-4 h-4" />
                مقاول
              </button>
              <button
                type="button"
                onClick={() => setMode('note')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold border transition-all',
                  mode === 'note'
                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                    : 'bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground'
                )}
              >
                <StickyNote className="w-4 h-4" />
                ملاحظة
              </button>
            </div>
          </DialogHeader>

          {/* ── Body ───────────────────────────────────────────── */}
          <div className="overflow-y-auto max-h-[60vh] no-scrollbar p-5 space-y-4">
            {/* Note mode */}
            {mode === 'note' && (
              <div className="space-y-3">
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-3 text-right">
                  <p className="text-xs text-violet-300 leading-relaxed">
                    ستُنقل التذاكر لقسم المقاولين كـ <span className="font-bold">ملاحظة</span> بدون تعيين مقاول محدد.
                  </p>
                </div>
                <Label className="text-xs font-bold text-muted-foreground block">الملاحظة</Label>
                <textarea
                  className="w-full bg-muted/30 border border-border/50 focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 text-foreground rounded-2xl p-4 text-right text-sm min-h-[120px] outline-none transition-all resize-none"
                  placeholder="اكتب الملاحظة هنا..."
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  dir="rtl"
                />
              </div>
            )}

            {/* Contractor mode */}
            {mode === 'contractor' && loadingContractors ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : mode === 'contractor' && (
              <>
                {/* Specialty Filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground ml-1">تخصص المقاول المطلوب</Label>
                  <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                    <SelectTrigger className="w-full bg-background border-border/50 rounded-xl h-11 text-right font-bold" dir="rtl">
                      <SelectValue placeholder="اختر التخصص..." />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border" dir="rtl">
                      {availableSpecialties.map(sp => (
                        <SelectItem key={sp.key} value={sp.key} className="focus:bg-blue-500/10">
                          {sp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Contractor result */}
                {selectedSpecialty && (
                  <div className="space-y-2">
                    {displaySuggested.length > 0 ? (
                      displaySuggested.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedContractor(c)}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-all',
                            selectedContractor?.id === c.id
                              ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/20'
                              : 'bg-muted/20 border-border/50 hover:bg-muted/40'
                          )}
                        >
                          <div className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black',
                            selectedContractor?.id === c.id ? 'bg-blue-500/20 text-blue-300' : 'bg-muted text-muted-foreground'
                          )}>
                            {c.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <span className="text-[9px] font-black text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-md border border-blue-500/20">مقترح</span>
                              <span className="font-bold text-sm text-foreground truncate">{c.name}</span>
                            </div>
                            {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                          </div>
                          {selectedContractor?.id === c.id && (
                            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                              <HardHat className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </button>
                      ))
                    ) : (
                      <>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-right">
                          <p className="text-xs font-bold text-amber-400">لا يوجد مقاول مخصص لهذه الفيلا — اختر من القائمة:</p>
                        </div>
                        {contractors
                          .filter(c => c.specialties?.some(s => s.specialtyKey === selectedSpecialty))
                          .map(c => (
                            <button
                              key={c.id}
                              onClick={() => setSelectedContractor(c)}
                              className={cn(
                                'w-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-all',
                                selectedContractor?.id === c.id
                                  ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/20'
                                  : 'bg-muted/20 border-border/50 hover:bg-muted/40'
                              )}
                            >
                              <div className={cn(
                                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black',
                                selectedContractor?.id === c.id ? 'bg-blue-500/20 text-blue-300' : 'bg-muted text-muted-foreground'
                              )}>
                                {c.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0 text-right">
                                <span className="font-bold text-sm text-foreground block truncate">{c.name}</span>
                                {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                              </div>
                              {selectedContractor?.id === c.id && (
                                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                                  <HardHat className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </button>
                          ))}
                        {contractors.filter(c => c.specialties?.some(s => s.specialtyKey === selectedSpecialty)).length === 0 && (
                          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-center">
                            <p className="text-sm font-bold text-rose-400">لا يوجد مقاولون بهذا التخصص</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────── */}
          <DialogFooter className="px-5 pb-5 pt-4 border-t border-border/50 shrink-0">
            {mode === 'note' ? (
              <Button
                onClick={handleAssign}
                disabled={loading || !noteText.trim()}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl h-11 font-bold flex items-center justify-center gap-2 shadow-md"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <StickyNote className="w-5 h-5" />}
                حفظ الملاحظة
              </Button>
            ) : (
              <Button
                onClick={handleAssign}
                disabled={loading || !selectedContractor}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-bold flex items-center justify-center gap-2 shadow-md"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <HardHat className="w-5 h-5" />}
                {selectedContractor ? `إسناد لـ ${selectedContractor.name}` : 'تأكيد الإسناد'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Appointment prompt after assignment ─────────────── */}
      {showAppointment && (
        <Dialog open={showAppointment} onOpenChange={v => { if (!v) handleSkipAppointment(); }}>
          <DialogContent className="bg-card border-border text-foreground sm:max-w-[380px] rounded-3xl p-6" dir="rtl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center', mode === 'note' ? 'bg-violet-500/10' : 'bg-blue-500/10')}>
                <CalendarPlus className={cn('w-8 h-8', mode === 'note' ? 'text-violet-400' : 'text-blue-400')} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {mode === 'note' ? 'تم حفظ الملاحظة! 🎉' : 'تم الإسناد بنجاح! 🎉'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  هل تريد تحديد موعد الآن؟
                </p>
                {mode === 'note'
                  ? <p className="text-xs text-violet-400 font-semibold mt-1 line-clamp-2">{noteText}</p>
                  : <p className="text-xs text-blue-400 font-semibold mt-1">{selectedContractor?.name}</p>}
              </div>
              <div className="flex gap-3 w-full">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl border-border"
                  onClick={handleSkipAppointment}
                >
                  لاحقاً
                </Button>
                <Button
                  className={cn('flex-1 text-white rounded-xl gap-2', mode === 'note' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700')}
                  onClick={() => {
                    setShowAppointment(false);
                    setTimeout(() => setShowAppointmentDialog(true), 100);
                  }}
                >
                  <CalendarPlus className="w-4 h-4" />
                  تحديد موعد
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Actual Appointment Dialog ───────────────────────── */}
      <UnifiedAppointmentDialog
        open={showAppointmentDialog}
        onOpenChange={(v) => {
          setShowAppointmentDialog(v);
          if (!v) {
            onOpenChange(false);
            onSuccess();
          }
        }}
        tickets={assignedTickets}
        onSuccess={handleAppointmentSuccess}
      />
    </>
  );
}

// ─── Contractor Card ──────────────────────────────────────────────────────────
function ContractorCard({
  contractor,
  selected,
  onSelect,
  highlighted = false,
}: {
  contractor: Contractor;
  selected: boolean;
  onSelect: () => void;
  highlighted?: boolean;
}) {
  const projectSet = new Set(contractor.assignments.map(a => a.projectId));

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-2xl border text-right transition-all',
        selected
          ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/20'
          : highlighted
            ? 'bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10'
            : 'bg-muted/20 border-border/50 hover:bg-muted/40 hover:border-border'
      )}
    >
      {/* Avatar */}
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black',
        selected ? 'bg-blue-500/20 text-blue-300' : 'bg-muted text-muted-foreground'
      )}>
        {contractor.name.charAt(0)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-foreground truncate">{contractor.name}</span>
          {highlighted && (
            <span className="text-[9px] font-black text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-md border border-blue-500/20 shrink-0">
              مقترح
            </span>
          )}
        </div>
        {contractor.phone && (
          <p className="text-xs text-muted-foreground">{contractor.phone}</p>
        )}
        {contractor.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {contractor.specialties.slice(0, 3).map(s => (
              <span key={s.id} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md text-muted-foreground">
                {s.specialtyKey}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Check */}
      {selected && (
        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
    </button>
  );
}
