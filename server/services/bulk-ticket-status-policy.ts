import type {TicketStatus} from '@prisma/client';
import {closures, planClosure} from './ticket-closure-plan.js';
export class BulkStatusError extends Error {
  constructor(public code: string, public httpStatus: number, message: string) { super(message); }
}
type Actor = {uid: string; role: string; disabled: boolean; projects: {id: string}[]};
type Row = {projectId: string; status: TicketStatus; assignedSupervisorIds: string[]; supervisorClosures: unknown};
export function checkBulkStatusAccess(actor: Actor | null, rows: Row[], expectedCount: number) {
  if (!actor || actor.disabled || !['admin','engineer','supervisor'].includes(actor.role)) throw new BulkStatusError('FORBIDDEN',403,'ليس لديك صلاحية تحديث حالة التذاكر.');
  if (rows.length !== expectedCount || rows.some(t => actor.role !== 'admin' && !actor.projects.some(p => p.id === t.projectId))) throw new BulkStatusError('TICKET_ACCESS_DENIED',403,'بعض التذاكر غير موجودة أو خارج مشاريعك.');
  if (actor.role === 'supervisor' && rows.some(t => !t.assignedSupervisorIds.includes(actor.uid) && !closures(t.supervisorClosures).some(h => h.supervisorUid === actor.uid))) throw new BulkStatusError('SUPERVISOR_NOT_ASSIGNED',403,'يمكنك تحديث حالة دورك في التذاكر المسندة إليك فقط.');
}
const terminal = new Set(['closed','completed','absent','out_of_scope']);
export function planBulkStatus(actor: Actor, ticket: Row, status: TicketStatus) {
  const history = closures(ticket.supervisorClosures);
  if (terminal.has(status)) {
    const plan = planClosure(ticket.assignedSupervisorIds, history, actor, actor.role === 'supervisor' ? 'self' : 'all', undefined, '', []);
    return {status: plan.changed ? (plan.final ? status : 'in_progress') : ticket.status,
      assignedSupervisorIds: plan.active, supervisorClosures: plan.history,
      closedAt: plan.changed && plan.final ? new Date() : undefined};
  }
  const completedSelf = actor.role === 'supervisor' && !ticket.assignedSupervisorIds.includes(actor.uid) && history.some(h => h.supervisorUid === actor.uid);
  const reopenAll = actor.role !== 'supervisor' && terminal.has(ticket.status);
  return {status,
    assignedSupervisorIds: reopenAll ? [...new Set([...ticket.assignedSupervisorIds, ...history.map(h => h.supervisorUid)])] : completedSelf ? [...ticket.assignedSupervisorIds, actor.uid] : ticket.assignedSupervisorIds,
    supervisorClosures: reopenAll ? [] : completedSelf ? history.filter(h => h.supervisorUid !== actor.uid) : history,
    closedAt: null};
}
