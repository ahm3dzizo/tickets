/**
 * AI classifier — fallback when keyword confidence is too low.
 * Prefers OpenRouter (set OPENROUTER_API_KEY, defaults to the free
 * google/gemma-4-26b-a4b-it:free model) and falls back to NaraRouter
 * (set NARA_API_KEY) if no OpenRouter key is configured.
 */

import prisma from "../db.js";
import { loadKeywordsFromDB, normalizeArabic } from "./keywords.js";
import { invalidateKeywordCache } from "./keywords.js";
import { nudgeReclassifyWorker } from "./reclassify-worker.js";

const NARA_URL = "https://router.bynara.id/v1/chat/completions";
const NARA_MODEL = "mistral-large";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";

interface ProviderConfig {
  url: string;
  model: string;
  apiKey: string;
  label: string;
}

function getProvider(): ProviderConfig | null {
  if (process.env.OPENROUTER_API_KEY) {
    return { url: OPENROUTER_URL, model: OPENROUTER_MODEL, apiKey: process.env.OPENROUTER_API_KEY, label: "OpenRouter" };
  }
  if (process.env.NARA_API_KEY) {
    return { url: NARA_URL, model: NARA_MODEL, apiKey: process.env.NARA_API_KEY, label: "NaraRouter" };
  }
  return null;
}

export function geminiEnabled(): boolean {
  return !!getProvider();
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
  primaryType:    string;
  allTypes:       string[];
  subTypeId?:     string;
  subTypeNameAr?: string;
  allSubTypeIds:  string[];   // resolved sub-type IDs for every detected type
  confidence:     number;
  reason:         string;
  source:         "gemini";
}

function stripJsonComments(str: string): string {
  return str.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export async function classifyWithGemini(
  description: string
): Promise<GeminiClassifyResult | null> {
  const provider = getProvider();
  if (!provider) return null;

  try {
    const [types, subTypes] = await Promise.all([getActiveTypes(), getActiveSubTypes()]);
    if (types.length === 0) return null;

    const typesList = types
      .map((t) => {
        const subs = subTypes.filter(s => s.parentKey === t.key).map(s => s.nameAr).join(" | ");
        const desc = t.description ? ` — ${t.description}` : "";
        return `- ${t.key}: ${t.nameAr}${desc}${subs ? ` (أنواع فرعية: ${subs})` : ""}`;
      })
      .join("\n");

    const prompt = `أنت متخصص في تصنيف بلاغات صيانة المساكن العربية. ردّك يجب أن يكون JSON فقط بدون أي نص إضافي.

أنواع الصيانة المتاحة (مع وصف نطاق كل نوع وأنواعه الفرعية):
${typesList}

طريقة التصنيف:
اقرأ البلاغ كاملاً وافهم كل مشكلة فيه. لكل مشكلة:
1. حدد النوع الأنسب (type) من القائمة أعلاه — بناءً على وصف النوع وفهم السياق الكامل
2. حدد النوع الفرعي الأدق (subType) من الأنواع الفرعية لذلك النوع — أو null إن لم يتطابق

مثال: "روائح صرف صحي + كسر سيراميك + مشكلة أفياش"
→ [{"type":"drainage","subType":"روائح كريهة"},{"type":"ceramics","subType":"تبليط أرضيات"},{"type":"electricity","subType":"أفياش وقواطع"}]

قواعد:
1. لكل مشكلة مستقلة في البلاغ، أضف عنصراً منفصلاً في المصفوفة
2. لا تدمج مشاكل مختلفة تحت نوع واحد
3. subType يجب أن يكون من الأنواع الفرعية المذكورة للنوع أعلاه فقط، أو null
4. إذا كان البلاغ مبهماً → items: [], confidence: 0
5. JSON فقط بدون أي نص آخر

الصيغة: {"items":[{"type":"key","subType":"اسم فرعي أو null"}],"confidence":0.9}`;

    const response = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `البلاغ: "${description}"` }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
        console.error(`[${provider.label}] API error:`, data.error?.message || response.statusText);
        return null;
    }

    const text = data.choices?.[0]?.message?.content?.trim() || "";

    let parsed: { items?: { type: string; subType?: string | null }[]; confidence?: number };
    try {
      const stripped = stripJsonComments(text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim());
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON object found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error(`[${provider.label}] Failed to parse response:`, text);
      return null;
    }

    const validTypeKeys = new Set(types.map((t) => t.key));
    const items = (parsed.items ?? []).filter(it => validTypeKeys.has(it.type));
    if (items.length === 0) return null;

    const validTypes = items.map(it => it.type);

    // Resolve sub-type name → id for each item
    const allSubTypeIds: string[] = [];
    for (const item of items) {
      if (item.subType && item.subType !== "null") {
        const match = subTypes.find(
          s => s.nameAr === item.subType && s.parentKey === item.type
        );
        if (match) allSubTypeIds.push(match.id);
      }
    }

    // Primary sub-type (for primary type)
    let subTypeId: string | undefined;
    let subTypeNameAr: string | undefined;
    if (allSubTypeIds.length > 0) {
      subTypeId = allSubTypeIds[0];
      subTypeNameAr = items[0].subType ?? undefined;
    }

    return {
      primaryType:   validTypes[0],
      allTypes:      validTypes,
      subTypeId,
      subTypeNameAr,
      allSubTypeIds,
      confidence:    parsed.confidence ?? 0.8,
      reason:        "",
      source:        "gemini",
    };
  } catch (err: any) {
    console.error(`[${provider.label}] classify error:`, err.message);
    return null;
  }
}

// ── Batch classification — multiple tickets in one request ─────────────────
export interface GeminiBatchResult {
  id:             string;
  primaryType:    string;
  allTypes:       string[];
  subTypeId?:     string;
  allSubTypeIds:  string[];
  confidence:     number;
}

export async function classifyBatchWithGemini(
  items: { id: string; description: string }[]
): Promise<GeminiBatchResult[]> {
  const provider = getProvider();
  if (!provider || items.length === 0) return [];

  const [types, subTypes] = await Promise.all([getActiveTypes(), getActiveSubTypes()]);
  if (types.length === 0) return [];

  const typesList = types
    .map((t) => {
      const subs = subTypes.filter(s => s.parentKey === t.key).map(s => s.nameAr).join(" | ");
      const desc = t.description ? ` — ${t.description}` : "";
      return `- ${t.key}: ${t.nameAr}${desc}${subs ? ` (${subs})` : ""}`;
    })
    .join("\n");

  const ticketLines = items
    .map((item, i) => `${i + 1}. "${item.description.replace(/"/g, "'")}"`)
    .join("\n");

  const prompt = `أنت متخصص في تصنيف بلاغات صيانة المساكن العربية. ردّك يجب أن يكون JSON array فقط.

أنواع الصيانة المتاحة (مع وصف نطاق كل نوع وأنواعه الفرعية):
${typesList}

طريقة التصنيف:
لكل بلاغ، اقرأه كاملاً واستخرج كل مشكلة فيه. لكل مشكلة:
1. حدد النوع الأنسب (type) من القائمة — بناءً على وصفه وفهم السياق
2. حدد النوع الفرعي الأدق (subType) من الأنواع الفرعية لذلك النوع — أو null

قواعد:
- كل مشكلة مستقلة تحصل على عنصر منفصل في items
- subType من الأنواع الفرعية للنوع المذكور فقط، أو null
- إذا كان البلاغ مبهماً → items: []

الصيغة:
[{"i":1,"items":[{"type":"key","subType":"اسم فرعي أو null"}],"confidence":0.9}]`;

  try {
    const response = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `البلاغات:\n${ticketLines}` }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
        console.error(`[${provider.label} batch] API error:`, data.error?.message || response.statusText);
        throw new Error(data.error?.message || `${provider.label} Error`);
    }

    const text = data.choices?.[0]?.message?.content?.trim() || "";

    const stripped  = stripJsonComments(text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim());
    const arrMatch  = stripped.match(/\[[\s\S]*\]/);
    if (!arrMatch) {
      console.error(`[${provider.label} batch] No JSON array in response:`, text.slice(0, 120));
      return [];
    }

    const parsed: { i: number; items?: { type: string; subType?: string | null }[]; confidence?: number }[] = JSON.parse(arrMatch[0]);
    const validTypeKeys = new Set(types.map((t) => t.key));

    return parsed
      .filter((r) => r.i >= 1 && r.i <= items.length)
      .map((r) => {
        const validItems = (r.items ?? []).filter(it => validTypeKeys.has(it.type));
        const validTypes = validItems.map(it => it.type);

        // Resolve sub-type IDs
        const allSubTypeIds: string[] = [];
        for (const item of validItems) {
          if (item.subType && item.subType !== "null") {
            const match = subTypes.find(s => s.nameAr === item.subType && s.parentKey === item.type);
            if (match) allSubTypeIds.push(match.id);
          }
        }

        return {
          id:           items[r.i - 1].id,
          primaryType:  validTypes[0] ?? "unclassified",
          allTypes:     validTypes,
          subTypeId:    allSubTypeIds[0],
          allSubTypeIds,
          confidence:   r.confidence ?? 0.8,
        };
      });
  } catch (err: any) {
    console.error(`[${provider.label} batch] error:`, err.message);
    throw err;
  }
}

// ── Auto-learn: add Gemini's result as keywords so next time keywords catch it ─
export async function learnFromGeminiResult(
  description: string,
  types: string[]
): Promise<void> {
  if (!description || types.length === 0) return;

  const stopWords = new Set([
    "في","من","الى","على","عن","مع","هذا","هذه","ذلك","تلك","التي","الذي",
    "كان","كانت","يكون","هو","هي","هم","انا","نحن","انت","يوجد","لا","لم",
    "لن","ما","قد","كل","بعض","غير","وقت","يوم","ساعه","الان","اليوم",
    "جدا","فقط","حتى","ايضا","او","و","ثم","لكن","اما","اذا","لان",
    "بسبب","حيث","بين","خلال","دون","قبل","بعد","تحت","فوق","عند",
    "هناك","يرجى","يوجد","فيه","فيها","منه","منها","عليه","عليها",
    "مشكله","مشكلة","موجود","موجوده","محتاج","محتاجه","عايز","عايزه",
    "ارجو","ارجوكم","يلزم","يلزمنا","نريد","نحتاج",
    "سلام","عليكم","وعليكم","السلامه","حياكم","شكرا","شكرً","مرحبا","اهلا",
    "تحيه","تحية","صباح","مساء","خير","معك","تواصل","حضرتك","حضرتكم",
    "منزل","مسكن","شقه","شقة","فيلا","وحده","وحدة","مبنى","مبني",
    "صاله","صالة","مجلس","غرفه","غرفة","اوضه","اوضة",
    "كبير","كبيره","صغير","صغيره","جديد","جديده","قديم","قديمه",
    "اول","ثاني","ثالث","رابع","خامس",
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

      const wordsToLearn = uniqueWords.slice(0, 8);

      for (const word of wordsToLearn) {
        const existing = await prisma.ticketTypeKeyword.findFirst({
          where: { keyword: word, typeId: typeRecord.id },
        });

        if (existing) {
          await prisma.ticketTypeKeyword.update({
            where: { id: existing.id },
            data: {
              usageCount:        { increment: 1 },
              weight:            Math.min(existing.weight + 0.1, 3.0),
              pendingReclassify: true,
            },
          });
        } else {
          const rival = await prisma.ticketTypeKeyword.findFirst({
            where: { keyword: word, typeId: { not: typeRecord.id }, weight: { gt: 2.0 } },
          });
          if (rival) continue;

          await prisma.ticketTypeKeyword.create({
            data: {
              keyword:           word,
              typeId:            typeRecord.id,
              weight:            1.0,
              source:            "gemini_learned",
              isLearned:         true,
              confidence:        0.75,
              usageCount:        1,
              pendingReclassify: true,
            },
          });
        }
      }
    }

    invalidateKeywordCache();
    nudgeReclassifyWorker();
  } catch (err: any) {
    console.error("[Gemini] learnFromGeminiResult error:", err.message);
  }
}
