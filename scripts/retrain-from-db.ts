/**
 * scripts/retrain-from-db.ts
 * ───────────────────────────
 * Exports all classified tickets from DB to ml/db_tickets.csv
 * so train.py can use them as additional training data.
 *
 * Run:  npx tsx scripts/retrain-from-db.ts
 */

import fs from "fs";
import path from "path";
import prisma from "../server/db.js";

const OUT_PATH = path.resolve("ml/db_tickets.csv");

const VALID_TYPES = new Set([
  "plumbing", "electricity", "doors_windows", "doors", "paints",
  "ceramics", "waterproofing", "structural", "garage_door", "pumps",
  "ac_ventilation", "drainage", "cracks", "tank_insulation",
  "grading", "pest_control", "cleaning",
]);

async function main() {
  console.log("📦 Exporting classified tickets from DB...");

  const tickets = await prisma.ticket.findMany({
    where: {
      type: { in: [...VALID_TYPES] },
      description: { not: "" },
    },
    select: { description: true, type: true },
  });

  const rows = tickets.filter(t =>
    t.description && t.description.length >= 10 && t.type && VALID_TYPES.has(t.type!)
  );

  const csv = ["text,label", ...rows.map(r => {
    const text = r.description!
      .replace(/"/g, "'")
      .replace(/\r?\n/g, " ")
      .replace(/,/g, "،")
      .trim();
    return `"${text}",${r.type}`;
  })].join("\n");

  fs.writeFileSync(OUT_PATH, csv, "utf8");
  console.log(`✅ Exported ${rows.length} tickets → ${OUT_PATH}`);

  await prisma.$disconnect();
}

main().catch(err => { console.error("❌", err); process.exit(1); });
