import type { TicketStatus } from '@prisma/client';
import { closures } from './ticket-closure-plan.js';

export class BulkStatusError extends Error {
  constructor(public code: string, public httpStatus: number, message: string) { super(message); }
}

export type Actor = {uid: string; role: string; disabled: boolean; projects: {id: string}[]};
export type Row = {
  projectId: string;
  status: TicketStatus;
  assignedSupervisorIds: string[];
  supervisorClosures: unknown;
  supervisorStatuses: unknown;
};
const terminal = new Set<TicketStatus>(['closed','completed','absent','out_of_scope']);
const validStatuses = new Set<TicketStatus>([
  'open','in_progress','pending','waiting','completed','closed',
  'absent','out_of_scope','contractor','note',
]);

export function supervisorStatuses(value: unknown): Record<string, TicketStatus> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, TicketStatus] =>
      typeof entry[1] === 'string' && validStatuses.has(entry[1] as TicketStatus));
  return Object.fromEntries(entries);
}

// For each supervisor the status is personal. The global status is kept
// separately for the management view and never used to overwrite colleagues.
export function personalTicketStatus(
  ticket: Pick<Row, 'status' | 'assignedSupervisorIds' | 'supervisorClosures' | 'supervisorStatuses'>,
  uid: string,
): TicketStatus {
  const personal = supervisorStatuses(ticket.supervisorStatuses)[uid];
  if (personal) return personal;
  if (!ticket.assignedSupervisorIds.includes(uid) &&
      closures(ticket.supervisorClosures).some(h => h.supervisorUid === uid)) {
    return 'closed';
  }
  return ticket.status;
}

export function checkBulkStatusAccess(actor: Actor | null, rows: Row[], expectedCount: number) {
  if (!actor || actor.disabled || !['admin','engineer','supervisor'].includes(actor.role)) {
    throw new BulkStatusError('FORBIDDEN',403,'ليس لديك صلاحية تحديث حالة التذاكر.');
  }
  if (rows.length !== expectedCount || rows.some(t =>
      actor.role !== 'admin' && !actor.projects.some(p => p.id === t.projectId))) {
    throw new BulkStatusError('TICKET_ACCESS_DENIED',403,'بعض التذاكر غير موجودة أو خارج مشاريعك.');
  }
  if (actor.role === 'supervisor' && rows.some(t =>
    !t.assignedSupervisorIds.includes(actor.uid) &&
    !closures(t.supervisorClosures).some(h => h.supervisorUid === actor.uid))) {
    throw new BulkStatusError('SUPERVISOR_NOT_ASSIGNED',403,'يمكنك تحديث حالة دورك في التذاكر المسندة إليك فقط.');
  }
}

/**
 * The "الحالة" action is internal-only: no WhatsApp, no customer report, no
 * approval request. It affects only ONE supervisor role on a shared ticket.
 * Explicit "إغلاق" / "طلب الإغلاق للجميع" remain independent workflows.
 */
export function planBulkStatus(actor: Actor, ticket: Row, desired: TicketStatus, requestedSupervisorUid?: string) {
  const history = closures(ticket.supervisorClosures);
  const roles = [...new Set([...ticket.assignedSupervisorIds, ...history.map(h => h.supervisorUid)])];
  const personal = supervisorStatuses(ticket.supervisorStatuses);
  const privileged = actor.role === 'admin' || actor.role === 'engineer';
  const roleUid = privileged ? (requestedSupervisorUid || (roles.length === 1 ? roles[0] : undefined)) : actor.uid;

  if (roles.length === 0) {
    if (!privileged) throw new BulkStatusError('SUPERVISOR_NOT_ASSIGNED',403,'ليس لديك دور على هذه التذكرة.');
    if (requestedSupervisorUid) throw new BulkStatusError('SUPERVISOR_NOT_ASSIGNED',409,'المشرف غير مسؤول عن هذه التذكرة.');
    return {
      status: desired,
      assignedSupervisorIds: ticket.assignedSupervisorIds,
      supervisorClosures: history,
      supervisorStatuses: personal,
      closedAt: terminal.has(desired) ? new Date() : null,
    };
  }
  if (!roleUid) {
    throw new BulkStatusError('SUPERVISOR_TARGET_REQUIRED',409,
      'التذكرة مشتركة. حدد المشرف المطلوب تغيير حالته بشكل مستقل.');
  }
  if (!roles.includes(roleUid)) {
    throw new BulkStatusError('SUPERVISOR_NOT_ASSIGNED',409,'المشرف المختار غير مسؤول عن هذه التذكرة.');
  }
  if (!privileged && roleUid !== actor.uid) {
    throw new BulkStatusError('FORBIDDEN',403,'لا يمكنك تغيير حالة دور مشرف آخر.');
  }

  const active = [...ticket.assignedSupervisorIds];
  const wasActive = active.includes(roleUid);
  const hadCompleted = history.some(h => h.supervisorUid === roleUid);
  if (!wasActive && !hadCompleted) {
    throw new BulkStatusError('SUPERVISOR_NOT_ASSIGNED',409,'المشرف غير نشط على هذه التذكرة.');
  }
  if (ticket.assignedSupervisorIds.length === 0 &&
      terminal.has(ticket.status) && !privileged) {
    const alreadyThisStatus = personalTicketStatus(ticket, roleUid) === desired;
    if (!alreadyThisStatus) {
      throw new BulkStatusError('MANAGEMENT_REOPEN_REQUIRED',409,
        'التذكرة أغلقت نهائيًا. إعادة فتح الدور تحتاج الإدارة.');
    }
  }

  // Snapshot other supervisors' previously visible state before changing the
  // aggregate status, so their screens never silently switch on our action.
  for (const uid of roles) {
    if (uid !== roleUid && !personal[uid]) {
      personal[uid] = personalTicketStatus(ticket, uid);
    }
  }
  personal[roleUid] = desired;

  if (terminal.has(desired)) {
    const remaining = active.filter(uid => uid !== roleUid);
    const nextHistory = wasActive
      ? [
          ...history.filter(h => h.supervisorUid !== roleUid),
          {
            supervisorUid: roleUid,
            completedAt: new Date().toISOString(),
            completedByUid: actor.uid,
            notes: 'تغيير حالة داخلي - بدون تقرير للعميل',
            items: [],
          },
        ]
      : history;
    const final = remaining.length === 0;
    return {
      status: final ? desired : 'in_progress' as TicketStatus,
      assignedSupervisorIds: remaining,
      supervisorClosures: nextHistory,
      supervisorStatuses: personal,
      closedAt: final ? new Date() : null,
    };
  }

  const remaining = wasActive ? active : [...active, roleUid];
  const nextHistory = hadCompleted ? history.filter(h => h.supervisorUid !== roleUid) : history;
  // One supervisor: the ticket itself can follow their internal status.
  // Shared: preserve the global aggregate; only the chosen role changes.
  const single = remaining.length === 1 && nextHistory.length === 0;
  return {
    status: single ? desired : terminal.has(ticket.status) ? 'in_progress' as TicketStatus : ticket.status,
    assignedSupervisorIds: remaining,
    supervisorClosures: nextHistory,
    supervisorStatuses: personal,
    closedAt: null,
  };
}
