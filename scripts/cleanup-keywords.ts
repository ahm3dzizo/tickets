/**
 * scripts/cleanup-keywords.ts
 * ────────────────────────────
 * Cleans up cross-type keyword contamination:
 *
 * 1. Manual keywords are sacred — never touched.
 * 2. If a manual keyword exists for type X, delete all SEED versions
 *    of that same keyword from every OTHER type.
 * 3. For remaining multi-type seed keywords:
 *    - Keep only the type whose usageCount >= 35% of total usageCount.
 *    - If no single type dominates at 35%, delete from ALL types
 *      (word is too generic to be useful).
 * 4. Also delete a hard-coded list of pure location/generic words
 *    that should NEVER be keywords (باب، حمام، غرفة...).
 *
 * Run:  npx tsx scripts/cleanup-keywords.ts
 *       npx tsx scripts/cleanup-keywords.ts --dry-run
 */

import prisma from "../server/db.js";

const DRY_RUN = process.argv.includes("--dry-run");

// Words that describe LOCATION, CONTEXT, or GENERIC ACTION — not the actual problem.
// These contaminate every type and should not be keywords at all.
const LOCATION_GENERICS = new Set([
  // ── Rooms / locations ──────────────────────────────────────────────────
  "باب","حمام","غرفه","مطبخ","صاله","مجلس","دور","سطح","حوش","طابق",
  "فله","فيلا","كراج","مدخل","ممر","ارضيه","حمامات","ماستر","نوم",
  "سفلي","سقف","نساء","رجال","جانبي","مجلس","مسبقا",
  // ── Generic directional / positional ──────────────────────────────────
  "داخل","خارج","امام","خلف","يمين","يسار","فوق","تحت","جانب",
  "جهه","ناحيه","اعلي","اسفل","رئيسي","رئيسيه",
  // ── Generic adjectives / states ───────────────────────────────────────
  "بشكل","كامل","جيد","سليم","طيبه","اول","ثاني","كبير","صغير",
  "جديد","قديم","كثير","صعوبه","خلل",
  // ── Generic action verbs (not maintenance-specific) ────────────────────
  "اعاده","اغلاق","فتح","تاكد","اعمال","تنظيف","ملاحظات","استلام",
  "تجمع","توجيه","امل","يعمل","يفتح","يغلق","تغلق","يمكن","يسبب",
  "يشتغل","يقفل","يلزم","اغلاقه","باحكام",
  // ── Generic filler / connectors ───────────────────────────────────────
  "بلاط","جدار","مياه","علوي","اثناء","انه","اللي","كما","مما",
  "لكم","فراغات","دوره","عدد","صور","صوره","صوت","عزل","وزن","وزنيه",
  "غطاء","ميول","تصريف","انترلوك","افياش","ترويبه","تطبيل","فتحه",
  "ارضي","اكثر","الا","وعدم","بها","ربل","هواء","سحب",
  // ── Meta / company / filler ────────────────────────────────────────────
  "تذكره","شركه","رتال","الله","امطار","وباب","شباك","صوره",
]);

// Dominance threshold: a type must own >= 35% of total usageCount to keep the keyword
const DOMINANCE_THRESHOLD = 0.35;

async function main() {
  console.log(`\n🧹 Cleanup Keywords ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log("━".repeat(50));

  // ── Step 1: Delete pure location/generic words ──────────────────────────
  console.log("\n[1] Removing location/generic words...");
  let step1Deleted = 0;

  for (const word of LOCATION_GENERICS) {
    const records = await prisma.ticketTypeKeyword.findMany({
      where: { keyword: word, source: { not: "manual" } },
      select: { id: true, source: true },
    });
    if (records.length === 0) continue;
    console.log(`  🗑  "${word}" → removing ${records.length} records`);
    if (!DRY_RUN) {
      await prisma.ticketTypeKeyword.deleteMany({
        where: { id: { in: records.map(r => r.id) } },
      });
    }
    step1Deleted += records.length;
  }
  console.log(`   Total removed: ${step1Deleted}`);

  // ── Step 2: Manual keywords win — delete conflicting seed entries ────────
  console.log("\n[2] Manual keywords override seed duplicates...");
  let step2Deleted = 0;

  const manualKeywords = await prisma.ticketTypeKeyword.findMany({
    where: { source: "manual" },
    select: { keyword: true, typeId: true },
  });

  for (const mk of manualKeywords) {
    const conflicts = await prisma.ticketTypeKeyword.findMany({
      where: {
        keyword: mk.keyword,
        typeId: { not: mk.typeId },
        source: { not: "manual" },
      },
      select: { id: true, typeId: true },
    });
    if (conflicts.length === 0) continue;
    const type = await prisma.ticketType.findUnique({ where: { id: mk.typeId }, select: { key: true } });
    console.log(`  ✂️  "${mk.keyword}" (manual→${type?.key}) removes ${conflicts.length} seed duplicates`);
    if (!DRY_RUN) {
      await prisma.ticketTypeKeyword.deleteMany({
        where: { id: { in: conflicts.map(c => c.id) } },
      });
    }
    step2Deleted += conflicts.length;
  }
  console.log(`   Total removed: ${step2Deleted}`);

  // ── Step 3: Dominance check for remaining multi-type keywords ───────────
  console.log("\n[3] Dominance check — keeping only the dominant type...");
  let step3Deleted = 0;
  let step3Kept    = 0;

  // Find all keywords still appearing in 2+ types (non-manual)
  const multiType = await prisma.$queryRaw<{ keyword: string }[]>`
    SELECT keyword
    FROM "TicketTypeKeyword"
    WHERE source != 'manual'
    GROUP BY keyword
    HAVING COUNT(DISTINCT "typeId") >= 2
  `;

  for (const { keyword } of multiType) {
    const records = await prisma.ticketTypeKeyword.findMany({
      where: { keyword, source: { not: "manual" } },
      include: { ticketType: { select: { key: true } } },
      orderBy: { usageCount: "desc" },
    });

    const totalCount = records.reduce((s, r) => s + r.usageCount, 0);
    const topRecord  = records[0];
    const topRatio   = totalCount > 0 ? topRecord.usageCount / totalCount : 0;

    const toDelete = topRatio >= DOMINANCE_THRESHOLD
      ? records.slice(1)     // keep top, delete rest
      : records;             // no dominant type → delete ALL

    if (toDelete.length === 0) continue;

    const action = topRatio >= DOMINANCE_THRESHOLD
      ? `keep "${topRecord.ticketType?.key}" (${(topRatio * 100).toFixed(0)}%), delete ${toDelete.length} others`
      : `no dominant type (top=${(topRatio * 100).toFixed(0)}%) → delete ALL ${records.length}`;

    console.log(`  "${keyword}" → ${action}`);

    if (!DRY_RUN) {
      await prisma.ticketTypeKeyword.deleteMany({
        where: { id: { in: toDelete.map(r => r.id) } },
      });
    }
    step3Deleted += toDelete.length;
    if (topRatio >= DOMINANCE_THRESHOLD) step3Kept++;
  }
  console.log(`   Kept dominant: ${step3Kept} | Deleted: ${step3Deleted}`);

  // ── Summary ──────────────────────────────────────────────────────────────
  const remaining = await prisma.ticketTypeKeyword.count();
  console.log(`\n${"━".repeat(50)}`);
  console.log(`🗑  Step 1 (generic words):    ${step1Deleted}`);
  console.log(`✂️   Step 2 (manual wins):      ${step2Deleted}`);
  console.log(`🏆  Step 3 (dominance filter): ${step3Deleted}`);
  console.log(`📚  Keywords remaining in DB:  ${remaining}`);
  if (DRY_RUN) console.log("\n⚠️  Dry run — nothing deleted");

  await prisma.$disconnect();
}

main().catch(err => { console.error("❌", err); process.exit(1); });
