import type { NextFunction, Request, Response } from 'express';
import prisma from '../db.js';

const OPEN_VISIT_PHASES = ['claimed', 'en_route', 'arrived', 'in_progress', 'paused'];
const ACTIVE_TICKET_STATUSES = ['open', 'pending', 'in_progress', 'waiting', 'contractor', 'note'];

function requestPath(req: Request): string {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

/**
 * Legacy general-ticket routes still call maybeAutoFinishAppointment() after a
 * status change. That helper predates the technician visit state machine and can
 * complete a WorkSession without the technician's explicit Finish + GPS action.
 *
 * Until the large legacy attendance router is retired, prevent ONLY the mutation
 * that would terminalize the final active ticket while an open technician visit
 * exists. Supervisors/admins may still edit every other ticket normally.
 */
export async function protectOpenTechVisitFromLegacyAutoFinish(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const method = req.method.toUpperCase();
    const path = requestPath(req);

    const specialClose = method === 'POST'
      ? path.match(/^\/api\/tickets\/([^/]+)\/special-close$/)
      : null;
    const ticketUpdate = method === 'PUT'
      ? path.match(/^\/api\/tickets\/([^/]+)$/)
      : null;

    if (!specialClose && !ticketUpdate) {
      next();
      return;
    }

    // A normal PUT with no status change cannot trigger the legacy auto-finish.
    if (ticketUpdate && (req.body?.status === undefined || req.body?.status === null)) {
      next();
      return;
    }

    const ticketId = (specialClose || ticketUpdate)![1];
    const targetStatus = specialClose
      ? String(req.body?.closeType === 'out_of_scope' ? 'out_of_scope' : 'closed')
      : String(req.body?.status || '').toLowerCase();

    // If the target remains operationally active, the legacy helper will see a
    // remaining active ticket and cannot complete the visit.
    if (ACTIVE_TICKET_STATUSES.includes(targetStatus)) {
      next();
      return;
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, appointmentId: true },
    });
    if (!ticket?.appointmentId) {
      next();
      return;
    }

    const openSession = await prisma.appointmentWorkSession.findUnique({
      where: { appointmentId: ticket.appointmentId },
      select: { technicianId: true, status: true },
    });
    if (!openSession || !OPEN_VISIT_PHASES.includes(openSession.status)) {
      next();
      return;
    }

    const otherActiveTickets = await prisma.ticket.count({
      where: {
        appointmentId: ticket.appointmentId,
        id: { not: ticket.id },
        status: { in: ACTIVE_TICKET_STATUSES as any },
      },
    });

    if (otherActiveTickets > 0) {
      next();
      return;
    }

    res.status(409).json({
      code: 'OPEN_TECH_VISIT_REQUIRES_EXPLICIT_FINISH',
      error: 'لا يمكن إغلاق آخر تذكرة من المسار الإداري أثناء زيارة فني مفتوحة. حدّد النتيجة من تطبيق الفني ثم أنهِ الزيارة بالموقع.',
      appointmentId: ticket.appointmentId,
      technicianId: openSession.technicianId,
      visitPhase: openSession.status,
    });
  } catch (error) {
    console.error('[protect-tech-visit-completion] guard failed:', error);
    res.status(500).json({ error: 'تعذر التحقق من حالة زيارة الفني.' });
  }
}
