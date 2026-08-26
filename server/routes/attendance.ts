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

const ACTIVE_TICKET_STATUSES = ['open', 'pending', 'in_progress', 'waiting', 'contractor'];

/**
 * If every ticket in the appointment is in a terminal state
 * (completed / closed / out_of_scope / absent), auto-finish the
 * appointment work session and mark the appointment completed.
 * Called after any ticket status change so a claimed appointment
 * doesn't stay "in progress" once its work is actually done.
 */
export async function maybeAutoFinishAppointment(appointmentId: string | null | undefined) {
  if (!appointmentId) return;
  try {
    const remaining = await prisma.ticket.count({
      where: {
        appointmentId,
        status: { in: ACTIVE_TICKET_STATUSES }
      }
    });
    if (remaining > 0) return;

    const session = await prisma.appointmentWorkSession.findUnique({
      where: { appointmentId }
    });
    if (session && ['in_progress', 'paused'].includes(session.status)) {
      const now = new Date();
      let extraPause = 0;
      if (session.status === 'paused' && session.pausedAt) {
        extraPause = Math.round((now.getTime() - session.pausedAt.getTime()) / 60000);
      }
      const totalPausedMins = (session.totalPausedMins || 0) + extraPause;
      const totalElapsedMins = Math.round((now.getTime() - session.claimedAt.getTime()) / 60000);
      const totalDurationMins = Math.max(0, totalElapsedMins - totalPausedMins);

      await prisma.appointmentWorkSession.update({
        where: { id: session.id },
        data: {
          status: 'completed',
          finishedAt: now,
          pausedAt: null,
          totalPausedMins,
          totalElapsedMins,
          totalDurationMins,
          completionNotes: session.completionNotes || 'أُنهي تلقائياً بعد إغلاق كل تذاكر الموعد',
        }
      });

      if (session.shiftLogId) {
        await prisma.shiftLog.update({
          where: { id: session.shiftLogId },
          data: { totalWorkMinutes: { increment: totalDurationMins } }
        }).catch(() => {});
      }
    }

    // Mark the appointment itself completed if it isn't already.
    await prisma.appointment.updateMany({
      where: { id: appointmentId, status: { not: 'completed' } },
      data: { status: 'completed' }
    });
  } catch (e) {
    console.warn('maybeAutoFinishAppointment failed:', e);
  }
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
        clockInLat: lat,
        clockInLng: lng,
        clockInAccuracy: accuracy,
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

    // Auto-finish any still-open appointment session before clocking out.
    const openSession = await prisma.appointmentWorkSession.findFirst({
      where: { technicianId, status: 'in_progress' }
    });
    if (openSession) {
      const now = new Date();
      const totalDurationMins = Math.round((now.getTime() - openSession.claimedAt.getTime()) / 60000);
      await prisma.appointmentWorkSession.update({
        where: { id: openSession.id },
        data: {
          status: 'completed',
          finishedAt: now,
          totalDurationMins,
          completionNotes: 'أغلقت تلقائياً عند نهاية الوردية'
        }
      });
      // Auto-complete remaining active tickets in that appointment.
      await prisma.ticket.updateMany({
        where: {
          appointmentId: openSession.appointmentId,
          status: { in: ['in_progress', 'open', 'pending'] }
        },
        data: { status: 'completed', closedAt: now }
      });
      await prisma.appointment.update({
        where: { id: openSession.appointmentId },
        data: { status: 'completed' }
      });
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
        clockOutLat: lat,
        clockOutLng: lng,
        clockOutNote: note,
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
        workSessions: {
          include: {
            appointment: {
              select: { id: true, date: true, time: true, unit: { select: { unitNumber: true } } }
            }
          }
        }
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
      include: {
        breaks: true,
        workSessions: {
          include: {
            appointment: {
              select: { id: true, date: true, time: true, unit: { select: { unitNumber: true } } }
            }
          }
        }
      }
    });
    res.json(shifts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================= APPOINTMENT WORK SESSION =================

// GET /tech/me/active-session — current active session for the tech (for recovery)
router.get('/tech/me/active-session', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const session = await prisma.appointmentWorkSession.findFirst({
      where: { technicianId: req.technicianId!, status: 'in_progress' },
      include: {
        appointment: {
          include: {
            unit: { include: { block: true } },
            client: true,
            project: { select: { id: true, name: true, officeLat: true, officeLng: true, officeAddress: true } },
            tickets: {
              select: {
                id: true, ticketId: true, description: true, status: true,
                type: true, detectedTypes: true, priority: true,
                unit: { select: { unitNumber: true } },
                client: { select: { name: true, phone: true } }
              }
            }
          }
        }
      }
    });
    res.json(session || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tech/appointments/:id/claim
router.post('/tech/appointments/:appointmentId/claim', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;
    const { lat, lng, accuracy } = req.body || {};

    const technician = await prisma.technician.findUnique({
      where: { id: technicianId },
      select: { id: true, name: true, supervisorId: true, projectId: true, specialty: true }
    });
    if (!technician) {
      res.status(404).json({ error: 'Technician not found' });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        tickets: { select: { id: true, status: true } }
      }
    });
    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }
    if (['cancelled', 'completed'].includes(appointment.status)) {
      res.status(400).json({ error: `Cannot claim a ${appointment.status} appointment` });
      return;
    }

    const isDirectTechnician =
      appointment.technicianId === technician.id ||
      appointment.technicianIds.includes(technician.id);
    const isSupervisorAppointment =
      !!technician.supervisorId &&
      appointment.supervisorIds.includes(technician.supervisorId);
    if (!isDirectTechnician && !isSupervisorAppointment) {
      res.status(403).json({ error: 'This appointment is not assigned to this technician' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${technicianId}))`;

      // Enforce: one active appointment per tech.
      const otherActive = await tx.appointmentWorkSession.findFirst({
        where: {
          technicianId,
          status: 'in_progress',
          appointmentId: { not: appointmentId }
        },
        include: {
          appointment: {
            select: { id: true, date: true, time: true, unit: { select: { unitNumber: true } } }
          }
        }
      });
      if (otherActive) {
        return { blockedBy: otherActive, session: null, updatedTickets: 0 };
      }

      // Idempotent: if a session already exists for this appointment, decide what to do.
      const existing = await tx.appointmentWorkSession.findUnique({
        where: { appointmentId }
      });
      if (existing) {
        if (['in_progress', 'paused'].includes(existing.status)) {
          if (existing.technicianId !== technicianId) {
            throw new Error('Another technician is already working on this appointment');
          }
          // Same tech re-entering: if paused, resume; otherwise just return.
          if (existing.status === 'paused' && existing.pausedAt) {
            const extraPause = Math.round((Date.now() - existing.pausedAt.getTime()) / 60000);
            const resumed = await tx.appointmentWorkSession.update({
              where: { id: existing.id },
              data: {
                status: 'in_progress',
                pausedAt: null,
                totalPausedMins: (existing.totalPausedMins || 0) + extraPause,
              }
            });
            return { blockedBy: null, session: resumed, updatedTickets: 0 };
          }
          return { blockedBy: null, session: existing, updatedTickets: 0 };
        }
        // A finished/cancelled session already existed → delete it before reopening.
        await tx.appointmentWorkSession.delete({ where: { id: existing.id } });
      }

      const shift = await tx.shiftLog.findFirst({
        where: { technicianId, status: { in: ['ACTIVE', 'ON_BREAK'] } },
        orderBy: { clockInAt: 'desc' }
      });

      const session = await tx.appointmentWorkSession.create({
        data: {
          appointmentId,
          technicianId,
          shiftLogId: shift?.id,
          status: 'in_progress',
          claimLat: typeof lat === 'number' ? lat : null,
          claimLng: typeof lng === 'number' ? lng : null,
          claimAccuracy: typeof accuracy === 'number' ? accuracy : null
        }
      });

      // Move all still-open tickets to in_progress.
      const updated = await tx.ticket.updateMany({
        where: {
          appointmentId,
          status: { in: ['open', 'pending'] }
        },
        data: { status: 'in_progress' }
      });

      return { blockedBy: null, session, updatedTickets: updated.count };
    });

    if (result.blockedBy) {
      res.status(409).json({
        code: 'ACTIVE_APPOINTMENT_EXISTS',
        error: 'Finish the active appointment before claiming another one',
        activeAppointmentId: result.blockedBy.appointmentId,
        activeAppointment: result.blockedBy.appointment
      });
      return;
    }

    res.json({
      ok: true,
      session: result.session,
      updatedTickets: result.updatedTickets
    });
  } catch (err: any) {
    console.error('CLAIM APPOINTMENT ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /tech/appointments/:id/finish
router.post('/tech/appointments/:appointmentId/finish', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;
    const { lat, lng, notes } = req.body || {};

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.appointmentWorkSession.findUnique({
        where: { appointmentId }
      });
      if (!session) {
        throw new Error('No active session for this appointment');
      }
      if (session.technicianId !== technicianId) {
        throw new Error('This appointment is being worked on by another technician');
      }
      if (session.status === 'completed' || session.status === 'cancelled') {
        // Idempotent: already finished — return the current state.
        return { session, completedTickets: 0 };
      }

      const now = new Date();
      // If the session is currently paused, close out the paused window first.
      let extraPause = 0;
      if (session.status === 'paused' && session.pausedAt) {
        extraPause = Math.round((now.getTime() - session.pausedAt.getTime()) / 60000);
      }
      const totalPausedMins = (session.totalPausedMins || 0) + extraPause;
      const totalElapsedMins = Math.round((now.getTime() - session.claimedAt.getTime()) / 60000);
      const totalDurationMins = Math.max(0, totalElapsedMins - totalPausedMins);

      const updatedSession = await tx.appointmentWorkSession.update({
        where: { id: session.id },
        data: {
          status: 'completed',
          finishedAt: now,
          pausedAt: null,
          totalPausedMins,
          totalElapsedMins,
          totalDurationMins,
          finishLat: typeof lat === 'number' ? lat : null,
          finishLng: typeof lng === 'number' ? lng : null,
          completionNotes: notes || null
        }
      });

      // Auto-complete any ticket that is still in_progress / open / pending.
      // Tickets already set by the tech to out_of_scope / waiting / absent stay as-is.
      const completed = await tx.ticket.updateMany({
        where: {
          appointmentId,
          status: { in: ['in_progress', 'open', 'pending'] }
        },
        data: { status: 'completed', closedAt: now, closureNotes: notes || undefined }
      });

      // Mark the appointment itself as completed.
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: 'completed' }
      });

      // Roll up work minutes into the shift log.
      if (session.shiftLogId) {
        await tx.shiftLog.update({
          where: { id: session.shiftLogId },
          data: {
            totalWorkMinutes: { increment: totalDurationMins }
          }
        });
      }

      return { session: updatedSession, completedTickets: completed.count };
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('FINISH APPOINTMENT ERROR:', err);
    res.status(400).json({ error: err.message });
  }
});

// POST /tech/appointments/:id/cancel-claim
// Release an appointment session without completing anything.
router.post('/tech/appointments/:appointmentId/cancel-claim', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.appointmentWorkSession.findUnique({ where: { appointmentId } });
      if (!session) return { cancelled: false };
      if (session.technicianId !== technicianId) {
        throw new Error('Cannot cancel another technician\'s session');
      }
      if (!['in_progress', 'paused'].includes(session.status)) return { cancelled: false };

      await tx.appointmentWorkSession.update({
        where: { id: session.id },
        data: { status: 'cancelled', finishedAt: new Date(), pausedAt: null }
      });

      // Revert tickets back to their pre-claim state.
      // They still belong to a scheduled appointment, so pending — not open.
      await tx.ticket.updateMany({
        where: { appointmentId, status: 'in_progress' },
        data: { status: 'pending' }
      });

      return { cancelled: true };
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /tech/appointments/:id/pause — pause the session (frees up the tech to claim another)
router.post('/tech/appointments/:appointmentId/pause', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;
    const { reason } = req.body || {};

    const session = await prisma.appointmentWorkSession.findUnique({ where: { appointmentId } });
    if (!session) { res.status(404).json({ error: 'No session' }); return; }
    if (session.technicianId !== technicianId) { res.status(403).json({ error: 'Not yours' }); return; }
    if (session.status !== 'in_progress') {
      res.status(400).json({ error: 'Session must be in_progress to pause' });
      return;
    }

    const updated = await prisma.appointmentWorkSession.update({
      where: { id: session.id },
      data: {
        status: 'paused',
        pausedAt: new Date(),
        pauseReason: reason || null,
      }
    });
    res.json({ ok: true, session: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tech/appointments/:id/resume — resume the session
router.post('/tech/appointments/:appointmentId/resume', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${technicianId}))`;

      const session = await tx.appointmentWorkSession.findUnique({ where: { appointmentId } });
      if (!session) throw new Error('No session');
      if (session.technicianId !== technicianId) throw new Error('Not yours');
      if (session.status !== 'paused') throw new Error('Session is not paused');

      // Refuse resume if the tech now has another in_progress appointment.
      const otherActive = await tx.appointmentWorkSession.findFirst({
        where: {
          technicianId,
          status: 'in_progress',
          appointmentId: { not: appointmentId }
        },
        include: {
          appointment: {
            select: { id: true, date: true, time: true, unit: { select: { unitNumber: true } } }
          }
        }
      });
      if (otherActive) {
        return { blockedBy: otherActive, session: null };
      }

      const now = new Date();
      const extraPause = session.pausedAt
        ? Math.round((now.getTime() - session.pausedAt.getTime()) / 60000)
        : 0;
      const totalPausedMins = (session.totalPausedMins || 0) + extraPause;

      const updated = await tx.appointmentWorkSession.update({
        where: { id: session.id },
        data: {
          status: 'in_progress',
          pausedAt: null,
          totalPausedMins,
        }
      });
      return { session: updated, blockedBy: null };
    });

    if (result.blockedBy) {
      res.status(409).json({
        code: 'ACTIVE_APPOINTMENT_EXISTS',
        error: 'Finish or pause the other active appointment first',
        activeAppointmentId: result.blockedBy.appointmentId,
        activeAppointment: result.blockedBy.appointment
      });
      return;
    }
    res.json({ ok: true, session: result.session });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /tech/appointments/:id/postpone — cancel the session and reschedule the appointment
router.post('/tech/appointments/:appointmentId/postpone', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;
    const { newDate, newTime, reason } = req.body || {};

    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      res.status(400).json({ error: 'newDate (YYYY-MM-DD) is required' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        include: { workSession: true }
      });
      if (!appointment) throw new Error('Appointment not found');

      const session = appointment.workSession;
      if (session) {
        if (session.technicianId !== technicianId) {
          throw new Error('This appointment is owned by another technician');
        }
        if (['in_progress', 'paused'].includes(session.status)) {
          // Close the session out as cancelled so the tech can move on.
          await tx.appointmentWorkSession.update({
            where: { id: session.id },
            data: {
              status: 'cancelled',
              finishedAt: new Date(),
              pausedAt: null,
              completionNotes: reason ? `تم التأجيل: ${reason}` : 'تم التأجيل',
            }
          });
        }
      }

      // Revert any tickets that were flipped to in_progress back to pending
      // (an appointment is still scheduled for them, just at a new date).
      await tx.ticket.updateMany({
        where: { appointmentId, status: 'in_progress' },
        data: { status: 'pending' }
      });

      // Reschedule the appointment itself.
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          date: newDate,
          time: newTime ?? null,
          status: 'scheduled',
          notes: reason
            ? `${appointment.notes ? appointment.notes + '\n' : ''}تم التأجيل من ${appointment.date}${appointment.time ? ' ' + appointment.time : ''}: ${reason}`
            : appointment.notes,
        }
      });
      return { appointment: updated };
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /tech/appointments/:id/tickets/:ticketId — per-ticket exception state
// (out_of_scope | waiting | absent | contractor | completed)
router.patch('/tech/appointments/:appointmentId/tickets/:ticketId', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const { appointmentId, ticketId } = req.params;
    const { status, notes } = req.body || {};

    const allowed = ['completed', 'out_of_scope', 'waiting', 'absent', 'contractor', 'in_progress'];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: `Invalid status: ${status}` });
      return;
    }

    const session = await prisma.appointmentWorkSession.findUnique({ where: { appointmentId } });
    if (!session || session.status !== 'in_progress') {
      res.status(400).json({ error: 'No active session for this appointment' });
      return;
    }
    if (session.technicianId !== technicianId) {
      res.status(403).json({ error: 'Not your appointment' });
      return;
    }

    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, appointmentId }
    });
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not in this appointment' });
      return;
    }

    const now = new Date();
    const isClosing = ['completed', 'out_of_scope', 'absent'].includes(status);
    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status,
        closedAt: isClosing ? now : null,
        closureNotes: isClosing && notes ? notes : undefined
      }
    });
    await maybeAutoFinishAppointment(appointmentId);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================= SUPERVISOR / ADMIN ENDPOINTS =================

router.get('/attendance/live', requireAuth, async (req: AuthRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const shifts = await prisma.shiftLog.findMany({
      where: { clockInAt: { gte: today }, status: { in: ['ACTIVE', 'ON_BREAK'] } },
      include: {
        technician: true,
        workSessions: {
          where: { status: 'in_progress' },
          include: {
            appointment: {
              select: { id: true, date: true, time: true, unit: { select: { unitNumber: true } } }
            }
          }
        }
      }
    });

    const result = shifts.map(s => ({
      technicianId: s.technicianId,
      name: s.technician?.name,
      specialty: s.technician?.specialty,
      shiftStatus: s.status,
      currentSession: s.workSessions[0] || null,
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
      include: {
        breaks: true,
        workSessions: {
          include: {
            appointment: {
              select: { id: true, date: true, time: true, unit: { select: { unitNumber: true } }, tickets: { select: { id: true, status: true } } }
            }
          }
        },
        technician: true
      }
    });
    res.json(shifts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/attendance/report', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { from, to, projectId, technicianId } = req.query as {
      from?: string; to?: string; projectId?: string; technicianId?: string;
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
    if (projectId && projectId !== 'all') where.projectId = projectId;
    if (technicianId && technicianId !== 'all') where.technicianId = technicianId;

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
        workSessions: {
          include: {
            appointment: {
              select: {
                id: true, date: true, time: true, notes: true,
                unit: { select: { unitNumber: true, block: { select: { blockNumber: true } } } },
                client: { select: { name: true, phone: true } },
                tickets: { select: { id: true, ticketId: true, description: true, status: true, type: true } }
              }
            }
          }
        }
      },
      orderBy: { clockInAt: 'desc' }
    });

    let totalWorkMinutes = 0;
    let totalBreakMinutes = 0;
    let totalOvertimeMinutes = 0;
    let totalAppointmentsWorked = 0;
    let totalTicketsWorked = 0;
    let flaggedShiftsCount = 0;

    shifts.forEach(s => {
      totalWorkMinutes += s.totalWorkMinutes || 0;
      totalBreakMinutes += s.totalBreakMinutes || 0;
      totalOvertimeMinutes += s.overtimeMinutes || 0;
      totalAppointmentsWorked += s.workSessions?.length || 0;
      totalTicketsWorked += s.workSessions?.reduce((n, ws) => n + (ws.appointment?.tickets?.length || 0), 0) || 0;
      if (s.isFlagged) flaggedShiftsCount++;
    });

    res.json({
      shifts,
      summary: {
        totalShifts: shifts.length,
        totalWorkHours: Number((totalWorkMinutes / 60).toFixed(1)),
        totalBreakHours: Number((totalBreakMinutes / 60).toFixed(1)),
        totalOvertimeHours: Number((totalOvertimeMinutes / 60).toFixed(1)),
        totalAppointmentsWorked,
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
    const updated = await prisma.shiftLog.update({ where: { id: shiftLogId }, data });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================= TECH APPOINTMENT LIST =================

router.get('/tech/appointments', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technician = await prisma.technician.findUnique({
      where: { id: req.technicianId! },
      select: { id: true, supervisorId: true, projectId: true, specialty: true, name: true }
    });
    if (!technician) {
      res.status(404).json({ error: 'Technician not found' });
      return;
    }

    // Only in_progress blocks — paused sessions free up the tech to claim another.
    const activeSession = await prisma.appointmentWorkSession.findFirst({
      where: { technicianId: technician.id, status: 'in_progress' },
      select: { appointmentId: true, claimedAt: true }
    });
    const activeAppointmentId = activeSession?.appointmentId || null;

    const { from, to, date } = req.query as { from?: string; to?: string; date?: string };

    // Visibility rules for the tech app:
    //   1. Appointments explicitly assigned to this tech (technicianId or technicianIds).
    //   2. Supervisor's general appointments — visible to every tech under that
    //      supervisor ONLY when the appointment has no specific tech assigned yet.
    //   3. Appointments assigned to a different tech under the same supervisor
    //      stay hidden.
    const orConditions: any[] = [
      { technicianId: technician.id },
      { technicianIds: { has: technician.id } }
    ];
    if (technician.supervisorId) {
      orConditions.push({
        AND: [
          { supervisorIds: { has: technician.supervisorId } },
          { technicianId: null },
          { technicianIds: { isEmpty: true } }
        ]
      });
    }

    const where: any = {
      status: { not: 'cancelled' },
      OR: orConditions,
    };
    if (technician.projectId) where.projectId = technician.projectId;
    if (date) where.date = date;
    else if (from && to) where.date = { gte: from, lte: to };

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        unit: { select: { unitNumber: true } },
        project: {
          select: { id: true, name: true, officeLat: true, officeLng: true, officeAddress: true }
        },
        technician: {
          select: { id: true, name: true, specialty: true, phoneNumber: true }
        },
        workSession: {
          select: {
            id: true, status: true, technicianId: true,
            claimedAt: true, finishedAt: true, pausedAt: true,
            pauseReason: true, totalPausedMins: true,
            totalDurationMins: true, totalElapsedMins: true,
          }
        },
        tickets: {
          select: {
            id: true, ticketId: true, clientId: true, description: true,
            status: true, type: true, detectedTypes: true, priority: true,
            unit: { select: { unitNumber: true } },
            client: { select: { name: true, phone: true } }
          }
        }
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }]
    });

    const enriched = appointments.map((appointment: any) => {
      const ws = appointment.workSession;
      const isClaimedByMe =
        ws && ['in_progress', 'paused'].includes(ws.status) && ws.technicianId === technician.id;
      const isClaimedByOther =
        ws && ['in_progress', 'paused'].includes(ws.status) && ws.technicianId !== technician.id;
      const isPausedByMe = isClaimedByMe && ws.status === 'paused';

      const isCompleted = appointment.status === 'completed';

      const completedTickets = appointment.tickets?.filter((t: any) =>
        ['completed', 'closed', 'out_of_scope', 'absent'].includes(String(t.status).toLowerCase())
      ).length || 0;

      const unitNumber =
        appointment.unit?.unitNumber ||
        appointment.tickets?.find((tk: any) => tk.unit?.unitNumber)?.unit?.unitNumber ||
        '';
      const firstTicket = appointment.tickets?.[0];
      const clientName  = firstTicket?.client?.name  || appointment.clientName  || '';
      const clientPhone = firstTicket?.client?.phone || appointment.clientPhone || '';

      // Priority: 0 = in_progress by me, 1 = paused by me, 2 = pending mine, 99 = completed at bottom
      const appointmentPriority = isCompleted
        ? 99
        : (isClaimedByMe && !isPausedByMe ? 0 : (isPausedByMe ? 1 : 2));

      return {
        ...appointment,
        unitNumber,
        clientName,
        clientPhone,
        isClaimedByMe,
        isClaimedByOther,
        isPausedByMe,
        isCompleted,
        activeAppointmentId,
        // Only in_progress (not paused) blocks claiming another appointment.
        claimBlocked: !!activeAppointmentId && activeAppointmentId !== appointment.id,
        completedTickets,
        totalTickets: appointment.tickets?.length || 0,
        appointmentPriority,
      };
    });

    enriched.sort((a: any, b: any) => {
      if (a.appointmentPriority !== b.appointmentPriority) {
        return a.appointmentPriority - b.appointmentPriority;
      }
      if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
      return String(a.time || '').localeCompare(String(b.time || ''));
    });

    res.json(enriched);
  } catch (err: any) {
    console.error('GET /tech/appointments error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/tech/tickets/:id', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const { id } = req.params;
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        unit: { select: { unitNumber: true } },
        project: { select: { name: true } },
        client: { select: { name: true, phone: true } },
        appointment: {
          select: {
            id: true, notes: true, date: true, time: true, status: true,
            workSession: {
              select: { id: true, status: true, technicianId: true, claimedAt: true, finishedAt: true, totalDurationMins: true }
            }
          }
        }
      }
    });

    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    res.json({
      ...ticket,
      unitNumber: ticket.unit?.unitNumber,
      projectName: ticket.project?.name,
      clientName: ticket.client?.name,
      clientPhone: ticket.client?.phone,
      appointmentNotes: ticket.appointment?.notes,
      appointmentSession: ticket.appointment?.workSession || null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
