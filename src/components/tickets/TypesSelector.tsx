import React, { useState, useRef, useEffect } from 'react';
import { Search, Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TicketType } from '@/types';
import { useTicketTypes } from '@/contexts/TicketTypesContext';

// Static fallback labels (used when context hasn't loaded yet)
export const TYPE_LABELS_STATIC: Record<string, string> = {
  electricity:     'كهرباء',
  plumbing:        'سباكة',
  doors:           'أبواب',
  paints:          'دهانات',
  cracks:          'تشققات',
  ceramics:        'سيراميك',
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
};

interface TypesSelectorProps {
  value: TicketType[];
  onChange: (v: TicketType[]) => void;
  label?: string;
  min?: number;
  className?: string;
}

export function TypesSelector({ value, onChange, label, min = 1, className }: TypesSelectorProps) {
  const { activeTypes, typeTranslations } = useTicketTypes();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use dynamic types from context, fall back to static list if not loaded yet
  const availableTypes: { key: string; nameAr: string }[] =
    activeTypes.length > 0
      ? activeTypes
      : Object.entries(TYPE_LABELS_STATIC).map(([key, nameAr]) => ({ key, nameAr }));

  // merged label resolver: context first, static fallback
  const getLabel = (key: string) =>
    typeTranslations[key] ?? TYPE_LABELS_STATIC[key] ?? key;

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handler);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const filtered = availableTypes.filter(t =>
    t.nameAr.includes(search) || t.key.includes(search.toLowerCase())
  );

  const toggle = (key: string) => {
    const t = key as TicketType;
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

      <div ref={rootRef} className="relative">
        {/* Trigger */}
        <button
          type="button"
          onClick={() => setOpen(p => !p)}
          className={cn(
            'w-full min-h-[44px] flex flex-wrap items-center gap-1.5 px-3 py-2',
            'rounded-xl border border-border bg-white/5 text-right cursor-pointer',
            'hover:border-slate-500 transition-colors',
            open && 'border-blue-500/40 ring-2 ring-blue-500/10'
          )}
        >
          {value.length === 0 ? (
            <span className="text-slate-500 text-sm flex-1">اختر الأنواع...</span>
          ) : (
            value.map(t => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[11px] font-bold"
              >
                {getLabel(t)}
                <span
                  role="button"
                  onClick={(e) => remove(t, e)}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              </span>
            ))
          )}
          <ChevronDown className={cn('w-3.5 h-3.5 text-slate-500 mr-auto shrink-0 transition-transform', open && 'rotate-180')} />
        </button>

        {/* Dropdown — absolute inside the same DOM tree so Dialog backdrop won't block it */}
        {open && (
          <div className="absolute z-[200] top-full mt-1 left-0 right-0 rounded-xl border border-border bg-card shadow-2xl shadow-black/60 overflow-hidden">
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث عن نوع..."
                className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none text-right"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-slate-600 hover:text-slate-400">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="text-center text-slate-600 text-xs py-4">لا توجد نتائج</p>
              ) : (
                filtered.map(t => {
                  const selected = value.includes(t.key as TicketType);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => toggle(t.key)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-right',
                        selected ? 'bg-blue-500/10 text-blue-300' : 'text-slate-300 hover:bg-white/5'
                      )}
                    >
                      <span>{t.nameAr}</span>
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
          </div>
        )}
      </div>
    </div>
  );
}
