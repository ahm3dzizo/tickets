/**
 * Background Classification Worker
 * ──────────────────────────────────
 * 1. Tries ML model first (batch) — fast, free, no quota
 * 2. Sends only low-confidence ML tickets to AI
 * 3. Leaves low-confidence tickets pending when AI fails so a later pass retries them
 */

import prisma from "../db.js";
import { classifyBatchWithGemini, geminiEnabled, learnFromGeminiResult } from "./gemini.js";
import { classifyBatchWithML } from "./ml-client.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB, uniqueStringList } from "./db-helpers.js";

const INTERVAL_MS          = 15_000;
const BATCH_SIZE           = 10;
const MIN_DESC_LEN         = 5;
const ML_CONFIDENCE_THRESHOLD  = 0.70;
const RATE_LIMIT_PAUSE_RPM = 70_000;
const RATE_LIMIT_PAUSE_RPD = 60 * 60_000;

let _timer: ReturnType<typeof setInterval> | null = null;
let _running   = false;
let _pausedUntil = 0;

export function startGeminiWorker(): void {
  if (_timer) return;
  console.log("[ClassifyWorker] Started — ML primary, AI fallback, every 15 s");

  const run = async () => {
    if (_running) return;
    if (Date.now() < _pausedUntil) return;
    _running = true;
    try {
      await processBatch();
    } catch (error: any) {
      console.error('[ClassifyWorker] unexpected error:', error?.message || error);
    } finally {
      _running = false;
    }
  };

  void run();
  _timer = setInterval(() => void run(), INTERVAL_MS);
}

export function stopGeminiWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log("[ClassifyWorker] Stopped");
  }
}

async function processBatch(): Promise<void> {
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
  if (valid.length === 0) return;

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
          const isDaily = err.message?.includes("PerDay") || err.message?.includes("per_day");
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

  const typeToSpecialty = await buildTypeToSpecialtyMap();
  const now             = new Date();
  const typeRecords     = await prisma.ticketType.findMany({ select: { id: true, key: true } });
  const typeKeyToId     = Object.fromEntries(typeRecords.map(t => [t.key, t.id]));

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
    }
  }

  if (aiRequestFailed && needGemini.length > 0) {
    console.warn(`[ClassifyWorker] ${needGemini.length} low-confidence ticket(s) remain queued for a later AI retry`);
  }
}
