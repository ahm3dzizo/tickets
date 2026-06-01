import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Ticket, TicketType } from '@/types';
import { usersApi, ticketsApi } from '@/lib/api';
import { toast } from 'sonner';
import { UserPlus, Loader2 } from 'lucide-react';

interface ReassignSupervisorButtonProps {
  ticket: Ticket;
  onReassigned?: () => void;
  variant?: 'button' | 'icon';
}

const typeTranslations: Record<string, string> = {
  'electricity': 'كهرباء', 'plumbing': 'سباكة', 'doors': 'أبواب',
  'paints': 'دهانات', 'painting': 'دهانات', 'cracks': 'تشققات',
  'ceramics': 'سيراميك', 'tiles': 'سيراميك', 'tank_insulation': 'عزل خزان',
  'drainage': 'صرف صحي', 'ac_ventilation': 'تكييف وتهوية', 'pumps': 'مضخات',
  'doors_windows': 'أبواب ونوافذ', 'waterproofing': 'عزل مائي',
  'grading': 'ميول وترويبة', 'pest_control': 'مكافحة حشرات',
  'cleaning': 'تنظيف', 'structural': 'إنشائي',
};

export function ReassignSupervisorButton({ ticket, onReassigned, variant = 'button' }: ReassignSupervisorButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allSupervisors, setAllSupervisors] = useState<{id: string; name: string; specialties: string[]}[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const allUsers = await usersApi.getAll();
      let projectSupers = allUsers.filter(
        (u: any) => u.role === 'supervisor' && Array.isArray(u.projectIds) && u.projectIds.includes(ticket.projectId)
      );
      if (projectSupers.length === 0) {
        projectSupers = allUsers.filter((u: any) => u.role === 'supervisor');
      }
      const mapped = projectSupers.map((u: any) => ({
        id: u.uid,
        name: u.displayName,
        specialties: u.specialties?.length ? u.specialties : u.specialty ? [u.specialty] : ['general'],
      }));
      setAllSupervisors(mapped);
      setSelectedIds(
        (ticket.assignedSupervisorIds as string[] | undefined) ??
        (ticket.assignedSupervisorId ? [ticket.assignedSupervisorId] : [])
      );
    } catch {
      toast.error('فشل تحميل المشرفين');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const selected = allSupervisors.filter(s => selectedIds.includes(s.id));
      await ticketsApi.update(ticket.id, {
        assigneeName: selected[0]?.name || '',
        assignedSupervisorId: selectedIds[0] || '',
        assignedSupervisorIds: selectedIds,
        assignedSupervisors: selected,
      });
      toast.success('تم إعادة تعيين المشرفين');
      setOpen(false);
      onReassigned?.();
    } catch {
      toast.error('فشل إعادة التعيين');
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <Button
      variant="outline"
      className="w-full justify-end border-border bg-white/5 text-amber-400 hover:bg-amber-500/10 text-xs h-12 rounded-2xl font-bold"
      onClick={openDialog}
    >
      <UserPlus className="w-4 h-4 mr-2" />
      إعادة تعيين المشرف
    </Button>
  );

  return (
    <>
      {content}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[420px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white text-right">إعادة تعيين المشرفين</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-xs text-slate-500 text-right space-y-1">
              <p>التذكرة: <span className="text-white">{ticket.ticketId || ticket.refNumber || ticket.id.slice(0, 8)}</span></p>
              <p>النوع الحالي: <span className="text-white">{ticket.detectedTypes?.map((t: string) => typeTranslations[t]).join(' · ') || typeTranslations[ticket.type]}</span></p>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : allSupervisors.length === 0 ? (
              <p className="text-[11px] text-slate-600 text-right">لا يوجد مشرفون في هذا المشروع</p>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">
                  اختر المشرفين ({allSupervisors.length})
                </Label>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {allSupervisors.map(sup => (
                    <div
                      key={sup.id}
                      onClick={() => setSelectedIds(prev =>
                        prev.includes(sup.id) ? prev.filter(x => x !== sup.id) : [...prev, sup.id]
                      )}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all',
                        selectedIds.includes(sup.id)
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                          : 'bg-white/5 border-border text-slate-400 hover:border-slate-500'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{sup.name}</span>
                        <span className="text-[10px] text-slate-500">{sup.specialties.join(' · ')}</span>
                      </div>
                      <div className={cn(
                        'w-3.5 h-3.5 rounded border-2 shrink-0',
                        selectedIds.includes(sup.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
                      )} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={saving || selectedIds.length === 0}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-12 font-bold mt-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تأكيد إعادة التعيين'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
