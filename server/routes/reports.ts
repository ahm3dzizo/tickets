import { Router } from 'express';
import { AuthRequest, requireAuth } from '../auth.js';
import prisma from '../db.js';

const router = Router();

// GET /api/reports/stats?projectId=&from=&to=
router.get('/stats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { projectId, from, to } = req.query as Record<string, string>;

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to)   dateFilter.lte = new Date(new Date(to).setHours(23, 59, 59, 999));

    const where: any = {};
    if (projectId)     where.projectId = projectId;
    if (from || to)    where.createdAt = dateFilter;

    // ── 1. Totals ─────────────────────────────────────────────────────────────
    const [total, openCount, closedCount, inProgressCount, pendingCount, waitingCount, outOfScopeCount] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.count({ where: { ...where, status: 'open' } }),
      prisma.ticket.count({ where: { ...where, status: 'closed' } }),
      prisma.ticket.count({ where: { ...where, status: 'in_progress' } }),
      prisma.ticket.count({ where: { ...where, status: 'pending' } }),
      prisma.ticket.count({ where: { ...where, status: 'waiting' } }),
      prisma.ticket.count({ where: { ...where, status: 'out_of_scope' } }),
    ]);

    // Avg days to close
    const closedWithDates = await prisma.ticket.findMany({
      where: { ...where, status: 'closed', closedAt: { not: null } },
      select: { createdAt: true, closedAt: true },
    });
    const avgDays = closedWithDates.length
      ? Math.round(closedWithDates.reduce((sum, t) => {
          return sum + (t.closedAt!.getTime() - t.createdAt.getTime()) / 86_400_000;
        }, 0) / closedWithDates.length * 10) / 10
      : 0;

    // ── 2. Overdue (open > 7 days) ────────────────────────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const overdueCount = await prisma.ticket.count({
      where: { ...where, status: { in: ['open', 'in_progress', 'pending'] }, createdAt: { lt: sevenDaysAgo } },
    });

    // ── 3. SLA Breakdown (closed tickets) ─────────────────────────────────────
    const sla = { within1: 0, within3: 0, within7: 0, within14: 0, over14: 0 };
    for (const t of closedWithDates) {
      const days = (t.closedAt!.getTime() - t.createdAt.getTime()) / 86_400_000;
      if      (days <= 1)  sla.within1++;
      else if (days <= 3)  sla.within3++;
      else if (days <= 7)  sla.within7++;
      else if (days <= 14) sla.within14++;
      else                 sla.over14++;
    }

    // ── 4. By Status (full breakdown) ─────────────────────────────────────────
    const byStatus = [
      { key: 'open',         nameAr: 'مفتوحة',       count: openCount,        color: '#f97316' },
      { key: 'in_progress',  nameAr: 'قيد التنفيذ',   count: inProgressCount,  color: '#6366f1' },
      { key: 'pending',      nameAr: 'معلقة',         count: pendingCount,     color: '#f59e0b' },
      { key: 'waiting',      nameAr: 'في الانتظار',   count: waitingCount,     color: '#14b8a6' },
      { key: 'closed',       nameAr: 'مغلقة',         count: closedCount,      color: '#22c55e' },
      { key: 'out_of_scope', nameAr: 'خارج النطاق',   count: outOfScopeCount,  color: '#6b7280' },
    ].filter(s => s.count > 0);

    // ── 5. By Priority ────────────────────────────────────────────────────────
    const priorityGroups = await prisma.ticket.groupBy({
      by: ['priority'],
      _count: { id: true },
      where,
    });
    const priorityNames: Record<number, string> = { 1: 'عاجل', 2: 'عالي', 3: 'متوسط عالي', 4: 'متوسط', 5: 'منخفض' };
    const priorityColors: Record<number, string> = { 1: '#ef4444', 2: '#f97316', 3: '#f59e0b', 4: '#6366f1', 5: '#22c55e' };
    const byPriority = priorityGroups
      .map(r => ({ priority: r.priority, nameAr: priorityNames[r.priority] ?? `${r.priority}`, count: r._count.id, color: priorityColors[r.priority] ?? '#6b7280' }))
      .sort((a, b) => a.priority - b.priority);

    // ── 6. By Specialty ───────────────────────────────────────────────────────
    const allTypes = await prisma.ticketType.findMany({
      where: { isActive: true },
      select: { key: true, nameAr: true, specialty: { select: { key: true, nameAr: true } } },
    });
    const typeToSpecialty = Object.fromEntries(
      allTypes.map(t => [t.key, { key: t.specialty?.key ?? 'general', nameAr: t.specialty?.nameAr ?? 'عام' }])
    );
    const ticketsByType = await prisma.ticket.groupBy({ by: ['type'], _count: { id: true }, where });
    const specialtyMap = new Map<string, { nameAr: string; count: number }>();
    for (const row of ticketsByType) {
      const sp = typeToSpecialty[row.type] ?? { key: 'general', nameAr: 'عام' };
      const cur = specialtyMap.get(sp.key) ?? { nameAr: sp.nameAr, count: 0 };
      specialtyMap.set(sp.key, { ...cur, count: cur.count + row._count.id });
    }
    const bySpecialty = [...specialtyMap.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count);

    // ── 7. By Main Type ───────────────────────────────────────────────────────
    const typeNameMap = Object.fromEntries(allTypes.map(t => [t.key, t.nameAr]));
    const closedByType = await prisma.ticket.groupBy({ by: ['type'], _count: { id: true }, where: { ...where, status: 'closed' } });
    const closedByTypeMap = Object.fromEntries(closedByType.map(r => [r.type, r._count.id]));
    const byMainType = ticketsByType.map(r => ({
      key:    r.type,
      nameAr: typeNameMap[r.type] ?? r.type,
      count:  r._count.id,
      closed: closedByTypeMap[r.type] ?? 0,
      open:   r._count.id - (closedByTypeMap[r.type] ?? 0),
    })).sort((a, b) => b.count - a.count);

    // ── 8. By Sub-Type ────────────────────────────────────────────────────────
    const subTypeGroups = await prisma.ticket.groupBy({ by: ['subTypeId'], _count: { id: true }, where: { ...where, subTypeId: { not: null } } });
    const subTypeIds = subTypeGroups.map(r => r.subTypeId!).filter(Boolean);
    const subTypeRecords = subTypeIds.length
      ? await prisma.ticketSubType.findMany({ where: { id: { in: subTypeIds } }, select: { id: true, nameAr: true, parentType: { select: { key: true, nameAr: true } } } })
      : [];
    const subTypeMap = Object.fromEntries(subTypeRecords.map(s => [s.id, s]));
    const closedSubType = await prisma.ticket.groupBy({ by: ['subTypeId'], _count: { id: true }, where: { ...where, subTypeId: { not: null }, status: 'closed' } });
    const closedSubMap = Object.fromEntries(closedSubType.map(r => [r.subTypeId!, r._count.id]));
    const bySubType = subTypeGroups.filter(r => r.subTypeId && subTypeMap[r.subTypeId!]).map(r => {
      const info = subTypeMap[r.subTypeId!];
      return { id: r.subTypeId!, nameAr: info.nameAr, parentKey: info.parentType.key, parentName: info.parentType.nameAr, count: r._count.id, closed: closedSubMap[r.subTypeId!] ?? 0, open: r._count.id - (closedSubMap[r.subTypeId!] ?? 0) };
    }).sort((a, b) => b.count - a.count);

    // ── 9. By Project ─────────────────────────────────────────────────────────
    const projectGroups = await prisma.ticket.groupBy({ by: ['projectId'], _count: { id: true }, where });
    const projectIds = projectGroups.map(r => r.projectId);
    const projects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, abbreviation: true } });
    const projectNameMap = Object.fromEntries(projects.map(p => [p.id, p]));
    const closedByProject = await prisma.ticket.groupBy({ by: ['projectId'], _count: { id: true }, where: { ...where, status: 'closed' } });
    const closedByProjectMap = Object.fromEntries(closedByProject.map(r => [r.projectId, r._count.id]));
    const byProject = projectGroups.map(r => ({
      id:     r.projectId,
      name:   projectNameMap[r.projectId]?.name ?? r.projectId,
      abbr:   projectNameMap[r.projectId]?.abbreviation ?? '',
      count:  r._count.id,
      closed: closedByProjectMap[r.projectId] ?? 0,
      open:   r._count.id - (closedByProjectMap[r.projectId] ?? 0),
    })).sort((a, b) => b.count - a.count);

    // ── 10. Monthly Trend ─────────────────────────────────────────────────────
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1); twelveMonthsAgo.setHours(0, 0, 0, 0);
    const monthlyRaw = projectId
      ? await prisma.$queryRaw<{ month: Date; total: bigint; closed: bigint }[]>`
          SELECT DATE_TRUNC('month', "createdAt") AS month, COUNT(*)::bigint AS total,
                 COUNT(CASE WHEN status = 'closed' THEN 1 END)::bigint AS closed
          FROM "Ticket" WHERE "createdAt" >= ${twelveMonthsAgo} AND "projectId" = ${projectId}
          GROUP BY 1 ORDER BY 1`
      : await prisma.$queryRaw<{ month: Date; total: bigint; closed: bigint }[]>`
          SELECT DATE_TRUNC('month', "createdAt") AS month, COUNT(*)::bigint AS total,
                 COUNT(CASE WHEN status = 'closed' THEN 1 END)::bigint AS closed
          FROM "Ticket" WHERE "createdAt" >= ${twelveMonthsAgo}
          GROUP BY 1 ORDER BY 1`;
    const byMonth = monthlyRaw.map(r => ({ month: r.month.toISOString().slice(0, 7), total: Number(r.total), closed: Number(r.closed), open: Number(r.total) - Number(r.closed) }));

    // ── 11. Supervisor Performance ────────────────────────────────────────────
    const supTickets = await prisma.ticket.findMany({
      where: { ...where, assignedSupervisorId: { not: null } },
      select: { assignedSupervisorId: true, status: true, createdAt: true, closedAt: true },
    });
    const supMap = new Map<string, { open: number; closed: number; totalDays: number; closedCount: number }>();
    for (const t of supTickets) {
      const sid = t.assignedSupervisorId!;
      const cur = supMap.get(sid) ?? { open: 0, closed: 0, totalDays: 0, closedCount: 0 };
      if (t.status === 'closed') {
        cur.closed++;
        if (t.closedAt) { cur.totalDays += (t.closedAt.getTime() - t.createdAt.getTime()) / 86_400_000; cur.closedCount++; }
      } else {
        cur.open++;
      }
      supMap.set(sid, cur);
    }
    const supIds = [...supMap.keys()];
    const supUsers = supIds.length
      ? await prisma.user.findMany({ where: { uid: { in: supIds } }, select: { uid: true, displayName: true, specialty: true } })
      : [];
    const supNameMap = Object.fromEntries(supUsers.map(u => [u.uid, u]));
    const bySupervisor = [...supMap.entries()].map(([uid, v]) => ({
      uid,
      name:    supNameMap[uid]?.displayName ?? uid,
      specialty: supNameMap[uid]?.specialty ?? '',
      open:    v.open,
      closed:  v.closed,
      total:   v.open + v.closed,
      avgDays: v.closedCount > 0 ? Math.round(v.totalDays / v.closedCount * 10) / 10 : null,
    })).sort((a, b) => b.total - a.total).slice(0, 15);

    // ── 12. Top Clients by Ticket Count ──────────────────────────────────────
    const clientGroups = await prisma.ticket.groupBy({
      by: ['clientId', 'clientName', 'villaNumber'],
      _count: { id: true },
      where: { ...where, clientId: { not: null } },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    const clientClosed = await prisma.ticket.groupBy({
      by: ['clientId'],
      _count: { id: true },
      where: { ...where, clientId: { not: null }, status: 'closed' },
    });
    const clientClosedMap = Object.fromEntries(clientClosed.map(r => [r.clientId!, r._count.id]));
    const topClients = clientGroups.map(r => ({
      clientId:    r.clientId!,
      clientName:  r.clientName,
      villaNumber: r.villaNumber,
      count:       r._count.id,
      closed:      clientClosedMap[r.clientId!] ?? 0,
      open:        r._count.id - (clientClosedMap[r.clientId!] ?? 0),
    }));

    // ── 13. Avg Resolution Days by Type ──────────────────────────────────────
    const closedByTypeWithDates = await prisma.ticket.findMany({
      where: { ...where, status: 'closed', closedAt: { not: null } },
      select: { type: true, createdAt: true, closedAt: true },
    });
    const typeResMap = new Map<string, { totalDays: number; count: number }>();
    for (const t of closedByTypeWithDates) {
      const days = (t.closedAt!.getTime() - t.createdAt.getTime()) / 86_400_000;
      const cur = typeResMap.get(t.type) ?? { totalDays: 0, count: 0 };
      typeResMap.set(t.type, { totalDays: cur.totalDays + days, count: cur.count + 1 });
    }
    const byTypeAvgDays = [...typeResMap.entries()].map(([key, v]) => ({
      key,
      nameAr:  typeNameMap[key] ?? key,
      avgDays: Math.round(v.totalDays / v.count * 10) / 10,
      count:   v.count,
    })).sort((a, b) => b.avgDays - a.avgDays);

    res.json({
      totals:     { total, open: openCount, closed: closedCount, avgDays, overdueCount, inProgress: inProgressCount, pending: pendingCount },
      sla,
      byStatus,
      byPriority,
      bySpecialty,
      byMainType,
      bySubType,
      byProject,
      byMonth,
      bySupervisor,
      topClients,
      byTypeAvgDays,
    });
  } catch (err: any) {
    console.error('[Reports] stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
