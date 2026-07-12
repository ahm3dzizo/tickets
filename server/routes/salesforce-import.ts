/**
 * POST /api/salesforce/import
 * Called by the browser bookmarklet running inside the Salesforce page.
 *
 * Behaviour:
 *  - New tickets   → create + keyword-classify (AI reclassify-worker picks them up later)
 *  - Existing open → sync status if SF says closed; otherwise skip
 *  - Leading zeros → stripped from numeric case IDs ("00197089" → "197089")
 */

import { Router, Request, Response, NextFunction } from "express";
import prisma from "../db.js";
import { requireAuth } from "../auth.js";
import {
  loadKeywordsFromDB,
  classifyFromKeywordsDB,
} from "../classifier/keywords.js";

const router = Router();

// ── CORS for Salesforce domains (bookmarklet origin) ──────────────────────────
router.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || "";
  if (origin.includes("salesforce.com") || origin.includes("force.com")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "00197089" → "197089", non-numeric kept as-is */
function normalizeCaseId(raw: string): string {
  const s = (raw || "").trim();
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
}

/** Map Salesforce case status → our TicketStatus enum value */
function mapSFStatus(
  sfStatus: string
): "open" | "pending" | "in_progress" | "closed" | "out_of_scope" {
  const s = (sfStatus || "").toLowerCase().trim();
  if (s.includes("close") || s.includes("resolved") || s.includes("مغلق")) return "closed";
  if (s.includes("in progress") || s.includes("in_progress") || s.includes("قيد التنفيذ")) return "in_progress";
  if (s.includes("pending") || s.includes("waiting") || s.includes("انتظار")) return "pending";
  if (s.includes("scope") || s.includes("خارج نطاق")) return "out_of_scope";
  return "open";
}

// Statuses we treat as "already done" — never reopen them from SF
const TERMINAL_STATUSES = new Set(["closed", "completed", "out_of_scope"]);

// ── Types ─────────────────────────────────────────────────────────────────────
interface SFRow {
  caseNumber: string;
  unit: string;        // "NTF-721"
  accountName: string;
  openedDate: string;
  description: string;
  status?: string;     // optional — present when Status column exists in report
}

// ── POST /api/salesforce/import ───────────────────────────────────────────────
router.post("/import", requireAuth, async (req: Request, res: Response) => {
  const { rows } = req.body as { rows: SFRow[] };

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "لا توجد بيانات" });
    return;
  }

  // Load keyword classifier once for this batch
  const keywords = await loadKeywordsFromDB();

  let added = 0, updated = 0, skipped = 0;
  const errors: string[] = [];

  // Per-request caches to avoid repeated DB round-trips
  const projectCache = new Map<string, any>();       // abbr → project
  const unitCache    = new Map<string, any | null>(); // "projId|villaNum" → unit | null
  const typeIdCache  = new Map<string, string | null>(); // typeKey → DB id

  for (const row of rows) {
    try {
      const rawId = (row.caseNumber || "").trim();
      if (!rawId) continue;

      const caseNumber = normalizeCaseId(rawId);
      const sfStatus   = mapSFStatus(row.status ?? "");

      // ── Dedup check (both raw and normalized form) ──────────────────────
      const existing = await prisma.ticket.findFirst({
        where: {
          OR: [
            { ticketId: caseNumber },
            { ticketId: rawId },
          ],
        },
        select: { id: true, status: true },
      });

      if (existing) {
        // Status sync: only close tickets that SF says are closed and we haven't
        if (
          sfStatus === "closed" &&
          !TERMINAL_STATUSES.has(existing.status)
        ) {
          await prisma.ticket.update({
            where: { id: existing.id },
            data: { status: "closed", closedAt: new Date() },
          });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      // ── Parse unit field ("NTF-721") ────────────────────────────────────
      const dashIdx = (row.unit || "").indexOf("-");
      if (dashIdx < 0) {
        errors.push(`${caseNumber}: رقم الوحدة "${row.unit}" غير صالح`);
        continue;
      }
      const abbr       = row.unit.slice(0, dashIdx).trim().toUpperCase();
      const villaNumber = row.unit.slice(dashIdx + 1).trim();

      // ── Project lookup ──────────────────────────────────────────────────
      let project = projectCache.get(abbr);
      if (!project) {
        project = await prisma.project.findFirst({
          where: { abbreviation: { equals: abbr, mode: "insensitive" } },
        });
        if (!project) {
          errors.push(`${caseNumber}: مشروع "${abbr}" غير موجود في النظام`);
          continue;
        }
        projectCache.set(abbr, project);
      }

      // ── Unit + client lookup ────────────────────────────────────────────
      const unitKey = `${project.id}|${villaNumber}`;
      if (!unitCache.has(unitKey)) {
        const u = await prisma.unit.findFirst({
          where: { projectId: project.id, unitNumber: villaNumber },
          include: {
            clients: {
              where: { isPrimary: true },
              include: { client: true },
              take: 1,
            },
          },
        });
        unitCache.set(unitKey, u ?? null);
      }
      const unit   = unitCache.get(unitKey);
      const client = unit?.clients?.[0]?.client ?? null;
      const clientId   = client?.id ?? null;
      const clientName = client?.name ?? row.accountName;

      // ── Parse opened date ────────────────────────────────────────────────
      let createdAt: Date;
      try {
        const d = new Date(row.openedDate);
        createdAt = isNaN(d.getTime()) ? new Date() : d;
      } catch {
        createdAt = new Date();
      }

      // ── Keyword classification ───────────────────────────────────────────
      const description = (row.description || "").trim() || `بلاغ صيانة - ${clientName}`;
      let type         = "general";
      let typeId: string | null = null;
      let detectedTypes: string[] = [];
      let subTypeId: string | null = null;

      if (keywords.length > 0) {
        try {
          const cls = classifyFromKeywordsDB(description, keywords);
          if (cls && cls.primaryType) {
            type          = cls.primaryType;
            detectedTypes = cls.allTypes ?? [type];
            subTypeId     = cls.subTypeId ?? null;

            // Resolve typeId (cached)
            if (!typeIdCache.has(type)) {
              const rec = await prisma.ticketType.findFirst({ where: { key: type } });
              typeIdCache.set(type, rec?.id ?? null);
            }
            typeId = typeIdCache.get(type) ?? null;
          }
        } catch {
          /* classification failure is non-fatal */
        }
      }

      // ── Create ticket ────────────────────────────────────────────────────
      await prisma.ticket.create({
        data: {
          ticketId:           caseNumber,
          refNumber:          villaNumber,
          projectId:          project.id,
          projectAbbr:        abbr,
          unitId:             unit?.id ?? null,
          clientId,
          clientName,
          villaNumber,
          description,
          type,
          typeId,
          subTypeId,
          status:             sfStatus,
          priority:           4,
          detectedTypes,
          detectedSubTypeIds: [],
          createdAt,
          // If SF already says closed, record the closure date
          ...(sfStatus === "closed" ? { closedAt: createdAt } : {}),
        },
      });

      added++;
    } catch (e: any) {
      errors.push(`${row.caseNumber || "?"}: ${e.message}`);
    }
  }

  res.json({ added, updated, skipped, errors, total: rows.length });
});

export default router;
