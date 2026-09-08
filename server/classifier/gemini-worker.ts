/**
 * Background Classification Worker
 * ──────────────────────────────────
 * 1. Tries ML model first (batch) — fast, free, no quota
 * 2. Sends only low-confidence ML tickets to AI
 * 3. Leaves low-confidence tickets pending when AI fails so a later pass retries them
 * 4. Uses adaptive polling and can be nudged immediately after ticket mutations
 */

import prisma from "../db.js";
import { invalidateTicketListResponseCache } from "../middleware/ticket-list-cache.js";
import { nudgeTranslationWorker } from "../translation-worker.js";
import { classifyBatchWithGemini, geminiEnabled, learnFromGeminiResult } from "./gemini.js";
import { classifyBatchWithML } from "./ml-client.js";
import { buildContextPayload, findSupervisorsDB, uniqueStringList } from "./db-helpers.js";

const BATCH_SIZE              = 10;
const MIN_DESC_LEN            = 5;
const ML_CONFIDENCE_THRESHOLD = 0.70;
const RATE_LIMIT_PAUSE_RPM    = 70_000;
const RATE_LIMIT_PAUSE_RPD    = 60 * 60_000;
const BUSY_DELAY_MS           = 1_000;
const IDLE_DELAYS_MS          = [15_000, 30_000, 60_000, 5 * 60_000];

let _timer: ReturnType<typeof setTimeout> | null = null;
let _running = false;
let _started = false;
let _nudged = false;
let _idleLevel = 0;
let _pausedUntil = 0;

function clearWorkerTimer(): void {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}

function scheduleNext(delayMs: number): void {
  if (!_started) return;
  clearWorkerTimer();
  _timer = setTimeout(() => void runWorker(), Math.max(0, delayMs));
}

function nextIdleDelay(): number {
  const index = Math.min(_idleLevel, IDLE_DELAYS_MS.length - 1);
  const delay = IDLE_DELAYS_MS[index];
  _idleLevel = Math.min(index + 1, IDLE_DELAYS_MS.length - 1);
  return delay;
}

async function runWorker(): Promise<void> {
  if (!_started) return;
  if (_running) {
    _nudged = true;
    return;
  }

  if (Date.now() < _pausedUntil) {
    scheduleNext(_pausedUntil - Date.now());
    return;
  }

  _running = true;
  let processed = 0;
  try {
    processed = await processBatch();
  } catch (error: any) {
    console.error('[ClassifyWorker] unexpected error:', error?.message || error);
  } finally {
    _running = false;
    if (!_started) return;

    if (_nudged) {
      _nudged = false;
      _idleLevel = 0;
      scheduleNext(0);
      return;
    }

    if (Date.now() < _pausedUntil) {
      scheduleNext(_pausedUntil - Date.now());
    } else if (processed >= BATCH_SIZE) {
      _idleLevel = 0;
      scheduleNext(BUSY_DELAY_MS);
    } else if (processed > 0) {
      _idleLevel = 0;
      scheduleNext(IDLE_DELAYS_MS[0]);
    } else {
      scheduleNext(nextIdleDelay());
    }
  }
}

export function startGeminiWorker(): void {
  if (_started) return;
  _started = true;
  _idleLevel = 0;
  console.log("[ClassifyWorker] Started — adaptive ML primary / AI fallback (15s → 5m idle)");
  scheduleNext(0);
}

export function stopGeminiWorker(): void {
  if (!_started) return;
  _started = false;
  _nudged = false;
  clearWorkerTimer();
  console.log("[ClassifyWorker] Stopped");
}

/** Wake classification immediately after a successful ticket mutation/import. */
export function nudgeGeminiWorker(): void {
  if (!_started) return;
  _idleLevel = 0;
  if (_running) {
    _nudged = true;
    return;
  }
  scheduleNext(0);
}

async function processBatch(): Promise<number> {
  const tickets = await prisma.ticket.findMany({
    where: {
      geminiClassifiedAt: null,
      description:        { not: "" },
      status:             { notIn: ["closed", "out_of_scope"] },
    },
    orderBy: { createdAt: "asc" },
    take:    BATCH_SIZE,
    select:  { id: true, description: true, projectId: true, type: true },
  });

  const valid = tickets.filter(t => t.description && t.description.length >= MIN_DESC_LEN);
  if (valid.length === 0) return 0;

  const batchItems = valid.map(t => ({ id: t.id, description: t.description! }));

  const mlResults = await classifyBatchWithML(batchItems);
  const mlById    = Object.fromEntries(mlResults.map(r => [r.id, r]));

  const needGemini = batchItems.filter(item => {
    const ml = mlById[item.id];
    return !ml || ml.confidence < ML_CONFIDENCE_THRESHOLD;
  });
  const needsAiIds = new Set(needGemini.map(item => item.id));
  const geminiById: Record<string, any> = {};
  let aiRequestFailed = false;

  if (needGemini.length > 0) {
    if (geminiEnabled()) {
      try {
        const geminiResults = await classifyBatchWithGemini(needGemini);
        for (const r of geminiResults) geminiById[r.id] = r;
      } catch (err: any) {
        aiRequestFailed = true;
        if (err.message?.includes("429") || err.message?.includes("quota")) {
          const isDaily = err.message?.includes("PerDay") || err.message?.includes("per_day") || err.message?.includes("per-day");
          const pause   = isDaily ? RATE_LIMIT_PAUSE_RPD : RATE_LIMIT_PAUSE_RPM;
          _pausedUntil  = Date.now() + pause;
          console.warn(`[ClassifyWorker] ⏸ AI ${isDaily ? "daily" : "per-min"} limit — pausing ${pause / 60000}m`);
        } else {
          console.error("[ClassifyWorker] AI error — affected tickets stay queued for retry:", err.message);
        }
      }
    } else {
      aiRequestFailed = true;
      console.warn('[ClassifyWorker] AI unavailable — low-confidence tickets stay queued for retry');
    }
  }

  // Reuse the classifier's 10-minute reference-data cache instead of querying
  // ticket types/specialties again for every worker batch.
  const refData = await buildContextPayload();
  const typeToSpecialty: Record<string, string> = {};
  const typeKeyToId: Record<string, string> = {};
  for (const type of refData.types as any[]) {
    typeToSpecialty[type.key] = type.specialty?.key || "general";
    typeKeyToId[type.key] = type.id;
  }

  const now = new Date();
  let wroteTicket = false;

  for (const ticket of valid) {
    const geminiResult = geminiById[ticket.id];
    const mlResult     = mlById[ticket.id];
    const neededAi     = needsAiIds.has(ticket.id);
    const aiRespondedForTicket = neededAi && Object.prototype.hasOwnProperty.call(geminiById, ticket.id);

    const result = (geminiResult?.primaryType && geminiResult.primaryType !== "unclassified")
      ? { ...geminiResult, _src: "gemini" }
      : (mlResult?.primaryType && mlResult.primaryType !== "unclassified")
        ? { ...mlResult, _src: "ml" }
        : null;

    const shouldMarkAiDone = !neededAi || aiRespondedForTicket;
    const updateData: Record<string, any> = shouldMarkAiDone ? { geminiClassifiedAt: now } : {};

    if (result) {
      const allTypes = uniqueStringList(result.allTypes).filter(type => type !== "unclassified");
      updateData.type          = result.primaryType;
      updateData.detectedTypes = allTypes;
      updateData.typeId        = typeKeyToId[result.primaryType] ?? null;
      updateData.subTypeId     = result.subTypeId ?? null;

      if (result._src === "gemini") {
        learnFromGeminiResult(ticket.description!, allTypes).catch(() => {});
      }

      if (ticket.projectId && result.primaryType !== ticket.type) {
        try {
          const specialties = [...new Set(allTypes.map((t: string) => typeToSpecialty[t] || "general"))] as string[];
          const supervisors = await findSupervisorsDB(ticket.projectId, specialties);
          updateData.assignedSupervisorIds = supervisors.map(s => s.id);
          updateData.assigneeName = supervisors[0]?.name || null;
        } catch {}
      }

      const src = result._src === "gemini" ? "🤖" : "🧠";
      const retrySuffix = !shouldMarkAiDone ? ' — AI retry pending' : '';
      console.log(
        `[ClassifyWorker] ${src} ${ticket.id.slice(0, 8)} → [${allTypes.join(", ")}]` +
        (result.primaryType !== ticket.type ? ` (was: ${ticket.type})` : " (confirmed)") +
        (result.confidence ? ` conf:${(result.confidence * 100).toFixed(0)}%` : "") + retrySuffix
      );
    } else if (!shouldMarkAiDone) {
      console.log(`[ClassifyWorker] ↻ ${ticket.id.slice(0, 8)} → AI retry pending`);
    } else {
      console.log(`[ClassifyWorker] ⬜ ${ticket.id.slice(0, 8)} → unclassified`);
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: updateData });
      wroteTicket = true;
    }
  }

  if (wroteTicket) {
    invalidateTicketListResponseCache();
    nudgeTranslationWorker();
  }

  if (aiRequestFailed && needGemini.length > 0) {
    console.warn(`[ClassifyWorker] ${needGemini.length} low-confidence ticket(s) remain queued for a later AI retry`);
  }

  return valid.length;
}
