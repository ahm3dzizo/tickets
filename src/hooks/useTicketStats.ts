// src/hooks/useTicketStats.ts
import { useMemo } from 'react';
import { differenceInDays } from 'date-fns';
import { Ticket, TicketType } from '@/types';
import { parseIssuedAt } from '@/components/tickets/TicketTable';

export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  pending: number;
  completed: number;
  closed: number;
  outOfScope: number;
  overdue: number;         // مفتوحة أكثر من 7 أيام
  critical: number;        // أولوية 9
  avgDaysOpen: number;
  byType: Record<TicketType | string, number>;
  byProject: Record<string, number>;
  bySUPERVISOR: Record<string, number>;
  byPriority: Record<number, number>;
  resolvedThisWeek: number;
  resolvedThisMonth: number;
}

export function useTicketStats(tickets: Ticket[]): TicketStats {
  return useMemo(() => {
    const now = new Date();

    const byType: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    const bySUPERVISOR: Record<string, number> = {};
    const byPriority: Record<number, number> = {};

    let open = 0, inProgress = 0, pending = 0, completed = 0,
        closed = 0, outOfScope = 0, overdue = 0, critical = 0;
    let totalDays = 0, countOpen = 0;
    let resolvedThisWeek = 0, resolvedThisMonth = 0;

    for (const t of tickets) {
      // ─── Status ───────────────────────────────────────────
      if (t.status === 'open')           open++;
      else if (t.status === 'in-progress') inProgress++;
      else if (t.status === 'pending')   pending++;
      else if (t.status === 'completed') completed++;
      else if (t.status === 'closed')    closed++;
      else if (t.status === 'out-of-scope') outOfScope++;

      // ─── Days open ────────────────────────────────────────
      const createdAt = (t.createdAt as any)?.toDate
        ? (t.createdAt as any).toDate()
        : new Date(t.createdAt as any);
      const openDate = (t.issuedAt ? parseIssuedAt(t.issuedAt) : null) ?? createdAt;
      const closeDate = t.closedAt ? new Date(t.closedAt) : null;
      const endDate = (t.status === 'closed' && closeDate) ? closeDate : now;
      const days = differenceInDays(endDate, openDate);

      if (t.status !== 'closed' && t.status !== 'out-of-scope') {
        totalDays += days;
        countOpen++;
        if (days > 7) overdue++;
      }

      // ─── Priority ─────────────────────────────────────────
      const p = typeof t.priority === 'number' ? t.priority : 3;
      byPriority[p] = (byPriority[p] ?? 0) + 1;
      if (p === 9) critical++;

      // ─── By Type ──────────────────────────────────────────
      const types: string[] = t.detectedTypes?.length
        ? t.detectedTypes
        : t.type ? [t.type] : [];
      for (const tp of types) {
        byType[tp] = (byType[tp] ?? 0) + 1;
      }

      // ─── By Project ───────────────────────────────────────
      if (t.projectId) {
        byProject[t.projectId] = (byProject[t.projectId] ?? 0) + 1;
      }

      // ─── By SUPERVISOR ────────────────────────────────────
      const supMap = (t as any).SUPERVISORByType as Record<string, { name: string }[]> | undefined;
      const supNames: string[] = supMap
        ? [...new Set(Object.values(supMap).flatMap((s: { name: string }[]) => s.map((x: { name: string }) => x.name)))]
        : t.assignedSupervisors?.map((s: any) => s.name) ??
          (t.assigneeName && t.assigneeName !== '---' ? [t.assigneeName] : []);
      for (const name of supNames) {
        bySUPERVISOR[name] = (bySUPERVISOR[name] ?? 0) + 1;
      }

      // ─── Resolved this week / month ───────────────────────
      if (t.status === 'completed' || t.status === 'closed') {
        const closedAt = t.closedAt
          ? ((t.closedAt as any)?.toDate ? (t.closedAt as any).toDate() : new Date(t.closedAt as any))
          : null;
        if (closedAt) {
          const daysAgo = differenceInDays(now, closedAt);
          if (daysAgo <= 7)  resolvedThisWeek++;
          if (daysAgo <= 30) resolvedThisMonth++;
        }
      }
    }

    return {
      total: tickets.length,
      open, inProgress, pending, completed, closed, outOfScope,
      overdue, critical,
      avgDaysOpen: countOpen > 0 ? Math.round(totalDays / countOpen) : 0,
      byType, byProject, bySUPERVISOR, byPriority,
      resolvedThisWeek, resolvedThisMonth,
    };
  }, [tickets]);
}
