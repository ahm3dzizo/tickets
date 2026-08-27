const NARA_ORIGIN = 'https://router.bynara.id';
const MAX_REQUESTS_PER_MINUTE = 15;
const MIN_SPACING_MS = Math.ceil(60_000 / MAX_REQUESTS_PER_MINUTE);
const MAX_RETRIES = 2;

let installed = false;
let queue: Promise<void> = Promise.resolve();
let nextAllowedAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isNaraRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  return url.startsWith(NARA_ORIGIN);
}

async function acquireSlot(): Promise<void> {
  let release!: () => void;
  const previous = queue;
  queue = new Promise<void>(resolve => { release = resolve; });
  await previous;

  try {
    const waitMs = Math.max(0, nextAllowedAt - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    nextAllowedAt = Date.now() + MIN_SPACING_MS;
  } finally {
    release();
  }
}

function retryDelay(response?: Response, attempt = 0): number {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
  }
  return Math.max(MIN_SPACING_MS, 1_500 * (attempt + 1));
}

export function installNaraRateLimiter(): void {
  if (installed) return;
  installed = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isNaraRequest(input)) return originalFetch(input, init);

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      await acquireSlot();
      try {
        const response = await originalFetch(input, init);
        const retryable = response.status === 429 || [502, 503, 504].includes(response.status);
        if (!retryable || attempt === MAX_RETRIES) return response;

        const delay = retryDelay(response, attempt);
        console.warn(`[NaraLimiter] ${response.status} — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay / 1000)}s`);
        await sleep(delay);
      } catch (error) {
        lastError = error;
        if (attempt === MAX_RETRIES) throw error;
        const delay = retryDelay(undefined, attempt);
        console.warn(`[NaraLimiter] network error — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay / 1000)}s`);
        await sleep(delay);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('NaraRouter request failed');
  }) as typeof fetch;

  console.log(`[NaraLimiter] Installed — shared limit ${MAX_REQUESTS_PER_MINUTE} requests/minute`);
}

installNaraRateLimiter();
