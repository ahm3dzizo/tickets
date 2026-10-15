import { closures } from './ticket-closure-plan.js';

export type ApprovalDecision = 'approve' | 'reject';
export type ApprovalVote = { decision: ApprovalDecision; at: string; notes: string };
export type ApprovalVotes = Record<string, ApprovalVote>;
export type ApprovalOutcome = 'pending' | 'approved' | 'rejected';

export function parseVotes(input: unknown): ApprovalVotes {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as ApprovalVotes;
}

export function approvalOutcome(approvers: string[], votes: ApprovalVotes): ApprovalOutcome {
  if (approvers.some(uid => votes[uid]?.decision === 'reject')) return 'rejected';
  if (approvers.length > 0 && approvers.every(uid => votes[uid]?.decision === 'approve')) return 'approved';
  return 'pending';
}

export function validateApprovalInitiator(
  role: string, uid: string,
  tickets: Array<{ status: string; assignedSupervisorIds: string[]; supervisorClosures: unknown }>,
) {
  if (role !== 'supervisor' || tickets.length === 0) throw new Error('SUPERVISOR_REQUIRED');
  for (const ticket of tickets) {
    if (['closed', 'completed', 'out_of_scope', 'absent'].includes(ticket.status)) {
      throw new Error('TICKET_ALREADY_CLOSED');
    }
    const personallyActive = ticket.assignedSupervisorIds.includes(uid);
    const personallyCompleted = closures(ticket.supervisorClosures).some(c => c.supervisorUid === uid);
    if (!personallyActive && !personallyCompleted) throw new Error('SUPERVISOR_NOT_ASSIGNED');
  }
}

export function matchesExpectedRoles(
  expected: Record<string, string[]>,
  tickets: Array<{ id: string; assignedSupervisorIds: string[] }>,
): boolean {
  return tickets.length === Object.keys(expected).length && tickets.every(ticket => {
    const previous = expected[ticket.id];
    return Array.isArray(previous) && previous.length === ticket.assignedSupervisorIds.length &&
      previous.every(uid => ticket.assignedSupervisorIds.includes(uid));
  });
}
