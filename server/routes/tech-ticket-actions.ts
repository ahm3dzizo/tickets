import { Router } from 'express';
import prisma from '../db.js';
import { requireTechAuth, TechAuthRequest } from './tech-auth.js';

const router = Router();

const ALLOWED_TICKET_STATUSES = [
  'completed',
  'out_of_scope',
  'waiting',
  'absent',
  'contractor',
  'in_progress',
] as const;

type AllowedTicketStatus = typeof ALLOWED_TICKET_STATUSES[number];

const UNRESOLVED_VISIT_STATUSES = ['open', 'pending', 'in_progress', 'note'];
const TERMINAL_TICKET_STATUSES = ['completed', 'out_of_scope', 'absent'];

function cleanNotes(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean.slice(0, 2000) : null;
}

// PATCH /api/tech/appointments/:appointmentId/tickets/:ticketId
// A technician must deliberately record a result for each ticket. The auth
// middleware already verifies: active account, active shift, appointment access,
// session ownership and session=in_progress. We repeat ownership checks here as
// defense-in-depth because this endpoint mutates production ticket data.
router.patch(
  '/appointments/:appointmentId/tickets/:ticketId',
  requireTechAuth,
  async (req: TechAuthRequest, res) => {
    try {
      const technicianId = req.technicianId!;
      const { appointmentId, ticketId } = req.params;
      const status = String(req.body?.status || '').toLowerCase() as AllowedTicketStatus;
      const notes = cleanNotes(req.body?.notes);

      if (!ALLOWED_TICKET_STATUSES.includes(status)) {
        res.status(400).json({ error: `Invalid status: ${status}` });
        return;
      }
      if (status !== 'in_progress' && (!notes || notes.length < 3)) {
        res.status(400).json({
          code: 'OUTCOME_NOTE_REQUIRED',
          error: 'أضف ملاحظة توضح نتيجة التذكرة.',
        });
        return;
      }

      const result = await prisma.$transaction(async tx => {
        const session = await tx.appointmentWorkSession.findUnique({
          where: { appointmentId },
          select: { id: true, technicianId: true, status: true },
        });
        if (!session || session.technicianId !== technicianId || session.status !== 'in_progress') {
          throw new Error('No active technician session for this appointment');
        }

        const ticket = await tx.ticket.findFirst({
          where: { id: ticketId, appointmentId },
          select: {
            id: true,
            status: true,
            closureNotes: true,
          },
        });
        if (!ticket) throw new Error('Ticket not in this appointment');

        const now = new Date();
        const isTerminal = TERMINAL_TICKET_STATUSES.includes(status);
        const updated = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            status,
            closedAt: isTerminal ? now : null,
            // Keep the field name for schema compatibility, but use it as the
            // technician's visit-outcome note for every deliberate disposition.
            closureNotes: status === 'in_progress' ? null : notes,
          },
        });

        const audits: Array<{
          ticketId: string;
          field: string;
          oldValue: string | null;
          newValue: string | null;
          changedBy: string;
        }> = [];
        if (String(ticket.status) !== status) {
          audits.push({
            ticketId,
            field: 'status',
            oldValue: String(ticket.status),
            newValue: status,
            changedBy: `technician:${technicianId}`,
          });
        }
        if ((ticket.closureNotes || null) !== (status === 'in_progress' ? null : notes)) {
          audits.push({
            ticketId,
            field: 'closureNotes',
            oldValue: ticket.closureNotes || null,
            newValue: status === 'in_progress' ? null : notes,
            changedBy: `technician:${technicianId}`,
          });
        }
        if (audits.length) await tx.ticketAudit.createMany({ data: audits });

        return updated;
      });

      res.json(result);
    } catch (err: any) {
      const message = err?.message || 'Failed to update ticket';
      const statusCode = message.includes('not in this appointment') ? 404 : 400;
      res.status(statusCode).json({ error: message });
    }
  },
);

// POST /api/tech/appointments/:appointmentId/finish
// Finishes only the technician visit/session. It NEVER silently changes ticket
// outcomes. waiting/contractor are valid hand-off outcomes and remain open for
// the next operational workflow while this field visit is closed.
router.post(
  '/appointments/:appointmentId/finish',
  requireTechAuth,
  async (req: TechAuthRequest, res) => {
    try {
      const technicianId = req.technicianId!;
      const appointmentId = req.params.appointmentId;
      const notes = cleanNotes(req.body?.notes);
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);

      const result = await prisma.$transaction(async tx => {
        const session = await tx.appointmentWorkSession.findUnique({
          where: { appointmentId },
        });
        if (!session) throw new Error('No session for this appointment');
        if (session.technicianId !== technicianId) throw new Error('Not your appointment');
        if (session.status === 'completed') {
          return { session, unresolvedTickets: 0, alreadyCompleted: true };
        }
        if (session.status === 'cancelled') throw new Error('Appointment session is cancelled');

        const unresolvedTickets = await tx.ticket.findMany({
          where: {
            appointmentId,
            status: { in: UNRESOLVED_VISIT_STATUSES as any },
          },
          select: { id: true, ticketId: true, status: true },
        });
        if (unresolvedTickets.length > 0) {
          const error: any = new Error(`يوجد ${unresolvedTickets.length} تذكرة بدون نتيجة نهائية للزيارة.`);
          error.code = 'UNRESOLVED_TICKETS';
          error.ticketIds = unresolvedTickets.map(ticket => ticket.id);
          throw error;
        }

        const now = new Date();
        let extraPause = 0;
        if (session.status === 'paused' && session.pausedAt) {
          extraPause = Math.round((now.getTime() - session.pausedAt.getTime()) / 60000);
        }
        const totalPausedMins = (session.totalPausedMins || 0) + extraPause;
        const totalElapsedMins = Math.max(0, Math.round((now.getTime() - session.claimedAt.getTime()) / 60000));
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
            finishLat: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
            finishLng: Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null,
            completionNotes: notes,
          },
        });

        await tx.appointment.update({
          where: { id: appointmentId },
          data: { status: 'completed' },
        });

        if (session.shiftLogId) {
          await tx.shiftLog.update({
            where: { id: session.shiftLogId },
            data: { totalWorkMinutes: { increment: totalDurationMins } },
          });
        }

        return { session: updatedSession, unresolvedTickets: 0, alreadyCompleted: false };
      });

      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(err?.code === 'UNRESOLVED_TICKETS' ? 409 : 400).json({
        code: err?.code,
        error: err?.message || 'Failed to finish appointment',
        remainingTicketIds: err?.ticketIds,
      });
    }
  },
);

export default router;
