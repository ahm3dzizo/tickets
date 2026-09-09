import type { NextFunction, Request, Response } from 'express';
import prisma from '../db.js';
import type { TechAuthRequest } from '../routes/tech-auth.js';

type SessionSnapshot = {
  session: any;
  ticketIds: string[];
};

type AuditRequest = TechAuthRequest & {
  __previousTechSessionSnapshot?: SessionSnapshot | null;
};

function requestPath(req: Request): string {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function actionMatch(req: Request): { appointmentId: string; action: string } | null {
  if (req.method.toUpperCase() !== 'POST') return null;
  const match = requestPath(req).match(
    /^\/api\/tech\/appointments\/([^/]+)\/(claim|travel|arrive|start-work|finish|cancel-claim|pause|resume|postpone)$/,
  );
  return match ? { appointmentId: match[1], action: match[2] } : null;
}

function safeIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function requestLocation(req: Request) {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const accuracy = Number(req.body?.accuracy);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  };
}

function compactSessionSnapshot(session: any, action: string, req?: Request) {
  if (!session) return { action, session: null, requestLocation: req ? requestLocation(req) : null };
  return {
    action,
    sessionId: session.id || null,
    appointmentId: session.appointmentId || null,
    technicianId: session.technicianId || null,
    shiftLogId: session.shiftLogId || null,
    status: session.status || null,
    claimedAt: safeIso(session.claimedAt),
    pausedAt: safeIso(session.pausedAt),
    finishedAt: safeIso(session.finishedAt),
    pauseReason: session.pauseReason || null,
    totalPausedMins: session.totalPausedMins ?? null,
    totalDurationMins: session.totalDurationMins ?? null,
    totalElapsedMins: session.totalElapsedMins ?? null,
    claimLat: session.claimLat ?? null,
    claimLng: session.claimLng ?? null,
    claimAccuracy: session.claimAccuracy ?? null,
    finishLat: session.finishLat ?? null,
    finishLng: session.finishLng ?? null,
    completionNotes: session.completionNotes || null,
    requestLocation: req ? requestLocation(req) : null,
    recordedAt: new Date().toISOString(),
  };
}

async function ticketIdsForAppointment(appointmentId: string): Promise<string[]> {
  const tickets = await prisma.ticket.findMany({
    where: { appointmentId },
    select: { id: true },
  });
  return tickets.map(ticket => ticket.id);
}

async function writeLifecycleAudit(
  ticketIds: string[],
  field: string,
  value: unknown,
  changedBy: string,
) {
  if (!ticketIds.length) return;
  const serialized = JSON.stringify(value).slice(0, 8000);
  await prisma.ticketAudit.createMany({
    data: ticketIds.map(ticketId => ({
      ticketId,
      field,
      oldValue: null,
      newValue: serialized,
      changedBy,
    })),
  });
}

/**
 * Preserve technician visit history without changing the current Prisma schema.
 * AppointmentWorkSession is still one-row-per-appointment today and a re-claim
 * can delete a completed/cancelled row. We snapshot the previous terminal row
 * before the claim and write it to TicketAudit only if the claim succeeds.
 * Every successful lifecycle action is also written as an immutable audit event,
 * including the action GPS when supplied.
 */
export async function auditTechSessionLifecycle(
  req: AuditRequest,
  res: Response,
  next: NextFunction,
) {
  const matched = actionMatch(req);
  if (!matched) {
    next();
    return;
  }

  if (matched.action === 'claim') {
    try {
      const existing = await prisma.appointmentWorkSession.findUnique({
        where: { appointmentId: matched.appointmentId },
      });
      if (existing && ['completed', 'cancelled'].includes(existing.status)) {
        req.__previousTechSessionSnapshot = {
          session: existing,
          ticketIds: await ticketIdsForAppointment(matched.appointmentId),
        };
      }
    } catch (error) {
      console.warn('[tech-session-audit] pre-claim snapshot failed:', error);
    }
  }

  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    void (async () => {
      const changedBy = req.technicianId
        ? `technician:${req.technicianId}`
        : 'technician:unknown';

      const previous = req.__previousTechSessionSnapshot;
      if (previous?.session) {
        await writeLifecycleAudit(
          previous.ticketIds,
          'tech_visit_archived',
          compactSessionSnapshot(previous.session, 'archived_before_reclaim'),
          changedBy,
        );
      }

      const [session, ticketIds] = await Promise.all([
        prisma.appointmentWorkSession.findUnique({
          where: { appointmentId: matched.appointmentId },
        }),
        ticketIdsForAppointment(matched.appointmentId),
      ]);

      await writeLifecycleAudit(
        ticketIds,
        `tech_visit_${matched.action.replace('-', '_')}`,
        compactSessionSnapshot(session, matched.action, req),
        changedBy,
      );
    })().catch(error => {
      console.warn('[tech-session-audit] lifecycle write failed:', error);
    });
  });

  next();
}
