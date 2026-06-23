import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth } from "../auth.js";
import { getIO } from "../socket.js";

const router = Router();

// ─── GET /api/appointments/conflicts ──────────────────────────────────────────
// يفحص التعارضات لمجموعة من المشرفين في نطاق تواريخ محدد
router.get("/conflicts", requireAuth, async (req: AuthRequest, res) => {
  const { supervisorIds, startDate, endDate, excludeTicketId } = req.query as {
    supervisorIds?: string;
    startDate?: string;
    endDate?: string;
    excludeTicketId?: string;
  };

  if (!supervisorIds || !startDate || !endDate) {
    res.status(400).json({ error: "supervisorIds, startDate, endDate مطلوبة" });
    return;
  }

  const ids = supervisorIds.split(",").filter(Boolean);
  if (ids.length === 0) {
    res.json({ conflicts: [], clientConflicts: [] });
    return;
  }

  try {
    // ── تعارضات المشرفين: تذاكر للمشرفين أنفسهم في نفس النطاق ──
    const where: any = {
      assignedSupervisorIds: { hasSome: ids },
      appointmentTime: { not: null },
      status: { notIn: ["closed", "completed", "out_of_scope"] },
    };
    if (excludeTicketId) {
      where.id = { not: excludeTicketId };
    }

    const ticketsInRange = await prisma.ticket.findMany({
      where,
      select: {
        id: true,
        ticketId: true,
        clientName: true,
        villaNumber: true,
        appointmentTime: true,
        assignedSupervisorIds: true,
        assignedSupervisors: true,
        status: true,
      },
    });

    // فلترة التذاكر التي تقع في النطاق المطلوب
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const conflicts = ticketsInRange.filter((t) => {
      if (!t.appointmentTime) return false;
      const apptDate = new Date(t.appointmentTime.split(" ")[0]);
      return apptDate >= start && apptDate <= end;
    });

    res.json({
      conflicts: conflicts.map((t) => ({
        ticketId: t.ticketId,
        id: t.id,
        clientName: t.clientName,
        villaNumber: t.villaNumber,
        appointmentTime: t.appointmentTime,
        supervisors: Array.isArray(t.assignedSupervisors)
          ? (t.assignedSupervisors as any[]).filter((s: any) =>
              ids.includes(s.id)
            )
          : [],
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/appointments/upcoming ──────────────────────────────────────────
// مواعيد المشرف القادمة (7 أيام)
router.get("/upcoming", requireAuth, async (req: AuthRequest, res) => {
  const { supervisorId, days = "7" } = req.query as {
    supervisorId?: string;
    days?: string;
  };

  const uid = supervisorId || req.uid!;
  const numDays = Math.min(parseInt(days, 10) || 7, 30);
  const todayStr = new Date().toISOString().split("T")[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + numDays);
  const endStr = endDate.toISOString().split("T")[0];

  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        assignedSupervisorIds: { has: uid },
        appointmentTime: { not: null },
        status: { notIn: ["closed", "completed", "out_of_scope"] },
      },
      select: {
        id: true,
        ticketId: true,
        clientName: true,
        villaNumber: true,
        appointmentTime: true,
        appointmentNotes: true,
        status: true,
        type: true,
        projectId: true,
        assignedSupervisors: true,
      },
      orderBy: { appointmentTime: "asc" },
    });

    // فلترة حسب النطاق الزمني
    const filtered = tickets.filter((t) => {
      if (!t.appointmentTime) return false;
      const d = t.appointmentTime.split(" ")[0];
      return d >= todayStr && d <= endStr;
    });

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/appointments/calendar ──────────────────────────────────────────
// كل المواعيد في نطاق معين (للـ Calendar view)
router.get("/calendar", requireAuth, async (req: AuthRequest, res) => {
  const { from, to, supervisorId, projectId, projectIds } = req.query as {
    from?: string;
    to?: string;
    supervisorId?: string;
    projectId?: string;
    projectIds?: string;
  };

  if (!from || !to) {
    res.status(400).json({ error: "from و to مطلوبان" });
    return;
  }

  const where: any = {
    appointmentTime: { not: null },
  };

  if (supervisorId) where.assignedSupervisorIds = { has: supervisorId };
  if (projectId) where.projectId = projectId;
  if (projectIds && !projectId) {
    const ids = projectIds.split(',').filter(Boolean);
    if (ids.length > 0) where.projectId = { in: ids };
  }

  try {
    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        id: true,
        ticketId: true,
        clientName: true,
        villaNumber: true,
        appointmentTime: true,
        appointmentNotes: true,
        status: true,
        type: true,
        detectedTypes: true,
        projectId: true,
        assignedSupervisorIds: true,
        assignedSupervisors: true,
        priority: true,
        client: { select: { phone: true } },
      },
      orderBy: { appointmentTime: "asc" },
    });

    // فلترة حسب النطاق
    const filtered = tickets.filter((t) => {
      if (!t.appointmentTime) return false;
      const d = t.appointmentTime.split(" ")[0];
      return d >= from && d <= to;
    });

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/appointments/push-subscribe ────────────────────────────────────
// حفظ Push Subscription للمستخدم
router.post("/push-subscribe", requireAuth, async (req: AuthRequest, res) => {
  const { subscription } = req.body as { subscription: any };
  if (!subscription || !subscription.endpoint) {
    res.status(400).json({ error: "subscription مطلوب" });
    return;
  }

  try {
    const uid = req.uid!;
    // حفظ في SystemSetting مؤقتاً (key = pushSubs_<uid>)
    await prisma.systemSetting.upsert({
      where: { key: `pushSubs_${uid}` },
      create: { key: `pushSubs_${uid}`, value: subscription },
      update: { value: subscription },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/appointments/push-unsubscribe ────────────────────────────────
router.delete("/push-unsubscribe", requireAuth, async (req: AuthRequest, res) => {
  try {
    await prisma.systemSetting.deleteMany({
      where: { key: `pushSubs_${req.uid}` },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
