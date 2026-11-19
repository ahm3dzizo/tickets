/**
 * Sending a proposal on WhatsApp must not undo an actual scheduled appointment.
 * Keep supervisor/contractor workflows intact; only appointment-related states
 * may be adjusted automatically by the outgoing appointment-range message.
 */
export function ticketStatusAfterAppointmentRangeSent(
  status: string,
  hasScheduledAppointment: boolean,
): 'waiting' | 'pending' | null {
  if (hasScheduledAppointment) return status === 'waiting' ? 'pending' : null;
  return ['open', 'pending'].includes(status) ? 'waiting' : null;
}

/**
 * Scheduling is reflected in badges independently of earlier WhatsApp
 * proposals (which might have left a legacy "waiting" status).
 * Other statuses—closed, contractor, in-progress, etc.—remain untouched.
 */
export function hasScheduledTicketBadge(ticket: {
  status: string;
  appointmentTime?: string | null;
  appointment?: {status?: string | null} | null;
}): boolean {
  return Boolean(ticket.appointmentTime &&
    (ticket.status === 'pending' || ticket.status === 'waiting') &&
    (!ticket.appointment || ticket.appointment.status === 'scheduled'));
}


/**
 * Tickets in a terminal workflow state must not be offered as active work
 * when creating appointments or shown in the unit's active-ticket modal.
 * Keep contractor/note and other internal states visible.
 */
export function isActiveAppointmentTicketStatus(status: string | null | undefined): boolean {
  return !['closed', 'completed', 'absent', 'out_of_scope', 'out-of-scope'].includes(
    String(status || '').trim().toLowerCase(),
  );
}
