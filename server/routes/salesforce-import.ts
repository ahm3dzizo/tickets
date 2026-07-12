/**
 * POST /api/salesforce/import
 * Called by the browser bookmarklet from within the Salesforce page.
 * The bookmarklet fetches report data via the Salesforce Analytics API (same-origin,
 * so no SF credentials needed on our side) and POSTs the parsed rows here.
 */

import { Router, Request, Response, NextFunction } from "express";
import prisma from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

// ── Allow CORS from Salesforce domains (the bookmarklet POSTs from there) ───
router.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || "";
  if (origin.includes("salesforce.com") || origin.includes("force.com")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// ── Types ─────────────────────────────────────────────────────────────────────
interface SFRow {
  caseNumber: string;   // "00197089"
  unit: string;         // "NTF-721"
  accountName: string;  // "عبدالرحمن فهد الشمري"
  openedDate: string;   // "6/29/2026" or ISO
  description: string;
}

// ── POST /api/salesforce/import ───────────────────────────────────────────────
router.post("/import", requireAuth, async (req: Request, res: Response) => {
  const { rows } = req.body as { rows: SFRow[] };

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "لا توجد بيانات" });
    return;
  }

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Cache projects and units to avoid repeated DB lookups
  const projectCache = new Map<string, any>(); // abbr → project
  const unitCache = new Map<string, any>();     // "abbr|villaNum" → unit

  for (const row of rows) {
    try {
      const caseNumber = (row.caseNumber || "").trim();
      if (!caseNumber) continue;

      // ── Dedup ────────────────────────────────────────────────────────────
      const numericId = /^\d+$/.test(caseNumber) ? String(parseInt(caseNumber, 10)) : null;
      const existsWhere: any[] = [{ ticketId: caseNumber }];
      if (numericId && numericId !== caseNumber) existsWhere.push({ ticketId: numericId });

      const existing = await prisma.ticket.findFirst({ where: { OR: existsWhere } });
      if (existing) { skipped++; continue; }

      // ── Parse unit → project abbr + villa number ──────────────────────
      const dashIdx = (row.unit || "").indexOf("-");
      if (dashIdx < 0) {
        errors.push(`${caseNumber}: رقم الوحدة "${row.unit}" غير صالح`);
        continue;
      }
      const abbr = row.unit.slice(0, dashIdx).trim().toUpperCase();
      const villaNumber = row.unit.slice(dashIdx + 1).trim();

      // ── Find project ─────────────────────────────────────────────────────
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

      // ── Find unit + client ────────────────────────────────────────────────
      const unitKey = `${project.id}|${villaNumber}`;
      let unit = unitCache.get(unitKey);
      if (unit === undefined) {
        unit = await prisma.unit.findFirst({
          where: { projectId: project.id, unitNumber: villaNumber },
          include: {
            clients: {
              where: { isPrimary: true },
              include: { client: true },
              take: 1,
            },
          },
        }) ?? null;
        unitCache.set(unitKey, unit);
      }

      const clientEntry = unit?.clients?.[0]?.client ?? null;
      const clientId = clientEntry?.id ?? null;
      const clientName = clientEntry?.name ?? row.accountName;

      // ── Parse date ────────────────────────────────────────────────────────
      let createdAt: Date;
      try {
        const d = new Date(row.openedDate);
        createdAt = isNaN(d.getTime()) ? new Date() : d;
      } catch {
        createdAt = new Date();
      }

      // ── Create ticket ─────────────────────────────────────────────────────
      await prisma.ticket.create({
        data: {
          ticketId:    caseNumber,
          refNumber:   villaNumber,
          projectId:   project.id,
          projectAbbr: abbr,
          unitId:      unit?.id ?? null,
          clientId,
          clientName,
          villaNumber,
          description: (row.description || "").trim() || `بلاغ صيانة - ${clientName}`,
          type:        "general",
          status:      "open",
          priority:    4,
          detectedTypes:      [],
          detectedSubTypeIds: [],
          createdAt,
        },
      });

      added++;
    } catch (e: any) {
      errors.push(`${row.caseNumber}: ${e.message}`);
    }
  }

  res.json({ added, skipped, errors, total: rows.length });
});

export default router;
