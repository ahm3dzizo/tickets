import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAuthHeaders } from '@/services/classificationApi';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface TicketSubTypeEntry {
  id: string;
  nameAr: string;
  parentTypeId: string;
  parentKey: string;   // key of parent TicketType
}

interface TicketTypeEntry {
  id: string;
  key: string;
  nameAr: string;
  isActive: boolean;
  specialty?: { key: string; nameAr: string };
  subTypes?: TicketSubTypeEntry[];
}

interface TicketTypesContextValue {
  typeTranslations:    Record<string, string>;   // key → nameAr (active + inactive, so old tickets still resolve)
  typeBg:              Record<string, string>;   // key → tailwind classes
  types:               TicketTypeEntry[];         // active + inactive
  activeTypes:         TicketTypeEntry[];         // active only — use this for "pick a type" selectors
  subTypes:            TicketSubTypeEntry[];
  subTypeTranslations: Record<string, string>;   // subTypeId → nameAr
  subTypeBg:           Record<string, string>;   // subTypeId → tailwind classes (inherited from parent)
  refresh: () => void;
}

// ─── Fallback colors (cycle through for new types) ────────────────────────────
const COLOR_POOL = [
  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'bg-rose-500/10 text-rose-400 border-rose-500/20',
  'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  'bg-sky-500/10 text-sky-400 border-sky-500/20',
  'bg-lime-500/10 text-lime-400 border-lime-500/20',
  'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
];

// specialty → preferred color (overrides pool)
const SPECIALTY_COLOR: Record<string, string> = {
  plumbing:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  electrical:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  carpentry:   'bg-orange-500/10 text-orange-400 border-orange-500/20',
  painting:    'bg-purple-500/10 text-purple-400 border-purple-500/20',
  civil:       'bg-slate-500/10 text-slate-400 border-slate-500/20',
  general:     'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const STATIC_FALLBACKS: Record<string, string> = {
  electricity: 'كهرباء',
  plumbing: 'سباكة',
  doors: 'أبواب',
  doors_windows: 'أبواب ونوافذ',
  paints: 'دهانات',
  ceramics: 'سيراميك',
  drainage: 'صرف صحي',
  ac_ventilation: 'تكييف وتهوية',
  waterproofing: 'عزل مائي',
  pest_control: 'مكافحة حشرات',
  general: 'عام',
  cracks: 'شروخ وتصدعات',
  grading: 'تسوية',
  lighting: 'إضاءة',
  aluminum: 'ألمنيوم',
  hvac: 'تكييف',
  smart_home: 'نظام ذكي',
  swimming_pool: 'مسبح',
  landscaping: 'زراعة وحدائق',
  mechanics:    'ميكانيكا / سباكة',
  tank_neck:    'رقبة خزان',
  tank_cover:   'غطاء خزان',
  tank_broken:  'كسر خزان',
  smells:       'روائح',
  interlocking: 'انترلوك',
  gypsum:       'جبس',
};

// ─── Context ───────────────────────────────────────────────────────────────────
const TicketTypesContext = createContext<TicketTypesContextValue>({
  typeTranslations:    {},
  typeBg:              {},
  types:               [],
  activeTypes:         [],
  subTypes:            [],
  subTypeTranslations: {},
  subTypeBg:           {},
  refresh: () => {},
});

export function TicketTypesProvider({ children }: { children: React.ReactNode }) {
  const [types, setTypes] = useState<TicketTypeEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ticket-types', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data: TicketTypeEntry[] = await res.json();
      // Keep inactive types too — tickets tagged with a type that was later
      // deactivated still need their label/color to resolve instead of
      // falling back to the raw db key (e.g. "type_1782144360722").
      setTypes(data);
    } catch {
      // silently fail — TicketTable still works with empty maps
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeTypes = types.filter(t => t.isActive);

  const typeTranslations: Record<string, string> = { ...STATIC_FALLBACKS };
  const typeBg: Record<string, string> = {};

  types.forEach((t, idx) => {
    typeTranslations[t.key] = t.nameAr;
    typeBg[t.key] =
      SPECIALTY_COLOR[t.specialty?.key ?? ''] ??
      COLOR_POOL[idx % COLOR_POOL.length];
  });

  // Build sub-type maps from the subTypes already included in each type
  const subTypes: TicketSubTypeEntry[] = [];
  const subTypeTranslations: Record<string, string> = {};
  const subTypeBg: Record<string, string> = {};

  types.forEach((t, idx) => {
    const bg = typeBg[t.key] ?? COLOR_POOL[idx % COLOR_POOL.length];
    (t.subTypes ?? []).forEach(s => {
      subTypes.push({ ...s, parentKey: t.key });
      subTypeTranslations[s.id] = s.nameAr;
      subTypeBg[s.id] = bg;
    });
  });

  return (
    <TicketTypesContext.Provider value={{ typeTranslations, typeBg, types, activeTypes, subTypes, subTypeTranslations, subTypeBg, refresh: load }}>
      {children}
    </TicketTypesContext.Provider>
  );
}

export const useTicketTypes = () => useContext(TicketTypesContext);