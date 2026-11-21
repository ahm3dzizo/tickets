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
export type AppointmentTicketState = {
  status?: string | null;
  supervisorClosures?: unknown;
  supervisorStatuses?: Record<string, unknown> | null;
};

/**
 * A supervisor-level closure makes the ticket unavailable for new appointments,
 * even while another supervisor's shared-ticket role remains active.
 * Special outcomes (absence / misuse / out of scope) are terminal like closure,
 * but remain distinct persisted statuses for reporting and audit.
 */
export function isActiveAppointmentTicketStatus(
  value: string | null | undefined | AppointmentTicketState,
): boolean {
  if (value && typeof value === 'object') {
    if (Array.isArray(value.supervisorClosures) && value.supervisorClosures.length > 0) return false;
    const roleStatuses = Object.values(value.supervisorStatuses || {}).map(status =>
      String(status || '').trim().toLowerCase(),
    );
    if (roleStatuses.some(status => ['closed', 'completed', 'absent', 'out_of_scope', 'out-of-scope', 'misuse'].includes(status))) return false;
    value = value.status;
  }

  const status = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ![
    'closed', 'close', 'completed', 'complete', 'absent', 'absence',
    'عدم_تواجد', 'عدم_التواجد', 'out_of_scope', 'misuse',
    'سوء_استخدام', 'خارج_الاختصاص',
  ].includes(status);
}
