/**
 * Reclassify Worker
 * ─────────────────
 * Watches for keywords that were recently learned (pendingReclassify = true)
 * and re-runs the classifier on tickets whose descriptions contain those keywords.
 *
 * Priority: open/in_progress tickets first, then closed.
 * Runs every 30 seconds, processes up to 5 pending keywords per tick,
 * and up to 40 tickets per keyword.
 *
 * When a ticket's type changes, supervisors are automatically re-assigned
 * based on the new specialty.
 */

import prisma from "../db.js";
import { loadKeywordsFromDB, classifyFromKeywordsDB, invalidateKeywordCache } from "./keywords.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB, uniqueStringList } from "./db-helpers.js";

const INTERVAL_MS         = 30_000;  // 30 s between ticks
const KEYWORDS_PER_TICK   = 5;       // pending keywords processed per tick
const TICKETS_PER_KEYWORD = 40;      // max tickets reclassified per keyword

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

// In-memory nudge: if true, next tick runs immediately (don't wait for interval)
let _nudged = false;

export function startReclassifyWorker(): void {
  if (_timer) return;
  console.log("[ReclassifyWorker] Started — watches learned keywords every 30 s");

  _timer = setInterval(async () => {
    if (_running) return;
    _nudged = false;
    _running = true;
    try {
      await processPendingKeywords();
    } finally {
      _running = false;
    }
  }, INTERVAL_MS);
}

export function stopReclassifyWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log("[ReclassifyWorker] Stopped");
  }
}

/**
 * Call this right after a keyword is learned so the worker processes it
 * on the very next tick instead of waiting up to 30 s.
 */
export function nudgeReclassifyWorker(): void {
  if (_running) return;
  _nudged = true;
  // Fire immediately — don't wait for the interval
  setImmediate(async () => {
    if (!_nudged || _running) return;
    _nudged = false;
    _running = true;
    try {
      await processPendingKeywords();
    } finally {
      _running = false;
    }
  });
}

// ── Core logic ──────────────────────────────────────────────────────────────

async function processPendingKeywords(): Promise<void> {
  const pendingKeywords = await prisma.ticketTypeKeyword.findMany({
    where: { pendingReclassify: true },
    take: KEYWORDS_PER_TICK,
    orderBy: { updatedAt: "asc" }, // oldest pending first
    select: { id: true, keyword: true, typeId: true },
  });

  if (pendingKeywords.length === 0) return;

  // Force fresh keyword cache so new weights are used
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
      // Leave pendingReclassify = true → will retry next tick
    }
  }

  invalidateKeywordCache();
}

async function reclassifyForKeyword(
  keyword: string,
  keywords: Awaited<ReturnType<typeof loadKeywordsFromDB>>,
  typeToSpecialty: Record<string, string>
): Promise<void> {
  // Tickets whose description contains the keyword (case-insensitive).
  // Open/in_progress first (closedAt IS NULL → nulls first).
  const tickets = await prisma.ticket.findMany({
    where: {
      description: { contains: keyword, mode: "insensitive" },
    },
    orderBy: [
      { closedAt: { sort: "asc", nulls: "first" } }, // open tickets first
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

    // Only reclassify if:
    // 1. New type is meaningful
    // 2. New type is different from current type
    if (
      result.primaryType === "unclassified" ||
      result.primaryType === ticket.type
    ) continue;

    const allTypes = uniqueStringList(result.allTypes).filter(type => type !== "unclassified");
    const updateData: Record<string, any> = {
      type:         result.primaryType,
      detectedTypes: allTypes,
      typeId:       result.typeId   ?? null,
      subTypeId:    result.subTypeId ?? null,
    };

    // Update supervisors when specialty changes
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
    console.log(
      `[ReclassifyWorker] keyword "${keyword}" → reclassified ${changed}/${tickets.length} tickets`
    );
  }
}
