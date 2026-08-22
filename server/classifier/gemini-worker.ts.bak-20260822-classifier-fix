/**
 * Background Classification Worker
 * ──────────────────────────────────
 * 1. Tries ML model first (batch) — fast, free, no quota
 * 2. Sends only low-confidence ML tickets to Gemini
 *
 * Rate:  ML is unlimited. Gemini falls back only when ML confidence < 70%.
 * Only processes open/in-progress tickets — closed ones use ReclassifyWorker.
 */

import prisma from "../db.js";
import { classifyBatchWithGemini, geminiEnabled, learnFromGeminiResult } from "./gemini.js";
import { classifyBatchWithML } from "./ml-client.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB } from "./db-helpers.js";

const INTERVAL_MS          = 15_000;
const BATCH_SIZE           = 10;      // ML handles more per batch (no cost)
const MIN_DESC_LEN         = 5;
const ML_CONFIDENCE_THRESHOLD  = 0.70;
const RATE_LIMIT_PAUSE_RPM = 70_000;
const RATE_LIMIT_PAUSE_RPD = 60 * 60_000;

let _timer: ReturnType<typeof setInterval> | null = null;
let _running   = false;
let _pausedUntil = 0;

export function startGeminiWorker(): void {
  if (_timer) return;
  console.log("[ClassifyWorker] Started — ML primary, Gemini fallback, every 15 s");

  _timer = setInterval(async () => {
    if (_running) return;
    if (Date.now() < _pausedUntil) return;
    _running = true;
    try {
      await processBatch();
    } finally {
      _running = false;
    }
  }, INTERVAL_MS);
}

export function stopGeminiWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log("[ClassifyWorker] Stopped");
  }
}

// ── Core logic ──────────────────────────────────────────────────────────────

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

  // ── Step 1: ML batch ──────────────────────────────────────────────────
  const mlResults = await classifyBatchWithML(batchItems);
  const mlById    = Object.fromEntries(mlResults.map(r => [r.id, r]));

  // ── Step 2: Gemini for low-confidence only ────────────────────────────
  const needGemini = batchItems.filter(item => {
    const ml = mlById[item.id];
    return !ml || ml.confidence < ML_CONFIDENCE_THRESHOLD;
  });

  const geminiById: Record<string, any> = {};

  if (needGemini.length > 0 && geminiEnabled()) {
    try {
      const geminiResults = await classifyBatchWithGemini(needGemini);
      for (const r of geminiResults) geminiById[r.id] = r;
    } catch (err: any) {
      if (err.message?.includes("429") || err.message?.includes("quota")) {
        const isDaily = err.message?.includes("PerDay") || err.message?.includes("per_day");
        const pause   = isDaily ? RATE_LIMIT_PAUSE_RPD : RATE_LIMIT_PAUSE_RPM;
        _pausedUntil  = Date.now() + pause;
        console.warn(`[ClassifyWorker] ⏸ Gemini ${isDaily ? "daily" : "per-min"} limit — pausing ${pause / 60000}m`);
      } else {
        console.error("[ClassifyWorker] Gemini error:", err.message);
      }
    }
  }

  // ── Step 3: Apply results ─────────────────────────────────────────────
  const typeToSpecialty = await buildTypeToSpecialtyMap();
  const now             = new Date();
  const typeRecords     = await prisma.ticketType.findMany({ select: { id: true, key: true } });
  const typeKeyToId     = Object.fromEntries(typeRecords.map(t => [t.key, t.id]));

  for (const ticket of valid) {
    const geminiResult = geminiById[ticket.id];
    const mlResult     = mlById[ticket.id];

    // pick best result: Gemini > ML (if both available and classified)
    const result = (geminiResult?.primaryType && geminiResult.primaryType !== "unclassified")
      ? { ...geminiResult, _src: "gemini" }
      : (mlResult?.primaryType && mlResult.primaryType !== "unclassified")
        ? { ...mlResult, _src: "ml" }
        : null;

    const updateData: Record<string, any> = { geminiClassifiedAt: now };

    if (result) {
      updateData.type          = result.primaryType;
      updateData.detectedTypes = result.allTypes;
      updateData.typeId        = typeKeyToId[result.primaryType] ?? null;
      updateData.subTypeId     = result.subTypeId ?? null;

      if (result._src === "gemini") {
        learnFromGeminiResult(ticket.description!, result.allTypes).catch(() => {});
      }

      if (ticket.projectId && result.primaryType !== ticket.type) {
        try {
          const specialties = [...new Set(result.allTypes.map((t: string) => typeToSpecialty[t] || "general"))] as string[];
          const supervisors = await findSupervisorsDB(ticket.projectId, specialties);
          if (supervisors.length > 0) {
            updateData.assignedSupervisorId  = supervisors[0].id;
            updateData.assignedSupervisorIds = supervisors.map(s => s.id);
            updateData.assignedSupervisors   = supervisors.map(s => ({
              id: s.id, name: s.name, specialty: s.specialties[0] || "general",
            }));
          }
        } catch { /* non-fatal */ }
      }

      const src = result._src === "gemini" ? "🤖" : "🧠";
      console.log(
        `[ClassifyWorker] ${src} ${ticket.id.slice(0, 8)} → [${result.allTypes.join(", ")}]` +
        (result.primaryType !== ticket.type ? ` (was: ${ticket.type})` : " (confirmed)") +
        (result.confidence   ? ` conf:${(result.confidence * 100).toFixed(0)}%` : "")
      );
    } else {
      console.log(`[ClassifyWorker] ⬜ ${ticket.id.slice(0, 8)} → unclassified`);
    }

    await prisma.ticket.update({ where: { id: ticket.id }, data: updateData });
  }
}
