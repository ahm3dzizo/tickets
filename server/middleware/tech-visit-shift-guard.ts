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
