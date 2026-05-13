import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAuthHeaders } from '@/services/classificationApi';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface TicketTypeEntry {
  id: string;
  key: string;
  nameAr: string;
  isActive: boolean;
  specialty?: { key: string; nameAr: string };
}

interface TicketTypesContextValue {
  typeTranslations: Record<string, string>;   // key → nameAr
  typeBg: Record<string, string>;             // key → tailwind classes
  types: TicketTypeEntry[];
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

// ─── Context ───────────────────────────────────────────────────────────────────
const TicketTypesContext = createContext<TicketTypesContextValue>({
  typeTranslations: {},
  typeBg: {},
  types: [],
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
      setTypes(data.filter(t => t.isActive));
    } catch {
      // silently fail — TicketTable still works with empty maps
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const typeTranslations: Record<string, string> = {};
  const typeBg: Record<string, string> = {};

  types.forEach((t, idx) => {
    typeTranslations[t.key] = t.nameAr;
    typeBg[t.key] =
      SPECIALTY_COLOR[t.specialty?.key ?? ''] ??
      COLOR_POOL[idx % COLOR_POOL.length];
  });

  return (
    <TicketTypesContext.Provider value={{ typeTranslations, typeBg, types, refresh: load }}>
      {children}
    </TicketTypesContext.Provider>
  );
}

export const useTicketTypes = () => useContext(TicketTypesContext);