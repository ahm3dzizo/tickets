import { Router } from "express";
import { AppointmentStatus } from "@prisma/client";
import prisma from "../db.js";
import { AuthRequest, requireAuth, getRequesterRole } from "../auth.js";
import { getIO } from "../socket.js";
import { DEFAULT_WORK_HOURS, autoCorrectMins, type WorkHoursSettings } from "./settings.js";

const router = Router();

// ── Compute unitNumber / clientName / refNumber from relations for responses ─
function appointmentToResponse(a: {
  unit?: { unitNumber: string } | null;
  client?: { name: string } | null;
  project?: { abbreviation: string } | null;
  [key: string]: any;
}) {
  const unitNumber  = a.unit?.unitNumber || '';
  const projAbbr    = a.project?.abbreviation || '';
  return {
    ...a,
    unitNumber,
    clientName:  a.client?.name || '',
    refNumber:   projAbbr && unitNumber ? `${projAbbr}-${unitNumber}` : unitNumber,
    technicians: a.technician ? [a.technician] : [],
  };
}

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
        unit:   { select: { unitNumber: true } },
        client: { select: { name: true } },
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
      conflicts: filtered.map((a: any) => ({
        id: a.id,
        clientName:  a.client?.name || '',
        unitNumber: a.unit?.unitNumber || '',
        appointmentTime: `${a.date} ${a.time || ""}`.trim(),
        supervisors: [],
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
        unit:    { select: { unitNumber: true } },
        client:  { select: { name: true } },
        project: { select: { abbreviation: true } },
        tickets: {
          select: {
            id: true, ticketId: true, status: true, type: true, projectId: true,
            assignedSupervisorIds: true,
            unit:    { select: { unitNumber: true } },
            client:  { select: { name: true } },
            project: { select: { abbreviation: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });

    const ticketList = appts.flatMap((a: any) => {
      const apptUnitNumber = a.unit?.unitNumber || '';
      const apptClient = a.client?.name || '';
      const apptAbbr   = a.project?.abbreviation || '';
      if (a.tickets.length > 0) {
        return a.tickets.map((t: any) => ({
          ...t,
          unitNumber: t.unit?.unitNumber || apptUnitNumber,
          clientName:  t.client?.name || apptClient,
          refNumber:   t.project?.abbreviation && t.unit?.unitNumber
            ? `${t.project.abbreviation}-${t.unit.unitNumber}` : '',
          assignedSupervisors: [],
          appointmentTime:  `${a.date} ${a.time || ""}`.trim(),
          appointmentNotes: a.notes,
        }));
      }
      return [{
        id: a.id, ticketId: '',
        unitNumber:  apptUnitNumber,
        clientName:   apptClient,
        refNumber:    apptAbbr && apptUnitNumber ? `${apptAbbr}-${apptUnitNumber}` : apptUnitNumber,
        appointmentTime:  `${a.date} ${a.time || ""}`.trim(),
        appointmentNotes: a.notes,
        status: 'pending', type: a.types[0] || 'general',
        projectId: a.projectId, assignedSupervisors: [],
      }];
    });

    res.json(ticketList);
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
        unit:    { select: { unitNumber: true } },
        client:  { select: { name: true } },
        project: { select: { abbreviation: true } },
        technician: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            phoneNumber: true,
            specialty: true,
          },
        },
        workSession: {
          select: {
            id: true, status: true, technicianId: true,
            claimedAt: true, finishedAt: true, totalDurationMins: true,
            technician: { select: { id: true, name: true } },
          },
        },
        tickets: {
          select: {
            id: true,
            ticketId: true,
            clientId: true,
            description: true,
            status: true,
            type: true,
            detectedTypes: true,
            detectedSubTypeIds: true,
            assignedSupervisorIds: true,
            priority: true,
            unit:   { select: { unitNumber: true } },
            client: { select: { name: true, phone: true } },
            project: { select: { abbreviation: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });

    res.json(appointments.map((a: any) => ({
      ...appointmentToResponse(a),
      tickets: a.tickets.map((t: any) => ({
        ...t,
        unitNumber: t.unit?.unitNumber || a.unit?.unitNumber || '',
        clientName:  t.client?.name || a.client?.name || '',
        refNumber:   t.project?.abbreviation && t.unit?.unitNumber
          ? `${t.project.abbreviation}-${t.unit.unitNumber}` : '',
      })),
    })));
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
  const { projectId, unitId } = req.query as {
    projectId?: string;
    unitId?: string;
  };

  if (!projectId || !unitId) {
    res.status(400).json({ error: "projectId و unitId مطلوبان" });
    return;
  }

  try {
    const where: any = {
      projectId,
      unitId,
    };
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        unit:    { select: { unitNumber: true } },
        client:  { select: { name: true } },
        project: { select: { abbreviation: true } },
        tickets: { select: { id: true, ticketId: true, status: true, type: true } },
      },
      orderBy: [{ date: "desc" }, { time: "desc" }],
    });
    res.json(appointments.map(a => appointmentToResponse(a as any)));
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
    unitId: bodyUnitId,
    clientId,
    clientPhone,
    date,
    time,
    notes,
    supervisorIds,
    technicianId,
    technicianIds,
    types,
    ticketIds,
  } = req.body as {
    projectId: string;
    unitId?: string;
    clientId?: string;
    clientPhone?: string;
    date: string;
    time?: string;
    notes?: string;
    supervisorIds?: string[];
    technicianId?: string;
    technicianIds?: string[];
    types?: string[];
    ticketIds?: string[];
  };

  if (!projectId || !date) {
    res.status(400).json({ error: "projectId و date مطلوبان" });
    return;
  }

  try {
    // ============================================================
    // STRICT PROJECT / UNIT / CLIENT VALIDATION
    // ============================================================

    // unitId is the ONLY source of the appointment unit.
    const resolvedUnitId: string | null = bodyUnitId || null;

    // Appointment MUST have a Unit.
    if (!resolvedUnitId) {
      res.status(400).json({
        error: "unitId مطلوب ولا يمكن إنشاء موعد بدون وحدة",
        code: "UNIT_REQUIRED",
      });
      return;
    }

    // 4) Client/project consistency is validated below through ClientUnit -> Unit -> Project.
    // Client itself does NOT have projectId in Prisma schema.

    // 5) clientId and unitId MUST actually be linked
    if (clientId && resolvedUnitId) {
      const clientUnit = await prisma.clientUnit.findFirst({
        where: {
          clientId,
          unitId: resolvedUnitId,
        },
        select: {
          clientId: true,
          unitId: true,
        },
      });

      if (!clientUnit) {
        res.status(400).json({
          error: "العميل لا يرتبط بالوحدة المحددة",
          code: "CLIENT_UNIT_MISMATCH",
        });
        return;
      }
    }

    // 6) Resolve primary client from the Unit if clientId wasn't supplied
    let resolvedClientId = clientId || null;

    if (!resolvedClientId) {
      const primaryLink = await prisma.clientUnit.findFirst({
        where: {
          unitId: resolvedUnitId,
          isPrimary: true,
        },
        select: {
          clientId: true,
        },
      });

      resolvedClientId = primaryLink?.clientId || null;
    }

    // ─────────────────────────────────────────────────────────────────────
    // STRICT PROJECT CONSISTENCY VALIDATION
    // projectId, unitId and clientId MUST belong to the same project.
    // ─────────────────────────────────────────────────────────────────────

    // 1. Unit must belong to the requested project
    if (resolvedUnitId) {
      const unitCheck = await prisma.unit.findUnique({
        where: { id: resolvedUnitId },
        select: {
          id: true,
          unitNumber: true,
          projectId: true,
        },
      });

      if (!unitCheck) {
        res.status(400).json({
          error: "الوحدة غير موجودة",
          code: "UNIT_NOT_FOUND",
        });
        return;
      }

      if (unitCheck.projectId !== projectId) {
        res.status(400).json({
          error: "لا يمكن إنشاء الموعد: الوحدة تابعة لمشروع مختلف",
          code: "UNIT_PROJECT_MISMATCH",
        });
        return;
      }
    }

    // 2. Client must be linked to a unit in the requested project
    if (resolvedClientId) {
      const clientUnits = await prisma.clientUnit.findMany({
        where: {
          clientId: resolvedClientId,
        },
        select: {
          unit: {
            select: {
              id: true,
              unitNumber: true,
              projectId: true,
            },
          },
        },
      });

      const clientBelongsToProject = clientUnits.some(
        (cu) => cu.unit && cu.unit.projectId === projectId
      );

      if (!clientBelongsToProject) {
        res.status(400).json({
          error: "لا يمكن إنشاء الموعد: العميل غير مرتبط بهذا المشروع",
          code: "CLIENT_PROJECT_MISMATCH",
        });
        return;
      }

      // 3. If both client and unit are supplied,
      //    the client must actually belong to that exact unit.
      if (resolvedUnitId) {
        const clientBelongsToUnit = clientUnits.some(
          (cu) => cu.unit && cu.unit.id === resolvedUnitId
        );

        if (!clientBelongsToUnit) {
          res.status(400).json({
            error: "لا يمكن إنشاء الموعد: العميل غير مرتبط بهذه الوحدة",
            code: "CLIENT_UNIT_MISMATCH",
          });
          return;
        }
      }
    }

    let finalTime = time || null;
    if (finalTime) {
      const check = await validateAndCorrectAppointmentTime(projectId, finalTime);
      if (check.error) {
        res.status(400).json({ error: check.error });
        return;
      }
      finalTime = check.time || finalTime;
    }

    const apptInclude = {
      technician: { select: { id: true, name: true, employeeId: true, specialty: true, phoneNumber: true } },
      unit:       { select: { id: true, unitNumber: true } },
      client:     { select: { id: true, name: true, phone: true } },
      project:    { select: { id: true, abbreviation: true } },
      tickets:    { select: { id: true, ticketId: true, status: true, type: true } },
    };

    let appointment = await prisma.appointment.findFirst({
      where: resolvedUnitId ? { projectId, unitId: resolvedUnitId, date } : { projectId, date },
    });

    if (appointment) {
      const updatedTypes   = Array.from(new Set([...(appointment.types as string[] || []), ...(types || [])]));
      const updatedSupIds  = Array.from(new Set([...(appointment.supervisorIds as string[] || []), ...(supervisorIds || [])]));

      appointment = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          time: finalTime || appointment.time,
          notes: notes ? (appointment.notes ? `${appointment.notes}\n${notes}` : notes) : appointment.notes,
          types: updatedTypes,
          supervisorIds: updatedSupIds,
          technicianId: technicianId !== undefined ? (technicianId || null) : appointment.technicianId,
          technicianIds: technicianIds !== undefined ? technicianIds : appointment.technicianIds,
          clientPhone: clientPhone || appointment.clientPhone,
          ...(resolvedClientId && !appointment.clientId ? { clientId: resolvedClientId } : {}),
        },
        include: apptInclude,
      });
    } else {
      appointment = await prisma.appointment.create({
        data: {
          projectId,
          unitId: resolvedUnitId,
          clientId: resolvedClientId,
          clientPhone: clientPhone || null,
          date,
          time: finalTime || null,
          notes: notes || null,
          supervisorIds: supervisorIds || [],
          technicianId: technicianId || null,
          technicianIds: technicianIds || (technicianId ? [technicianId] : []),
          types: types || [],
        },
        include: apptInclude,
      });
    }

    // ============================================================
    // STRICT TICKET PROJECT / UNIT VALIDATION
    // ============================================================

    if (ticketIds && ticketIds.length > 0) {
      const uniqueTicketIds = Array.from(new Set(ticketIds));

      const tickets = await prisma.ticket.findMany({
        where: {
          id: {
            in: uniqueTicketIds,
          },
        },
        select: {
          id: true,
          status: true,
          projectId: true,
          unitId: true,
        },
      });

      // Every requested ticket must exist
      if (tickets.length !== uniqueTicketIds.length) {
        const foundIds = new Set(tickets.map(t => t.id));
        const missingTicketIds = uniqueTicketIds.filter(
          id => !foundIds.has(id)
        );

        res.status(400).json({
          error: "يوجد تذاكر غير موجودة",
          code: "TICKET_NOT_FOUND",
          ticketIds: missingTicketIds,
        });
        return;
      }

      // Every ticket MUST belong to the appointment project
      const wrongProjectTickets = tickets.filter(
        t => t.projectId !== projectId
      );

      if (wrongProjectTickets.length > 0) {
        res.status(400).json({
          error: "يوجد تذاكر لا تتبع المشروع المحدد",
          code: "TICKET_PROJECT_MISMATCH",
          ticketIds: wrongProjectTickets.map(t => t.id),
        });
        return;
      }

      // Every ticket with a unit MUST belong to the appointment unit
      const wrongUnitTickets = tickets.filter(
        t => t.unitId && t.unitId !== resolvedUnitId
      );

      if (wrongUnitTickets.length > 0) {
        res.status(400).json({
          error: "يوجد تذاكر لا تتبع الوحدة المحددة",
          code: "TICKET_UNIT_MISMATCH",
          ticketIds: wrongUnitTickets.map(t => t.id),
        });
        return;
      }

      // Safe to link tickets now
      await Promise.all(
        tickets.map((t) =>
          prisma.ticket.update({
            where: {
              id: t.id,
            },
            data: {
              appointmentId: appointment.id,
              ...(t.status !== "closed"
                ? { status: "pending" }
                : {}),
            },
          })
        )
      );
    }

    const enriched = appointmentToResponse(appointment as any);
    getIO()?.emit("appointment:created", enriched);
    res.json(enriched);
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
        unit:      { select: { id: true, unitNumber: true } },
        client:    { select: { id: true, name: true, phone: true } },
        project:   { select: { id: true, abbreviation: true } },
        technician: { select: { id: true, name: true, employeeId: true, specialty: true, phoneNumber: true } },
        tickets: { select: { id: true, ticketId: true, status: true, type: true, detectedTypes: true, assignedSupervisorIds: true } },
      },
    });
    if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
    res.json(appointmentToResponse(appointment as any));
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
    technicianId,
    technicianIds,
    types,
    clientPhone,
    status
  } = req.body as {
    date: string;
    time?: string;
    notes?: string;
    supervisorIds?: string[];
    technicianId?: string | null;
    technicianIds?: string[];
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
        ...(technicianId !== undefined ? { technicianId: technicianId || null } : {}),
        ...(technicianIds !== undefined ? { technicianIds } : {}),
        types: types || [],
        ...(clientPhone ? { clientPhone } : {}),
        ...(status ? { status: status as AppointmentStatus } : {}),
      } as any,
      include: {
        unit:      { select: { unitNumber: true } },
        client:    { select: { name: true } },
        project:   { select: { abbreviation: true } },
        technician: { select: { id: true, name: true, employeeId: true, specialty: true, phoneNumber: true } },
        tickets: { select: { id: true, ticketId: true, status: true, type: true } }
      }
    });

    const enriched = appointmentToResponse(appointment as any);
    getIO()?.emit("appointment:updated", enriched);
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/appointments/:id/assign-technician ─────────────────────────────
router.patch("/:id/assign-technician", requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { technicianId, technicianIds } = req.body as {
    technicianId?: string | null;
    technicianIds?: string[];
  };

  try {
    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        technicianId: technicianId || null,
        technicianIds: technicianIds || (technicianId ? [technicianId] : []),
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
      assignedSupervisorIds: [] as string[],
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
