import type { NextFunction, Response } from 'express';
import prisma from '../db.js';
import type { TechAuthRequest } from '../routes/tech-auth.js';

const OPEN_VISIT_PHASES = ['claimed', 'en_route', 'arrived', 'in_progress', 'paused'];
const BREAK_BLOCKING_PHASES = ['claimed', 'en_route', 'arrived', 'in_progress'];

export async function blockClockOutWithOpenVisit(
  req: TechAuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await prisma.appointmentWorkSession.findFirst({
      where: {
        technicianId: req.technicianId!,
        status: { in: OPEN_VISIT_PHASES },
      },
      select: { appointmentId: true, status: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (session) {
      res.status(409).json({
        code: 'UNFINISHED_APPOINTMENT',
        error: 'لا يمكن تسجيل الانصراف قبل إنهاء أو تأجيل الموعد الجاري.',
        activeAppointmentId: session.appointmentId,
        sessionStatus: session.status,
      });
      return;
    }
    next();
  } catch (error) {
    console.error('[tech-visit-shift-guard] clock-out check failed:', error);
    res.status(500).json({ error: 'تعذر التحقق من الموعد الجاري.' });
  }
}

export async function blockBreakWithActiveVisit(
  req: TechAuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await prisma.appointmentWorkSession.findFirst({
      where: {
        technicianId: req.technicianId!,
        status: { in: BREAK_BLOCKING_PHASES },
      },
      select: { appointmentId: true, status: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (session) {
      res.status(409).json({
        code: 'ACTIVE_VISIT_BLOCKS_BREAK',
        error: 'لا يمكن بدء الاستراحة أثناء زيارة جارية. أنهِ أو أجّل الموعد أولاً.',
        activeAppointmentId: session.appointmentId,
        sessionStatus: session.status,
      });
      return;
    }
    next();
  } catch (error) {
    console.error('[tech-visit-shift-guard] break check failed:', error);
    res.status(500).json({ error: 'تعذر التحقق من الموعد الجاري.' });
  }
}

/**
 * The state machine may only reach visit completion from in_progress. This keeps
 * a technician from jumping directly from claimed/en_route/arrived to finish,
 * even if all ticket rows happened to already carry non-blocking statuses.
 */
export async function requireInProgressVisitForFinish(
  req: TechAuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    if (!/^\/api\/tech\/appointments\/[^/]+\/finish$/.test(path)) {
      next();
      return;
    }

    const appointmentId = req.params.appointmentId;
    const session = await prisma.appointmentWorkSession.findUnique({
      where: { appointmentId },
      select: { technicianId: true, status: true },
    });

    if (!session || session.technicianId !== req.technicianId) {
      res.status(403).json({
        code: 'APPOINTMENT_SESSION_NOT_OWNED',
        error: 'جلسة هذا الموعد لا تخص هذا الفني.',
      });
      return;
    }

    if (session.status !== 'in_progress') {
      res.status(409).json({
        code: 'INVALID_VISIT_PHASE',
        error: 'لا يمكن إنهاء الموعد قبل الوصول وبدء العمل.',
        currentPhase: session.status,
        requiredPhase: 'in_progress',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('[tech-visit-shift-guard] finish phase check failed:', error);
    res.status(500).json({ error: 'تعذر التحقق من مرحلة الموعد.' });
  }
}
