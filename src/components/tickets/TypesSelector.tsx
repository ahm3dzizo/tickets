import React, { useState, useRef, useEffect } from 'react';
import { Search, Check, ChevronDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { TicketType } from '@/types';

export const TYPE_LABELS: Record<string, string> = {
  electricity:     'كهرباء',
  plumbing:        'سباكة',
  doors:           'أبواب',
  paints:          'دهانات',
  painting:        'دهانات',
  cracks:          'تشققات',
  ceramics:        'سيراميك',
  tiles:           'سيراميك',
  tank_insulation: 'عزل خزان',
  drainage:        'صرف صحي',
  ac_ventilation:  'تكييف وتهوية',
  pumps:           'مضخات',
  doors_windows:   'أبواب ونوافذ',
  waterproofing:   'عزل مائي',
  grading:         'ميول وترويبة',
  pest_control:    'مكافحة حشرات',
  cleaning:        'تنظيف',
  structural:      'إنشائي',
  unclassified:    'غير مصنف',
};

// Deduplicated canonical list (no duplicate Arabic labels)
const CANONICAL_TYPES: TicketType[] = [
  'electricity', 'plumbing', 'doors', 'paints', 'cracks', 'ceramics',
  'tank_insulation', 'drainage', 'ac_ventilation', 'pumps', 'doors_windows',
  'waterproofing', 'grading', 'pest_control', 'cleaning', 'structural', 'unclassified',
];

interface TypesSelectorProps {
  value: TicketType[];
  onChange: (v: TicketType[]) => void;
  /** Label shown above the selector */
  label?: string;
  /** Minimum selections (default 1) */
  min?: number;
  className?: string;
}

export function TypesSelector({ value, onChange, label, min = 1, className }: TypesSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearch('');
  }, [open]);

  const filtered = CANONICAL_TYPES.filter(t =>
    TYPE_LABELS[t]?.includes(search) || t.includes(search.toLowerCase())
  );

  const toggle = (t: TicketType) => {
    if (value.includes(t)) {
      if (value.length <= min) return;
      onChange(value.filter(x => x !== t));
    } else {
      onChange([...value, t]);
    }
  };

  const remove = (t: TicketType, e: React.MouseEvent) => {
    e.stopPropagation();
    if (value.length <= min) return;
    onChange(value.filter(x => x !== t));
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">
          {label}
        </label>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'w-full min-h-[44px] flex flex-wrap items-center gap-1.5 px-3 py-2',
              'rounded-xl border border-border bg-white/5 text-right',
              'hover:border-slate-500 transition-colors cursor-pointer',
              open && 'border-blue-500/40 ring-2 ring-blue-500/10'
            )}
          >
            {value.length === 0 ? (
              <span className="text-slate-500 text-sm flex-1">اختر الأنواع...</span>
            ) : (
              <>
                {value.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[11px] font-bold"
                  >
                    {TYPE_LABELS[t] || t}
                    <span
                      role="button"
                      onClick={(e) => remove(t, e)}
                      className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5" />
                    </span>
                  </span>
                ))}
              </>
            )}
            <ChevronDown className={cn('w-3.5 h-3.5 text-slate-500 mr-auto shrink-0 transition-transform', open && 'rotate-180')} />
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[220px] max-w-sm"
          align="start"
          sideOffset={6}
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث..."
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none text-right"
            />
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-center text-slate-600 text-xs py-4">لا توجد نتائج</p>
            ) : (
              filtered.map(t => {
                const selected = value.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggle(t)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-right',
                      selected
                        ? 'bg-blue-500/10 text-blue-300'
                        : 'text-slate-300 hover:bg-white/5'
                    )}
                  >
                    <span>{TYPE_LABELS[t] || t}</span>
                    <div className={cn(
                      'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                      selected ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
                    )}>
                      {selected && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {value.length > 0 && (
            <div className="border-t border-border px-3 py-1.5 flex justify-between items-center">
              <span className="text-[10px] text-slate-600">{value.length} محدد</span>
              {value.length > min && (
                <button
                  type="button"
                  onClick={() => onChange(value.slice(0, min))}
                  className="text-[10px] text-slate-500 hover:text-rose-400 transition-colors"
                >
                  مسح الكل
                </button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
