/**
 * Background Gemini Worker
 * ─────────────────────────
 * Picks up tickets that have never been verified by Gemini (geminiClassifiedAt = null)
 * and classifies them in batches of 3 per request.
 *
 * Rate:  3 tickets per request × 1 request per 15 s  ≈ 12 tickets/min
 *        Well under the free-tier 5 RPM limit.
 *
 * Activated automatically on server start when GEMINI_API_KEY is set.
 */

import prisma from "../db.js";
import { classifyBatchWithGemini, geminiEnabled, learnFromGeminiResult } from "./gemini.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB } from "./db-helpers.js";

const INTERVAL_MS      = 15_000;  // 15 s → 1 request/15 s = 4 RPM (< 5 RPM free limit)
const BATCH_SIZE       = 3;       // tickets per Gemini request
const MIN_DESC_LEN     = 5;
const RATE_LIMIT_PAUSE_RPM = 70_000;       // 70 s after per-minute limit
const RATE_LIMIT_PAUSE_RPD = 60 * 60_000;  // 60 min after daily limit — wait for quota reset

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;
let _pausedUntil = 0;  // epoch ms — worker skips ticks while paused

export function startGeminiWorker(): void {
  if (!geminiEnabled()) {
    console.log("[GeminiWorker] Disabled — GEMINI_API_KEY not set");
    return;
  }
  if (_timer) return;

  console.log("[GeminiWorker] Started — Gemini batch classifier every 15 s (3 tickets/batch)");

  _timer = setInterval(async () => {
    if (_running) return;
    if (Date.now() < _pausedUntil) return;  // still in rate-limit cooldown
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
    console.log("[GeminiWorker] Stopped");
  }
}

// ── Core logic ─────────────────────────────────────────────────────────────

async function processBatch(): Promise<void> {
  // Find tickets not yet processed by Gemini — oldest first
  const tickets = await prisma.ticket.findMany({
    where: {
      geminiClassifiedAt: null,
      description: { not: "" },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true, description: true, projectId: true, type: true },
  });

  const valid = tickets.filter(t => t.description && t.description.length >= MIN_DESC_LEN);
  if (valid.length === 0) return;

  let results;
  try {
    results = await classifyBatchWithGemini(valid.map(t => ({ id: t.id, description: t.description! })));
  } catch (err: any) {
    if (err.message?.includes("429") || err.message?.includes("quota")) {
      const isDaily = err.message?.includes("PerDay") || err.message?.includes("per_day");
      const pause   = isDaily ? RATE_LIMIT_PAUSE_RPD : RATE_LIMIT_PAUSE_RPM;
      _pausedUntil  = Date.now() + pause;
      console.warn(`[GeminiWorker] ⏸ ${isDaily ? "Daily" : "Per-minute"} limit hit — pausing ${pause / 60000}m`);
      return;  // tickets NOT marked → will be retried after cooldown
    }
    console.error("[GeminiWorker] Gemini error:", err.message);
    return;
  }

  const typeToSpecialty = await buildTypeToSpecialtyMap();
  const now = new Date();

  for (const ticket of valid) {
    const result = results.find(r => r.id === ticket.id);

    // Mark as processed regardless (so we don't retry forever on vague descriptions)
    const updateData: Record<string, any> = { geminiClassifiedAt: now };

    if (result && result.primaryType !== "unclassified" && result.allTypes.length > 0) {
      updateData.type          = result.primaryType;
      updateData.detectedTypes = result.allTypes;

      // Auto-learn in background
      learnFromGeminiResult(ticket.description!, result.allTypes).catch(() => {});

      // Re-assign supervisor if classification changed
      if (ticket.projectId && result.primaryType !== ticket.type) {
        try {
          const specialties = [...new Set(result.allTypes.map(t => typeToSpecialty[t] || "general"))] as string[];
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

      console.log(
        `[GeminiWorker] ✅ ${ticket.id.slice(0, 8)} → [${result.allTypes.join(", ")}]` +
        (result.primaryType !== ticket.type ? ` (was: ${ticket.type})` : " (confirmed)")
      );
    } else {
      console.log(`[GeminiWorker] ⬜ ${ticket.id.slice(0, 8)} → unclear/unclassified`);
    }

    await prisma.ticket.update({ where: { id: ticket.id }, data: updateData });
  }
}
