import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth } from "../auth.js";

const router = Router();

// GET /api/dashboard/stats
router.get("/stats", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ 
      where: { uid: req.uid },
      include: { projects: { select: { id: true } } } 
    });
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    
    const projectIds = user.projects.map(p => p.id);

    const { projectId } = req.query as { projectId?: string };
    const where: any = {};
    
    if (projectId) {
      where.projectId = projectId;
    } else if (user.role !== 'admin' && projectIds.length > 0) {
      where.projectId = { in: projectIds };
    }

    if (user.role === 'supervisor') {
      where.assignedSupervisorIds = { has: user.uid };
    }

    const ticketsWhere: any = {
      ...where,
      NOT: { description: { startsWith: 'موعد صيانة مجدول يدوياً للمشرف' } }
    };

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd    = new Date(todayStart.getTime() + 86_400_000);
    const todayStr    = now.toISOString().split("T")[0];

    function parseDateString(raw: any): Date | null {
      if (!raw) return null;
      const str = String(raw).trim();
      const parts = str.split(/[-/ ]/);
      if (parts.length >= 3 && parts[0].length <= 2 && parts[2].length === 4) {
        const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        if (!isNaN(d.getTime())) return d;
      }
      const num = Number(raw);
      if (!isNaN(num) && num > 1000) {
        const d = new Date((num - 25569) * 86400 * 1000);
        if (!isNaN(d.getTime())) return d;
      }
      const d = new Date(str);
      return !isNaN(d.getTime()) ? d : null;
    }

    const activeTickets = await prisma.ticket.findMany({
      where: { ...ticketsWhere, status: { in: ["open", "in_progress", "pending", "waiting"] } },
      select: { id: true, ticketId: true, clientName: true, villaNumber: true, type: true, status: true, createdAt: true, assignedSupervisors: true, issuedAt: true, appointmentTime: true },
    });

    let overdueCount = 0;
    const overdueList: any[] = [];
    const apptsList: any[] = [];
    const nowMs = now.getTime();
    const todayStartMs = todayStart.getTime();

    for (const t of activeTickets) {
      // Overdue logic
      let openDate = new Date(t.createdAt);
      if (t.issuedAt) {
        const parsed = parseDateString(t.issuedAt);
        if (parsed) openDate = parsed;
      }
      const daysOpen = Math.floor((nowMs - openDate.getTime()) / 86_400_000);
      if (daysOpen > 6) {
        overdueCount++;
        overdueList.push({ ...t, daysOpen });
      }
    }

    overdueList.sort((a, b) => b.daysOpen - a.daysOpen);
    const overdueTickets = overdueList.slice(0, 10);

    // Fetch upcoming appointments from Appointment table
    const apptWhere: any = { date: { gte: todayStr } };
    if (projectId) {
      apptWhere.projectId = projectId;
    } else if (user.role !== 'admin' && projectIds.length > 0) {
      apptWhere.projectId = { in: projectIds };
    }
    if (user.role === 'supervisor') {
      apptWhere.supervisorIds = { has: user.uid };
    }

    const rawAppts = await prisma.appointment.findMany({
      where: apptWhere,
      select: { id: true, clientName: true, villaNumber: true, date: true, time: true, types: true, projectId: true },
      orderBy: { date: 'asc' },
      take: 20,
    });

    const todayAppts = rawAppts.map(a => ({
      id: a.id,
      ticketId: '',
      clientName: a.clientName,
      villaNumber: a.villaNumber,
      appointmentTime: `${a.date}${a.time ? ' ' + a.time : ''}`,
      type: (a.types && a.types[0]) || 'general',
      status: 'pending',
      projectId: a.projectId,
    }));

    const [total, openCount, closedCount, unclassified] = await Promise.all([
      prisma.ticket.count({ where: ticketsWhere }),
      prisma.ticket.count({ where: { ...ticketsWhere, status: "open" } }),
      prisma.ticket.count({ where: { ...ticketsWhere, status: "closed" } }),
      prisma.ticket.count({ where: { ...ticketsWhere, type: "unclassified" } }),
    ]);

    const closedToday = await prisma.ticket.count({
      where: { ...ticketsWhere, status: "closed", closedAt: { gte: todayStart, lt: todayEnd } },
    });

    // Last 7 days trend — pure ORM to avoid raw SQL enum issues
    const days7ago = new Date(now.getTime() - 6 * 86_400_000);
    days7ago.setHours(0, 0, 0, 0);
    const tickets7days = await prisma.ticket.findMany({
      where: { ...ticketsWhere, createdAt: { gte: days7ago } },
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
      where: { ...ticketsWhere, assignedSupervisorId: { not: null }, status: { not: "closed" } },
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
