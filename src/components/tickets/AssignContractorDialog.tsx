// src/components/tickets/AssignContractorDialog.tsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { HardHat, Loader2, Search, Check, CalendarPlus, ChevronDown } from 'lucide-react';
import { contractorsApi } from '@/lib/contractorsApi';
import { ticketsApi } from '@/lib/api';
import { Contractor, Ticket } from '@/types';
import { cn } from '@/lib/utils';
import { SaveInternalAppointmentDialog } from './SaveInternalAppointmentDialog';

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
  const [loading, setLoading] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [suggested, setSuggested] = useState<Contractor[]>([]);
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);
  const [search, setSearch] = useState('');
  const [loadingContractors, setLoadingContractors] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);
  const [assignedTickets, setAssignedTickets] = useState<Ticket[]>([]);
  const [showAllContractors, setShowAllContractors] = useState(false);

  // Get the common villa number and block for suggestion
  const villaNumber = tickets.length === 1 ? tickets[0].villaNumber : undefined;
  const blockNumber = tickets.length === 1 ? (tickets[0] as any).blockNumber : undefined;

  useEffect(() => {
    if (!open || !projectId) return;

    setLoadingContractors(true);
    setSelectedContractor(null);
    setSearch('');
    setShowAllContractors(false);

    Promise.all([
      contractorsApi.getAll(projectId),
      villaNumber
        ? contractorsApi.suggest({ projectId, villaNumber, blockNumber })
        : Promise.resolve([]),
    ])
      .then(([all, sugg]) => {
        setContractors(all);
        setSuggested(sugg);
        // Auto-select if only one suggestion
        if (sugg.length === 1) setSelectedContractor(sugg[0]);
      })
      .catch(() => toast.error('فشل تحميل المقاولين'))
      .finally(() => setLoadingContractors(false));
  }, [open, projectId, villaNumber]);

  const filteredContractors = contractors.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const displayContractors = showAllContractors
    ? filteredContractors
    : (suggested.length > 0 ? suggested : filteredContractors);

  const handleAssign = async () => {
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
      // Ask user if they want to set an appointment
      setShowAppointment(true);
    } catch {
      toast.error('فشل إسناد المقاول');
    } finally {
      setLoading(false);
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
      <Dialog open={open && !showAppointment} onOpenChange={onOpenChange}>
        <DialogContent
          className="bg-card border-border text-foreground sm:max-w-[460px] max-h-[90vh] flex flex-col rounded-3xl p-0 overflow-hidden"
          dir="rtl"
        >
          {/* ── Header ─────────────────────────────────────────── */}
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/50 shrink-0">
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <HardHat className="w-5 h-5 text-blue-400" />
              </div>
              إسناد لمقاول
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {tickets.length === 1
                ? `فيلا ${tickets[0].villaNumber} — ${tickets[0].clientName}`
                : `${tickets.length} تذاكر محددة`}
            </p>
          </DialogHeader>

          {/* ── Body ───────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-4">

            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث في المقاولين..."
                value={search}
                onChange={e => { setSearch(e.target.value); setShowAllContractors(true); }}
                className="pr-10 h-10 bg-background border-border/50 rounded-xl text-right"
              />
            </div>

            {loadingContractors ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : (
              <>
                {/* Suggested section */}
                {suggested.length > 0 && !search && !showAllContractors && (
                  <div>
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      مقترح بناءً على الفيلا والتخصص
                    </p>
                    <div className="space-y-2">
                      {suggested.map(c => (
                        <ContractorCard
                          key={c.id}
                          contractor={c}
                          selected={selectedContractor?.id === c.id}
                          onSelect={() => setSelectedContractor(c)}
                          highlighted
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* All contractors toggle */}
                {suggested.length > 0 && !search && (
                  <button
                    className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground py-2 border border-border/40 rounded-xl hover:bg-muted/30 transition-colors"
                    onClick={() => setShowAllContractors(v => !v)}
                  >
                    <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showAllContractors && 'rotate-180')} />
                    {showAllContractors ? 'إخفاء الكل' : `عرض كل المقاولين (${contractors.length})`}
                  </button>
                )}

                {/* Full list */}
                {(showAllContractors || suggested.length === 0 || search) && (
                  <div>
                    {suggested.length > 0 && !search && (
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                        كل المقاولين
                      </p>
                    )}
                    <div className="space-y-2">
                      {filteredContractors.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-6">
                          {contractors.length === 0
                            ? 'لا يوجد مقاولون مسجلون في هذا المشروع'
                            : 'لا توجد نتائج'}
                        </p>
                      ) : (
                        filteredContractors.map(c => (
                          <ContractorCard
                            key={c.id}
                            contractor={c}
                            selected={selectedContractor?.id === c.id}
                            onSelect={() => setSelectedContractor(c)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────── */}
          <DialogFooter className="px-5 pb-5 pt-4 border-t border-border/50 shrink-0 flex flex-col gap-2">
            {selectedContractor && (
              <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                <HardHat className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-sm font-bold text-blue-300">{selectedContractor.name}</span>
                {selectedContractor.phone && (
                  <span className="text-xs text-muted-foreground mr-auto">{selectedContractor.phone}</span>
                )}
              </div>
            )}
            <Button
              onClick={handleAssign}
              disabled={loading || !selectedContractor}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-bold flex items-center justify-center gap-2 shadow-md"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <HardHat className="w-5 h-5" />}
              تأكيد الإسناد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Appointment prompt after assignment ─────────────── */}
      {showAppointment && (
        <Dialog open={showAppointment} onOpenChange={v => { if (!v) handleSkipAppointment(); }}>
          <DialogContent className="bg-card border-border text-foreground sm:max-w-[380px] rounded-3xl p-6" dir="rtl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <CalendarPlus className="w-8 h-8 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">تم الإسناد بنجاح! 🎉</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  هل تريد تحديد موعد للمقاول الآن؟
                </p>
                <p className="text-xs text-blue-400 font-semibold mt-1">{selectedContractor?.name}</p>
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
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2"
                  onClick={() => {
                    // Close this prompt and open appointment dialog
                    setShowAppointment(false);
                    // Re-open appointment only
                    setTimeout(() => setShowAppointment(true), 100);
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
      <SaveInternalAppointmentDialog
        open={false} // controlled separately when user clicks "تحديد موعد"
        onOpenChange={() => {}}
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
