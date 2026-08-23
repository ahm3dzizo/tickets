import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ticketsApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTicketTypes } from '@/contexts/TicketTypesContext';

interface QuickAddSpecialtyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitNumber?: string;
  ticketId?: string;
  existingDetectedTypes?: string[];
  existingSupervisorIds?: string[];
  existingSupervisors?: any[];
  supervisors: any[];
  onSuccess?: () => void;
}

export function QuickAddSpecialtyDialog({
  open,
  onOpenChange,
  unitNumber,
  ticketId,
  existingDetectedTypes,
  existingSupervisorIds,
  existingSupervisors,
  supervisors,
  onSuccess
}: QuickAddSpecialtyDialogProps) {
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedSupId, setSelectedSupId] = useState<string>('');
  
  const { typeTranslations } = useTicketTypes();
  // Fallback if not loaded
  const mergedTypes = Object.keys(typeTranslations).length > 0 ? typeTranslations : {
    electricity: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب', paints: 'دهانات',
    ceramics: 'سيراميك', drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية',
    waterproofing: 'عزل مائي', pest_control: 'مكافحة حشرات'
  };

  useEffect(() => {
    if (open) {
      setSelectedType('');
      setSelectedSupId('');
    }
  }, [open]);

  const handleSave = async () => {
    if (!selectedType || !ticketId) {
      toast.error('البيانات غير مكتملة');
      return;
    }

    setLoading(true);
    try {
      const selectedSup = supervisors?.find(s => s.uid === selectedSupId || s.id === selectedSupId);
      
      const newDetectedTypes = [...(existingDetectedTypes || []), selectedType];
      
      const updateData: any = {
        detectedTypes: Array.from(new Set(newDetectedTypes))
      };

      if (selectedSup) {
        const sId = selectedSup.uid || selectedSup.id;
        const sName = selectedSup.displayName || selectedSup.name;
        
        const currentSupIds = existingSupervisorIds || [];
        const currentSups = existingSupervisors || [];
        
        if (!currentSupIds.includes(sId)) {
          updateData.assignedSupervisorIds = [...currentSupIds, sId];
          updateData.assignedSupervisors = [
            ...currentSups, 
            { id: sId, name: sName, specialty: 'general' }
          ];
        }
      }

      await ticketsApi.update(ticketId, updateData);
      toast.success('تمت إضافة التخصص الإضافي للتذكرة بنجاح');
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error('فشل إضافة التخصص');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-[400px] rounded-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground text-right flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-400" />
            إضافة تخصص (فيلا {unitNumber})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-widest block text-right">
              التخصص
            </Label>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
              {Object.entries(mergedTypes).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setSelectedType(k)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                    selectedType === k
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-300'
                      : 'bg-muted/50 border-border text-muted-foreground hover:border-slate-400 dark:hover:border-slate-500'
                  )}
                >
                  {v as React.ReactNode}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-[11px] uppercase font-bold tracking-widest block text-right">
              المشرف (اختياري)
            </Label>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              <div
                onClick={() => setSelectedSupId('')}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all',
                  !selectedSupId
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-300'
                    : 'bg-muted/50 border-border text-muted-foreground hover:border-slate-400 dark:hover:border-slate-500'
                )}
              >
                <span className="text-sm font-bold">بدون مشرف محدد</span>
                <div className={cn('w-3.5 h-3.5 rounded border-2 shrink-0', !selectedSupId ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground/50')} />
              </div>
              {supervisors.map(s => {
                const sId = s.uid || s.id;
                const sName = s.displayName || s.name;
                return (
                  <div
                    key={sId}
                    onClick={() => setSelectedSupId(sId)}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all',
                      selectedSupId === sId
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-300'
                        : 'bg-muted/50 border-border text-muted-foreground hover:border-slate-400 dark:hover:border-slate-500'
                    )}
                  >
                    <span className="text-sm font-bold">{sName}</span>
                    <div className={cn('w-3.5 h-3.5 rounded border-2 shrink-0', selectedSupId === sId ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground/50')} />
                  </div>
                );
              })}
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={loading || !selectedType}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-bold"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ وإضافة'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
