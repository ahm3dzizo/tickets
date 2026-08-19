import { Router } from 'express';
import { requireTechAuth, TechAuthRequest } from './tech-auth.js';
import { requireAuth, AuthRequest } from '../auth.js';
import prisma from '../db.js';
import { DEFAULT_WORK_HOURS, WorkHoursSettings, toMins } from './settings.js';

const router = Router();

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ================= SHIFT ENDPOINTS =================

router.post('/shift/clock-in', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { lat, lng, accuracy, projectId } = req.body;
    const technicianId = req.technicianId!;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await prisma.shiftLog.findFirst({
      where: {
        technicianId,
        clockInAt: { gte: today },
        status: { in: ['ACTIVE', 'ON_BREAK'] }
      }
    });
    if (existing) {
      res.status(400).json({ error: 'Active shift already exists for today' });
      return;
    }
    
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.officeLat == null || project.officeLng == null) {
      res.status(400).json({ error: 'Project or project office location not found' });
      return;
    }
    
    const distance = haversineMeters(lat, lng, project.officeLat, project.officeLng);
    const isFlagged = distance > 500;
    const flagReason = isFlagged ? 'clock_in_far_from_office' : null;
    
    const shift = await prisma.shiftLog.create({
      data: {
        technicianId,
        projectId,
        status: 'ACTIVE',
        clockInAt: new Date(),
        shiftDate: (() => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          return d;
        })(),
        clockInDistanceM: distance,
        isFlagged,
        flagReason
      }
    });
    res.json(shift);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shift/clock-out', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { lat, lng, note } = req.body;
    const technicianId = req.technicianId!;
    
    const shift = await prisma.shiftLog.findFirst({
      where: {
        technicianId,
        status: { in: ['ACTIVE', 'ON_BREAK'] }
      }
    });
    
    if (!shift) {
      res.status(400).json({ error: 'No active shift found' });
      return;
    }
    
    const openBreak = await prisma.shiftBreakLog.findFirst({
      where: { shiftLogId: shift.id, endedAt: null }
    });
    const now = new Date();
    if (openBreak) {
      const durationMins = Math.round((now.getTime() - openBreak.startedAt.getTime()) / 60000);
      await prisma.shiftBreakLog.update({
        where: { id: openBreak.id },
        data: { endedAt: now, durationMins }
      });
    }
    
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'work_hours' } });
    const wh = (setting?.value as unknown as WorkHoursSettings) || DEFAULT_WORK_HOURS;
    const projectWh = wh.byProject?.[shift.projectId] || wh.default;
    
    const totalWorkMinutes = Math.round((now.getTime() - shift.clockInAt.getTime()) / 60000);
    const breaks = await prisma.shiftBreakLog.findMany({ where: { shiftLogId: shift.id } });
    const totalBreakMinutes = breaks.reduce((acc, b) => acc + (b.durationMins || 0), 0);
    
    let regularMinutes = 0;
    if (projectWh.enabled && projectWh.hasMorning && projectWh.hasAfternoon) {
      const mStart = toMins(projectWh.morning.start);
      const mEnd = toMins(projectWh.morning.end);
      const aStart = toMins(projectWh.afternoon.start);
      const aEnd = toMins(projectWh.afternoon.end);
      regularMinutes = (mEnd - mStart) + (aEnd - aStart);
    } else {
      regularMinutes = 8 * 60;
    }
    
    const overtimeMinutes = Math.max(0, totalWorkMinutes - totalBreakMinutes - regularMinutes);
    
    const updated = await prisma.shiftLog.update({
      where: { id: shift.id },
      data: {
        clockOutAt: now,
        status: 'COMPLETED',
        totalWorkMinutes,
        totalBreakMinutes,
        regularMinutes,
        overtimeMinutes
      }
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shift/break/start', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { breakType = 'MEAL' } = req.body;
    const technicianId = req.technicianId!;
    
    const shift = await prisma.shiftLog.findFirst({
      where: { technicianId, status: 'ACTIVE' }
    });
    if (!shift) {
      res.status(400).json({ error: 'No active shift found' });
      return;
    }
    
    await prisma.shiftLog.update({
      where: { id: shift.id },
      data: { status: 'ON_BREAK' }
    });
    
    const breakLog = await prisma.shiftBreakLog.create({
      data: {
        shiftLogId: shift.id,
        breakType,
        startedAt: new Date()
      }
    });
    res.json(breakLog);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shift/break/end', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const shift = await prisma.shiftLog.findFirst({
      where: { technicianId, status: 'ON_BREAK' }
    });
    if (!shift) {
      res.status(400).json({ error: 'No shift on break found' });
      return;
    }
    
    const openBreak = await prisma.shiftBreakLog.findFirst({
      where: { shiftLogId: shift.id, endedAt: null }
    });
    if (!openBreak) {
      res.status(400).json({ error: 'No open break found' });
      return;
    }
    
    const now = new Date();
    const durationMins = Math.round((now.getTime() - openBreak.startedAt.getTime()) / 60000);
    
    await prisma.shiftBreakLog.update({
      where: { id: openBreak.id },
      data: { endedAt: now, durationMins }
    });
    
    const updated = await prisma.shiftLog.update({
      where: { id: shift.id },
      data: { status: 'ACTIVE' }
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/shift/today', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const shift = await prisma.shiftLog.findFirst({
      where: {
        technicianId: req.technicianId!,
        clockInAt: { gte: today }
      },
      include: {
        breaks: true,
        sessions: true
      }
    });
    res.json(shift || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/shift/history', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { from, to, page = '1', pageSize = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(pageSize);
    
    const where: any = { technicianId: req.technicianId! };
    if (from || to) {
      where.clockInAt = {};
      if (from) where.clockInAt.gte = new Date(from as string);
      if (to) where.clockInAt.lte = new Date(to as string);
    }
    
    const shifts = await prisma.shiftLog.findMany({
      where,
      skip,
      take: Number(pageSize),
      orderBy: { clockInAt: 'desc' },
      include: { breaks: true, sessions: true }
    });
    res.json(shifts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================= TICKET SESSION ENDPOINTS =================

router.post('/ticket-session/claim', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { ticketId } = req.body;
    const technicianId = req.technicianId!;
    
    const existing = await prisma.ticketTimeSession.findFirst({
      where: {
        ticketId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] }
      }
    });
    if (existing) {
      res.status(400).json({ error: 'Ticket is already being worked on' });
      return;
    }
    
    const tech = await prisma.technician.findUnique({ where: { id: technicianId } });
    if (!tech) {
      res.status(404).json({ error: 'Technician not found' });
      return;
    }
    
    const shift = await prisma.shiftLog.findFirst({
      where: { technicianId, status: 'ACTIVE' }
    });
    
    const session = await prisma.ticketTimeSession.create({
      data: {
        ticketId,
        technicianId,
        shiftLogId: shift?.id,
        status: 'CLAIMED',
        specialtyKey: tech.specialty || 'general'
      }
    });
    
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'in_progress' }
    });
    
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ticket-session/travel', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { ticketId } = req.body;
    const session = await prisma.ticketTimeSession.findFirst({
      where: { ticketId, technicianId: req.technicianId!, status: 'CLAIMED' }
    });
    if (!session) {
      res.status(404).json({ error: 'Claimed session not found' });
      return;
    }
    
    const updated = await prisma.ticketTimeSession.update({
      where: { id: session.id },
      data: {
        status: 'EN_ROUTE',
        travelStartedAt: new Date()
      }
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ticket-session/arrive', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { ticketId, lat, lng, accuracy } = req.body;
    const session = await prisma.ticketTimeSession.findFirst({
      where: { ticketId, technicianId: req.technicianId!, status: 'EN_ROUTE' }
    });
    if (!session) {
      res.status(404).json({ error: 'En route session not found' });
      return;
    }
    
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { project: true }
    });
    
    let isLocationVerified = true;
    let distance = 0;
    
    if (ticket?.project?.officeLat && ticket?.project?.officeLng) {
      distance = haversineMeters(lat, lng, ticket.project.officeLat, ticket.project.officeLng);
      if (distance > 300) {
        isLocationVerified = false;
      }
    }
    
    const now = new Date();
    const travelDurationMins = session.travelStartedAt 
      ? Math.round((now.getTime() - session.travelStartedAt.getTime()) / 60000) 
      : 0;
      
    const updated = await prisma.ticketTimeSession.update({
      where: { id: session.id },
      data: {
        status: 'IN_PROGRESS',
        arrivedAt: now,
        workStartedAt: now,
        travelDurationMins,
        checkInLat: lat,
        checkInLng: lng,
        checkInAccuracy: accuracy,
        checkInDistanceMeters: distance,
        isLocationVerified
      }
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ticket-session/pause', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { ticketId, reason } = req.body;
    const session = await prisma.ticketTimeSession.findFirst({
      where: { ticketId, technicianId: req.technicianId!, status: 'IN_PROGRESS' }
    });
    if (!session) {
      res.status(404).json({ error: 'In progress session not found' });
      return;
    }
    
    const updated = await prisma.ticketTimeSession.update({
      where: { id: session.id },
      data: {
        status: 'PAUSED',
        pauseReason: reason
      }
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ticket-session/resume', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { ticketId } = req.body;
    const session = await prisma.ticketTimeSession.findFirst({
      where: { ticketId, technicianId: req.technicianId!, status: 'PAUSED' }
    });
    if (!session) {
      res.status(404).json({ error: 'Paused session not found' });
      return;
    }
    
    const updated = await prisma.ticketTimeSession.update({
      where: { id: session.id },
      data: {
        status: 'IN_PROGRESS'
      }
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ticket-session/complete', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { ticketId, notes } = req.body;
    const session = await prisma.ticketTimeSession.findFirst({
      where: { ticketId, technicianId: req.technicianId!, status: 'IN_PROGRESS' }
    });
    if (!session) {
      res.status(404).json({ error: 'In progress session not found' });
      return;
    }
    
    const now = new Date();
    const workStartedAt = session.workStartedAt || now;
    let workDurationMins = Math.round((now.getTime() - workStartedAt.getTime()) / 60000);
    workDurationMins -= (session.pausedDurationMins || 0);
    workDurationMins = Math.max(0, workDurationMins);
    
    const updated = await prisma.ticketTimeSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        completionNotes: notes,
        workDurationMins
      }
    });
    
    // Complete the actual ticket as well.
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'completed',
        closedAt: now,
        closureNotes: notes || undefined
      }
    });

    // ============================================================
    // AUTO COMPLETE APPOINTMENT
    // If this ticket belongs to an appointment and it was the
    // last non-completed ticket, complete the appointment too.
    // Appointment status remains "scheduled" while work is active.
    // ============================================================
    const completedTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { appointmentId: true }
    });

    if (completedTicket?.appointmentId) {
      const remainingTickets = await prisma.ticket.count({
        where: {
          appointmentId: completedTicket.appointmentId,
          status: {
            not: 'completed'
          }
        }
      });

      if (remainingTickets === 0) {
        await prisma.appointment.update({
          where: { id: completedTicket.appointmentId },
          data: {
            status: 'completed'
          }
        });

        console.log(
          'APPOINTMENT AUTO COMPLETED:',
          completedTicket.appointmentId
        );
      }
    }

    if (session.shiftLogId) {
      const shift = await prisma.shiftLog.findUnique({ where: { id: session.shiftLogId } });
      if (shift) {
        await prisma.shiftLog.update({
          where: { id: shift.id },
          data: {
            totalWorkMinutes: (shift.totalWorkMinutes || 0) + workDurationMins
          }
        });
      }
    }
    
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ticket-session/mine', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const sessions = await prisma.ticketTimeSession.findMany({
      where: {
        technicianId: req.technicianId!,
        status: { in: ['CLAIMED', 'EN_ROUTE', 'IN_PROGRESS', 'PAUSED'] }
      }
    });
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================= SUPERVISOR ENDPOINTS =================

router.get('/attendance/live', requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const shifts = await prisma.shiftLog.findMany({
      where: { clockInAt: { gte: today }, status: { in: ['ACTIVE', 'ON_BREAK'] } },
      include: {
        technician: true,
        sessions: {
          where: { status: { in: ['CLAIMED', 'EN_ROUTE', 'IN_PROGRESS', 'PAUSED'] } }
        }
      }
    });
    
    const result = shifts.map(s => ({
      technicianId: s.technicianId,
      name: s.technician?.name,
      specialty: s.technician?.specialty,
      shiftStatus: s.status,
      currentSession: s.sessions[0] || null,
      totalWorkMinutes: s.totalWorkMinutes
    }));
    
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/attendance/daily', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dateParam = req.query.date as string;
    const projectId = req.query.projectId as string;
    
    const date = dateParam ? new Date(dateParam) : new Date();
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);
    
    const where: any = { clockInAt: { gte: date, lt: nextDay } };
    if (projectId) where.projectId = projectId;
    
    const shifts = await prisma.shiftLog.findMany({
      where,
      include: { breaks: true, sessions: true, technician: true }
    });
    res.json(shifts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/attendance/report', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { from, to, projectId, technicianId } = req.query as {
      from?: string;
      to?: string;
      projectId?: string;
      technicianId?: string;
    };

    const where: any = {};
    if (from || to) {
      where.clockInAt = {};
      if (from) {
        const fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
        where.clockInAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.clockInAt.lte = toDate;
      }
    }
    if (projectId && projectId !== 'all') {
      where.projectId = projectId;
    }
    if (technicianId && technicianId !== 'all') {
      where.technicianId = technicianId;
    }

    const shifts = await prisma.shiftLog.findMany({
      where,
      include: {
        technician: {
          select: { id: true, name: true, employeeId: true, specialty: true, phoneNumber: true }
        },
        project: {
          select: { id: true, name: true, abbreviation: true }
        },
        breaks: true,
        sessions: {
          include: {
            ticket: {
              select: { id: true, ticketId: true, description: true, status: true, clientName: true }
            }
          }
        }
      },
      orderBy: { clockInAt: 'desc' }
    });

    let totalWorkMinutes = 0;
    let totalBreakMinutes = 0;
    let totalOvertimeMinutes = 0;
    let totalTicketsWorked = 0;
    let flaggedShiftsCount = 0;

    shifts.forEach(s => {
      totalWorkMinutes += s.totalWorkMinutes || 0;
      totalBreakMinutes += s.totalBreakMinutes || 0;
      totalOvertimeMinutes += s.overtimeMinutes || 0;
      totalTicketsWorked += s.sessions?.length || 0;
      if (s.isFlagged) flaggedShiftsCount++;
    });

    res.json({
      shifts,
      summary: {
        totalShifts: shifts.length,
        totalWorkHours: Number((totalWorkMinutes / 60).toFixed(1)),
        totalBreakHours: Number((totalBreakMinutes / 60).toFixed(1)),
        totalOvertimeHours: Number((totalOvertimeMinutes / 60).toFixed(1)),
        totalTicketsWorked,
        flaggedShiftsCount
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/attendance/override', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { shiftLogId, clockInAt, clockOutAt, reason } = req.body;
    
    const data: any = {};
    if (clockInAt) data.clockInAt = new Date(clockInAt);
    if (clockOutAt) data.clockOutAt = new Date(clockOutAt);
    
    const updated = await prisma.shiftLog.update({
      where: { id: shiftLogId },
      data
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================
// CLAIM APPOINTMENT
// Claiming an appointment immediately starts all eligible
// open tickets belonging to that appointment.
// Direct workflow: IN_PROGRESS -> PAUSED -> IN_PROGRESS -> COMPLETED.
// ============================================================
router.post('/tech/appointments/:appointmentId/claim', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;

    const technician = await prisma.technician.findUnique({
      where: { id: technicianId },
      select: {
        id: true,
        name: true,
        supervisorId: true,
        projectId: true,
        specialty: true
      }
    });

    if (!technician) {
      res.status(404).json({ error: 'Technician not found' });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        tickets: {
          select: {
            id: true,
            ticketId: true,
            status: true,
            assigneeName: true,
            assignedSupervisorId: true,
            assignedSupervisorIds: true
          }
        }
      }
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    if (appointment.status === 'cancelled') {
      res.status(400).json({ error: 'Cannot claim a cancelled appointment' });
      return;
    }

    // Technician must belong to this appointment either directly
    // or through the technicianIds array.
    const isDirectTechnician =
      appointment.technicianId === technician.id ||
      appointment.technicianIds.includes(technician.id);

    const isSupervisorAppointment =
      !!technician.supervisorId &&
      appointment.supervisorIds.includes(technician.supervisorId);

    if (!isDirectTechnician && !isSupervisorAppointment) {
      res.status(403).json({
        error: 'This appointment is not assigned to this technician'
      });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const eligibleTickets = appointment.tickets.filter((ticket) => {
        // Only currently open tickets.
        if (ticket.status !== 'open') return false;

        const assignedToTech =
          ticket.assigneeName &&
          ticket.assigneeName.trim() === technician.name.trim();

        const assignedToSupervisor =
          !!technician.supervisorId &&
          (
            ticket.assignedSupervisorId === technician.supervisorId ||
            ticket.assignedSupervisorIds.includes(technician.supervisorId)
          );

        // If the ticket has an explicit technician/supervisor assignment,
        // only claim it when it belongs to this technician's chain.
        const hasExplicitAssignment =
          !!ticket.assigneeName ||
          !!ticket.assignedSupervisorId ||
          ticket.assignedSupervisorIds.length > 0;

        if (hasExplicitAssignment) {
          return assignedToTech || assignedToSupervisor;
        }

        // Appointment ticket without an explicit assignment:
        // because the appointment itself belongs to this technician,
        // it is eligible.
        return isDirectTechnician;
      });

      const claimedTickets: any[] = [];

      for (const ticket of eligibleTickets) {
        /*
         * IMPORTANT:
         *
         * Claiming an appointment starts the work immediately.
         *
         * Correct lifecycle:
         *
         * IN_PROGRESS
         *   -> PAUSED / IN_PROGRESS
         *   -> COMPLETED
         *
         * There is no EN_ROUTE / ARRIVED step for appointment claims.
         */

        const existing = await tx.ticketTimeSession.findFirst({
          where: {
            ticketId: ticket.id,
            status: {
              notIn: ['COMPLETED', 'CANCELLED']
            }
          }
        });

        if (existing) {
          /*
           * If the existing session belongs to this technician,
           * this ticket has already been claimed by him.
           *
           * If it belongs to another technician, DO NOT touch it.
           * This prevents one technician from hijacking another
           * technician's active work session.
           */
          if (existing.technicianId === technicianId) {
            claimedTickets.push({
              ticketId: ticket.ticketId,
              sessionId: existing.id,
              alreadyClaimed: true
            });
          }

          continue;
        }

        const shift = await tx.shiftLog.findFirst({
          where: {
            technicianId,
            status: {
              in: ['ACTIVE', 'ON_BREAK']
            }
          },
          orderBy: {
            clockInAt: 'desc'
          }
        });

        const now = new Date();

        const session = await tx.ticketTimeSession.create({
          data: {
            ticketId: ticket.id,
            technicianId,
            shiftLogId: shift?.id,
            status: 'IN_PROGRESS',
            specialtyKey: technician.specialty || 'general',
            claimedAt: now,
            workStartedAt: now
          }
        });

        /*
         * DIRECT WORKFLOW:
         *
         * Appointment Claim = IN_PROGRESS immediately.
         *
         * There is no EN_ROUTE / ARRIVED step.
         * Work timing starts at the exact moment of claiming.
         */
        await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            status: 'in_progress'
          }
        });

        claimedTickets.push({
          ticketId: ticket.ticketId,
          sessionId: session.id,
          alreadyClaimed: false
        });
      }

      /*
       * Claiming an appointment does not complete it.
       *
       * remainingOpen is returned only as information for the client.
       * The appointment must remain active until its tickets are
       * actually completed through the completion workflow.
       */
      const remainingOpen = await tx.ticket.count({
        where: {
          appointmentId,
          status: {
            in: ['open', 'pending', 'waiting']
          }
        }
      });

      return {
        claimedTickets,
        remainingOpen
      };
    });

    res.json({
      ok: true,
      appointmentId,
      technicianId,
      claimedCount: result.claimedTickets.length,
      tickets: result.claimedTickets
    });

  } catch (err: any) {
    console.error('CLAIM APPOINTMENT ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/tech/appointments', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technician = await prisma.technician.findUnique({
      where: { id: req.technicianId! },
      select: {
        id: true,
        supervisorId: true,
        projectId: true,
        specialty: true,
        name: true
      }
    });

    if (!technician) {
      res.status(404).json({ error: 'Technician not found' });
      return;
    }

    const { from, to, date } = req.query as {
      from?: string;
      to?: string;
      date?: string;
    };

    const orConditions: any[] = [
      { technicianId: technician.id },
      { technicianIds: { has: technician.id } }
    ];

    // كل مواعيد المشرف تظهر للفنيين التابعين له
    if (technician.supervisorId) {
      orConditions.push({
        supervisorIds: { has: technician.supervisorId }
      });
    }

    const where: any = {
      status: { not: 'cancelled' },
      OR: orConditions
    };

    // المواعيد يجب أن تكون في نفس مشروع الفني
    if (technician.projectId) {
      where.projectId = technician.projectId;
    }

    if (date) {
      where.date = date;
    } else if (from && to) {
      where.date = {
        gte: from,
        lte: to
      };
    }

    const appointments = await prisma.appointment.findMany({
      where,

      include: {
        project: {
          select: {
            id: true,
            name: true,
            officeLat: true,
            officeLng: true,
            officeAddress: true
          }
        },

        technician: {
          select: {
            id: true,
            name: true,
            specialty: true,
            phoneNumber: true
          }
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
            priority: true,
            appointmentTime: true,
            appointmentNotes: true,

            techSessions: {
              where: {
                technicianId: technician.id
              },
              orderBy: {
                createdAt: 'desc'
              },
              take: 1
            }
          }
        }
      },

      orderBy: [
        { date: 'asc' },
        { time: 'asc' }
      ]
    });

    console.log('========== TECH APPOINTMENTS DEBUG ==========');
    console.log('TECHNICIAN:', {
      id: technician.id,
      name: technician.name,
      supervisorId: technician.supervisorId,
      projectId: technician.projectId
    });
    console.log('APPOINTMENTS COUNT:', appointments.length);
    console.log('APPOINTMENTS:', appointments.map((a: any) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      projectId: a.projectId,
      technicianId: a.technicianId,
      technicianIds: a.technicianIds,
      supervisorIds: a.supervisorIds,
      status: a.status,
      ticketsCount: Array.isArray(a.tickets) ? a.tickets.length : 0
    })));
    console.log('=============================================');

    const enrichedAppointments = appointments.map((appointment: any) => {
      const isAssignedToMe =
        appointment.technicianId === technician.id ||
        (
          Array.isArray(appointment.technicianIds) &&
          appointment.technicianIds.includes(technician.id)
        );

      const isSupervisorAppointment =
        !!technician.supervisorId &&
        Array.isArray(appointment.supervisorIds) &&
        appointment.supervisorIds.includes(technician.supervisorId);

      return {
        ...appointment,
        isAssignedToMe,
        isSupervisorAppointment,
        appointmentPriority: isAssignedToMe ? 1 : 2
      };
    });

    // المواعيد المخصصة للفني أولاً، ثم مواعيد المشرف
    enrichedAppointments.sort((a: any, b: any) => {
      if (a.appointmentPriority !== b.appointmentPriority) {
        return a.appointmentPriority - b.appointmentPriority;
      }

      if (a.date !== b.date) {
        return String(a.date).localeCompare(String(b.date));
      }

      return String(a.time || '').localeCompare(String(b.time || ''));
    });

    res.json(enrichedAppointments);

  } catch (err: any) {
    console.error('GET /tech/appointments error:', err);

    res.status(500).json({
      error: err.message
    });
  }
});

export default router;
