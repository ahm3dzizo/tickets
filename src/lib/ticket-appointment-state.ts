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
