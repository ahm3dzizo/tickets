export function getProviderFallbackOrder(
  configured: string[],
  unavailable: string[] = [],
  excluded: string[] = [],
): string[] {
  const blocked = new Set([...unavailable, ...excluded]);
  return configured.filter(label => !blocked.has(label));
}

export function getAiRetryDelayMs(
  attempt: number,
  baseMs = 5 * 60_000,
  maxMs = 30 * 60_000,
): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  return Math.min(baseMs * (2 ** (safeAttempt - 1)), maxMs);
}
