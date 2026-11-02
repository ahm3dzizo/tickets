// Approval maintenance details are keyed by ticket ID so they cannot leak
// between tickets in the same customer/unit closure batch.
export function itemsForTicket<T>(value: unknown, ticketId: string): T[] {
  if (Array.isArray(value)) return value as T[]; // legacy approval rows
  if (value && typeof value === 'object') {
    const mapped = (value as Record<string, unknown>)[ticketId];
    return Array.isArray(mapped) ? mapped as T[] : [];
  }
  return [];
}

export function itemsForReport<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]; // legacy approval rows
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(items =>
      Array.isArray(items) ? items as T[] : []);
  }
  return [];
}
