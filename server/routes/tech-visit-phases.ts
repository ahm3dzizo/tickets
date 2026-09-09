import { Router } from 'express';
import prisma from '../db.js';
import { requireTechAuth, TechAuthRequest } from './tech-auth.js';

const router = Router();

const BLOCKING_PHASES = ['claimed', 'en_route', 'arrived', 'in_progress'] as const;
const OWNED_OPEN_PHASES = [...BLOCKING_PHASES, 'paused'] as const;

type VisitPhase = typeof OWNED_OPEN_PHASES[number] | 'completed' | 'cancelled';

function httpError(message: string, status = 400, code?: string) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isAppointmentAccessible(appointment: any, technician: any): boolean {
  if (!appointment || !technician?.projectId || appointment.projectId !== technician.projectId) return false;

  const technicianIds = Array.isArray(appointment.technicianIds) ? appointment.technicianIds : [];
  const hasSpecificTechnician = Boolean(appointment.technicianId) || technicianIds.length > 0;
  const directlyAssigned = appointment.technicianId === technician.id || technicianIds.includes(technician.id);
  const supervisorPool =
    !hasSpecificTechnician &&
    Boolean(technician.supervisorId) &&
    Array.isArray(appointment.supervisorIds) &&
    appointment.supervisorIds.includes(technician.supervisorId);
  const ownsExistingSession = appointment.workSession?.technicianId === technician.id;

  return directlyAssigned || supervisorPool || ownsExistingSession;
}

async function loadTechnicianAndAppointment(technicianId: string, appointmentId: string) {
  const [technician, appointment] = await Promise.all([
    prisma.technician.findUnique({
      where: { id: technicianId },
      select: {
        id: true,
        isActive: true,
        projectId: true,
        supervisorId: true,
      },
    }),
    prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        workSession: true,
        tickets: { select: { id: true, status: true } },
      },
    }),
  ]);

  if (!technician?.isActive) throw httpError('Technician not found or inactive', 403);
  if (!appointment) throw httpError('Appointment not found', 404);
  if (!isAppointmentAccessible(appointment, technician)) {
    throw httpError('هذا الموعد غير مخصص لهذا الفني.', 403);
  }
  return { technician, appointment };
}

async function requireActiveShift(tx: any, technicianId: string) {
  const shift = await tx.shiftLog.findFirst({
    where: { technicianId, status: 'ACTIVE' },
    orderBy: { clockInAt: 'desc' },
  });
  if (!shift) {
    throw httpError('يجب تسجيل الحضور وإنهاء الاستراحة قبل متابعة الموعد.', 409, 'ACTIVE_SHIFT_REQUIRED');
  }
  return shift;
}

async function ownedSession(tx: any, technicianId: string, appointmentId: string) {
  const session = await tx.appointmentWorkSession.findUnique({ where: { appointmentId } });
  if (!session) throw httpError('لم يتم استلام هذا الموعد بعد.', 409, 'APPOINTMENT_NOT_CLAIMED');
  if (session.technicianId !== technicianId) {
    throw httpError('جلسة هذا الموعد تخص فنيًا آخر.', 403, 'APPOINTMENT_OWNED_BY_OTHER');
  }
  return session;
}

// ── 1) CLAIM: reserve the visit only. Do NOT start maintenance/ticket timers yet.
router.post('/appointments/:appointmentId/claim', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;
    const { lat, lng, accuracy } = req.body || {};

    const { appointment } = await loadTechnicianAndAppointment(technicianId, appointmentId);
    if (['cancelled', 'completed'].includes(String(appointment.status))) {
      throw httpError(`Cannot claim a ${appointment.status} appointment`, 409);
    }

    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${technicianId}))`;

      const otherActive = await tx.appointmentWorkSession.findFirst({
        where: {
          technicianId,
          status: { in: [...BLOCKING_PHASES] },
          appointmentId: { not: appointmentId },
        },
        include: {
          appointment: {
            select: { id: true, date: true, time: true, unit: { select: { unitNumber: true } } },
          },
        },
      });
      if (otherActive) {
        return { blockedBy: otherActive, session: null };
      }

      const existing = await tx.appointmentWorkSession.findUnique({ where: { appointmentId } });
      if (existing) {
        if ((OWNED_OPEN_PHASES as readonly string[]).includes(existing.status)) {
          if (existing.technicianId !== technicianId) {
            throw httpError('Another technician already owns this appointment', 409, 'APPOINTMENT_OWNED_BY_OTHER');
          }
          return { blockedBy: null, session: existing };
        }
        // The pre-route lifecycle audit snapshots this terminal row before a
        // successful re-claim, so deleting the single-row legacy session no
        // longer destroys visit history.
        await tx.appointmentWorkSession.delete({ where: { id: existing.id } });
      }

      const shift = await requireActiveShift(tx, technicianId);
      const session = await tx.appointmentWorkSession.create({
        data: {
          appointmentId,
          technicianId,
          shiftLogId: shift.id,
          status: 'claimed',
          claimLat: lat,
          claimLng: lng,
          claimAccuracy: accuracy,
        },
      });

      return { blockedBy: null, session };
    });

    if (result.blockedBy) {
      res.status(409).json({
        code: 'ACTIVE_APPOINTMENT_EXISTS',
        error: 'أنهِ أو أجّل الموعد الجاري قبل استلام موعد آخر.',
        activeAppointmentId: result.blockedBy.appointmentId,
        activeAppointment: result.blockedBy.appointment,
      });
      return;
    }

    res.json({ ok: true, phase: result.session?.status, session: result.session, updatedTickets: 0 });
  } catch (err: any) {
    res.status(err?.status || 400).json({ code: err?.code, error: err?.message || 'Claim failed' });
  }
});

// ── 2) EN ROUTE
router.post('/appointments/:appointmentId/travel', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;
    await loadTechnicianAndAppointment(technicianId, appointmentId);

    const session = await prisma.$transaction(async tx => {
      await requireActiveShift(tx, technicianId);
      const current = await ownedSession(tx, technicianId, appointmentId);
      if (current.status === 'en_route') return current;
      if (current.status !== 'claimed') {
        throw httpError(`Cannot start travel from phase ${current.status}`, 409, 'INVALID_VISIT_PHASE');
      }
      return tx.appointmentWorkSession.update({
        where: { id: current.id },
        data: { status: 'en_route' },
      });
    });

    res.json({ ok: true, phase: session.status, session });
  } catch (err: any) {
    res.status(err?.status || 400).json({ code: err?.code, error: err?.message || 'Travel start failed' });
  }
});

// ── 3) ARRIVED — GPS is enforced by the pre-route middleware.
router.post('/appointments/:appointmentId/arrive', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;
    await loadTechnicianAndAppointment(technicianId, appointmentId);

    const session = await prisma.$transaction(async tx => {
      await requireActiveShift(tx, technicianId);
      const current = await ownedSession(tx, technicianId, appointmentId);
      if (current.status === 'arrived') return current;
      if (current.status !== 'en_route') {
        throw httpError(`Cannot mark arrived from phase ${current.status}`, 409, 'INVALID_VISIT_PHASE');
      }
      return tx.appointmentWorkSession.update({
        where: { id: current.id },
        data: { status: 'arrived' },
      });
    });

    res.json({ ok: true, phase: session.status, session });
  } catch (err: any) {
    res.status(err?.status || 400).json({ code: err?.code, error: err?.message || 'Arrival failed' });
  }
});

// ── 4) START WORK — only now move tickets to in_progress and start work timer.
router.post('/appointments/:appointmentId/start-work', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;
    await loadTechnicianAndAppointment(technicianId, appointmentId);

    const result = await prisma.$transaction(async tx => {
      await requireActiveShift(tx, technicianId);
      const current = await ownedSession(tx, technicianId, appointmentId);
      if (current.status === 'in_progress') return { session: current, updatedTickets: 0 };
      if (current.status !== 'arrived') {
        throw httpError(`Cannot start work from phase ${current.status}`, 409, 'INVALID_VISIT_PHASE');
      }

      const workStartedAt = new Date();
      const session = await tx.appointmentWorkSession.update({
        where: { id: current.id },
        data: {
          status: 'in_progress',
          // claimedAt is the legacy work-duration anchor. The immutable
          // tech_visit_claim audit retains the earlier reservation timestamp.
          claimedAt: workStartedAt,
          pausedAt: null,
          totalPausedMins: 0,
        },
      });
      const updated = await tx.ticket.updateMany({
        where: { appointmentId, status: { in: ['open', 'pending'] } },
        data: { status: 'in_progress' },
      });
      return { session, updatedTickets: updated.count };
    });

    res.json({ ok: true, phase: result.session.status, ...result });
  } catch (err: any) {
    res.status(err?.status || 400).json({ code: err?.code, error: err?.message || 'Start work failed' });
  }
});

// ── PAUSE active maintenance. A paused session keeps ownership but does not
// block the technician from taking another appointment, matching existing policy.
router.post('/appointments/:appointmentId/pause', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';

    const session = await prisma.$transaction(async tx => {
      await requireActiveShift(tx, technicianId);
      const current = await ownedSession(tx, technicianId, appointmentId);
      if (current.status !== 'in_progress') {
        throw httpError('يمكن إيقاف الموعد مؤقتاً بعد بدء العمل فقط.', 409, 'INVALID_VISIT_PHASE');
      }
      return tx.appointmentWorkSession.update({
        where: { id: current.id },
        data: { status: 'paused', pausedAt: new Date(), pauseReason: reason || null },
      });
    });

    res.json({ ok: true, phase: session.status, session });
  } catch (err: any) {
    res.status(err?.status || 400).json({ code: err?.code, error: err?.message || 'Pause failed' });
  }
});

router.post('/appointments/:appointmentId/resume', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;

    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${technicianId}))`;
      await requireActiveShift(tx, technicianId);
      const current = await ownedSession(tx, technicianId, appointmentId);
      if (current.status !== 'paused') {
        throw httpError('Session is not paused', 409, 'INVALID_VISIT_PHASE');
      }

      const otherActive = await tx.appointmentWorkSession.findFirst({
        where: {
          technicianId,
          status: { in: [...BLOCKING_PHASES] },
          appointmentId: { not: appointmentId },
        },
        include: {
          appointment: {
            select: { id: true, date: true, time: true, unit: { select: { unitNumber: true } } },
          },
        },
      });
      if (otherActive) return { blockedBy: otherActive, session: null };

      const now = new Date();
      const extraPause = current.pausedAt
        ? Math.max(0, Math.round((now.getTime() - current.pausedAt.getTime()) / 60000))
        : 0;
      const session = await tx.appointmentWorkSession.update({
        where: { id: current.id },
        data: {
          status: 'in_progress',
          pausedAt: null,
          totalPausedMins: (current.totalPausedMins || 0) + extraPause,
        },
      });
      return { blockedBy: null, session };
    });

    if (result.blockedBy) {
      res.status(409).json({
        code: 'ACTIVE_APPOINTMENT_EXISTS',
        error: 'أنهِ أو أوقف الموعد الآخر قبل استئناف هذا الموعد.',
        activeAppointmentId: result.blockedBy.appointmentId,
        activeAppointment: result.blockedBy.appointment,
      });
      return;
    }
    res.json({ ok: true, phase: result.session?.status, session: result.session });
  } catch (err: any) {
    res.status(err?.status || 400).json({ code: err?.code, error: err?.message || 'Resume failed' });
  }
});

router.post('/appointments/:appointmentId/cancel-claim', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;

    const result = await prisma.$transaction(async tx => {
      const current = await ownedSession(tx, technicianId, appointmentId);
      if (!(OWNED_OPEN_PHASES as readonly string[]).includes(current.status)) {
        return { cancelled: false, session: current };
      }
      const session = await tx.appointmentWorkSession.update({
        where: { id: current.id },
        data: { status: 'cancelled', finishedAt: new Date(), pausedAt: null },
      });
      await tx.ticket.updateMany({
        where: { appointmentId, status: 'in_progress' },
        data: { status: 'pending' },
      });
      return { cancelled: true, session };
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(err?.status || 400).json({ code: err?.code, error: err?.message || 'Cancel claim failed' });
  }
});

router.post('/appointments/:appointmentId/postpone', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const appointmentId = req.params.appointmentId;
    const { newDate, newTime } = req.body || {};
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';

    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(newDate))) {
      throw httpError('newDate (YYYY-MM-DD) is required', 400);
    }
    if (newTime != null && newTime !== '' && !/^\d{2}:\d{2}$/.test(String(newTime))) {
      throw httpError('newTime must be HH:mm', 400);
    }

    const { appointment } = await loadTechnicianAndAppointment(technicianId, appointmentId);
    const result = await prisma.$transaction(async tx => {
      await requireActiveShift(tx, technicianId);
      const current = await tx.appointmentWorkSession.findUnique({ where: { appointmentId } });
      if (current && current.technicianId !== technicianId) {
        throw httpError('This appointment is owned by another technician', 403);
      }
      if (current && (OWNED_OPEN_PHASES as readonly string[]).includes(current.status)) {
        await tx.appointmentWorkSession.update({
          where: { id: current.id },
          data: {
            status: 'cancelled',
            finishedAt: new Date(),
            pausedAt: null,
            completionNotes: reason ? `تم التأجيل: ${reason}` : 'تم التأجيل',
          },
        });
      }
      await tx.ticket.updateMany({
        where: { appointmentId, status: 'in_progress' },
        data: { status: 'pending' },
      });
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          date: String(newDate),
          time: newTime ? String(newTime) : null,
          status: 'scheduled',
          notes: reason
            ? `${appointment.notes ? appointment.notes + '\n' : ''}تم التأجيل من ${appointment.date}${appointment.time ? ' ' + appointment.time : ''}: ${reason}`
            : appointment.notes,
        },
      });
      return { appointment: updated };
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(err?.status || 400).json({ code: err?.code, error: err?.message || 'Postpone failed' });
  }
});

export default router;
