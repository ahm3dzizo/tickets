/**
 * scripts/extract-keywords-from-excel.ts
 * ─────────────────────────────────────────
 * Reads the manually-classified tickets Excel file (NTF1 Ticket.xlsm),
 * extracts high-frequency Arabic keywords per classification category,
 * maps them to our 3-specialty system, and upserts into the DB.
 *
 * Run:  npx tsx scripts/extract-keywords-from-excel.ts
 *
 * The Excel "تصنيف التذاكر" column contains manual classifications like:
 *   سباكة، المنيوم، دهانات، سيراميك، كهرباء، عزل، خشب، نمل، رخام، جبس
 * These are mapped to our system's TicketType keys.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
import prisma from "../server/db.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Inline normalization — mirrors server/classifier/keywords.ts but with correct \s/\w
function normalizeAr(text: string): string {
  if (!text) return "";
  let s = text.toLowerCase();
  s = s.replace(/[ً-ٰٟ]/g, ""); // diacritics
  s = s.replace(/[أإآ]/g, "ا");
  s = s.replace(/ة/g, "ه");
  s = s.replace(/[ىي]/g, "ي");
  s = s.replace(/[^؀-ۿ\s]/g, " "); // keep Arabic + whitespace
  s = s.replace(/\s+/g, " ").trim();
  // Strip definite article word-by-word
  s = s.split(" ").map((w) => {
    if (w.length <= 2) return w;
    if (w.length > 5 && (w.startsWith("بال") || w.startsWith("وال") || w.startsWith("فال") || w.startsWith("كال"))) return w.slice(3);
    if (w.length > 4 && w.startsWith("لل")) return w.slice(2);
    if (w.length > 4 && w.startsWith("ال")) return w.slice(2);
    return w;
  }).join(" ");
  return s.replace(/\s+/g, " ").trim();
}

// ── Excel category → system TicketType key mapping ─────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  "سباكة":    "plumbing",
  "سباكه":    "plumbing",
  "كهرباء":   "electricity",
  "كهرباء،":  "electricity",
  "المنيوم":  "doors_windows",
  "المونيوم": "doors_windows",
  "دهانات":   "paints",
  "دهانات،":  "paints",
  "سيراميك":  "ceramics",
  "عزل":      "waterproofing",
  "خشب":      "doors",
  "ابواب خشب": "doors",
  "رخام":     "ceramics",
  "جبس":      "paints",
  "نمل":      "pest_control",
  "كراج":     "structural",
  "كاراج":    "structural",
  "زجاج":     "doors_windows",
};

// Arabic stop words — in NORMALIZED form (as normalizeAr would produce)
const STOP_WORDS = new Set([
  "في","من","الي","علي","عن","مع","هذا","هذه","ذلك","تلك","التي","الذي",
  "كان","كانت","يكون","هو","هي","هم","انا","نحن","انت","انتم","يوجد",
  "لا","لم","لن","ما","قد","كل","بعض","غير","وقت","يوم","ساعه","الان",
  "اليوم","جدا","فقط","حتي","ايضا","او","ثم","لكن","اما","اذا",
  "لان","بسبب","حيث","بين","خلال","دون","قبل","بعد","تحت","فوق","عند",
  "سلام","عليكم","وعليكم","شكرا","مرحبا","اهلا","تحيه","تحيه",
  "صباح","مساء","خير","حياكم","ارجو","ارجوكم","يرجي","نرجو","برجاء",
  "منزل","مسكن","شقه","فيلا","وحده","مبني","بيت",
  "صاله","مجلس","غرفه","دور","سطح","حوش","طابق",
  "كبير","كبيره","صغير","صغيره","جديد","جديده","قديم","قديمه","ثاني",
  "تقرير","طلب","موضوع","حاله","نوع","سبب","نتيجه",
  "عمل","شغل","تنفيذ","اصلاح","صيانه","تركيب","تغيير","تعديل",
  "مشكله","موجود","موجوده","محتاج","يحتاج","تحتاج","لدي","عندي",
  "يوجد","توجد","وجود","عدم","تم","يتم","الرجاء","فضلا","نامل",
  "حضرتك","معك","تواصل","عاجل","جميع","احد","احدي","فيلا",
  "رقم","ات","به","فيه","فيها","منه","منها","كذلك",
  "اكثر","هناك","هنا","مره","مرات","وال","بال","انا","احتاج",
  "يوجد","المشكله","المشكلة","الشكاليه","حاليا","السلام","وبركاته",
]);

// Minimum word length and minimum frequency to be included as keyword
const MIN_WORD_LEN  = 3;
const MIN_FREQUENCY = 2;     // word must appear in at least 2 tickets for this type
const MAX_KEYWORDS_PER_TYPE = 200;  // cap per type to avoid noise

function extractWords(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  // Strip Unicode directional/control chars that Excel embeds in Arabic text
  const cleaned = text.replace(/[​-‏‪-‮⁦-⁩﻿؜]/g, " ");
  return normalizeAr(cleaned)
    .split(/\s+/)
    .filter((w) => w.length >= MIN_WORD_LEN && !STOP_WORDS.has(w) && /[؀-ۿ]/.test(w));
}

function resolveTypeKeys(rawCategory: string): string[] {
  const keys: string[] = [];
  const parts = rawCategory.split(/[،,+،\-]/);
  for (const part of parts) {
    const trimmed = part.trim();
    const mapped = CATEGORY_MAP[trimmed];
    if (mapped) keys.push(mapped);
  }
  return [...new Set(keys)];
}

async function main() {
  const excelPath = path.join(__dirname, "..", "NTF1 Ticket (2).xlsm");
  console.log(`📂 Reading: ${excelPath}`);

  const wb = XLSX.readFile(excelPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Find header row (row with "الوصف" and "تصنيف التذاكر")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].includes("الوصف") && rows[i].includes("تصنيف التذاكر")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    console.error("❌ Could not find header row");
    process.exit(1);
  }

  const headers: string[] = rows[headerIdx];
  const descCol   = headers.indexOf("الوصف");
  const typeCol   = headers.indexOf("تصنيف التذاكر");
  const statusCol = headers.indexOf("حالة الإغلاق");

  console.log(`✅ Header at row ${headerIdx + 1} — desc:${descCol} type:${typeCol} status:${statusCol}`);

  // Collect word frequencies: typeKey → word → count
  const freqMap: Record<string, Record<string, number>> = {};
  let processed = 0;
  let skipped   = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawDesc = String(row[descCol] || "").trim();
    const rawType = String(row[typeCol] || "").trim();

    if (!rawDesc || !rawType || rawType === "مكرره" || rawType === "خارج اختصاص" || rawType === "خارج الاختصاص") {
      skipped++;
      continue;
    }

    const typeKeys = resolveTypeKeys(rawType);
    if (typeKeys.length === 0) { skipped++; continue; }

    const words = extractWords(rawDesc);
    for (const key of typeKeys) {
      if (!freqMap[key]) freqMap[key] = {};
      for (const w of words) {
        freqMap[key][w] = (freqMap[key][w] || 0) + 1;
      }
    }
    processed++;
  }

  console.log(`\n📊 Processed: ${processed} tickets, skipped: ${skipped}`);
  console.log(`📝 Type coverage: ${Object.keys(freqMap).join(", ")}\n`);

  // Load active types from DB
  const dbTypes = await prisma.ticketType.findMany({ where: { isActive: true }, select: { id: true, key: true, nameAr: true } });
  const typeByKey = Object.fromEntries(dbTypes.map((t) => [t.key, t]));

  let totalInserted = 0;
  let totalUpdated  = 0;

  for (const [typeKey, wordFreqs] of Object.entries(freqMap)) {
    const dbType = typeByKey[typeKey];
    if (!dbType) {
      console.warn(`⚠️  Type "${typeKey}" not found in DB — skipping`);
      continue;
    }

    // Sort by frequency, cap at MAX_KEYWORDS_PER_TYPE
    const sorted = Object.entries(wordFreqs)
      .filter(([, count]) => count >= MIN_FREQUENCY)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_KEYWORDS_PER_TYPE);

    console.log(`  [${typeKey}] ${dbType.nameAr}: ${sorted.length} keywords (from ${Object.keys(wordFreqs).length} unique words)`);

    for (const [word, count] of sorted) {
      // Weight: logarithmic scale based on frequency (1.0 → 3.0)
      const weight = Math.min(1.0 + Math.log10(count) * 1.5, 3.0);

      const existing = await prisma.ticketTypeKeyword.findFirst({
        where: { keyword: word, typeId: dbType.id },
      });

      if (existing) {
        if (existing.source === "seed" || existing.source === "manual") continue; // don't overwrite curated

        await prisma.ticketTypeKeyword.update({
          where: { id: existing.id },
          data: { usageCount: existing.usageCount + count, weight: Math.max(existing.weight, weight) },
        });
        totalUpdated++;
      } else {
        await prisma.ticketTypeKeyword.create({
          data: {
            keyword:           word,
            typeId:            dbType.id,
            weight:            parseFloat(weight.toFixed(2)),
            source:            "seed",
            isLearned:         false,
            confidence:        0.85,
            usageCount:        count,
            pendingReclassify: false, // seed data doesn't trigger reclassification
          },
        });
        totalInserted++;
      }
    }
  }

  console.log(`\n✅ Done! Inserted: ${totalInserted}, Updated: ${totalUpdated}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
