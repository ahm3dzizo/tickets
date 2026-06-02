/**
 * scripts/restore-types-from-excel.ts
 * ────────────────────────────────────
 * Restores ticket types from the ground-truth Excel classifications.
 * Maps Arabic category names → system type keys → updates DB.
 *
 * Run:  npx tsx scripts/restore-types-from-excel.ts
 *       npx tsx scripts/restore-types-from-excel.ts --dry-run
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

import prisma from "../server/db.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN   = process.argv.includes("--dry-run");

const CATEGORY_MAP: Record<string, string> = {
  "سباكة":    "plumbing",   "سباكه":    "plumbing",
  "كهرباء":   "electricity",
  "المنيوم":  "doors_windows", "المونيوم": "doors_windows",
  "دهانات":   "paints",
  "سيراميك":  "ceramics",
  "عزل":      "waterproofing",
  "خشب":      "doors",       "ابواب خشب": "doors",
  "رخام":     "ceramics",
  "جبس":      "paints",
  "نمل":      "pest_control",
  "كراج":     "structural",  "كاراج":    "structural",
  "زجاج":     "doors_windows",
  "تشققات":   "cracks",      "تشقق":     "cracks",
};

function resolveTypeKey(rawCategory: string): string | null {
  const cleaned = rawCategory.replace(/[​-‏‪-‮⁦-⁩﻿؜]/g, "").trim();
  // Try full match first
  if (CATEGORY_MAP[cleaned]) return CATEGORY_MAP[cleaned];
  // For combined categories (سباكة، سيراميك) → take the first one
  const parts = cleaned.split(/[،,+\-]/);
  for (const part of parts) {
    const key = CATEGORY_MAP[part.trim()];
    if (key) return key;
  }
  return null;
}

async function main() {
  console.log(`\n📥 Restore Types from Excel ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log("━".repeat(50));

  const excelPath = path.join(__dirname, "..", "NTF1 Ticket (2).xlsm");
  const wb  = XLSX.readFile(excelPath);
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < 5; i++) {
    if (rows[i].some((c: any) => String(c).includes("الوصف"))) { headerIdx = i; break; }
  }
  if (headerIdx === -1) { console.error("❌ Header not found"); process.exit(1); }

  const headers = rows[headerIdx];
  const ticketCol = headers.findIndex((h: any) => String(h).includes("رقم التذكرة"));
  const typeCol   = headers.findIndex((h: any) => String(h).includes("تصنيف"));
  console.log(`✅ Header row ${headerIdx + 1} — ticketId:${ticketCol} type:${typeCol}\n`);

  // Load active types from DB
  const dbTypes = await prisma.ticketType.findMany({
    where: { isActive: true },
    select: { id: true, key: true },
  });
  const typeIdByKey = Object.fromEntries(dbTypes.map(t => [t.key, t.id]));

  let updated = 0, skipped = 0, notFound = 0, noType = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawTicketId = String(row[ticketCol] || "").trim().replace(/\.0$/, "");
    const rawCategory = String(row[typeCol]   || "").trim();

    if (!rawTicketId || rawTicketId === "NaN") { skipped++; continue; }
    if (!rawCategory || rawCategory === "مكرره" || rawCategory.includes("خارج")) {
      skipped++; continue;
    }

    const typeKey = resolveTypeKey(rawCategory);
    if (!typeKey) { noType++; continue; }

    const typeId = typeIdByKey[typeKey];
    if (!typeId) { noType++; continue; }

    // Find ticket in DB by ticketId
    const ticket = await prisma.ticket.findFirst({
      where: { ticketId: rawTicketId },
      select: { id: true, type: true, typeId: true },
    });

    if (!ticket) { notFound++; continue; }
    if (ticket.type === typeKey) { skipped++; continue; } // already correct

    console.log(`  ✅ ${rawTicketId}: "${ticket.type}" → "${typeKey}"`);

    if (!DRY_RUN) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { type: typeKey, typeId, detectedTypes: [typeKey] },
      });
    }
    updated++;
  }

  console.log(`\n${"━".repeat(50)}`);
  console.log(`✅ Updated:   ${updated}`);
  console.log(`⏭  Skipped:   ${skipped} (already correct or no category)`);
  console.log(`❓ Not found: ${notFound} (ticket ID not in DB)`);
  console.log(`❌ No type:   ${noType} (unmapped category)`);
  if (DRY_RUN) console.log("\n⚠️  Dry run — no changes written");

  await prisma.$disconnect();
}

main().catch(err => { console.error("❌", err); process.exit(1); });
