/**
 * Gemini Flash classifier — fallback when keyword confidence is too low.
 * Uses gemini-2.0-flash-lite (fastest free model).
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

// ── Build available-types list for the prompt ──────────────────────────────
async function getActiveTypes(): Promise<{ key: string; nameAr: string; description?: string }[]> {
  const types = await prisma.ticketType.findMany({
    where: { isActive: true },
    select: { key: true, nameAr: true, description: true },
    orderBy: { sortOrder: "asc" },
  });
  return types;
}

// ── Main classification function ───────────────────────────────────────────
export interface GeminiClassifyResult {
  primaryType: string;
  allTypes: string[];
  confidence: number;
  reason: string;
  source: "gemini";
}

export async function classifyWithGemini(
  description: string
): Promise<GeminiClassifyResult | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const types = await getActiveTypes();
    if (types.length === 0) return null;

    const typesList = types
      .map((t) => `- ${t.key}: ${t.nameAr}${t.description ? ` (${t.description})` : ""}`)
      .join("\n");

    const prompt = `Maintenance ticket classifier for Arabic residential projects. Reply with ONLY valid JSON.

Available types:
${typesList}

Rules:
1. Choose 1-2 types max (3 only if truly composite problem)
2. Focus on the root cause — e.g. "water leak caused tile damage" → [plumbing, ceramics]
3. If description is too vague or not a maintenance issue → return empty types array
4. Reply with JSON only, no other text

Problem description: "${description}"

Reply format: {"types":["key1","key2"],"confidence":0.9}`;

    const model = client.getGenerativeModel({
      model: "gemini-flash-latest",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200,
        // Disable thinking mode — saves ~150 tokens overhead, leaves full budget for output
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    });

    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim();

    // Parse JSON response — extract first {...} block regardless of surrounding text
    let parsed: { types?: string[]; confidence?: number; reason?: string };
    try {
      // Strip markdown code fences, then extract the JSON object
      const stripped = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("[Gemini] Failed to parse response:", text);
      return null;
    }

    const validTypeKeys = new Set((await getActiveTypes()).map((t) => t.key));
    const validTypes = (parsed.types ?? []).filter((k) => validTypeKeys.has(k));

    if (validTypes.length === 0) return null;

    return {
      primaryType: validTypes[0],
      allTypes:    validTypes,
      confidence:  parsed.confidence ?? 0.8,
      reason:      parsed.reason ?? "",
      source:      "gemini",
    };
  } catch (err: any) {
    console.error("[Gemini] classify error:", err.message);
    return null;
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
    "في","من","الى","على","عن","مع","هذا","هذه","ذلك","تلك","التي","الذي",
    "كان","كانت","يكون","هو","هي","هم","انا","نحن","انت","يوجد","لا","لم",
    "لن","ما","قد","كل","بعض","غير","وقت","يوم","ساعه","الان","اليوم",
    "جدا","فقط","حتى","ايضا","او","و","ثم","لكن","اما","اذا","لان",
    "بسبب","حيث","بين","خلال","دون","قبل","بعد","تحت","فوق","عند",
    "هناك","يرجى","يوجد","فيه","فيها","منه","منها","عليه","عليها",
    "مشكله","مشكلة","موجود","موجوده","محتاج","محتاجه","عايز","عايزه",
    "ارجو","ارجوكم","يلزم","يلزمنا","نريد","نحتاج",
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
