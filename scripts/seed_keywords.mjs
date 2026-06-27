/**
 * seed_keywords.mjs
 * Option A: Add "رقبة الخزان" subtype under tank_insulation (general specialty)
 * Option B: Seed TicketTypeKeyword from classified Excel keyword rules
 *
 * Run: node scripts/seed_keywords.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Keyword → ML type key mapping ──────────────────────────────────────────
// Derived from classifier_rules.json subcategory_rules
// Key: ML TicketType.key  |  Value: array of Arabic keywords to add
const KEYWORD_MAP = {
  // ── سباكة subcategories ─────────────────────────────────────────────────
  plumbing: [
    // تسريب مياه
    "تسريب", "تهريب", "يسرب", "رشح", "يرشح", "تشرب", "مياه تسرب", "بقعة رطوبة",
    // حنفيات وتمديدات
    "حنفية", "صنبور", "مواسير", "ماسورة", "خرطوم", "توصيل",
    // صنابير وأدوات
    "صنابير", "خلاط", "دش", "سيفون", "مغسلة", "حوض",
  ],

  // خزان مياه → tank_insulation (عام) ← NOT plumbing/ميكانيكا
  tank_insulation: [
    "خزان", "رقبة خزان", "غطاء خزان", "فتحة خزان",
    "رقبه خزان", "فتحه خزان", "غطاء خزن", "رقبه",
    "رقبة الخزان", "غطاء الخزان", "فتحة الخزان",
    "تنظيف خزان", "تعبئة خزان", "مستوى الخزان",
  ],

  drainage: [
    // انسداد صرف
    "انسداد", "انسد", "سدد", "مسدود", "بالوعة", "لا يصرف", "لا ينزل",
    "صرف بطيء", "تراكم مياه",
    // صرف صحي
    "مجاري", "غرفة التفتيش", "بيارة", "صرف خارجي",
    "روائح كريهة", "رائحة صرف", "أغطية صرف",
  ],

  pumps: [
    "ضغط مياه", "ضعف ضغط", "ضغط ضعيف", "نقص المياه",
    "انقطاع مياه", "مياه ضعيفة", "مضخة", "طلمبة", "عوامة",
  ],

  // ── كهرباء subcategories ────────────────────────────────────────────────
  electricity: [
    // إضاءة
    "ضوء", "اضاءة", "إضاءة", "لمبة", "سبوت", "نيون", "كشاف", "بروجكتور",
    "لمبات", "فانوس",
    // مقابس وأسلاك
    "مقبس", "بريزة", "سلك", "كابل", "مفتاح كهرباء", "زر كهرباء",
    // لوحة كهربائية
    "لوحة كهربائية", "تفريعة", "فيوز", "قاطع كهرباء", "لوحة",
    // أنظمة إلكترونية
    "انتركوم", "كاميرا مراقبة", "انذار", "جرس", "شاشة",
  ],

  ac_ventilation: [
    "تكييف", "مكيف", "مروحة", "مراوح", "شفاط", "تهوية",
    "مصد هواء", "هواء", "هوايات", "ويندو", "سبليت",
  ],

  // ── عام subcategories ───────────────────────────────────────────────────
  ceramics: [
    "سيراميك", "سراميك", "سيرامبك", "بلاط", "بلاطة", "بلاطات",
    "بورسلان", "رخام", "مرمر", "بروفايل", "انترلوك", "بلاط خارجي",
    "كسر سيراميك", "سيراميك مكسور", "مفصل سيراميك",
  ],

  paints: [
    "دهان", "دهانات", "بويه", "طلاء", "تقشر", "تقشير",
    "جبس", "جبسبورد", "جبس بورد", "اطار جبس", "سقف جبس", "لياسه",
    "معجون", "بتونة", "بياض", "دهان خارجي",
  ],

  doors_windows: [
    "المنيوم", "المونيوم", "الموينوم", "نافذة", "شباك", "شبابيك",
    "نوافذ", "زجاج", "درابزين", "كسر زجاج", "ألمنيوم",
    "مقبض نافذة", "قفل نافذة",
  ],

  doors: [
    "باب خشب", "ابواب خشب", "باب غرفة", "باب حمام",
    "لسان", "حلق الباب", "هتزاز الباب", "أقفال داخلية",
    "مفصلة", "مفصلات", "مقبض باب",
  ],

  garage_door: [
    "كراج", "كاراج", "جراج", "باب الجراج", "القراج",
    "باب الكراج", "باب القراج", "موتور كراج", "ريموت كراج",
    "سكة باب كراج", "فنر باب كراج",
  ],

  waterproofing: [
    "عزل", "رطوبة", "رطب", "كتمه", "بيتومين",
    "عزل مواسير", "عزل المواصير", "عزل سطح", "عزل جدار",
    "تسرب مياه أمطار", "تسربات نوافذ", "رطوبة جدار",
  ],

  cracks: [
    "هبوط", "تشقق", "تشققات", "شق", "خسف", "ميلان",
    "كراك", "تصدع", "انكسار", "تشقق جدار", "تشقق سقف",
  ],

  grading: [
    "ترويبه", "ترويبة", "ميول", "تجمع مياه أمطار",
    "هبوط أرض", "مملة", "فواصل بين البلاط",
  ],

  structural: [
    "سور", "حديقة", "حديد", "ليزر", "رمل", "بحص",
    "موقف سيارة", "أساسات", "أعمدة", "جدران حاملة",
  ],

  pest_control: [
    "نمل", "حشرة", "حشرات", "بق", "صراصير", "بعوض",
    "قوارض", "مبيدات", "رش حشرات",
  ],

  cleaning: [
    "نظافة", "تنظيف", "حاوية", "طلب حاوية",
    "تنظيف مخلفات", "تنظيف عام",
  ],
};

// ── Subtype to add (Option A) ───────────────────────────────────────────────
const NEW_SUBTYPE = {
  parentTypeKey: "tank_insulation",
  nameAr: "رقبة الخزان",
  keywords: [
    "رقبة خزان", "غطاء خزان", "فتحة خزان",
    "رقبه خزان", "فتحه خزان", "رقبة الخزان",
  ],
};

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  Seed Keywords + Add رقبة الخزان subtype");
  console.log("══════════════════════════════════════════\n");

  // ── Load type map ────────────────────────────────────────────────────────
  const allTypes = await prisma.ticketType.findMany({ select: { id: true, key: true } });
  const typeIdByKey = new Map(allTypes.map(t => [t.key, t.id]));
  console.log(`✔ Loaded ${allTypes.length} ticket types`);

  // ── Load existing keywords to avoid duplicates ───────────────────────────
  const existing = await prisma.ticketTypeKeyword.findMany({ select: { keyword: true, typeId: true } });
  const existingSet = new Set(existing.map(k => `${k.typeId}::${k.keyword}`));
  console.log(`✔ Found ${existing.length} existing keywords\n`);

  // ══ OPTION A: Add رقبة الخزان subtype ═══════════════════════════════════
  console.log("── Option A: Add رقبة الخزان subtype under tank_insulation ─────");
  const tankTypeId = typeIdByKey.get(NEW_SUBTYPE.parentTypeKey);
  if (!tankTypeId) {
    console.warn("⚠ tank_insulation type not found, skipping subtype creation");
  } else {
    const existingSubtype = await prisma.ticketSubType.findFirst({
      where: { nameAr: NEW_SUBTYPE.nameAr, parentTypeId: tankTypeId },
    });
    if (existingSubtype) {
      console.log(`  ↳ Subtype "${NEW_SUBTYPE.nameAr}" already exists, skipping`);
    } else {
      const created = await prisma.ticketSubType.create({
        data: {
          nameAr: NEW_SUBTYPE.nameAr,
          parentTypeId: tankTypeId,
          isActive: true,
        },
      });
      console.log(`  ✔ Created subtype "${NEW_SUBTYPE.nameAr}" (id: ${created.id.slice(0, 8)}...)`);

      // Add keywords for this subtype pointing to tank_insulation
      for (const kw of NEW_SUBTYPE.keywords) {
        const dedupeKey = `${tankTypeId}::${kw}`;
        if (existingSet.has(dedupeKey)) continue;
        await prisma.ticketTypeKeyword.create({
          data: {
            keyword: kw,
            typeId: tankTypeId,
            subTypeId: created.id,
            weight: 4.0,
            confidence: 0.95,
            source: "manual",
            isLearned: false,
          },
        });
        existingSet.add(dedupeKey);
        console.log(`    + keyword: "${kw}"`);
      }
    }
  }

  // ══ OPTION B: Seed keywords from classifier rules ════════════════════════
  console.log("\n── Option B: Seed keywords from Excel classifier rules ──────────");
  let added = 0;
  let skipped = 0;

  for (const [typeKey, keywords] of Object.entries(KEYWORD_MAP)) {
    const typeId = typeIdByKey.get(typeKey);
    if (!typeId) {
      console.warn(`  ⚠ Type not found: ${typeKey}, skipping`);
      continue;
    }

    let typeAdded = 0;
    for (const kw of keywords) {
      const dedupeKey = `${typeId}::${kw}`;
      if (existingSet.has(dedupeKey)) { skipped++; continue; }

      await prisma.ticketTypeKeyword.create({
        data: {
          keyword: kw,
          typeId,
          weight: 2.5,
          confidence: 0.80,
          source: "manual",
          isLearned: false,
        },
      });
      existingSet.add(dedupeKey);
      added++;
      typeAdded++;
    }

    if (typeAdded > 0) {
      console.log(`  ✔ ${typeKey}: +${typeAdded} keywords`);
    }
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  Done: ${added} added, ${skipped} skipped (already existed)`);
  console.log(`══════════════════════════════════════════\n`);
}

main()
  .catch(e => { console.error("Error:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
