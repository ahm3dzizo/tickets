import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth, getRequesterRole } from "../auth.js";
import { getIO } from "../socket.js";
import { DEFAULT_WORK_HOURS, autoCorrectMins, type WorkHoursSettings } from "./settings.js";

const router = Router();

async function validateAndCorrectAppointmentTime(
  projectId: string | null | undefined,
  timeStr: string | null | undefined
): Promise<{ time: string | null; error?: string }> {
  if (!timeStr) return { time: null };

  const timeClean = timeStr.trim();
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeClean);
  if (!timeMatch) return { time: timeClean };

  const whSetting = await prisma.systemSetting.findUnique({ where: { key: "work_hours" } });
  const whAll = (whSetting?.value as unknown as WorkHoursSettings) || DEFAULT_WORK_HOURS;
  const cfg = (projectId && whAll.byProject?.[projectId]) || whAll.default || DEFAULT_WORK_HOURS.default;

  if (!cfg?.enabled) {
    return { time: timeClean };
  }

  const rawMins = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
  const correctedMins = autoCorrectMins(rawMins, cfg);

  if (correctedMins === null) {
    const periods: Array<{ start: string; end: string }> = [];
    if (cfg.hasMorning !== false && cfg.morning) periods.push(cfg.morning);
    if (cfg.hasAfternoon !== false && cfg.afternoon) periods.push(cfg.afternoon);
    const rangeStr = periods.length > 0
      ? periods.map(p => `${p.start}–${p.end}`).join(" و ")
      : "غير محددة";
    return {
      time: timeClean,
      error: `الموعد خارج أوقات الدوام المحددة — المواعيد المتاحة: ${rangeStr}`
    };
  }

  const h = Math.floor(correctedMins / 60);
  const m = correctedMins % 60;
  const corrected = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { time: corrected };
}

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
        ? a.tickets.map((t) => ({ ...t, appointmentTime: `${a.date} ${a.time || ""}`.trim(), appointmentNotes: a.notes }))
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
        technician: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            phoneNumber: true,
            specialty: true,
          },
        },
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
    technicianId,
    technicianIds,
    technicians,
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
    technicianId?: string;
    technicianIds?: string[];
    technicians?: any[];
    types?: string[];
    ticketIds?: string[];
  };

  if (!projectId || !villaNumber || !date || !clientName) {
    res.status(400).json({ error: "projectId, villaNumber, date, clientName مطلوبة" });
    return;
  }

  try {
    let finalTime = time || null;
    if (finalTime) {
      const check = await validateAndCorrectAppointmentTime(projectId, finalTime);
      if (check.error) {
        res.status(400).json({ error: check.error });
        return;
      }
      finalTime = check.time || finalTime;
    }

    let appointment = await prisma.appointment.findFirst({
      where: { projectId, villaNumber, date }
    });

    if (appointment) {
      const updatedTypes = Array.from(new Set([...(appointment.types as string[] || []), ...(types || [])]));
      const updatedSupIds = Array.from(new Set([...(appointment.supervisorIds as string[] || []), ...(supervisorIds || [])]));
      
      const existingSups = (appointment.supervisors as any[]) || [];
      const newSups = (supervisors as any[]) || [];
      const mergedSupsMap = new Map();
      existingSups.forEach(s => mergedSupsMap.set(s.id, s));
      newSups.forEach(s => mergedSupsMap.set(s.id, s));
      const updatedSups = Array.from(mergedSupsMap.values());

      appointment = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          time: finalTime || appointment.time,
          notes: notes ? (appointment.notes ? `${appointment.notes}\n${notes}` : notes) : appointment.notes,
          types: updatedTypes,
          supervisorIds: updatedSupIds,
          supervisors: updatedSups,
          technicianId: technicianId !== undefined ? (technicianId || null) : appointment.technicianId,
          technicianIds: technicianIds !== undefined ? technicianIds : appointment.technicianIds,
          technicians: technicians !== undefined ? technicians : appointment.technicians,
          clientPhone: clientPhone || appointment.clientPhone,
        },
        include: {
          technician: { select: { id: true, name: true, employeeId: true, specialty: true, phoneNumber: true } },
          tickets: { select: { id: true, ticketId: true, status: true, type: true } }
        }
      });
    } else {
      appointment = await prisma.appointment.create({
        data: {
          projectId,
          villaNumber,
          clientId: clientId || null,
          clientName,
          clientPhone: clientPhone || null,
          date,
          time: finalTime || null,
          notes: notes || null,
          supervisorIds: supervisorIds || [],
          supervisors: supervisors || [],
          technicianId: technicianId || null,
          technicianIds: technicianIds || (technicianId ? [technicianId] : []),
          technicians: technicians || [],
          types: types || [],
        },
        include: {
          technician: { select: { id: true, name: true, employeeId: true, specialty: true, phoneNumber: true } },
          tickets: { select: { id: true, ticketId: true, status: true, type: true } }
        }
      });
    }

    // Sync linked tickets
    if (ticketIds && ticketIds.length > 0) {
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

// ─── GET /api/appointments/:id ────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        technician: { select: { id: true, name: true, employeeId: true, specialty: true, phoneNumber: true } },
        tickets: { select: { id: true, ticketId: true, status: true, type: true, detectedTypes: true, assignedSupervisorIds: true, assignedSupervisors: true } },
      },
    });
    if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
    res.json(appointment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/appointments/:id ────────────────────────────────────────────────
router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const {
    date,
    time,
    notes,
    supervisorIds,
    supervisors,
    technicianId,
    technicianIds,
    technicians,
    types,
    clientPhone,
    status
  } = req.body as {
    date: string;
    time?: string;
    notes?: string;
    supervisorIds?: string[];
    supervisors?: any[];
    technicianId?: string | null;
    technicianIds?: string[];
    technicians?: any[];
    types?: string[];
    clientPhone?: string;
    status?: string;
  };

  try {
    let finalTime = time;
    if (finalTime) {
      const existing = await prisma.appointment.findUnique({
        where: { id },
        select: { projectId: true }
      });
      const check = await validateAndCorrectAppointmentTime(existing?.projectId, finalTime);
      if (check.error) {
        res.status(400).json({ error: check.error });
        return;
      }
      finalTime = check.time || finalTime;
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        date,
        time: finalTime !== undefined ? (finalTime || null) : undefined,
        notes: notes || null,
        supervisorIds: supervisorIds || [],
        supervisors: supervisors || [],
        ...(technicianId !== undefined ? { technicianId: technicianId || null } : {}),
        ...(technicianIds !== undefined ? { technicianIds } : {}),
        ...(technicians !== undefined ? { technicians } : {}),
        types: types || [],
        ...(clientPhone ? { clientPhone } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        technician: { select: { id: true, name: true, employeeId: true, specialty: true, phoneNumber: true } },
        tickets: { select: { id: true, ticketId: true, status: true, type: true } }
      }
    });

    // No ticket field sync needed — appointment data is derived from the Appointment record

    getIO()?.emit("appointment:updated", appointment);
    res.json(appointment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/appointments/:id/assign-technician ─────────────────────────────
router.patch("/:id/assign-technician", requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { technicianId, technicianIds, technicians } = req.body as {
    technicianId?: string | null;
    technicianIds?: string[];
    technicians?: any[];
  };

  try {
    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        technicianId: technicianId || null,
        technicianIds: technicianIds || (technicianId ? [technicianId] : []),
        ...(technicians !== undefined ? { technicians } : {}),
      },
      include: {
        technician: { select: { id: true, name: true, employeeId: true, specialty: true, phoneNumber: true } },
        tickets: { select: { id: true, ticketId: true, status: true, type: true } }
      }
    });

    getIO()?.emit("appointment:updated", updated);
    res.json(updated);
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

export default router;
