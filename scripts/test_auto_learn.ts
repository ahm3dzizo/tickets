/**
 * Unit test for autoLearnFromClassification logic.
 *
 * Tests the core algorithm that:
 * 1. Receives a description + typeKey + confidence from Gemini
 * 2. Extracts meaningful keywords
 * 3. Adds/updates them in the TicketTypeKeyword table via Prisma
 *
 * Run: npx tsx scripts/test_auto_learn.ts
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

// ── Configuration ────────────────────────────────────────────────────────────
const VALID_TYPES = [
  "plumbing","electricity","doors_windows","cracks","ceramics",
  "tank_insulation","drainage","ac_ventilation","pumps",
  "waterproofing","grading","pest_control","cleaning","structural",
  "paints","doors",
];

// ── Mock DB State ────────────────────────────────────────────────────────────
interface MockKeyword {
  id: string;
  keyword: string;
  typeId: string;
  weight: number;
  confidence: number;
  usageCount: number;
  isLearned: boolean;
  source: string;
}

interface MockType {
  id: string;
  key: string;
  nameAr: string;
  isActive: boolean;
}

// Seed data: types
const mockTypes: MockType[] = [
  { id: "type_plumbing", key: "plumbing", nameAr: "سباكة", isActive: true },
  { id: "type_electricity", key: "electricity", nameAr: "كهرباء", isActive: true },
  { id: "type_cracks", key: "cracks", nameAr: "تشققات", isActive: true },
  { id: "type_doors", key: "doors", nameAr: "أبواب", isActive: true },
  { id: "type_paints", key: "paints", nameAr: "دهانات", isActive: true },
];

// Seed data: existing keywords
let mockKeywords: MockKeyword[] = [
  { id: "kw1", keyword: "مياه", typeId: "type_plumbing", weight: 4, confidence: 1, usageCount: 10, isLearned: false, source: "seed" },
  { id: "kw2", keyword: "تسريب", typeId: "type_plumbing", weight: 5, confidence: 1, usageCount: 8, isLearned: false, source: "seed" },
  { id: "kw3", keyword: "كهرباء", typeId: "type_electricity", weight: 4, confidence: 1, usageCount: 12, isLearned: false, source: "seed" },
  { id: "kw4", keyword: "لمبة", typeId: "type_electricity", weight: 3, confidence: 1, usageCount: 5, isLearned: false, source: "seed" },
  { id: "kw5", keyword: "تشقق", typeId: "type_cracks", weight: 5, confidence: 1, usageCount: 7, isLearned: false, source: "seed" },
];

let keywordIdCounter = 100;

// ── Mock Prisma ──────────────────────────────────────────────────────────────
function createMockPrisma() {
  // Deep-copy so tests don't leak state
  const types = JSON.parse(JSON.stringify(mockTypes)) as MockType[];
  const keywords = JSON.parse(JSON.stringify(mockKeywords)) as MockKeyword[];

  const mockPrisma = {
    ticketType: {
      findUnique: async ({ where }: { where: { key?: string; id?: string } }) => {
        if (where.key) return types.find(t => t.key === where.key) || null;
        if (where.id) return types.find(t => t.id === where.id) || null;
        return null;
      },
    },
    ticketTypeKeyword: {
      findFirst: async ({ where }: { where: { keyword: string; typeId?: { not: string } } }) => {
        if (where.typeId?.not) {
          return keywords.find(k => k.keyword === where.keyword && k.typeId !== where.typeId.not) || null;
        }
        return keywords.find(k => k.keyword === where.keyword) || null;
      },
      findUnique: async ({ where }: { where: { keyword_typeId?: { keyword: string; typeId: string } } }) => {
        if (where.keyword_typeId) {
          return keywords.find(
            k => k.keyword === where.keyword_typeId.keyword && k.typeId === where.keyword_typeId.typeId
          ) || null;
        }
        return null;
      },
      upsert: async ({ where, update, create }: {
        where: { keyword_typeId: { keyword: string; typeId: string } };
        update: Record<string, any>;
        create: Record<string, any>;
      }) => {
        const { keyword, typeId } = where.keyword_typeId;
        const existing = keywords.find(k => k.keyword === keyword && k.typeId === typeId);
        if (existing) {
          // Simulate Prisma's { increment: N } behavior
          if (update.usageCount?.increment) existing.usageCount += update.usageCount.increment;
          if (update.weight?.increment) existing.weight += update.weight.increment;
          if (update.isLearned !== undefined) existing.isLearned = update.isLearned;
          if (update.source !== undefined) existing.source = update.source;
          console.log(`  [MOCK] Updated keyword "${keyword}" for type ${typeId}: usageCount=${existing.usageCount}, weight=${existing.weight}`);
          return existing;
        }
        const newKw: MockKeyword = {
          id: `kw_${keywordIdCounter++}`,
          keyword,
          typeId,
          weight: create.weight as number || 1,
          confidence: create.confidence as number || 1,
          usageCount: (create.usageCount as number) || 1,
          isLearned: create.isLearned as boolean || true,
          source: create.source as string || "auto_learned",
        };
        keywords.push(newKw);
        console.log(`  [MOCK] Created keyword "${keyword}" for type ${typeId}`);
        return newKw;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
        const kw = keywords.find(k => k.id === where.id);
        if (kw) Object.assign(kw, data);
        return kw;
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const newKw: MockKeyword = {
          id: `kw_${keywordIdCounter++}`,
          keyword: data.keyword as string,
          typeId: data.typeId as string,
          weight: data.weight as number || 1,
          confidence: data.confidence as number || 1,
          usageCount: (data.usageCount as number) || 1,
          isLearned: data.isLearned as boolean || true,
          source: data.source as string || "auto_learned",
        };
        keywords.push(newKw);
        return newKw;
      },
    },
    // Export for assertions
    _getKeywords: () => JSON.parse(JSON.stringify(keywords)),
    _getTypes: () => JSON.parse(JSON.stringify(types)),
  };

  return mockPrisma;
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

// ── The Function Under Test (extracted from server.ts) ───────────────────────

const STOP_WORDS = new Set([
  "في","من","الى","على","عن","مع","هذا","هذه","ذلك","تلك","التي","الذي",
  "كان","كانت","يكون","هو","هي","هم","انا","نحن","انت","انتم","يوجد",
  "لا","لم","لن","ما","قد","كل","بعض","غير","وقت","يوم","ساعة","الان",
  "اليوم","جدا","فقط","حتى","ايضا","او","و","ثم","لكن","اما","اذا",
  "لان","بسبب","حيث","بين","خلال","دون","قبل","بعد","تحت","فوق",
  "ال","اللي","الا","ان","ان","او","ب","ت","ث","ج","ح",
]);

async function autoLearnFromClassification(
  prisma: any,
  description: string,
  typeKey: string,
  confidence: number,
): Promise<{ learnedKeywords: string[]; skippedReasons: string[] }> {
  const result = { learnedKeywords: [] as string[], skippedReasons: [] as string[] };

  if (confidence < 6 || !description || !typeKey) {
    result.skippedReasons.push("confidence < 6 or missing description/typeKey");
    return result;
  }

  const type = await prisma.ticketType.findUnique({ where: { key: typeKey } });
  if (!type) {
    result.skippedReasons.push(`type "${typeKey}" not found`);
    return result;
  }

  // استخراج الكلمات المهمة
  const words = description
    .toLowerCase()
    .replace(/[،,?.!;:""'']/g, " ")
    .split(/\s+/)
    .filter((w: string) => w.length > 2 && !STOP_WORDS.has(w) && isNaN(Number(w)));

  const uniqueWords = [...new Set(words)].slice(0, 5);

  for (const word of uniqueWords) {
    // نتأكد إن الكلمة مش موجودة لنوع تاني
    const existingOther = await prisma.ticketTypeKeyword.findFirst({
      where: { keyword: word, typeId: { not: type.id } },
    });
    if (existingOther) {
      result.skippedReasons.push(`"${word}" already belongs to another type`);
      continue;
    }

    // upsert
    await prisma.ticketTypeKeyword.upsert({
      where: { keyword_typeId: { keyword: word, typeId: type.id } },
      update: {
        usageCount: { increment: 1 },
        weight: { increment: 0.2 },
        isLearned: true,
        source: "auto_learned",
      },
      create: {
        keyword: word,
        typeId: type.id,
        weight: 1.0,
        isLearned: true,
        source: "auto_learned",
        confidence: confidence / 10,
        usageCount: 1,
      },
    });
    result.learnedKeywords.push(word);
  }

  return result;
}

// ── Tests ────────────────────────────────────────────────────────────────────

interface TestCase {
  name: string;
  description: string;
  typeKey: string;
  confidence: number;
  expectLearned: string[];
  expectSkipped: number;
  expectTotalKeywordsAfter?: number;
  check?: (kwList: MockKeyword[], prisma: MockPrisma) => void;
}

const testCases: TestCase[] = [
  {
    name: "1. Low confidence (< 6) → should NOT learn",
    description: "تسريب مياه من الحمام",
    typeKey: "plumbing",
    confidence: 4,
    expectLearned: [],
    expectSkipped: 1,
  },
  {
    name: "2. Valid plumbing description → learn new keywords",
    description: "تسريب مياه من المواسير في الحمام والبلاط مكسور",
    typeKey: "plumbing",
    confidence: 9,
    expectLearned: ["تسريب", "مياه", "المواسير", "الحمام", "والبلاط"], // "مكسور" → "مكسورة" after normalization? no, it becomes "مكسور" which is >2 chars and not stop word
    expectSkipped: 0,
  },
  {
    name: "3. Keyword already belongs to another type → skip it",
    description: "كهرباء لمبة مكسورة في المطبخ",
    typeKey: "cracks",
    confidence: 8,
    expectLearned: ["مكسورة", "المطبخ"], // "كهرباء" belongs to electricity, "لمبة" belongs to electricity → skipped
    expectSkipped: 2, // "كهرباء" and "لمبة" already in other type
  },
  {
    name: "4. Description with stop words only → learn nothing",
    description: "في من على عن هذا الذي لا",
    typeKey: "plumbing",
    confidence: 7,
    expectLearned: [],
    expectSkipped: 0, // all filtered out as stop words, so no iteration
  },
  {
    name: "5. Short words (<=2 chars) → filtered out",
    description: "أ ب ت ث ح م ن ه و ي موية",
    typeKey: "plumbing",
    confidence: 9,
    expectLearned: ["موية"], // only "موية" is >2 chars
    expectSkipped: 0,
  },
  {
    name: "6. Non-existent type key → skip",
    description: "تسريب مياه",
    typeKey: "nonexistent_type",
    confidence: 9,
    expectLearned: [],
    expectSkipped: 1,
  },
  {
    name: "7. Empty description → skip",
    description: "",
    typeKey: "plumbing",
    confidence: 9,
    expectLearned: [],
    expectSkipped: 1,
  },
  {
    name: "8. Electricity description → learn to electricity type",
    description: "فيشة الكهرباء عطلانة واللمبة طافية",
    typeKey: "electricity",
    confidence: 9,
    expectLearned: ["فيشة", "الكهرباء", "عطلانة", "واللمبة", "طافية"],
    expectSkipped: 0,
  },
  {
    name: "9. Repeat same description → upsert increments usageCount",
    description: "تسريب مياه من المواسير",
    typeKey: "plumbing",
    confidence: 9,
    expectLearned: ["تسريب", "مياه", "المواسير"], // existing words get upserted
    expectSkipped: 0,
    // We'll check usageCount after
  },
  {
    name: "10. Only 5 unique words max (slice limit)",
    description: "انهيار جدار أساس عمود سقف بناء هدم ترميم شروخ",
    typeKey: "cracks",
    confidence: 9,
    expectLearned: ["انهيار", "جدار", "أساس", "عمود", "سقف"], // max 5
    expectSkipped: 0,
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function runTest(tc: TestCase) {
  const prisma = createMockPrisma();
  const result = await autoLearnFromClassification(prisma, tc.description, tc.typeKey, tc.confidence);
  const finalKeywords = (prisma as any)._getKeywords() as MockKeyword[];

  const allMatch = tc.expectLearned.length === result.learnedKeywords.length &&
    tc.expectLearned.every(w => result.learnedKeywords.includes(w));
  const skipMatch = result.skippedReasons.length === tc.expectSkipped;

  const pass = allMatch && skipMatch;

  if (pass) {
    console.log(`  ✅ ${tc.name}`);
    console.log(`     Learned: [${result.learnedKeywords.join(", ")}]`);
    if (result.skippedReasons.length > 0) {
      console.log(`     Skipped reasons: ${result.skippedReasons.join("; ")}`);
    }
    if (tc.check) tc.check(finalKeywords, prisma);
    passed++;
  } else {
    console.log(`  ❌ ${tc.name}`);
    console.log(`     Expected learned: [${tc.expectLearned.join(", ")}]`);
    console.log(`     Got learned:      [${result.learnedKeywords.join(", ")}]`);
    console.log(`     Expected skipped: ${tc.expectSkipped}`);
    console.log(`     Got skipped:      ${result.skippedReasons.length} (${result.skippedReasons.join("; ")})`);
    failed++;
  }
}

async function main() {
  console.log("══════════════════════════════════════════════════════");
  console.log("  Unit Tests: autoLearnFromClassification");
  console.log("══════════════════════════════════════════════════════\n");

  for (const tc of testCases) {
    await runTest(tc);
  }

  // ── Additional edge case test ──
  console.log("\n── Edge Case: upsert increments weight correctly ──");
  const prisma2 = createMockPrisma();
  // First call: learn "المواسير" → creates it
  await autoLearnFromClassification(prisma2, "تسريب مياه من المواسير", "plumbing", 9);
  const kwsAfter1 = (prisma2 as any)._getKeywords() as MockKeyword[];
  const newWord1 = kwsAfter1.find(k => k.keyword === "المواسير")!;
  console.log(`  After 1st call: "${newWord1.keyword}" weight=${newWord1.weight}, usageCount=${newWord1.usageCount}`);
  
  // Second call: same description → upserts: weight +0.2, usageCount +1
  await autoLearnFromClassification(prisma2, "تسريب مياه من المواسير", "plumbing", 9);
  const kwsAfter2 = (prisma2 as any)._getKeywords() as MockKeyword[];
  const newWord2 = kwsAfter2.find(k => k.keyword === "المواسير")!;
  console.log(`  After 2nd call: "${newWord2.keyword}" weight=${newWord2.weight}, usageCount=${newWord2.usageCount}`);

  const weightOk = Math.abs(newWord2.weight - newWord1.weight - 0.2) < 0.001;
  const usageOk = newWord2.usageCount === newWord1.usageCount + 1;

  if (weightOk && usageOk) {
    console.log("  ✅ Upsert weight and usageCount increment correct");
    passed++;
  } else {
    console.log(`  ❌ Upsert failed: weight delta=${(newWord2.weight - newWord1.weight).toFixed(1)} (expected 0.2), usage delta=${newWord2.usageCount - newWord1.usageCount} (expected 1)`);
    failed++;
  }

  // ── Final summary ──
  console.log("\n══════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log("══════════════════════════════════════════════════════");
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});
