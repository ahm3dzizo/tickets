/** A shared Ticket has one global row but several independent supervisor roles.
 * Do not copy the contractor/note of one role onto the global Ticket fields. */
export type SupervisorWorkInfo = {
  contractorId: string | null;
  contractorName: string | null;
  contractorNote: string | null;
  assigneeName: string | null;
};

export function workDetails(input: unknown): Record<string, SupervisorWorkInfo> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return {...input as Record<string, SupervisorWorkInfo>};
}

export function workDetailForSupervisor(ticket: {supervisorWorkDetails?: unknown}, uid: string) {
  const detail = workDetails(ticket.supervisorWorkDetails)[uid];
  return detail ? {
    contractorId: detail.contractorId,
    contractorName: detail.contractorName,
    contractorNote: detail.contractorNote,
    assigneeName: detail.assigneeName,
  } : {};
}

export function planWorkAssignment(
  previous: unknown,
  targetUid: string | null,
  shared: boolean,
  info: SupervisorWorkInfo | null,
) {
  const details = workDetails(previous);
  if (targetUid) {
    if (info) details[targetUid] = info;
    else delete details[targetUid];
  }
  return {
    details,
    // Legacy fields are only used on tickets that have no other supervisor.
    legacy: shared ? {} : {
      contractorId: info?.contractorId ?? null,
      contractorNote: info?.contractorNote ?? null,
      ...(info ? {assigneeName: info.assigneeName} : {}),
    },
  };
}
