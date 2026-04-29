import prisma from "../db.js";
import { GEMINI_API_KEY, GEMINI_MODEL, VALID_TYPES } from "../config.js";
import { invalidateKeywordCache } from "./keywords.js";

// ── Reference Data Cache ────────────────────────────────────────────────────
let _refCache: {
  types: any[];
  specialties: any[];
  recentTickets: any[];
  keywords: any[];
} = { types: [], specialties: [], recentTickets: [], keywords: [] };
let _refCacheTime = 0;
const REF_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function invalidateReferenceCache() {
  _refCache = { types: [], specialties: [], recentTickets: [], keywords: [] };
  _refCacheTime = 0;
}

// ── Build Context Payload ───────────────────────────────────────────────────
async function buildContextPayload(force = false) {
  if (!force && _refCache.types.length > 0 && Date.now() - _refCacheTime < REF_CACHE_TTL) {
    return _refCache;
  }

  const [types, specialties, recentTickets, keywords] = await Promise.all([
    prisma.ticketType.findMany({
      where: { isActive: true },
      include: {
        specialty: { select: { key: true, nameAr: true } },
        subTypes: { where: { isActive: true }, select: { nameAr: true, description: true }, orderBy: { sortOrder: "asc" } },
        _count: { select: { keywords: true, tickets: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.ticket.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      select: { description: true, type: true, status: true },
      where: { type: { not: "" } },
    }),
    prisma.ticketTypeKeyword.findMany({
      where: { typeId: { not: null } },
      select: { keyword: true, weight: true, ticketType: { select: { key: true, nameAr: true } } },
      orderBy: { weight: "desc" },
      take: 200,
    }),
  ]);

  _refCache = { types, specialties, recentTickets, keywords };
  _refCacheTime = Date.now();
  return _refCache;
}

// ── Build Rich Prompt ───────────────────────────────────────────────────────
async function buildRichPrompt(description: string, projectId?: string): Promise<string> {
  const ctx = await buildContextPayload();

  const typesList = ctx.types.map(t =>
    `  - "${t.key}" (${t.nameAr}) ← تخصص: ${t.specialty?.nameAr || "عام"} | كلمات مفتاحية: ${t._count.keywords} | تذاكر سابقة: ${t._count.tickets}${t.subTypes.length ? ` | أنواع فرعية: ${t.subTypes.map(s => s.nameAr).join("، ")}` : ""}`
  ).join("\n");

  const specialtiesList = ctx.specialties.map((s: any) =>
    `  - "${s.key}" ← ${s.nameAr}`
  ).join("\n");

  const recentExamples = ctx.recentTickets.slice(0, 10).map(t =>
    `  - وصف: "${(t.description || "").slice(0, 120)}" ← النوع: "${t.type}" (الحالة: ${t.status})`
  ).join("\n\n");

  const topKeywords = ctx.keywords.slice(0, 40).map((k: any) =>
    `  - "${k.keyword}" ← ${k.ticketType?.nameAr || k.ticketType?.key} (وزن: ${k.weight})`
  ).join("\n");

  let projectInfo = "";
  if (projectId) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { clients: { take: 5, select: { villaNumber: true, name: true } } },
      });
      if (project) {
        projectInfo = `\nمعلومات المشروع:\n  الاسم: ${project.name}\n  الموقع: ${project.location}\n  العملاء المسجلون: ${project.clients.length}\n`;
        const supsInProject = await prisma.user.count({
          where: { role: "supervisor", projectIds: { has: projectId } },
        });
        projectInfo += `  المشرفون المخصصون: ${supsInProject}\n`;
      }
    } catch {}
  }

  return `أنت خبير متخصص في تصنيف تذاكر الصيانة العقارية (بعد البيع). 
أمامك قاعدة معرفة كاملة من النظام تشمل أنواع التذاكر المعتمدة، التخصصات، أمثلة من التذاكر السابقة، والكلمات المفتاحية.
استخدم هذه المعرفة لتصنيف الوصف الجديد بدقة.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 **قاعدة المعرفة من النظام:**

**التخصصات:**
${specialtiesList}

**أنواع التذاكر المعتمدة (مع كل التفاصيل):**
${typesList}

**أمثلة من التذاكر السابقة المصنفة (للاسترشاد):**
${recentExamples || "  (لا توجد تذاكر سابقة بعد)"}

**قاموس الكلمات المفتاحية المستخدمة:**
${topKeywords || "  (لا توجد كلمات مفتاحية بعد)"}
${projectInfo}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**الوصف الجديد المطلوب تصنيفه:** "${description}"

**تعليمات صارمة:**
1. اختر TYPE واحد أساسي من القائمة أعلاه (primaryType)
2. إذا كان الوصف يناسب أكثر من نوع، أدرجها في allTypes مرتبة حسب الأولوية
3. **مهم جدا: اختر subType (نوع فرعي) من الأنواع الفرعية الموجودة تحت النوع الأساسي** — اقرأ الأنواع الفرعية لكل type في القائمة أعلاه واختر الأنسب. لو مفيش type فرعي مناسب، حط null
4. الدرجة (confidence) من 1 إلى 10 — كلما كان الوصف واضحًا والتطابق قويًا، زادت الدرجة
4. اشرح سبب اختيارك (reason) بالعربية — مثلاً: "الكلمة المفتاحية X تطابقة مع النوع Y"
5. استخدم أمثلة التذاكر السابقة للاسترشاد إذا كانت مشابهة للوصف الجديد
6. إذا كان الوصف غامضًا جدًا، اختر النوع الأقرب بدرجة ثقة منخفضة
7. مهم جدا: إذا كان هناك نوع جديد غير موجود في القائمة أعلاه وتعتقد أنه مهم ويستحق الإضافة، أضف suggestedNewType (key إنجليزي) واختر specialtyKey مناسب
8. مهم جدا: إذا كان هناك مشكلة محددة جداً تستحق أن تكون نوعاً فرعياً تحت النوع الأساسي (primaryType) وغير موجودة حالياً في الأنواع الفرعية أعلاه، أضف suggestedNewSubType (اسم بالعربية)
9. اقتراح الأنواع الجديدة فقط إذا كان الوصف يحتوي على مشكلة واضحة ومتكررة ومهمة

**أرجِع ONLY JSON بالتنسيق التالي (ممنوع markdown أو نصوص إضافية):**
{"primaryType":"...","allTypes":["..."],"subType":"اسم النوع الفرعي أو null","confidence":8,"reason":"...","suggestedNewType":null,"suggestedNewSubType":null}`;
}

// ── Parse Gemini JSON Response ──────────────────────────────────────────────
function parseGeminiJsonResponse(text: string): {
  primaryType: string;
  allTypes: string[];
  subType: string | null;
  confidence: number;
  reason: string;
  suggestedNewType: string | null;
  suggestedNewSubType: string | null;
} | null {
  try {
    let cleanJson = text.trim();
    console.log("  📋 Raw Gemini response length:", text.length);

    // Remove markdown code blocks
    if (cleanJson.includes("```")) {
      const lines = cleanJson.split('\n');
      const filteredLines = lines.filter(line => !line.trim().startsWith('```'));
      cleanJson = filteredLines.join('\n').trim();
    }

    // Find first { and last }
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
    }

    let result;
    try {
      result = JSON.parse(cleanJson);
    } catch {
      // Fix Arabic quotes
      cleanJson = cleanJson
        .replace(/['\u2018\u2019\u201A\u201B\u2032\u2035`\u00B4]/g, '')
        .replace(/["\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
      cleanJson = cleanJson.replace(/""/g, '"');

      // Brute-force parse
      let trimmed = cleanJson;
      let parseAttempt = null;
      while (trimmed.length > 20) {
        try {
          parseAttempt = JSON.parse(trimmed);
          break;
        } catch {
          trimmed = trimmed.slice(0, -1);
        }
      }
      if (parseAttempt) {
        result = parseAttempt;
      } else {
        console.warn("  ⚠️ Could not parse JSON even after aggressive trimming");
        return null;
      }
    }
    if (!result.primaryType) return null;

    const validTypes = (result.allTypes || []).filter((t: string) => VALID_TYPES.includes(t));
    let finalTypes = validTypes.length > 0 ? validTypes : [result.primaryType];

    return {
      primaryType: result.primaryType,
      allTypes: finalTypes.slice(0, 3),
      subType: typeof result.subType === "string" ? result.subType : null,
      confidence: result.confidence || 5,
      reason: result.reason || "",
      suggestedNewType: typeof result.suggestedNewType === "string" ? result.suggestedNewType : null,
      suggestedNewSubType: typeof result.suggestedNewSubType === "string" ? result.suggestedNewSubType : null,
    };
  } catch (parseErr) {
    console.warn("⚠️ Gemini JSON Parsing Failed:", parseErr instanceof Error ? parseErr.message : String(parseErr));
    return null;
  }
}

// ── Rate Limiter للـ Gemini API ──────────────────────────────────────────
// يضمن ما نتعداش حدود الـ quota
const geminiRateLimit = {
  queue: [] as { fn: () => Promise<void>; resolve: (val: any) => void; reject: (err: any) => void }[],
  processing: false,
  lastCallTime: 0,
  MIN_INTERVAL_MS: 2000, // 2 ثواني بين كل طلب = ~30 طلب/دقيقة
};

async function processGeminiRateLimitQueue() {
  if (geminiRateLimit.processing || geminiRateLimit.queue.length === 0) return;
  geminiRateLimit.processing = true;
  
  while (geminiRateLimit.queue.length > 0) {
    const now = Date.now();
    const waitTime = Math.max(0, geminiRateLimit.MIN_INTERVAL_MS - (now - geminiRateLimit.lastCallTime));
    if (waitTime > 0) {
      await new Promise(r => setTimeout(r, waitTime));
    }
    
    const task = geminiRateLimit.queue.shift();
    if (task) {
      geminiRateLimit.lastCallTime = Date.now();
      try {
        const result = await task.fn();
        task.resolve(result);
      } catch (err) {
        task.reject(err);
      }
    }
  }
  
  geminiRateLimit.processing = false;
}

function enqueueGeminiCall<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    geminiRateLimit.queue.push({ fn: fn as () => Promise<void>, resolve, reject });
    processGeminiRateLimitQueue().catch(() => {});
  });
}

// ── Classify with Gemini ────────────────────────────────────────────────────
export async function classifyWithGeminiEnhanced(
  description: string,
  projectId?: string
): Promise<{
  primaryType: string;
  allTypes: string[];
  subType: string | null;
  confidence: number;
  reason: string;
  suggestedNewType: string | null;
  suggestedNewSubType: string | null;
} | null> {
  if (!GEMINI_API_KEY) return null;

  const prompt = await buildRichPrompt(description, projectId);

  // نستخدم الـ rate limiter
  return enqueueGeminiCall(async () => {
    return await _classifyWithGeminiEnhancedImpl(description, projectId, prompt);
  });
}

// ── التنفيذ الحقيقي للتصنيف (بيتنادى عن طريق rate limiter) ──────────────
async function _classifyWithGeminiEnhancedImpl(
  description: string,
  projectId?: string,
  prompt?: string
): Promise<{
  primaryType: string;
  allTypes: string[];
  subType: string | null;
  confidence: number;
  reason: string;
  suggestedNewType: string | null;
  suggestedNewSubType: string | null;
} | null> {
  if (!GEMINI_API_KEY) return null;
  if (!prompt) prompt = await buildRichPrompt(description, projectId);

  try {
    const isNewKey = GEMINI_API_KEY.startsWith("AQ.");
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isNewKey) headers["x-goog-api-key"] = GEMINI_API_KEY;

    // Use AbortController with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for large context prompts

    const res = await fetch(isNewKey ? apiUrl : `${apiUrl}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`⚠️ Gemini API error: ${res.status} - ${await res.text().catch(() => 'no body')}`);
      return null;
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let text = rawText;
    if (!text) {
      const fc = data?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      if (fc?.args) text = JSON.stringify(fc.args);
    }
    if (!text) {
      console.warn("⚠️ Gemini returned empty response");
      return null;
    }

    return parseGeminiJsonResponse(text);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn("⚠️ Gemini API call timed out (15s), falling back to keywords");
    } else {
      console.warn("⚠️ Gemini API call failed:", err);
    }
    return null;
  }
}

// ── تصدير الـ rate limiter عشان routes يقدر يستخدمها ────────────────────
export { enqueueGeminiCall };

// ── Build Type-to-Specialty Map ─────────────────────────────────────────────
export async function buildTypeToSpecialtyMap() {
  const types = await prisma.ticketType.findMany({
    where: { isActive: true },
    include: { specialty: { select: { key: true } } },
  });
  const map: Record<string, string> = {};
  for (const t of types) {
    map[t.key] = t.specialty?.key || "general";
  }
  return map;
}

// ── Find Supervisors ────────────────────────────────────────────────────────
export async function findSupervisorsDB(projectId: string, requiredSpecialties: string[]) {
  const allUsers = await prisma.user.findMany({
    where: { role: "supervisor" },
    select: { uid: true, displayName: true, specialties: true, specialty: true, projectIds: true },
  });

  const activeUsers = allUsers.filter((u: any) => !u.uid.startsWith("pending_"));

  let projectSups = activeUsers.filter(
    (u: any) => Array.isArray(u.projectIds) && u.projectIds.includes(projectId)
  );
  if (projectSups.length === 0) projectSups = activeUsers;

  const getSpecs = (u: any): string[] => {
    if (Array.isArray(u.specialties) && u.specialties.length > 0) return u.specialties;
    if (u.specialty) return [u.specialty];
    return ["general"];
  };

  let matched = projectSups.filter((s: any) =>
    getSpecs(s).some((sp: string) => requiredSpecialties.includes(sp))
  );

  if (matched.length === 0) {
    matched = projectSups.filter((s: any) => getSpecs(s).includes("general"));
  }
  if (matched.length === 0) {
    matched = projectSups.slice(0, 3);
  }

  return matched.map((u: any) => ({
    id: u.uid,
    name: u.displayName,
    specialties: getSpecs(u),
  }));
}

// ── Auto-Learn from Classification ──────────────────────────────────────────
export async function autoLearnFromClassification(description: string, typeKey: string, confidence: number): Promise<void> {
  if (confidence < 6 || !description || !typeKey) return;

  try {
    const type = await prisma.ticketType.findUnique({ where: { key: typeKey } });
    if (!type) return;

    const stopWords = new Set([
      "في","من","الى","على","عن","مع","هذا","هذه","ذلك","تلك","التي","الذي",
      "كان","كانت","يكون","هو","هي","هم","انا","نحن","انت","انتم","يوجد",
      "لا","لم","لن","ما","قد","كل","بعض","غير","وقت","يوم","ساعة","الان",
      "اليوم","جدا","فقط","حتى","ايضا","او","و","ثم","لكن","اما","اذا",
      "لان","بسبب","حيث","بين","خلال","دون","قبل","بعد","تحت","فوق",
      "ال","اللي","الا","ان","ان","او","ب","ت","ث","ج","ح",
    ]);

    const words = description
      .toLowerCase()
      .replace(/[،,?.!;:""'']/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w) && isNaN(Number(w)));

    const uniqueWords = [...new Set(words)].slice(0, 5);

    for (const word of uniqueWords) {
      const existingOther = await prisma.ticketTypeKeyword.findFirst({
        where: { keyword: word, typeId: { not: type.id } },
      });
      if (existingOther) continue;

      await prisma.ticketTypeKeyword.upsert({
        where: { keyword_typeId: { keyword: word, typeId: type.id } },
        update: { usageCount: { increment: 1 }, weight: { increment: 0.2 }, isLearned: true, source: "auto_learned" },
        create: { keyword: word, typeId: type.id, weight: 1.0, isLearned: true, source: "auto_learned", confidence: confidence / 10, usageCount: 1 },
      });
    }

    if (uniqueWords.length > 0) {
      console.log(`  📚 Auto-learned ${uniqueWords.length} keywords for "${type.nameAr}" from classification`);
    }
  } catch (err) {
    console.warn("  ⚠️ Auto-learn failed:", err);
  }
}

// ── Learn New Type from Gemini ──────────────────────────────────────────────
export async function learnNewTypeFromGemini(suggestedKey: string, parentTypeKey: string, description: string) {
  if (typeof suggestedKey !== "string" || typeof parentTypeKey !== "string") {
    console.warn("  ⚠️ learnNewTypeFromGemini: invalid arguments", { suggestedKey, parentTypeKey });
    return;
  }
  try {
    const existing = await prisma.ticketType.findUnique({ where: { key: suggestedKey } });
    if (existing) return;

    const parentType = await prisma.ticketType.findUnique({
      where: { key: parentTypeKey },
      include: { specialty: true },
    });
    
    // Determine the specialty ID from parent type, or fall back to "general"
    let specialtyId = parentType?.specialtyId || null;
    if (!specialtyId) {
      const generalSpecialty = await prisma.specialty.findUnique({ where: { key: "general" } });
      specialtyId = generalSpecialty?.id || null;
    }

    const maxOrder = await prisma.ticketType.aggregate({ _max: { sortOrder: true } });
    const nextOrder = (maxOrder._max.sortOrder || 0) + 1;
    const nameAr = "صيانة " + suggestedKey.replace(/_/g, " ");

    const newType = await prisma.ticketType.create({
      data: {
        key: suggestedKey, nameAr,
        description: `تم إنشاؤه تلقائياً من تصنيف: ${description.slice(0, 200)}`,
        specialtyId, sortOrder: nextOrder, isActive: true,
        color: `#${Math.floor(Math.random()*16777215).toString(16)}`, icon: "📋",
      },
    });

    const words = description
      .toLowerCase().replace(/[،,?.!;:""''\s]+/g, ' ').split(/\s+/)
      .filter(w => w.length > 2);
    for (const word of [...new Set(words)].slice(0, 5)) {
      await prisma.ticketTypeKeyword.upsert({
        where: { keyword_typeId: { keyword: word, typeId: newType.id } },
        update: { weight: { increment: 0.5 } },
        create: { keyword: word, typeId: newType.id, weight: 1.0, source: "gemini_suggested", isLearned: true, confidence: 0.7, usageCount: 1 },
      });
    }

    VALID_TYPES.push(suggestedKey);
    console.log(`  🆕 Auto-created new type: "${suggestedKey}" (${nameAr})`);
    
    invalidateReferenceCache();
    invalidateKeywordCache();
  } catch (err) {
    console.warn(`  ⚠️ Failed to learn new type "${suggestedKey}":`, err);
  }
}

// ── Learn New Sub-Type from Gemini ──────────────────────────────────────────
export async function learnNewSubTypeFromGemini(parentTypeKey: string, subTypeNameAr: string, description: string) {
  if (typeof parentTypeKey !== "string" || typeof subTypeNameAr !== "string") {
    console.warn("  ⚠️ learnNewSubTypeFromGemini: invalid arguments", { parentTypeKey, subTypeNameAr });
    return;
  }
  try {
    const parentType = await prisma.ticketType.findUnique({ where: { key: parentTypeKey } });
    if (!parentType) return;

    const existing = await prisma.ticketSubType.findFirst({
      where: { parentTypeId: parentType.id, nameAr: subTypeNameAr, isActive: true },
    });
    if (existing) return;

    const maxOrder = await prisma.ticketSubType.aggregate({
      where: { parentTypeId: parentType.id },
      _max: { sortOrder: true },
    });
    const nextOrder = (maxOrder._max.sortOrder || 0) + 1;

    await prisma.ticketSubType.create({
      data: {
        parentTypeId: parentType.id,
        nameAr: subTypeNameAr,
        description: `تم إنشاؤه تلقائياً من: ${description.slice(0, 200)}`,
        sortOrder: nextOrder,
        isActive: true,
      },
    });

    console.log(`  🆕 Auto-created sub-type: "${subTypeNameAr}" under ${parentType.nameAr}`);
    invalidateReferenceCache();
  } catch (err) {
    console.warn(`  ⚠️ Failed to learn sub-type "${subTypeNameAr}":`, err);
  }
}

// ── Auto-Learn Cycle ────────────────────────────────────────────────────────
export async function runAutoLearnCycle() {
  try {
    console.log("🔄 Auto-learn cycle started...");
    
    // التذاكر اللي محتاجة تصنيف: اللي type عام/plumbing ومافيش detectedTypes
    // أو اللي type معمم واتعملها classification فاشل (confidence < 6) 
    const ticketsToLearn = await prisma.ticket.findMany({
      where: {
        OR: [
          // تذاكر جديدة تماماً ما اتصنفتش
          { detectedTypes: { equals: [] } },
          // تذاكر قديمة نوعها عام
          { type: { in: ["general", "plumbing"] }, detectedTypes: { isEmpty: false } },
        ],
        // مش مقفولة — القفل معناه إنها اتعمل عليها
        status: { not: "closed" },
      },
      take: 15,     // ← قللنا لـ 15 عشان ما نحرقش quota Gemini
      orderBy: { createdAt: "desc" },
      select: { id: true, description: true, type: true, detectedTypes: true },
    });

    if (ticketsToLearn.length === 0) {
      console.log("  ✅ No tickets to auto-learn");
      return;
    }

    let learned = 0;
    let geminiFailed = 0;
    // Dynamic import to avoid circular dependency
    const { classifyTicket } = await import("./classify.js");
    for (const ticket of ticketsToLearn) {
      if (!ticket.description || ticket.description.length < 5) continue;
      
      const classification = await classifyTicket(ticket.description, undefined, { forceReclassify: true });
      
      if (classification.source === "gemini") {
        if (classification.confidence >= 7) {
          // ✅ Gemini نجح — نتعلم ونتحدّث
          await autoLearnFromClassification(ticket.description, classification.primaryType, classification.confidence);
          
          if (ticket.type === "general" || !ticket.type || classification.confidence >= 8) {
            await prisma.ticket.updateMany({
              where: { id: ticket.id },
              data: { 
                type: classification.primaryType, 
                detectedTypes: classification.allTypes,
              },
            });
          }
          learned++;
        } else {
          // Gemini حاول بس الثقة قليلة — نسجلها ونرجع نجرب تاني بعدين
          geminiFailed++;
        }
      } else {
        // keywords fallback — يعني Gemini فشل
        geminiFailed++;
      }
    }
    console.log(`  ✅ Auto-learn cycle: ${learned} learned, ${geminiFailed} low-conf/failed (out of ${ticketsToLearn.length})`);
    
    // لو في تذاكر فشل Gemini فيها — نضيفها تاني للدورة الجاية (عن طريق مسح detectedTypes بتاعها لو هي general)
    if (geminiFailed > 0) {
      const failedTickets = ticketsToLearn.filter(t => t.type === "general" || t.type === "plumbing");
      // مش بنمسح detectedTypes عشان ما نضيعش المعلومات — بنسيبها والـ Auto-Learn cycle الجاي هيحاول تاني
      console.log(`  📋 ${failedTickets.length} general/plumbing tickets will be retried next cycle`);
    }
    
    invalidateReferenceCache();
    invalidateKeywordCache();
  } catch (err) {
    console.error("  ❌ Auto-learn cycle error:", err);
  }
}

// ── Auto-Generate Types ─────────────────────────────────────────────────────
export async function autoGenerateTypes() {
  if (!GEMINI_API_KEY) return;
  try {
    const count = await prisma.ticketType.count({ where: { isActive: true } });
    if (count >= 8) {
      console.log(`  ℹ️ Already have ${count} types, skipping auto-generate`);
      return;
    }
    
    console.log("  🤖 Auto-generating ticket types from Gemini...");
    
    const specialties = await prisma.specialty.findMany({ where: { isActive: true } });
    const specialtiesList = specialties.map((s: any) => `  - "${s.key}": ${s.nameAr}`).join("\n");
    const existingTypes = await prisma.ticketType.findMany({ select: { key: true, nameAr: true } });
    const existingKeys = new Set(existingTypes.map((t: any) => t.key));

    const prompt = `أقترح 6-10 أنواع تذاكر صيانة عقارية شاملة (بعد البيع).
التخصصات: ${specialtiesList}
لا تكرر: ${existingTypes.map((t: any) => t.key).join(", ") || "لا يوجد"}
كل نوع: key إنجليزي, nameAr عربي, وصف, specialtyKey من القائمة, keywords (2-3 كلمات).
رد: JSON array فقط.`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${apiUrl}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) return;
    const data = await response.json();
    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    let suggestions;
    try {
      let clean = rawText.trim();
      if (clean.includes("```")) clean = clean.split('\n').filter(l => !l.trim().startsWith('```')).join('\n').trim();
      const fb = clean.indexOf('['), lb = clean.lastIndexOf(']');
      if (fb !== -1 && lb !== -1) clean = clean.substring(fb, lb + 1);
      suggestions = JSON.parse(clean);
    } catch { return; }

    if (!Array.isArray(suggestions) || suggestions.length === 0) return;

    // Build a map of specialty key → id for quick lookup
    const specialtyMap = new Map(specialties.map((s: any) => [s.key, s.id]));
    const maxOrder = await prisma.ticketType.aggregate({ _max: { sortOrder: true } });
    let nextOrder = (maxOrder._max.sortOrder || 0) + 1;
    let added = 0;

    for (const s of suggestions) {
      const key = (s.key || "").trim().toLowerCase();
      const nameAr = (s.nameAr || "").trim();
      const specialtyKey = (s.specialtyKey || "").trim().toLowerCase();
      const specialtyId = specialtyMap.get(specialtyKey) || null;
      const keywords: string[] = Array.isArray(s.keywords) ? s.keywords.filter((k: any) => typeof k === "string").map((k: string) => k.trim().toLowerCase()) : [];

      if (!key || !nameAr || existingKeys.has(key) || !specialtyId) continue;

      try {
        const newType = await prisma.ticketType.create({
          data: {
            key, nameAr,
            description: (s.description || "").trim().slice(0, 500),
            specialtyId, sortOrder: nextOrder++, isActive: true,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`, icon: "📋",
          },
        });
        for (const kw of keywords) {
          if (kw.length < 2) continue;
          await prisma.ticketTypeKeyword.upsert({
            where: { keyword_typeId: { keyword: kw, typeId: newType.id } },
            update: {},
            create: { keyword: kw, typeId: newType.id, weight: 1.5, source: "auto_generated", isLearned: false, confidence: 0.9 },
          });
        }
        existingKeys.add(key);
        added++;
      } catch {}
    }

    if (added > 0) {
      console.log(`  ✅ Auto-generated ${added} new ticket types`);
      invalidateReferenceCache();
      invalidateKeywordCache();
    }
  } catch (err) {
    console.warn("  ⚠️ Auto-generate types failed:", err);
  }
}
