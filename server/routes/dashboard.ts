import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth } from "../auth.js";

const router = Router();

// GET /api/dashboard/stats
router.get("/stats", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { uid: req.uid } });
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { projectId } = req.query as { projectId?: string };
    const where: any = {};
    
    if (projectId) {
      where.projectId = projectId;
    } else if (user.role !== 'admin' && user.projectIds && user.projectIds.length > 0) {
      where.projectId = { in: user.projectIds };
    }

    if (user.role === 'supervisor') {
      where.assignedSupervisorIds = { has: user.uid };
    }

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

    // Upcoming appointments (today and future)
    const todayAppts = await prisma.ticket.findMany({
      where: { ...where, appointmentTime: { gte: todayStr } },
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

    // Last 7 days trend — pure ORM to avoid raw SQL enum issues
    const days7ago = new Date(now.getTime() - 6 * 86_400_000);
    days7ago.setHours(0, 0, 0, 0);
    const tickets7days = await prisma.ticket.findMany({
      where: { ...where, createdAt: { gte: days7ago } },
      select: { createdAt: true, status: true },
    });
    const dayMap: Record<string, { opened: number; closed: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(days7ago.getTime() + i * 86_400_000);
      dayMap[d.toISOString().split("T")[0]] = { opened: 0, closed: 0 };
    }
    for (const t of tickets7days) {
      const day = new Date(t.createdAt).toISOString().split("T")[0];
      if (!dayMap[day]) dayMap[day] = { opened: 0, closed: 0 };
      dayMap[day].opened++;
      if (t.status === "closed") dayMap[day].closed++;
    }
    const recentActivity = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, opened: v.opened, closed: v.closed }));

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
      trend7Days: recentActivity,
      bySupervisor,
    });
  } catch (err: any) {
    console.error("[Dashboard]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
