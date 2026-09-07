const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;
const RIYADH_TZ = 'Asia/Riyadh';

type DateLike = string | number | Date | { toDate?: () => Date } | null | undefined;

function asDate(value: DateLike): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats calendar-only values without timezone conversion, while timestamps
 * are rendered using the business timezone. This prevents YYYY-MM-DD values
 * from shifting a day on clients in another timezone.
 */
export function formatTicketDate(value: DateLike): string | null {
  if (typeof value === 'string') {
    const match = value.match(DATE_ONLY_RE);
    if (match && !value.includes('T')) {
      const [, year, month, day] = match;
      return `${day}/${month}/${year}`;
    }
  }

  const date = asDate(value);
  if (!date) return null;

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: RIYADH_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatTicketDateTime(value: DateLike): string | null {
  const date = asDate(value);
  if (!date) return null;

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: RIYADH_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
