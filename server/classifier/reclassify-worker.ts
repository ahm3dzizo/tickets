/**
 * Reclassify Worker
 * ─────────────────
 * Watches for keywords that were recently learned (pendingReclassify = true)
 * and re-runs the classifier on tickets whose descriptions contain those keywords.
 *
 * Priority: open/in_progress tickets first, then closed.
 * Uses event nudges for immediate work and progressively backs off to a 5-minute
 * heartbeat while idle.
 */

import prisma from "../db.js";
import { invalidateTicketListResponseCache } from "../middleware/ticket-list-cache.js";
import { loadKeywordsFromDB, classifyFromKeywordsDB, invalidateKeywordCache } from "./keywords.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB, uniqueStringList } from "./db-helpers.js";

const KEYWORDS_PER_TICK   = 5;
const TICKETS_PER_KEYWORD = 40;
const BUSY_DELAY_MS       = 1_000;
const IDLE_DELAYS_MS      = [30_000, 60_000, 2 * 60_000, 5 * 60_000];

let _timer: ReturnType<typeof setTimeout> | null = null;
let _running = false;
let _started = false;
let _nudged = false;
let _idleLevel = 0;

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

  _running = true;
  let pendingCount = 0;
  try {
    pendingCount = await processPendingKeywords();
  } catch (err: any) {
    console.error('[ReclassifyWorker] unexpected error:', err?.message || err);
  } finally {
    _running = false;
    if (!_started) return;

    if (_nudged) {
      _nudged = false;
      _idleLevel = 0;
      scheduleNext(0);
      return;
    }

    if (pendingCount >= KEYWORDS_PER_TICK) {
      _idleLevel = 0;
      scheduleNext(BUSY_DELAY_MS);
    } else if (pendingCount > 0) {
      _idleLevel = 0;
      scheduleNext(IDLE_DELAYS_MS[0]);
    } else {
      scheduleNext(nextIdleDelay());
    }
  }
}

export function startReclassifyWorker(): void {
  if (_started) return;
  _started = true;
  _idleLevel = 0;
  console.log("[ReclassifyWorker] Started — event-driven with 30s → 5m idle heartbeat");
  scheduleNext(0);
}

export function stopReclassifyWorker(): void {
  if (!_started) return;
  _started = false;
  _nudged = false;
  clearWorkerTimer();
  console.log("[ReclassifyWorker] Stopped");
}

/** Wake immediately after a new learned keyword is marked pending. */
export function nudgeReclassifyWorker(): void {
  if (!_started) return;
  _idleLevel = 0;
  if (_running) {
    _nudged = true;
    return;
  }
  scheduleNext(0);
}

// ── Core logic ──────────────────────────────────────────────────────────────

async function processPendingKeywords(): Promise<number> {
  const pendingKeywords = await prisma.ticketTypeKeyword.findMany({
    where: { pendingReclassify: true },
    take: KEYWORDS_PER_TICK,
    orderBy: { updatedAt: "asc" },
    select: { id: true, keyword: true, typeId: true },
  });

  if (pendingKeywords.length === 0) return 0;

  const keywords = await loadKeywordsFromDB(true);
  const typeToSpecialty = await buildTypeToSpecialtyMap();

  for (const kw of pendingKeywords) {
    try {
      await reclassifyForKeyword(kw.keyword, keywords, typeToSpecialty);

      await prisma.ticketTypeKeyword.update({
        where: { id: kw.id },
        data: { pendingReclassify: false },
      });
    } catch (err: any) {
      console.error(`[ReclassifyWorker] Error on keyword "${kw.keyword}":`, err.message);
    }
  }

  invalidateKeywordCache();
  return pendingKeywords.length;
}

async function reclassifyForKeyword(
  keyword: string,
  keywords: Awaited<ReturnType<typeof loadKeywordsFromDB>>,
  typeToSpecialty: Record<string, string>
): Promise<void> {
  const tickets = await prisma.ticket.findMany({
    where: {
      description: { contains: keyword, mode: "insensitive" },
    },
    orderBy: [
      { closedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "desc" },
    ],
    take: TICKETS_PER_KEYWORD,
    select: {
      id: true,
      description: true,
      type: true,
      typeId: true,
      projectId: true,
      status: true,
      closedAt: true,
    },
  });

  if (tickets.length === 0) return;

  let changed = 0;

  for (const ticket of tickets) {
    if (!ticket.description || ticket.description.length < 5) continue;

    const result = classifyFromKeywordsDB(ticket.description, keywords);

    if (
      result.primaryType === "unclassified" ||
      result.primaryType === ticket.type
    ) continue;

    const allTypes = uniqueStringList(result.allTypes).filter(type => type !== "unclassified");
    const updateData: Record<string, any> = {
      type: result.primaryType,
      detectedTypes: allTypes,
      typeId: result.typeId ?? null,
      subTypeId: result.subTypeId ?? null,
    };

    if (ticket.projectId) {
      try {
        const specialties = [
          ...new Set(allTypes.map((t) => typeToSpecialty[t] || "general")),
        ] as string[];
        const supervisors = await findSupervisorsDB(ticket.projectId, specialties);
        updateData.assignedSupervisorIds = supervisors.map((s) => s.id);
        updateData.assigneeName = supervisors[0]?.name || null;
      } catch { /* non-fatal — type still updated */ }
    }

    await prisma.ticket.update({ where: { id: ticket.id }, data: updateData });

    const statusLabel = ticket.closedAt ? "مغلقة" : "مفتوحة";
    console.log(
      `[ReclassifyWorker] ✅ ${ticket.id.slice(0, 8)} [${statusLabel}]` +
      ` "${ticket.type}" → "${result.primaryType}" (keyword: ${keyword})`
    );
    changed++;
  }

  if (changed > 0) {
    invalidateTicketListResponseCache();
    console.log(
      `[ReclassifyWorker] keyword "${keyword}" → reclassified ${changed}/${tickets.length} tickets`
    );
  }
}
