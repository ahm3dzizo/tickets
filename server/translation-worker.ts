import prisma from './db.js';
import { translateAndCache, type TargetLanguage } from './routes/translation.js';

const TICKET_BATCH_SIZE = 25;
const TARGET_LANGS: TargetLanguage[] = ['en', 'hi', 'ur'];
const MAX_TEXTS_PER_PASS = 60;
const BUSY_DELAY_MS = 2_000;
const IDLE_DELAYS_MS = [20_000, 60_000, 5 * 60_000, 15 * 60_000];

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let started = false;
let nudged = false;
let idleLevel = 0;
let scanOffset = 0;

function collectTicketTexts(ticket: {
  description: string;
  closureNotes: string | null;
  contractorNote: string | null;
  appointment: { notes: string | null } | null;
}): string[] {
  return [
    ticket.description,
    ticket.closureNotes,
    ticket.contractorNote,
    ticket.appointment?.notes ?? null,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean);
}

function clearWorkerTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNext(delayMs: number): void {
  if (!started) return;
  clearWorkerTimer();
  timer = setTimeout(() => void runWorker(), Math.max(0, delayMs));
}

function nextIdleDelay(): number {
  const index = Math.min(idleLevel, IDLE_DELAYS_MS.length - 1);
  const delay = IDLE_DELAYS_MS[index];
  idleLevel = Math.min(index + 1, IDLE_DELAYS_MS.length - 1);
  return delay;
}

type TranslationPassResult = {
  translatedCount: number;
  scannedTickets: number;
};

async function processTranslationPass(): Promise<TranslationPassResult> {
  const tickets = await prisma.ticket.findMany({
    where: {
      geminiClassifiedAt: { not: null },
      description: { not: '' },
    },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    skip: scanOffset,
    take: TICKET_BATCH_SIZE,
    select: {
      id: true,
      ticketId: true,
      description: true,
      closureNotes: true,
      contractorNote: true,
      appointment: { select: { notes: true } },
    },
  });

  if (tickets.length === 0) {
    // End of the current scan. Do not immediately query page zero again;
    // reset the cursor and let the adaptive heartbeat (or an event nudge) do it.
    scanOffset = 0;
    return { translatedCount: 0, scannedTickets: 0 };
  }

  scanOffset += tickets.length;

  const sourceTexts = [...new Set(tickets.flatMap(collectTicketTexts))].slice(0, MAX_TEXTS_PER_PASS);
  if (sourceTexts.length === 0) {
    return { translatedCount: 0, scannedTickets: tickets.length };
  }

  // One cache lookup for all languages instead of one query per language.
  const cachedRows = await prisma.translationCache.findMany({
    where: {
      targetLang: { in: TARGET_LANGS },
      sourceText: { in: sourceTexts },
    },
    select: { targetLang: true, sourceText: true },
  });

  const cachedByLanguage = new Map<TargetLanguage, Set<string>>();
  for (const lang of TARGET_LANGS) cachedByLanguage.set(lang, new Set());
  for (const row of cachedRows) {
    const lang = row.targetLang as TargetLanguage;
    cachedByLanguage.get(lang)?.add(row.sourceText);
  }

  let translatedCount = 0;
  for (const targetLang of TARGET_LANGS) {
    const cachedSet = cachedByLanguage.get(targetLang) ?? new Set<string>();
    const missing = sourceTexts.filter(text => !cachedSet.has(text));
    if (missing.length === 0) continue;

    try {
      await translateAndCache(missing, targetLang, 'Pre-translation of classified maintenance ticket content', false);
      translatedCount += missing.length;
      console.log(`[TranslationWorker] cached ${missing.length} texts → ${targetLang}`);
    } catch (error: any) {
      console.warn(`[TranslationWorker] ${targetLang} pass failed; it will be retried later:`, error?.message || error);
    }
  }

  if (translatedCount > 0) {
    console.log(`[TranslationWorker] pass complete — ${translatedCount} new cached translations from ${tickets.length} classified tickets`);
  }

  return { translatedCount, scannedTickets: tickets.length };
}

async function runWorker(): Promise<void> {
  if (!started) return;
  if (running) {
    nudged = true;
    return;
  }

  running = true;
  let result: TranslationPassResult = { translatedCount: 0, scannedTickets: 0 };
  try {
    result = await processTranslationPass();
  } catch (error: any) {
    console.error('[TranslationWorker] unexpected error:', error?.message || error);
  } finally {
    running = false;
    if (!started) return;

    if (nudged) {
      nudged = false;
      idleLevel = 0;
      scanOffset = 0;
      scheduleNext(0);
      return;
    }

    if (result.translatedCount > 0) {
      idleLevel = 0;
      scheduleNext(BUSY_DELAY_MS);
    } else {
      scheduleNext(nextIdleDelay());
    }
  }
}

export function startTranslationWorker(): void {
  if (started) return;
  started = true;
  idleLevel = 0;
  console.log('[TranslationWorker] Started — adaptive/event-driven (20s → 15m idle)');
  scheduleNext(0);
}

export function stopTranslationWorker(): void {
  if (!started) return;
  started = false;
  nudged = false;
  clearWorkerTimer();
  console.log('[TranslationWorker] Stopped');
}

/** Wake translation immediately after ticket content/classification changes. */
export function nudgeTranslationWorker(): void {
  if (!started) return;
  idleLevel = 0;
  scanOffset = 0;
  if (running) {
    nudged = true;
    return;
  }
  scheduleNext(0);
}
