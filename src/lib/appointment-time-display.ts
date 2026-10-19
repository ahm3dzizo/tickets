/**
 * Customer-facing appointment time formatter.
 *
 * Scheduling/storage continue to use HH:mm (24-hour). Only the preview and
 * outgoing WhatsApp copy use the 12-hour Arabic display.
 */
export function formatAppointmentTime12Ar(time: string): string {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return time;
  const hour = Number(match[1]);
  const minutes = Number(match[2]);
  const hour12 = hour % 12 || 12;
  const period = hour === 12 ? 'ظهرًا' : hour < 12 ? 'صباحًا' : 'مساءً';
  return `${hour12}${minutes ? ':' + String(minutes).padStart(2, '0') : ''} ${period}`;
}

/**
 * Normalize direct API requests as well as the appointment dialog.
 * Leave already-formatted time-window labels (e.g. "بعد الظهر (1 م - 6 م)")
 * and other free text untouched.
 */
export function formatPreferredAppointmentTimeAr(label: string): string {
  const trimmed = label.trim();
  const match = /^(الساعة\s+)?([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) return label;
  return `${match[1] ? 'الساعة ' : ''}${formatAppointmentTime12Ar(`${match[2]}:${match[3]}`)}`;
}
