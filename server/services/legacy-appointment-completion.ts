import type {Prisma} from '@prisma/client';
import {closures} from './ticket-closure-plan.js';
// Legacy technician/shift completion must never bypass a shared supervisor role.
export async function completeLegacyAppointmentTickets(tx: Prisma.TransactionClient, appointmentId: string, now: Date, notes?: string) {
 const ids = await tx.$queryRaw<{id: string}[]>`SELECT id FROM "Ticket" WHERE "appointmentId" = ${appointmentId} ORDER BY id FOR UPDATE`;
 const tickets = await tx.ticket.findMany({where: {id: {in: ids.map(t=>t.id)}, status: {in: ['in_progress','open','pending']}}});
 const allowed = tickets.filter(t=>t.assignedSupervisorIds.length <= 1 && !closures(t.supervisorClosures).length);
 return tx.ticket.updateMany({where: {id: {in: allowed.map(t=>t.id)}}, data: {status: 'completed', closedAt: now, ...(notes ? {closureNotes: notes} : {})}});
}
