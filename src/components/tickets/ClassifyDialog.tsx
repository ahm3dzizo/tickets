import { useState, useEffect } from 'react';
import { Sparkles, Loader2, Check, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTicketTypes } from '@/contexts/TicketTypesContext';
import { classifyOnServer } from '@/services/classificationApi';
import { ticketsApi } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Ticket } from '@/types';

interface ClassifyDialogProps {
  ticket: Ticket;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function ClassifyDialog({ ticket, open, onClose, onDone }: ClassifyDialogProps) {
  const { typeTranslations, typeBg, activeTypes: types } = useTicketTypes();

  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [autoSuggestion, setAutoSuggestion]   = useState<string[]>([]);
  const [autoLoading,    setAutoLoading]       = useState(false);
  const [saving,         setSaving]            = useState(false);
  const [autoRan,        setAutoRan]           = useState(false);

  // Seed selection from existing ticket type
  useEffect(() => {
    if (!open) return;
    const existing = ticket.detectedTypes?.length
      ? (ticket.detectedTypes as string[])
      : ticket.type ? [ticket.type] : [];
    setSelectedTypes(existing.filter(t => t !== 'unclassified'));
    setAutoSuggestion([]);
    setAutoRan(false);
  }, [open, ticket]);

  const handleAutoSuggest = async () => {
    if (!ticket.description || !ticket.projectId) {
      toast.error('الوصف أو المشروع غير متاح');
      return;
    }
    setAutoLoading(true);
    try {
      const result = await classifyOnServer({
        description: ticket.description,
        projectId: ticket.projectId,
      });
      if (!result.primaryType || result.primaryType === 'unclassified') {
        toast.warning('لم يُتعرَّف على نوع — حدد يدوياً');
        setAutoSuggestion([]);
      } else {
        setAutoSuggestion(result.allTypes ?? [result.primaryType]);
        setSelectedTypes(result.allTypes ?? [result.primaryType]);
        toast.success(`اقتراح: ${result.allTypes.map(t => typeTranslations[t] ?? t).join(' + ')}`);
      }
      setAutoRan(true);
    } catch {
      toast.error('فشل التصنيف التلقائي');
    } finally {
      setAutoLoading(false);
    }
  };

  const toggleType = (key: string) => {
    setSelectedTypes(prev =>
      prev.includes(key)
        ? prev.length > 1 ? prev.filter(x => x !== key) : prev   // keep at least 1
        : [...prev, key]
    );
  };

  const handleSave = async () => {
    if (selectedTypes.length === 0) { toast.error('اختر نوعاً على الأقل'); return; }
    setSaving(true);
    try {
      // Also trigger learning if we changed from the auto-suggestion
      await ticketsApi.update(ticket.id, {
        type:          selectedTypes[0],
        detectedTypes: selectedTypes,
      });

      // If user chose something different from auto-suggestion → teach the classifier
      if (autoRan && autoSuggestion.length > 0 && selectedTypes[0] !== autoSuggestion[0]) {
        const { learnFromCorrection } = await import('@/services/classificationApi');
        learnFromCorrection(ticket.description ?? '', selectedTypes[0]).catch(() => {});
      }

      toast.success('✅ تم حفظ التصنيف');
      onDone();
      onClose();
    } catch {
      toast.error('فشل حفظ التصنيف');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  // Merge DB types with any legacy static types already on the ticket
  const allTypeKeys = types.length
    ? types.map(t => t.key)
    : Object.keys(typeTranslations);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-foreground font-bold text-base">تصنيف التذكرة</h2>
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-orange-400" />
            </div>
          </div>
        </div>

        {/* Ticket info */}
        <div className="bg-muted/40 border border-border/50 rounded-2xl p-3 text-right space-y-1">
          <p className="text-[11px] text-muted-foreground font-bold">
            {ticket.refNumber || ticket.ticketId || ticket.id.slice(0, 6)}
            {ticket.villaNumber && ` · فيلا ${ticket.villaNumber}`}
          </p>
          <p className="text-sm text-foreground leading-relaxed line-clamp-3">{ticket.description}</p>
        </div>

        {/* Auto-suggest button */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoSuggest}
            disabled={autoLoading}
            className="gap-2 rounded-xl border-orange-500/30 bg-orange-500/5 text-orange-400 hover:bg-orange-500/10 font-bold h-9"
          >
            {autoLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Sparkles className="w-3.5 h-3.5" />}
            اقتراح تلقائي
          </Button>
          {autoSuggestion.length > 0 && (
            <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              {autoSuggestion.map(t => typeTranslations[t] ?? t).join(' + ')}
            </span>
          )}
        </div>

        {/* Type pills */}
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground font-bold text-right">
            اختر النوع (يمكن أكثر من نوع)
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto no-scrollbar">
            {allTypeKeys.map(key => {
              const isSelected  = selectedTypes.includes(key);
              const isSuggested = autoSuggestion.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleType(key)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all',
                    isSelected
                      ? 'bg-primary/20 border-primary/40 text-primary'
                      : isSuggested
                        ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                        : 'bg-muted/40 border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
                  )}
                >
                  {isSelected && <Check className="w-2.5 h-2.5 inline ml-1" />}
                  {typeTranslations[key] ?? key}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected preview */}
        {selectedTypes.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground font-bold">محدد:</span>
            {selectedTypes.map(t => (
              <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-primary/15 text-primary border border-primary/25">
                {typeTranslations[t] ?? t}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 rounded-xl h-10 text-sm"
          >
            إلغاء
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || selectedTypes.length === 0}
            className="flex-1 rounded-xl h-10 font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-2 text-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            حفظ التصنيف
          </Button>
        </div>
      </div>
    </div>
  );
}
