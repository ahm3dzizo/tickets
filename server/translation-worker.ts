import prisma from './db.js';
import { translateAndCache, type TargetLanguage } from './routes/translation.js';

const INTERVAL_MS = 20_000;
const TICKET_BATCH_SIZE = 25;
const TARGET_LANGS: TargetLanguage[] = ['en', 'hi', 'ur'];
const MAX_TEXTS_PER_PASS = 60;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
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

async function missingTextsForLanguage(texts: string[], targetLang: TargetLanguage): Promise<string[]> {
  if (texts.length === 0) return [];
  const cached = await prisma.translationCache.findMany({
    where: { targetLang, sourceText: { in: texts } },
    select: { sourceText: true },
  });
  const cachedSet = new Set(cached.map(item => item.sourceText));
  return texts.filter(text => !cachedSet.has(text));
}

async function processTranslationPass(): Promise<void> {
  let tickets = await prisma.ticket.findMany({
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

  if (tickets.length === 0 && scanOffset > 0) {
    scanOffset = 0;
    tickets = await prisma.ticket.findMany({
      where: {
        geminiClassifiedAt: { not: null },
        description: { not: '' },
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
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
  }

  if (tickets.length === 0) return;
  scanOffset += tickets.length;

  const sourceTexts = [...new Set(tickets.flatMap(collectTicketTexts))].slice(0, MAX_TEXTS_PER_PASS);
  if (sourceTexts.length === 0) return;

  let translatedCount = 0;
  for (const targetLang of TARGET_LANGS) {
    const missing = await missingTextsForLanguage(sourceTexts, targetLang);
    if (missing.length === 0) continue;

    try {
      await translateAndCache(missing, targetLang, 'Pre-translation of classified maintenance ticket content', false);
      translatedCount += missing.length;
      console.log(`[TranslationWorker] cached ${missing.length} texts → ${targetLang}`);
    } catch (error: any) {
      console.warn(`[TranslationWorker] ${targetLang} pass failed; it will be retried on the next scan cycle:`, error?.message || error);
    }
  }

  if (translatedCount > 0) {
    console.log(`[TranslationWorker] pass complete — ${translatedCount} new cached translations from ${tickets.length} classified tickets`);
  }
}

export function startTranslationWorker(): void {
  if (timer) return;
  console.log('[TranslationWorker] Started — scans classified ticket content every 20 s');

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processTranslationPass();
    } catch (error: any) {
      console.error('[TranslationWorker] unexpected error:', error?.message || error);
    } finally {
      running = false;
    }
  };

  void run();
  timer = setInterval(() => void run(), INTERVAL_MS);
}

export function stopTranslationWorker(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  console.log('[TranslationWorker] Stopped');
}
