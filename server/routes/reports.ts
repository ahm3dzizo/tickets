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
    if (to)   dateFilter.lte = new Date(to);

    const where: any = {};
    if (projectId)     where.projectId = projectId;
    if (from || to)    where.createdAt = dateFilter;

    // ── Totals ───────────────────────────────────────────────────────────────
    const [total, openCount, closedCount] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.count({ where: { ...where, status: 'open' } }),
      prisma.ticket.count({ where: { ...where, status: 'closed' } }),
    ]);

    // Avg days to close (only closed tickets with closedAt)
    const closedWithDates = await prisma.ticket.findMany({
      where: { ...where, status: 'closed', closedAt: { not: null } },
      select: { createdAt: true, closedAt: true },
    });
    const avgDays = closedWithDates.length
      ? closedWithDates.reduce((sum, t) => {
          const diff = (t.closedAt!.getTime() - t.createdAt.getTime()) / 86_400_000;
          return sum + diff;
        }, 0) / closedWithDates.length
      : 0;

    // ── By Specialty (via TicketType → Specialty) ────────────────────────────
    const allTypes = await prisma.ticketType.findMany({
      where: { isActive: true },
      select: { key: true, nameAr: true, specialty: { select: { key: true, nameAr: true } } },
    });
    const typeToSpecialty = Object.fromEntries(
      allTypes.map(t => [t.key, { key: t.specialty?.key ?? 'general', nameAr: t.specialty?.nameAr ?? 'عام' }])
    );

    const ticketsByType = await prisma.ticket.groupBy({
      by: ['type'],
      _count: { id: true },
      where,
    });

    const specialtyMap = new Map<string, { nameAr: string; count: number }>();
    for (const row of ticketsByType) {
      const sp = typeToSpecialty[row.type] ?? { key: 'general', nameAr: 'عام' };
      const cur = specialtyMap.get(sp.key) ?? { nameAr: sp.nameAr, count: 0 };
      specialtyMap.set(sp.key, { ...cur, count: cur.count + row._count.id });
    }
    const bySpecialty = [...specialtyMap.entries()].map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count);

    // ── By Main Type ─────────────────────────────────────────────────────────
    const typeNameMap = Object.fromEntries(allTypes.map(t => [t.key, t.nameAr]));

    const closedByType = await prisma.ticket.groupBy({
      by: ['type'],
      _count: { id: true },
      where: { ...where, status: 'closed' },
    });
    const closedByTypeMap = Object.fromEntries(closedByType.map(r => [r.type, r._count.id]));

    const byMainType = ticketsByType
      .map(r => ({
        key:     r.type,
        nameAr:  typeNameMap[r.type] ?? r.type,
        count:   r._count.id,
        closed:  closedByTypeMap[r.type] ?? 0,
        open:    r._count.id - (closedByTypeMap[r.type] ?? 0),
      }))
      .sort((a, b) => b.count - a.count);

    // ── By Sub-Type ──────────────────────────────────────────────────────────
    const subTypeGroups = await prisma.ticket.groupBy({
      by: ['subTypeId'],
      _count: { id: true },
      where: { ...where, subTypeId: { not: null } },
    });

    const subTypeIds = subTypeGroups.map(r => r.subTypeId!).filter(Boolean);
    const subTypeRecords = subTypeIds.length
      ? await prisma.ticketSubType.findMany({
          where: { id: { in: subTypeIds } },
          select: { id: true, nameAr: true, parentType: { select: { key: true, nameAr: true } } },
        })
      : [];
    const subTypeMap = Object.fromEntries(subTypeRecords.map(s => [s.id, s]));

    const closedSubType = await prisma.ticket.groupBy({
      by: ['subTypeId'],
      _count: { id: true },
      where: { ...where, subTypeId: { not: null }, status: 'closed' },
    });
    const closedSubMap = Object.fromEntries(closedSubType.map(r => [r.subTypeId!, r._count.id]));

    const bySubType = subTypeGroups
      .filter(r => r.subTypeId && subTypeMap[r.subTypeId!])
      .map(r => {
        const info = subTypeMap[r.subTypeId!];
        return {
          id:         r.subTypeId!,
          nameAr:     info.nameAr,
          parentKey:  info.parentType.key,
          parentName: info.parentType.nameAr,
          count:      r._count.id,
          closed:     closedSubMap[r.subTypeId!] ?? 0,
          open:       r._count.id - (closedSubMap[r.subTypeId!] ?? 0),
        };
      })
      .sort((a, b) => b.count - a.count);

    // ── By Project ───────────────────────────────────────────────────────────
    const projectGroups = await prisma.ticket.groupBy({
      by: ['projectId'],
      _count: { id: true },
      where,
    });
    const projectIds = projectGroups.map(r => r.projectId);
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true, abbreviation: true },
    });
    const projectNameMap = Object.fromEntries(projects.map(p => [p.id, p]));

    const closedByProject = await prisma.ticket.groupBy({
      by: ['projectId'],
      _count: { id: true },
      where: { ...where, status: 'closed' },
    });
    const closedByProjectMap = Object.fromEntries(closedByProject.map(r => [r.projectId, r._count.id]));

    const byProject = projectGroups
      .map(r => ({
        id:    r.projectId,
        name:  projectNameMap[r.projectId]?.name ?? r.projectId,
        abbr:  projectNameMap[r.projectId]?.abbreviation ?? '',
        count: r._count.id,
        closed: closedByProjectMap[r.projectId] ?? 0,
        open:   r._count.id - (closedByProjectMap[r.projectId] ?? 0),
      }))
      .sort((a, b) => b.count - a.count);

    // ── Monthly Trend (last 12 months) ───────────────────────────────────────
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyRaw = projectId
      ? await prisma.$queryRaw<{ month: Date; total: bigint; closed: bigint }[]>`
          SELECT
            DATE_TRUNC('month', "createdAt") AS month,
            COUNT(*)::bigint                 AS total,
            COUNT(CASE WHEN status = 'closed' THEN 1 END)::bigint AS closed
          FROM "Ticket"
          WHERE "createdAt" >= ${twelveMonthsAgo}
            AND "projectId" = ${projectId}
          GROUP BY 1
          ORDER BY 1
        `
      : await prisma.$queryRaw<{ month: Date; total: bigint; closed: bigint }[]>`
          SELECT
            DATE_TRUNC('month', "createdAt") AS month,
            COUNT(*)::bigint                 AS total,
            COUNT(CASE WHEN status = 'closed' THEN 1 END)::bigint AS closed
          FROM "Ticket"
          WHERE "createdAt" >= ${twelveMonthsAgo}
          GROUP BY 1
          ORDER BY 1
        `;

    const byMonth = monthlyRaw.map(r => ({
      month:  r.month.toISOString().slice(0, 7),
      total:  Number(r.total),
      closed: Number(r.closed),
      open:   Number(r.total) - Number(r.closed),
    }));

    res.json({
      totals: { total, open: openCount, closed: closedCount, avgDays: Math.round(avgDays * 10) / 10 },
      bySpecialty,
      byMainType,
      bySubType,
      byProject,
      byMonth,
    });
  } catch (err: any) {
    console.error('[Reports] stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
