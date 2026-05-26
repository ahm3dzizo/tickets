/**
 * Gemini Flash classifier — fallback when keyword confidence is too low.
 * Uses gemini-2.5-flash-lite-lite (fastest free model).
 *
 * Set GEMINI_API_KEY in .env to enable.
 * Free tier: 1500 requests/day, 1M tokens/day — more than enough.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../db.js";
import { loadKeywordsFromDB, normalizeArabic } from "./keywords.js";
import { invalidateKeywordCache } from "./keywords.js";

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!_client) _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return _client;
}

export function geminiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// ── Build available-types + subtypes list ──────────────────────────────────
async function getActiveTypes(): Promise<{ key: string; nameAr: string; description?: string }[]> {
  const types = await prisma.ticketType.findMany({
    where: { isActive: true },
    select: { key: true, nameAr: true, description: true },
    orderBy: { sortOrder: "asc" },
  });
  return types;
}

type SubTypeInfo = { id: string; nameAr: string; parentKey: string };

async function getActiveSubTypes(): Promise<SubTypeInfo[]> {
  const subs = await prisma.ticketSubType.findMany({
    where: { isActive: true },
    select: { id: true, nameAr: true, parentType: { select: { key: true } } },
  });
  return subs.map(s => ({ id: s.id, nameAr: s.nameAr, parentKey: s.parentType.key }));
}

// ── Main classification function ───────────────────────────────────────────
export interface GeminiClassifyResult {
  primaryType:  string;
  allTypes:     string[];
  subTypeId?:   string;
  subTypeNameAr?: string;
  confidence:   number;
  reason:       string;
  source:       "gemini";
}

export async function classifyWithGemini(
  description: string
): Promise<GeminiClassifyResult | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const [types, subTypes] = await Promise.all([getActiveTypes(), getActiveSubTypes()]);
    if (types.length === 0) return null;

    const typesList = types
      .map((t) => {
        const subs = subTypes.filter(s => s.parentKey === t.key).map(s => s.nameAr).join("، ");
        return `- ${t.key}: ${t.nameAr}${subs ? ` (أنواع فرعية: ${subs})` : ""}`;
      })
      .join("\n");

    const prompt = `Maintenance ticket classifier for Arabic residential projects. Reply with ONLY valid JSON.

Available main types with their sub-types:
${typesList}

Rules:
1. Choose 1-2 main types max (3 only if truly composite)
2. Focus on root cause — e.g. "water leak caused tile damage" → types:[plumbing,ceramics], subType:"تسريبات مياه"
3. subType must be one of the listed sub-type names for the primary type
4. If description is vague → empty types array, null subType
5. JSON only, no other text

Problem: "${description}"

Format: {"types":["key1"],"subType":"اسم النوع الفرعي أو null","confidence":0.9}`;

    const model = client.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim();

    // Parse JSON response — extract first {...} block regardless of surrounding text
    let parsed: { types?: string[]; subType?: string | null; confidence?: number; reason?: string };
    try {
      const stripped = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("[Gemini] Failed to parse response:", text);
      return null;
    }

    const validTypeKeys = new Set(types.map((t) => t.key));
    const validTypes = (parsed.types ?? []).filter((k) => validTypeKeys.has(k));
    if (validTypes.length === 0) return null;

    // Resolve subType name → id
    let subTypeId: string | undefined;
    let subTypeNameAr: string | undefined;
    if (parsed.subType && parsed.subType !== "null") {
      const match = subTypes.find(
        s => s.nameAr === parsed.subType && s.parentKey === validTypes[0]
      );
      if (match) { subTypeId = match.id; subTypeNameAr = match.nameAr; }
    }

    return {
      primaryType:   validTypes[0],
      allTypes:      validTypes,
      subTypeId,
      subTypeNameAr,
      confidence:    parsed.confidence ?? 0.8,
      reason:        parsed.reason ?? "",
      source:        "gemini",
    };
  } catch (err: any) {
    console.error("[Gemini] classify error:", err.message);
    return null;
  }
}

// ── Batch classification — multiple tickets in one request ─────────────────
export interface GeminiBatchResult {
  id:           string;
  primaryType:  string;
  allTypes:     string[];
  subTypeId?:   string;
  confidence:   number;
}

export async function classifyBatchWithGemini(
  items: { id: string; description: string }[]
): Promise<GeminiBatchResult[]> {
  const client = getClient();
  if (!client || items.length === 0) return [];

  const [types, subTypes] = await Promise.all([getActiveTypes(), getActiveSubTypes()]);
  if (types.length === 0) return [];

  const typesList = types
    .map((t) => {
      const subs = subTypes.filter(s => s.parentKey === t.key).map(s => s.nameAr).join("، ");
      return `- ${t.key}: ${t.nameAr}${subs ? ` (${subs})` : ""}`;
    })
    .join("\n");

  const ticketLines = items
    .map((item, i) => `${i + 1}. "${item.description.replace(/"/g, "'")}"`)
    .join("\n");

  const prompt = `Maintenance classifier for Arabic residential projects.

Types with sub-types:
${typesList}

Rules: 1-2 main types max, subType = one sub-type name from the primary type (or null).

Tickets:
${ticketLines}

Return JSON array:
[{"i":1,"types":["key1"],"subType":"اسم فرعي أو null","confidence":0.9}]`;

  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 800,
      responseMimeType: "application/json",
    },
  });

  try {
    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim();

    // Extract JSON array from response
    const stripped  = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const arrMatch  = stripped.match(/\[[\s\S]*\]/);
    if (!arrMatch) {
      console.error("[Gemini batch] No JSON array in response:", text.slice(0, 120));
      return [];
    }

    const parsed: { i: number; types?: string[]; subType?: string | null; confidence?: number }[] = JSON.parse(arrMatch[0]);
    const validTypeKeys = new Set(types.map((t) => t.key));

    return parsed
      .filter((r) => r.i >= 1 && r.i <= items.length)
      .map((r) => {
        const validTypes = (r.types ?? []).filter((k) => validTypeKeys.has(k));
        // Resolve subType name → id
        let subTypeId: string | undefined;
        if (r.subType && r.subType !== "null" && validTypes[0]) {
          const match = subTypes.find(s => s.nameAr === r.subType && s.parentKey === validTypes[0]);
          if (match) subTypeId = match.id;
        }
        return {
          id:          items[r.i - 1].id,
          primaryType: validTypes[0] ?? "unclassified",
          allTypes:    validTypes,
          subTypeId,
          confidence:  r.confidence ?? 0.8,
        };
      });
  } catch (err: any) {
    console.error("[Gemini batch] error:", err.message);
    throw err; // let worker handle 429
  }
}

// ── Auto-learn: add Gemini's result as keywords so next time keywords catch it ─
export async function learnFromGeminiResult(
  description: string,
  types: string[]
): Promise<void> {
  if (!description || types.length === 0) return;

  // Arabic stop words — don't add these as keywords
  const stopWords = new Set([
    // Prepositions & conjunctions
    "في","من","الى","على","عن","مع","هذا","هذه","ذلك","تلك","التي","الذي",
    "كان","كانت","يكون","هو","هي","هم","انا","نحن","انت","يوجد","لا","لم",
    "لن","ما","قد","كل","بعض","غير","وقت","يوم","ساعه","الان","اليوم",
    "جدا","فقط","حتى","ايضا","او","و","ثم","لكن","اما","اذا","لان",
    "بسبب","حيث","بين","خلال","دون","قبل","بعد","تحت","فوق","عند",
    "هناك","يرجى","يوجد","فيه","فيها","منه","منها","عليه","عليها",
    "مشكله","مشكلة","موجود","موجوده","محتاج","محتاجه","عايز","عايزه",
    "ارجو","ارجوكم","يلزم","يلزمنا","نريد","نحتاج",
    // Greetings (very common in Arabic messages, not maintenance terms)
    "سلام","عليكم","وعليكم","السلامه","حياكم","شكرا","شكرً","مرحبا","اهلا",
    "تحيه","تحية","صباح","مساء","خير","معك","تواصل","حضرتك","حضرتكم",
    // Generic location words (too broad to be useful keywords)
    "منزل","مسكن","شقه","شقة","فيلا","وحده","وحدة","مبنى","مبني",
    "صاله","صالة","مجلس","غرفه","غرفة","اوضه","اوضة",
    // Generic adjectives & ordinals
    "كبير","كبيره","صغير","صغيره","جديد","جديده","قديم","قديمه",
    "اول","ثاني","ثالث","رابع","خامس",
    // Generic nouns (appear in many ticket types)
    "تقرير","طلب","موضوع","حاله","حالة","نوع","سبب","نتيجه","نتيجة",
    "عمل","شغل","تنفيذ","اصلاح","صيانه","صيانة","تركيب","تغيير",
  ]);

  try {
    const words = normalizeArabic(description)
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));

    const uniqueWords = [...new Set(words)];
    if (uniqueWords.length === 0) return;

    for (const typeKey of types) {
      const typeRecord = await prisma.ticketType.findUnique({ where: { key: typeKey } });
      if (!typeRecord) continue;

      // Only learn the most meaningful words (avoid learning too many generics)
      const wordsToLearn = uniqueWords.slice(0, 8);

      for (const word of wordsToLearn) {
        const existing = await prisma.ticketTypeKeyword.findFirst({
          where: { keyword: word, typeId: typeRecord.id },
        });

        if (existing) {
          // Reinforce existing keyword
          await prisma.ticketTypeKeyword.update({
            where: { id: existing.id },
            data: { usageCount: { increment: 1 }, weight: Math.min(existing.weight + 0.1, 3.0) },
          });
        } else {
          // Check if this word is already strongly associated with another type
          const rival = await prisma.ticketTypeKeyword.findFirst({
            where: { keyword: word, typeId: { not: typeRecord.id }, weight: { gt: 2.0 } },
          });
          if (rival) continue; // Don't confuse a strong keyword from another type

          await prisma.ticketTypeKeyword.create({
            data: {
              keyword:    word,
              typeId:     typeRecord.id,
              weight:     1.0,
              source:     "gemini_learned",
              isLearned:  true,
              confidence: 0.75,
              usageCount: 1,
            },
          });
        }
      }
    }

    invalidateKeywordCache();
  } catch (err: any) {
    console.error("[Gemini] learnFromGeminiResult error:", err.message);
  }
}
