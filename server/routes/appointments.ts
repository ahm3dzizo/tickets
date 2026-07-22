import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth, requireAdmin, getRequesterRole } from "../auth.js";
import { getIO } from "../socket.js";

const router = Router();

// ─── GET /api/appointments/conflicts ──────────────────────────────────────────
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
    const role = await getRequesterRole(req.uid!);
    const currentUser = await prisma.user.findUnique({
      where: { uid: req.uid! },
      select: { projects: { select: { id: true } } }
    });
    const userProjectIds = currentUser?.projects.map(p => p.id) || [];

    const where: any = {
      supervisorIds: { hasSome: ids },
      date: { gte: startDate, lte: endDate },
    };

    if (role !== "admin") {
      where.projectId = { in: userProjectIds.length ? userProjectIds : ["__none__"] };
    }

    const appts = await prisma.appointment.findMany({
      where,
      include: {
        tickets: {
          where: { status: { notIn: ["closed", "completed", "out_of_scope"] } },
          select: { id: true, ticketId: true, status: true },
        },
      },
    });

    // Filter out excluded ticket
    const filtered = excludeTicketId
      ? appts.filter((a) => !a.tickets.some((t) => t.id === excludeTicketId))
      : appts;

    res.json({
      conflicts: filtered.map((a) => ({
        id: a.id,
        clientName: a.clientName,
        villaNumber: a.villaNumber,
        appointmentTime: `${a.date} ${a.time || ""}`.trim(),
        supervisors: Array.isArray(a.supervisors)
          ? (a.supervisors as any[]).filter((s: any) => ids.includes(s.id))
          : [],
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/appointments/upcoming ──────────────────────────────────────────
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
    const role = await getRequesterRole(req.uid!);
    const currentUser = await prisma.user.findUnique({
      where: { uid: req.uid! },
      select: { projects: { select: { id: true } } }
    });
    const userProjectIds = currentUser?.projects.map(p => p.id) || [];

    const where: any = {
      supervisorIds: { has: uid },
      date: { gte: todayStr, lte: endStr },
    };

    if (role !== "admin") {
      where.projectId = { in: userProjectIds.length ? userProjectIds : ["__none__"] };
    }

    const appts = await prisma.appointment.findMany({
      where,
      include: {
        tickets: {
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
        },
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });

    // Return as flat ticket list for backward compat with existing callers
    const tickets = appts.flatMap((a) =>
      a.tickets.length > 0
        ? a.tickets
        : [
            {
              id: a.id,
              ticketId: "",
              clientName: a.clientName,
              villaNumber: a.villaNumber,
              appointmentTime: `${a.date} ${a.time || ""}`.trim(),
              appointmentNotes: a.notes,
              status: "pending",
              type: a.types[0] || "general",
              projectId: a.projectId,
              assignedSupervisors: a.supervisors,
            },
          ]
    );

    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/appointments/calendar ──────────────────────────────────────────
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
    date: { gte: from, lte: to },
  };

  if (supervisorId) where.supervisorIds = { has: supervisorId };
  if (projectId) where.projectId = projectId;
  if (projectIds && !projectId) {
    const ids = projectIds.split(",").filter(Boolean);
    if (ids.length > 0) where.projectId = { in: ids };
  }

  try {
    const role = await getRequesterRole(req.uid!);
    const currentUser = await prisma.user.findUnique({
      where: { uid: req.uid! },
      select: { projects: { select: { id: true } } }
    });
    const userProjectIds = currentUser?.projects.map(p => p.id) || [];

    if (role !== "admin") {
      if (where.projectId && typeof where.projectId === 'string') {
        if (!userProjectIds.includes(where.projectId)) where.projectId = { in: [] };
      } else if (where.projectId && where.projectId.in) {
        where.projectId.in = where.projectId.in.filter((id: string) => userProjectIds.includes(id));
        if (where.projectId.in.length === 0) where.projectId.in = ["__none__"];
      } else {
        where.projectId = { in: userProjectIds.length ? userProjectIds : ["__none__"] };
      }
    }
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        tickets: {
          select: {
            id: true,
            ticketId: true,
            clientId: true,
            clientName: true,
            villaNumber: true,
            description: true,
            status: true,
            type: true,
            detectedTypes: true,
            detectedSubTypeIds: true,
            assignedSupervisorIds: true,
            assignedSupervisors: true,
            priority: true,
            appointmentTime: true,
            appointmentNotes: true,
            client: { select: { phone: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });

    res.json(appointments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/appointments/by-client/:clientId ───────────────────────────────
router.get("/by-client/:clientId", requireAuth, async (req: AuthRequest, res) => {
  const { clientId } = req.params;
  try {
    const appointments = await prisma.appointment.findMany({
      where: { clientId },
      include: {
        tickets: { select: { id: true, ticketId: true, status: true, type: true } },
      },
      orderBy: [{ date: "desc" }, { time: "desc" }],
    });
    res.json(appointments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/appointments/by-unit ───────────────────────────────────────────
router.get("/by-unit", requireAuth, async (req: AuthRequest, res) => {
  const { projectId, villaNumber } = req.query as { projectId?: string; villaNumber?: string };
  if (!projectId || !villaNumber) {
    res.status(400).json({ error: "projectId و villaNumber مطلوبان" });
    return;
  }
  try {
    const appointments = await prisma.appointment.findMany({
      where: { projectId, villaNumber },
      include: {
        tickets: { select: { id: true, ticketId: true, status: true, type: true } },
      },
      orderBy: [{ date: "desc" }, { time: "desc" }],
    });
    res.json(appointments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/appointments/push-subscribe ────────────────────────────────────
router.post("/push-subscribe", requireAuth, async (req: AuthRequest, res) => {
  const { subscription } = req.body as { subscription: any };
  if (!subscription || !subscription.endpoint) {
    res.status(400).json({ error: "subscription مطلوب" });
    return;
  }

  try {
    const uid = req.uid!;
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

// ─── POST /api/appointments/migrate ──────────────────────────────────────────
router.post("/migrate", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const migrated = await migrateAppointments();
    res.json({ ok: true, created: migrated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/appointments ───────────────────────────────────────────────────
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const {
    projectId,
    villaNumber,
    clientId,
    clientName,
    clientPhone,
    date,
    time,
    notes,
    supervisorIds,
    supervisors,
    types,
    ticketIds,
  } = req.body as {
    projectId: string;
    villaNumber: string;
    clientId?: string;
    clientName: string;
    clientPhone?: string;
    date: string;
    time?: string;
    notes?: string;
    supervisorIds?: string[];
    supervisors?: any[];
    types?: string[];
    ticketIds?: string[];
  };

  if (!projectId || !villaNumber || !date || !clientName) {
    res.status(400).json({ error: "projectId, villaNumber, date, clientName مطلوبة" });
    return;
  }

  try {
    const appointment = await prisma.appointment.create({
      data: {
        projectId,
        villaNumber,
        clientId: clientId || null,
        clientName,
        clientPhone: clientPhone || null,
        date,
        time: time || null,
        notes: notes || null,
        supervisorIds: supervisorIds || [],
        supervisors: supervisors || [],
        types: types || [],
      },
    });

    // Sync linked tickets
    if (ticketIds && ticketIds.length > 0) {
      const appointmentTime = `${date} ${time || ""}`.trim();

      // Fetch tickets to conditionally update status
      const tickets = await prisma.ticket.findMany({
        where: { id: { in: ticketIds } },
        select: { id: true, status: true },
      });

      await Promise.all(
        tickets.map((t) =>
          prisma.ticket.update({
            where: { id: t.id },
            data: {
              appointmentId: appointment.id,
              appointmentTime,
              appointmentNotes: notes || null,
              appointmentAwaitingReply: false,
              isDirectAppointment: true,
              assignedSupervisorIds: supervisorIds || [],
              assignedSupervisorId: supervisorIds?.[0] || null,
              assignedSupervisors: supervisors || [],
              ...(t.status !== "closed" ? { status: "pending" } : {}),
            },
          })
        )
      );
    }

    getIO()?.emit("appointment:created", appointment);
    res.json(appointment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/appointments/:id ────────────────────────────────────────────────
router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { date, time, notes, supervisorIds, supervisors, types, clientPhone } = req.body as {
    date: string;
    time?: string;
    notes?: string;
    supervisorIds?: string[];
    supervisors?: any[];
    types?: string[];
    clientPhone?: string;
  };

  try {
    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        date,
        time: time || null,
        notes: notes || null,
        supervisorIds: supervisorIds || [],
        supervisors: supervisors || [],
        types: types || [],
        ...(clientPhone ? { clientPhone } : {}),
      },
    });

    // Sync all linked tickets
    const appointmentTime = `${date} ${time || ""}`.trim();
    await prisma.ticket.updateMany({
      where: { appointmentId: id },
      data: {
        appointmentTime,
        appointmentNotes: notes || null,
        assignedSupervisorIds: supervisorIds || [],
        assignedSupervisorId: supervisorIds?.[0] || null,
        assignedSupervisors: supervisors || [],
      },
    });

    getIO()?.emit("appointment:updated", appointment);
    res.json(appointment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/appointments/:id ─────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    // Fetch linked tickets to preserve non-pending statuses
    const linked = await prisma.ticket.findMany({
      where: { appointmentId: id },
      select: { id: true, status: true },
    });

    const pendingIds = linked.filter(t => t.status === "pending").map(t => t.id);
    const otherIds   = linked.filter(t => t.status !== "pending").map(t => t.id);

    const appointmentClear = {
      appointmentId: null as null,
      appointmentTime: null as null,
      appointmentNotes: null as null,
      appointmentAwaitingReply: false,
      isDirectAppointment: false,
      assignedSupervisorId: null as null,
      assignedSupervisorIds: [] as string[],
      assignedSupervisors: [] as any[],
    };

    if (pendingIds.length > 0) {
      await prisma.ticket.updateMany({
        where: { id: { in: pendingIds } },
        data: { ...appointmentClear, status: "open" },
      });
    }
    if (otherIds.length > 0) {
      await prisma.ticket.updateMany({
        where: { id: { in: otherIds } },
        data: appointmentClear,
      });
    }

    await prisma.appointment.delete({ where: { id } });
    getIO()?.emit("appointment:deleted", { id });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export async function migrateAppointments(): Promise<number> {
  // Find tickets with appointmentTime but no appointmentId
  const tickets = await prisma.ticket.findMany({
    where: {
      appointmentTime: { not: null },
      appointmentId: null,
    },
    select: {
      id: true,
      projectId: true,
      villaNumber: true,
      clientId: true,
      clientName: true,
      appointmentTime: true,
      appointmentNotes: true,
      assignedSupervisorIds: true,
      assignedSupervisors: true,
      type: true,
      detectedTypes: true,
      client: { select: { phone: true } },
    },
  });

  if (tickets.length === 0) return 0;

  // Group by (projectId, villaNumber, date)
  const groups = new Map<string, typeof tickets>();
  for (const t of tickets) {
    const date = (t.appointmentTime || "").split(" ")[0];
    const key = `${t.projectId}|${t.villaNumber}|${date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  let created = 0;
  for (const [, group] of groups) {
    const first = group[0];
    const apptTime = first.appointmentTime || "";
    const [date, time] = apptTime.split(" ");

    const types = new Set<string>();
    for (const t of group) {
      if (t.type) types.add(t.type);
      if (t.detectedTypes) t.detectedTypes.forEach((dt) => types.add(dt));
    }

    const supIds: string[] = first.assignedSupervisorIds || [];

    const appointment = await prisma.appointment.create({
      data: {
        projectId: first.projectId,
        villaNumber: first.villaNumber,
        clientId: first.clientId || null,
        clientName: first.clientName,
        clientPhone: first.client?.phone || null,
        date,
        time: time || null,
        notes: first.appointmentNotes || null,
        supervisorIds: supIds,
        supervisors: (first.assignedSupervisors as any) || [],
        types: Array.from(types),
      },
    });

    // Link tickets
    await prisma.ticket.updateMany({
      where: { id: { in: group.map((t) => t.id) } },
      data: { appointmentId: appointment.id },
    });

    created++;
  }

  return created;
}

export default router;
