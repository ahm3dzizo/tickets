/**
 * Background Gemini Worker
 * ─────────────────────────
 * Runs every 15 seconds and picks one unclassified ticket to classify via Gemini.
 * Rate: ~4 tickets/minute — safely under the free-tier 5 RPM limit.
 *
 * Activated automatically on server start when GEMINI_API_KEY is set.
 */

import prisma from "../db.js";
import { classifyWithGemini, geminiEnabled, learnFromGeminiResult } from "./gemini.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB } from "./db-helpers.js";

const INTERVAL_MS   = 15_000;  // 15 s → 4 req/min (< 5 RPM free limit)
const MIN_DESC_LEN  = 5;

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;         // prevent overlapping ticks

export function startGeminiWorker(): void {
  if (!geminiEnabled()) {
    console.log("[GeminiWorker] Disabled — GEMINI_API_KEY not set");
    return;
  }
  if (_timer) return; // already started

  console.log("[GeminiWorker] Started — classifying unclassified tickets every 15 s");

  _timer = setInterval(async () => {
    if (_running) return;   // skip if previous tick still busy
    _running = true;
    try {
      await processOne();
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

async function processOne(): Promise<void> {
  // Find the oldest unclassified open ticket
  const ticket = await prisma.ticket.findFirst({
    where: {
      status: { not: "closed" },
      OR: [
        { type: "unclassified" },
        { detectedTypes: { equals: [] } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, description: true, projectId: true },
  });

  if (!ticket?.description || ticket.description.length < MIN_DESC_LEN) return;

  let result;
  try {
    result = await classifyWithGemini(ticket.description);
  } catch (err: any) {
    // 429 = rate limited — just skip this tick quietly
    if (err.message?.includes("429") || err.message?.includes("quota")) return;
    console.error("[GeminiWorker] Gemini error:", err.message);
    return;
  }

  if (!result || result.primaryType === "unclassified" || result.allTypes.length === 0) {
    // Mark as explicitly unclassified so we don't retry endlessly
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { type: "unclassified", detectedTypes: [] },
    });
    return;
  }

  // Auto-learn in background
  learnFromGeminiResult(ticket.description, result.allTypes).catch(() => {});

  // Build update payload
  const updateData: Record<string, any> = {
    type:          result.primaryType,
    detectedTypes: result.allTypes,
  };

  // Try to assign supervisors if ticket has a project
  if (ticket.projectId) {
    try {
      const typeToSpecialty  = await buildTypeToSpecialtyMap();
      const specialties      = [...new Set(result.allTypes.map((t) => typeToSpecialty[t] || "general"))] as string[];
      const supervisors      = await findSupervisorsDB(ticket.projectId, specialties);
      if (supervisors.length > 0) {
        updateData.assignedSupervisorId  = supervisors[0].id;
        updateData.assignedSupervisorIds = supervisors.map((s) => s.id);
        updateData.assignedSupervisors   = supervisors.map((s) => ({
          id: s.id, name: s.name, specialty: s.specialties[0] || "general",
        }));
      }
    } catch { /* non-fatal */ }
  }

  await prisma.ticket.update({ where: { id: ticket.id }, data: updateData });

  console.log(
    `[GeminiWorker] ✅ Ticket ${ticket.id.slice(0, 8)} → [${result.allTypes.join(", ")}]` +
    ` (conf: ${result.confidence})`
  );
}
