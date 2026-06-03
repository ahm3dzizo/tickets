import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth } from "../auth.js";

const router = Router();

// GET /api/dashboard/stats
router.get("/stats", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.query as { projectId?: string };
    const where: any = projectId ? { projectId } : {};
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd    = new Date(todayStart.getTime() + 86_400_000);
    const todayStr    = now.toISOString().split("T")[0];

    const [total, openCount, closedCount, overdueCount, unclassified] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.count({ where: { ...where, status: "open" } }),
      prisma.ticket.count({ where: { ...where, status: "closed" } }),
      prisma.ticket.count({ where: { ...where, status: { in: ["open","in_progress","pending"] }, createdAt: { lt: sevenDaysAgo } } }),
      prisma.ticket.count({ where: { ...where, type: "unclassified" } }),
    ]);

    // Closed today
    const closedToday = await prisma.ticket.count({
      where: { ...where, status: "closed", closedAt: { gte: todayStart, lt: todayEnd } },
    });

    // Today's appointments
    const todayAppts = await prisma.ticket.findMany({
      where: { ...where, appointmentTime: { startsWith: todayStr } },
      select: { id: true, ticketId: true, clientName: true, villaNumber: true, appointmentTime: true, type: true, status: true },
      orderBy: { appointmentTime: "asc" },
      take: 20,
    });

    // Most overdue tickets (open > 7 days)
    const overdueTickets = await prisma.ticket.findMany({
      where: { ...where, status: { in: ["open","in_progress","pending"] }, createdAt: { lt: sevenDaysAgo } },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, ticketId: true, clientName: true, villaNumber: true, type: true, status: true, createdAt: true, assignedSupervisors: true },
    });

    // Last 7 days trend
    const days7ago = new Date(now.getTime() - 6 * 86_400_000);
    days7ago.setHours(0, 0, 0, 0);
    const recentActivity = await prisma.$queryRaw<{ day: Date; opened: bigint; closed: bigint }[]>`
      SELECT
        DATE_TRUNC('day', "createdAt") AS day,
        COUNT(*)::bigint AS opened,
        COUNT(CASE WHEN status = 'closed' AND "closedAt" >= DATE_TRUNC('day', "createdAt") THEN 1 END)::bigint AS closed
      FROM "Ticket"
      WHERE "createdAt" >= ${days7ago}
      ${projectId ? prisma.$queryRaw`AND "projectId" = ${projectId}` : prisma.$queryRaw``}
      GROUP BY 1 ORDER BY 1
    `;

    // Per supervisor summary
    const supTickets = await prisma.ticket.findMany({
      where: { ...where, assignedSupervisorId: { not: null }, status: { not: "closed" } },
      select: { assignedSupervisorId: true, status: true },
    });
    const supMap: Record<string, { open: number; inProgress: number; pending: number }> = {};
    for (const t of supTickets) {
      const sid = t.assignedSupervisorId!;
      if (!supMap[sid]) supMap[sid] = { open: 0, inProgress: 0, pending: 0 };
      if (t.status === "open")        supMap[sid].open++;
      if (t.status === "in_progress") supMap[sid].inProgress++;
      if (t.status === "pending")     supMap[sid].pending++;
    }
    const supIds = Object.keys(supMap);
    const supUsers = supIds.length
      ? await prisma.user.findMany({ where: { uid: { in: supIds } }, select: { uid: true, displayName: true, specialty: true } })
      : [];
    const supNameMap = Object.fromEntries(supUsers.map(u => [u.uid, u]));
    const bySupervisor = supIds
      .map(uid => ({ uid, name: supNameMap[uid]?.displayName ?? uid, specialty: supNameMap[uid]?.specialty ?? "", ...supMap[uid], total: supMap[uid].open + supMap[uid].inProgress + supMap[uid].pending }))
      .sort((a, b) => b.total - a.total).slice(0, 10);

    res.json({
      totals: { total, open: openCount, closed: closedCount, overdue: overdueCount, closedToday, unclassified },
      todayAppts,
      overdueTickets: overdueTickets.map(t => ({
        ...t,
        daysOpen: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86_400_000),
      })),
      trend7Days: recentActivity.map(r => ({
        day: r.day.toISOString().split("T")[0],
        opened: Number(r.opened),
        closed: Number(r.closed),
      })),
      bySupervisor,
    });
  } catch (err: any) {
    console.error("[Dashboard]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
