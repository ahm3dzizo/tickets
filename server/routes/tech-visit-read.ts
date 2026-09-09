import { Router } from 'express';
import prisma from '../db.js';
import { requireTechAuth, TechAuthRequest } from './tech-auth.js';

const router = Router();
const BLOCKING_PHASES = ['claimed', 'en_route', 'arrived', 'in_progress'];
const OPEN_PHASES = [...BLOCKING_PHASES, 'paused'];

// Current visit recovery, including travel/arrival phases and paused work.
router.get('/me/active-session', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const session = await prisma.appointmentWorkSession.findFirst({
      where: {
        technicianId: req.technicianId!,
        status: { in: OPEN_PHASES },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        appointment: {
          include: {
            unit: { include: { block: true } },
            client: true,
            project: {
              select: {
                id: true,
                name: true,
                officeLat: true,
                officeLng: true,
                officeAddress: true,
                googleMapsUrl: true,
              },
            },
            tickets: {
              select: {
                id: true,
                ticketId: true,
                description: true,
                status: true,
                type: true,
                detectedTypes: true,
                priority: true,
                unit: { select: { unitNumber: true } },
                client: { select: { name: true, phone: true } },
              },
            },
          },
        },
      },
    });
    res.json(session || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/appointments', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technician = await prisma.technician.findUnique({
      where: { id: req.technicianId! },
      select: { id: true, supervisorId: true, projectId: true, specialty: true, name: true },
    });
    if (!technician) {
      res.status(404).json({ error: 'Technician not found' });
      return;
    }

    // Claimed/travelling/arrived/working visits block another claim. Paused work
    // preserves ownership but intentionally frees the technician to take another
    // visit, matching the existing operational policy.
    const activeSession = await prisma.appointmentWorkSession.findFirst({
      where: { technicianId: technician.id, status: { in: BLOCKING_PHASES } },
      select: { appointmentId: true, claimedAt: true, status: true },
      orderBy: { updatedAt: 'desc' },
    });
    const activeAppointmentId = activeSession?.appointmentId || null;

    const { from, to, date } = req.query as { from?: string; to?: string; date?: string };
    const orConditions: any[] = [
      { technicianId: technician.id },
      { technicianIds: { has: technician.id } },
    ];
    if (technician.supervisorId) {
      orConditions.push({
        AND: [
          { supervisorIds: { has: technician.supervisorId } },
          { technicianId: null },
          { technicianIds: { isEmpty: true } },
        ],
      });
    }

    const where: any = { status: { not: 'cancelled' }, OR: orConditions };
    if (technician.projectId) where.projectId = technician.projectId;
    if (date) where.date = date;
    else if (from && to) where.date = { gte: from, lte: to };

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        unit: { select: { unitNumber: true } },
        project: {
          select: { id: true, name: true, officeLat: true, officeLng: true, officeAddress: true, googleMapsUrl: true },
        },
        technician: { select: { id: true, name: true, specialty: true, phoneNumber: true } },
        workSession: {
          select: {
            id: true,
            status: true,
            technicianId: true,
            claimedAt: true,
            finishedAt: true,
            pausedAt: true,
            pauseReason: true,
            totalPausedMins: true,
            totalDurationMins: true,
            totalElapsedMins: true,
            updatedAt: true,
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
            priority: true,
            unit: { select: { unitNumber: true } },
            client: { select: { name: true, phone: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });

    const typeKeys = [...new Set(appointments.flatMap((appointment: any) => [
      ...(appointment.types || []),
      ...(appointment.tickets || []).flatMap((ticket: any) => [ticket.type, ...(ticket.detectedTypes || [])]),
    ]).filter((value: unknown): value is string => typeof value === 'string' && !!value.trim()))];
    const typeRows = typeKeys.length
      ? await prisma.ticketType.findMany({
          where: { key: { in: typeKeys } },
          select: { key: true, nameAr: true },
        })
      : [];
    const typeLabels = Object.fromEntries(typeRows.map(type => [type.key, type.nameAr]));

    const enriched = appointments.map((appointment: any) => {
      const session = appointment.workSession;
      const openSession = session && OPEN_PHASES.includes(String(session.status));
      const isClaimedByMe = Boolean(openSession && session.technicianId === technician.id);
      const isClaimedByOther = Boolean(openSession && session.technicianId !== technician.id);
      const isPausedByMe = isClaimedByMe && session.status === 'paused';
      const isCompleted = appointment.status === 'completed';
      const completedTickets = appointment.tickets?.filter((ticket: any) =>
        ['completed', 'closed', 'out_of_scope', 'absent'].includes(String(ticket.status).toLowerCase())
      ).length || 0;
      const unitNumber = appointment.unit?.unitNumber
        || appointment.tickets?.find((ticket: any) => ticket.unit?.unitNumber)?.unit?.unitNumber
        || '';
      const firstTicket = appointment.tickets?.[0];
      const clientName = firstTicket?.client?.name || '';
      const clientPhone = firstTicket?.client?.phone || appointment.clientPhone || '';
      const phase = isClaimedByMe || isClaimedByOther ? String(session.status) : null;
      const appointmentPriority = isCompleted ? 99 : (isClaimedByMe && !isPausedByMe ? 0 : isPausedByMe ? 1 : 2);

      return {
        ...appointment,
        projectName: appointment.project?.name || '',
        unitNumber,
        clientName,
        clientPhone,
        phase,
        isClaimedByMe,
        isClaimedByOther,
        isPausedByMe,
        isCompleted,
        activeAppointmentId,
        claimBlocked: Boolean(activeAppointmentId && activeAppointmentId !== appointment.id),
        completedTickets,
        totalTickets: appointment.tickets?.length || 0,
        typeLabels,
        appointmentPriority,
      };
    });

    enriched.sort((a: any, b: any) => {
      if (a.appointmentPriority !== b.appointmentPriority) return a.appointmentPriority - b.appointmentPriority;
      if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
      return String(a.time || '').localeCompare(String(b.time || ''));
    });

    res.json(enriched);
  } catch (err: any) {
    console.error('GET /tech/appointments state-machine error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
