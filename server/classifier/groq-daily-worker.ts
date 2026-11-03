/**
 * Groq Daily Classification Worker
 * ──────────────────────────────────
 * Runs once per day to batch-classify ALL tickets still marked "unclassified".
 * Sends 30 tickets per API request to maximise Groq free-tier throughput
 * (~1,000 req/day × 30 tickets = ~30,000 tickets classified per day).
 *
 * Rate limits respected:
 *   - 30 requests / minute  → 2-second gap between requests
 *   - Automatic backoff on 429
 *
 * Usage: set GROQ_API_KEY in environment. The worker starts at server boot
 * and re-runs every 24 hours.
 */

import prisma from "../db.js";
import { updateClassifiedTicket } from "../services/classified-ticket-update.js";
import { invalidateTicketListResponseCache } from "../middleware/ticket-list-cache.js";
import { getGroqProvider, callGroqBatch, markProviderRateLimited } from "./gemini.js";
import { buildContextPayload, findSupervisorsDB, uniqueStringList } from "./db-helpers.js";
import { learnFromGeminiResult } from "./gemini.js";

const BATCH_SIZE      = 30;
const REQ_GAP_MS      = 2_100;   // ~28 req/min — safely under 30/min limit
const DAILY_MS        = 24 * 60 * 60_000;
const RETRY_PAUSE_MS  = 5 * 60_000;

let _timer: ReturnType<typeof setTimeout> | null = null;
let _started = false;
let _running = false;
let _lastRunDate = "";  // ISO date string YYYY-MM-DD

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function scheduleNext(delayMs: number): void {
  if (!_started) return;
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => void runDaily(), Math.max(0, delayMs));
}

export function startGroqDailyWorker(): void {
  if (_started) return;
  if (!process.env.GROQ_API_KEY) {
    console.log("[GroqDaily] GROQ_API_KEY not set — worker disabled");
    return;
  }
  _started = true;
  console.log("[GroqDaily] Started — daily batch classification of unclassified tickets");
  // Run immediately on start, then every 24 h
  scheduleNext(0);
}

export function stopGroqDailyWorker(): void {
  _started = false;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  console.log("[GroqDaily] Stopped");
}

async function runDaily(): Promise<void> {
  if (!_started) return;
  if (_running) return;

  const today = todayDate();
  if (_lastRunDate === today) {
    scheduleNext(DAILY_MS);
    return;
  }

  _running = true;
  try {
    console.log(`[GroqDaily] Starting batch run for ${today}`);
    const classified = await classifyAllUnclassified();
    _lastRunDate = today;
    console.log(`[GroqDaily] Done — ${classified} tickets classified today`);
  } catch (err: any) {
    console.error("[GroqDaily] Run failed:", err?.message);
  } finally {
    _running = false;
    scheduleNext(DAILY_MS);
  }
}

async function classifyAllUnclassified(): Promise<number> {
  const provider = getGroqProvider();
  if (!provider) return 0;

  const refData = await buildContextPayload();
  const typeToSpecialty: Record<string, string> = {};
  const typeKeyToId: Record<string, string> = {};
  for (const type of refData.types as any[]) {
    typeToSpecialty[type.key] = type.specialty?.key || "general";
    typeKeyToId[type.key] = type.id;
  }

  let offset = 0;
  let totalClassified = 0;
  let consecutiveErrors = 0;

  while (_started) {
    const tickets = await prisma.ticket.findMany({
      where: {
        type: "unclassified",
        description: { not: "" },
      },
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: BATCH_SIZE,
      select: { id: true, description: true, projectId: true, type: true },
    });

    if (tickets.length === 0) break;

    const batchItems = tickets
      .filter(t => t.description && t.description.length >= 5)
      .map(t => ({ id: t.id, description: t.description! }));

    if (batchItems.length === 0) {
      offset += tickets.length;
      continue;
    }

    try {
      const results = await callGroqBatch(provider, batchItems);

      let wroteAny = false;
      for (const r of results) {
        if (!r.primaryType || r.primaryType === "unclassified") continue;
        const ticket = tickets.find(t => t.id === r.id);
        if (!ticket) continue;

        const allTypes = uniqueStringList(r.allTypes).filter(t => t !== "unclassified");
        const updateData: Record<string, any> = {
          type:          r.primaryType,
          detectedTypes: allTypes,
          typeId:        typeKeyToId[r.primaryType] ?? null,
          subTypeId:     r.subTypeId ?? null,
          geminiClassifiedAt: new Date(),
        };

        if (ticket.projectId) {
          try {
            const specialties = [...new Set(allTypes.map(t => typeToSpecialty[t] || "general"))] as string[];
            const supervisors = await findSupervisorsDB(ticket.projectId, specialties);
            updateData.assignedSupervisorIds = supervisors.map(s => s.id);
            updateData.assigneeName = supervisors[0]?.name || null;
          } catch {}
        }

        await updateClassifiedTicket(r.id, updateData);
        learnFromGeminiResult(ticket.description!, allTypes).catch(() => {});
        totalClassified++;
        wroteAny = true;
      }

      if (wroteAny) invalidateTicketListResponseCache();
      consecutiveErrors = 0;
      offset += tickets.length;

      console.log(`[GroqDaily] batch +${results.filter(r => r.primaryType !== "unclassified").length}/${batchItems.length} (total: ${totalClassified})`);

      // Respect ~28 req/min rate limit
      await sleep(REQ_GAP_MS);

    } catch (err: any) {
      if (err.is429 || err.message?.includes("429")) {
        const isDaily = JSON.stringify(err).toLowerCase().includes("day");
        const pause = isDaily ? 60 * 60_000 : 70_000;
        markProviderRateLimited("Groq", pause);
        console.warn(`[GroqDaily] Rate limited — pausing ${Math.round(pause / 60_000)}m`);
        if (isDaily) break;
        await sleep(pause);
      } else {
        consecutiveErrors++;
        console.error(`[GroqDaily] Batch error (${consecutiveErrors}):`, err.message);
        if (consecutiveErrors >= 3) {
          console.error("[GroqDaily] Too many errors — aborting today's run");
          break;
        }
        await sleep(RETRY_PAUSE_MS);
        // Don't advance offset — retry same batch
      }
    }
  }

  return totalClassified;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
