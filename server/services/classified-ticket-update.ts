import prisma from '../db.js';
import {closures} from './ticket-closure-plan.js';
export async function updateClassifiedTicket(id: string, data: Record<string, any>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
    const current = await tx.ticket.findUnique({where: {id}});
    if (!current) return;
    if (current.assignedSupervisorIds.length > 1 || closures(current.supervisorClosures).length) {delete data.status; delete data.closedAt;}
    if (data.assignedSupervisorIds) {
      if (current.status === 'closed' || current.status === 'completed') delete data.assignedSupervisorIds;
      else data.assignedSupervisorIds = data.assignedSupervisorIds.filter((uid: string) => !closures(current.supervisorClosures).some(h => h.supervisorUid === uid));
    }
    return tx.ticket.update({where: {id}, data});
  });
}
