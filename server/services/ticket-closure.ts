import prisma from '../db.js';
import { closures, planClosure, uniqueClosureItems } from './ticket-closure-plan.js';
export { closures } from './ticket-closure-plan.js';


export async function closeTickets(uid: string, input: any) {
  const ids = [...new Set(input.ticketIds)] as string[];
  if (!ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || !id)) throw new Error('INVALID_TICKET_IDS');
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (
    input.supervisorUids !== undefined &&
    (!Array.isArray(input.supervisorUids) ||
      input.supervisorUids.length > 100 ||
      input.supervisorUids.some((id: unknown) => typeof id !== 'string' || !id))
  ) throw new Error('INVALID_SUPERVISOR_IDS');
  const items = input.items;
  if (!Array.isArray(items) || !items.length || items.length > 200 || items.some(i => !i || typeof i.description !== 'string' || !i.description.trim() || typeof i.status !== 'string')) throw new Error('INVALID_MAINTENANCE_ITEMS');
  return prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({where: {uid}, include: {projects: {select: {id: true}}}});
    if (!actor || actor.disabled) throw new Error('FORBIDDEN');
    // Lock in a consistent order. Re-read after the lock to serialize simultaneous closures/reassignments.
    for (const id of [...ids].sort()) await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
    const rows = await tx.ticket.findMany({where: {id: {in: ids}}, include: {client: true, unit: {include: {block: true}}, project: true}});
    if (rows.length !== ids.length) throw new Error('TICKET_NOT_FOUND');
    if (rows.some(t => actor.role !== 'admin' && !actor.projects.some(p => p.id === t.projectId))) throw new Error('FORBIDDEN');
    if (rows.some(t => t.unitId !== rows[0].unitId || t.clientId !== rows[0].clientId || t.projectId !== rows[0].projectId)) throw new Error('SAME_CUSTOMER_UNIT_REQUIRED');
    const finalRows: typeof rows = [];
    const results: {id: string; final: boolean; changed: boolean}[] = [];
    for (const ticket of rows) {
      if (ticket.status === 'closed' || ticket.status === 'completed') {
        if (actor.role === 'supervisor' && !closures(ticket.supervisorClosures).some(h => h.supervisorUid === uid) && !ticket.assignedSupervisorIds.includes(uid)) throw new Error('FORBIDDEN');
        results.push({id: ticket.id, final: true, changed: false}); continue;
      }
      const closureTarget =
        input.scope === 'selected' ? input.supervisorUids :
        input.scope === 'supervisor' ? input.supervisorUid :
        undefined;
      const plan = planClosure(
        ticket.assignedSupervisorIds,
        closures(ticket.supervisorClosures),
        actor,
        input.scope || 'self',
        closureTarget,
        notes,
        items,
      );
      results.push({id: ticket.id, final: plan.final, changed: plan.changed});
      if (!plan.changed) continue;
      const allItems = uniqueClosureItems([
        ...plan.history.flatMap(h => h.items),
        ...(!ticket.assignedSupervisorIds.length ? items : []),
      ]);
      const allNotes = [...new Set(plan.history.map(h => h.notes).filter(Boolean))].join('\n');
      const updated = await tx.ticket.update({where: {id: ticket.id}, data: {
        assignedSupervisorIds: plan.active, supervisorClosures: plan.history,
        status: plan.final ? 'closed' : 'in_progress', closedAt: plan.final ? new Date() : null,
        ...(plan.final ? {maintenanceItems: allItems.length ? allItems : items, closureNotes: allNotes || notes} : {}),
      }, include: {client: true, unit: {include: {block: true}}, project: true}});
      await tx.ticketAudit.create({data: {
        ticketId: ticket.id,
        field: plan.final ? 'إغلاق كامل للتذكرة' : 'إنهاء دور مشرف',
        oldValue: JSON.stringify(ticket.assignedSupervisorIds),
        newValue: JSON.stringify({
          remaining: plan.active,
          scope: input.scope || 'self',
          supervisorUid: input.supervisorUid || undefined,
          supervisorUids: input.supervisorUids || undefined,
          completedBy: uid,
          notes,
        }),
        changedBy: uid,
      }});
      if (plan.final) finalRows.push(updated);
    }
    if (!finalRows.length) return {results, image: null};

    const first = finalRows[0];
    if (first.client?.phone) {
      // Persist the report-generation job inside the same transaction, but do
      // not block the ticket closure on Python/image rendering. The worker will
      // render + send it after commit and can recover the job after a restart.
      await tx.ticketClosureReport.create({
        data: {
          ticketIds: finalRows.map(t => t.id),
          senderUid: uid,
          phone: first.client.phone,
          caption: '',
          image: Buffer.alloc(0),
          state: 'generating',
        },
      });
    }

    return {results, image: null};
  }, {timeout: 90000, maxWait: 10000});
}
