import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth, requireAdmin } from "../auth.js";
import { GEMINI_API_KEY, GEMINI_MODEL } from "../config.js";
import { classifyTicket, buildTypeToSpecialtyMap, findSupervisorsDB, autoLearnFromClassification } from "../classifier/classify.js";
import { loadKeywordsFromDB, invalidateKeywordCache, classifyFromKeywordsDB } from "../classifier/keywords.js";
import {
  classifyWithGeminiEnhanced,
  runAutoLearnCycle, autoGenerateTypes, invalidateReferenceCache,
} from "../classifier/gemini.js";

const router = Router();

// ── POST /api/classify ──────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const { description, projectId } = req.body as { description: string; projectId: string };
    if (!description || !projectId) {
      res.status(400).json({ error: "description and projectId are required" });
      return;
    }

    const classification = await classifyTicket(description, projectId);
    const typeToSpecialty = await buildTypeToSpecialtyMap();
    const requiredSpecialties = [...new Set(classification.allTypes.map((t: string) => typeToSpecialty[t] || "general"))];
    const supervisors = await findSupervisorsDB(projectId, requiredSpecialties);

    // Auto-learn from successful classifications
    if (classification.source === "gemini" && classification.confidence >= 6) {
      await autoLearnFromClassification(description, classification.primaryType, classification.confidence);
      invalidateReferenceCache();
      invalidateKeywordCache();
    }

    res.json({
      primaryType: classification.primaryType,
      allTypes: classification.allTypes,
      subType: classification.subType || undefined,       // ← NEW
      requiredSpecialties,
      confidence: classification.confidence,
      source: classification.source,
      supervisors,
      reason: classification.reason || undefined,
      suggestedNewType: (classification as any).suggestedNewType || undefined,
      suggestedNewSubType: (classification as any).suggestedNewSubType || undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classify/bulk ─────────────────────────────────────────────────
router.post("/bulk", requireAuth, async (req, res) => {
  try {
    const { items } = req.body as { items: { description: string; projectId: string }[] };
    if (!Array.isArray(items)) {
      res.status(400).json({ error: "items must be an array" });
      return;
    }

    const typeToSpecialty = await buildTypeToSpecialtyMap();
    const projectIds = [...new Set(items.map((i) => i.projectId))];
    const supervisorCache: Record<string, any[]> = {};

    for (const pid of projectIds) {
      supervisorCache[pid] = await prisma.user.findMany({
        where: { role: "supervisor", projectIds: { has: pid } },
        select: { uid: true, displayName: true, specialties: true, specialty: true },
      });
      if (supervisorCache[pid].length === 0) {
        supervisorCache[pid] = await prisma.user.findMany({
          where: { role: "supervisor" },
          select: { uid: true, displayName: true, specialties: true, specialty: true },
        });
      }
    }

    const getSpecs = (u: any): string[] => {
      if (Array.isArray(u.specialties) && u.specialties.length > 0) return u.specialties;
      if (u.specialty) return [u.specialty];
      return ["general"];
    };

    const results = await Promise.all(items.map(async (item) => {
      const classification = await classifyTicket(item.description, item.projectId);
      if (classification.source === "gemini" && classification.confidence >= 6) {
        await autoLearnFromClassification(item.description, classification.primaryType, classification.confidence);
      }
      const requiredSpecialties = [...new Set(classification.allTypes.map((t: string) => typeToSpecialty[t] || "general"))];
      const projectSups = supervisorCache[item.projectId] || [];

      const matched = projectSups.filter((s: any) =>
        getSpecs(s).some((sp: string) => requiredSpecialties.includes(sp))
      );
      const fallback = matched.length > 0 ? matched : projectSups.filter((s: any) => getSpecs(s).includes("general"));
      const finalSups = fallback.length > 0 ? fallback : projectSups;

      return {
        primaryType: classification.primaryType,
        allTypes: classification.allTypes,
        requiredSpecialties,
        confidence: classification.confidence,
        source: classification.source,
        supervisors: finalSups.map((u: any) => ({ id: u.uid, name: u.displayName, specialties: getSpecs(u) })),
      };
    }));

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classify/learn ────────────────────────────────────────────────
router.post("/learn", requireAuth, async (req, res) => {
  try {
    const { description, correctTypeKey } = req.body as { description: string; correctTypeKey: string };
    if (!description || !correctTypeKey) {
      res.status(400).json({ error: "description and correctTypeKey are required" });
      return;
    }

    const correctType = await prisma.ticketType.findUnique({ where: { key: correctTypeKey } });
    if (!correctType) {
      res.status(400).json({ error: "Type '" + correctTypeKey + "' not found" });
      return;
    }

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
      .split(/[\s,?.]+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    let updated = 0;
    for (const word of [...new Set(words)]) {
      const existing = await prisma.ticketTypeKeyword.findUnique({
        where: { keyword_typeId: { keyword: word, typeId: correctType.id } },
      });
      if (existing) {
        await prisma.ticketTypeKeyword.update({
          where: { id: existing.id },
          data: { usageCount: existing.usageCount + 1, isLearned: true },
        });
      } else {
        const otherKeyword = await prisma.ticketTypeKeyword.findFirst({
          where: { keyword: word, typeId: { not: correctType.id } },
        });
        if (otherKeyword) {
          await prisma.ticketTypeKeyword.update({
            where: { id: otherKeyword.id },
            data: { confidence: Math.max(0.1, otherKeyword.confidence - 0.2) },
          });
        }
        await prisma.ticketTypeKeyword.create({
          data: { keyword: word, typeId: correctType.id, weight: 1.0, isLearned: true, source: "learned", confidence: 0.8, usageCount: 1 },
        });
        updated++;
      }
    }

    invalidateKeywordCache();
    invalidateReferenceCache();

    res.json({ learned: updated, message: "Learned " + updated + " new keywords for " + correctType.nameAr });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classify/manual-keyword ───────────────────────────────────────
router.post("/manual-keyword", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { keyword, typeKey, weight } = req.body as { keyword: string; typeKey: string; weight?: number };
    if (!keyword || !typeKey) {
      res.status(400).json({ error: "keyword and typeKey are required" });
      return;
    }

    const type = await prisma.ticketType.findUnique({ where: { key: typeKey } });
    if (!type) {
      res.status(400).json({ error: "Type '" + typeKey + "' not found" });
      return;
    }

    const existing = await prisma.ticketTypeKeyword.findUnique({
      where: { keyword_typeId: { keyword: keyword.trim().toLowerCase(), typeId: type.id } },
    });

    if (existing) {
      await prisma.ticketTypeKeyword.update({
        where: { id: existing.id },
        data: { weight: weight ?? existing.weight, source: "manual" },
      });
    } else {
      await prisma.ticketTypeKeyword.create({
        data: { keyword: keyword.trim().toLowerCase(), typeId: type.id, weight: weight ?? 1.0, source: "manual", isLearned: false, confidence: 1.0 },
      });
    }

    invalidateKeywordCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classify/auto-learn ──────────────────────────────────────────
router.post("/auto-learn", requireAuth, requireAdmin, async (_req, res) => {
  try {
    runAutoLearnCycle().catch(console.error);
    res.json({ success: true, message: "Auto-learn cycle started in background" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classify/retry-failed ──────────────────────────────────────
router.post("/retry-failed", requireAuth, requireAdmin, async (_req, res) => {
  try {
    // التذاكر اللي Gemini فشل فيها (type = general/plumbing ومافيش detectedTypes متقدمة)
    const failedTickets = await prisma.ticket.findMany({
      where: {
        type: { in: ["general", "plumbing"] },
        status: { not: "closed" },
        OR: [
          { detectedTypes: { equals: [] } },
          { detectedTypes: { equals: ["plumbing"] } },
        ],
      },
      take: 100,
      orderBy: { createdAt: "desc" },
      select: { id: true, description: true, projectId: true, type: true },
    });

    if (failedTickets.length === 0) {
      res.json({ message: "No failed tickets found", processed: 0 });
      return;
    }

    let reclassified = 0;
    let stillFailed = 0;
    const { classifyTicket } = await import("../classifier/classify.js");
    const typeToSpecialty = await buildTypeToSpecialtyMap();

    for (const ticket of failedTickets) {
      if (!ticket.description || ticket.description.length < 5) continue;

      const classification = await classifyTicket(ticket.description, ticket.projectId || undefined, { forceReclassify: true });

      if (classification.source === "gemini" && classification.confidence >= 7) {
        // نجح التصنيف — نحدث التذكرة
        const requiredSpecialties = [...new Set(classification.allTypes.map((t: string) => typeToSpecialty[t] || "general"))];
        
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            type: classification.primaryType,
            detectedTypes: classification.allTypes,
          },
        });

        // نحدث المشرفين كمان لو في مشروع
        if (ticket.projectId) {
          const supervisors = await findSupervisorsDB(ticket.projectId, requiredSpecialties);
          if (supervisors.length > 0) {
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: {
                assignedSupervisorId: supervisors[0].id,
                assignedSupervisorIds: supervisors.map(s => s.id),
                assignedSupervisors: supervisors.map(s => ({ id: s.id, name: s.name, specialty: s.specialties[0] || "general" })),
              },
            });
          }
        }

        await autoLearnFromClassification(ticket.description, classification.primaryType, classification.confidence);
        reclassified++;
      } else {
        stillFailed++;
      }
    }

    invalidateReferenceCache();
    invalidateKeywordCache();

    res.json({
      message: `Reclassified ${reclassified} tickets, ${stillFailed} still failed`,
      processed: failedTickets.length,
      reclassified,
      stillFailed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/classify/analytics ─────────────────────────────────────────────
router.get("/analytics", requireAuth, async (_req, res) => {
  try {
    const [totalTickets, withDetectedTypes, typeDistribution, keywordsCount, geminiCalls] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { detectedTypes: { isEmpty: false } } }),
      prisma.ticket.groupBy({ by: ["type"], _count: true, orderBy: { _count: { type: "desc" } }, take: 20 }),
      prisma.ticketTypeKeyword.count({ where: { source: { equals: "auto_learned" } } }),
      prisma.ticketTypeKeyword.count({ where: { isLearned: true, source: { not: { equals: "seed" } } } }),
    ]);

    res.json({
      totalTickets,
      classifiedTickets: withDetectedTypes,
      classificationRate: totalTickets > 0 ? Math.round((withDetectedTypes / totalTickets) * 100) : 0,
      typeDistribution: typeDistribution.map((t: any) => ({ type: t.type, count: t._count })),
      learnedKeywords: { total: keywordsCount, auto: geminiCalls },
      geminiEnabled: !!GEMINI_API_KEY,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/classify/types ─────────────────────────────────────────────────
router.get("/types", requireAuth, async (_req, res) => {
  try {
    const types = await prisma.ticketType.findMany({
      where: { isActive: true },
      include: {
        specialty: { select: { key: true, nameAr: true } },
        subTypes: { where: { isActive: true }, include: { specialty: { select: { key: true, nameAr: true } } }, orderBy: { sortOrder: "asc" } },
        _count: { select: { keywords: true } },
      },
      orderBy: { sortOrder: "asc" },
    });
    res.json(types);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classify/generate-types ───────────────────────────────────────
router.post("/generate-types", requireAuth, requireAdmin, async (_req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      res.status(400).json({ error: "Gemini API key not configured" });
      return;
    }

    const specialties = await prisma.specialty.findMany({ where: { isActive: true } });
    const specialtiesList = specialties.map(s => `  - "${s.key}": ${s.nameAr}`).join("\n");
    const existingTypes = await prisma.ticketType.findMany({ select: { key: true, nameAr: true } });
    const existingKeys = new Set(existingTypes.map(t => t.key));

    const prompt = `أنت خبير في تصنيف تذاكر الصيانة العقارية (بعد البيع).
أريدك تقترح أنواع تذاكر جديدة ومناسبة لمشروع صيانة عقارات سكنية وتجارية.

التخصصات المتاحة:
${specialtiesList}

أنواع التذاكر الموجودة حالياً (لا تكررها):
${existingTypes.map(t => `  - "${t.key}": ${t.nameAr}`).join("\n") || "  (لا يوجد)"}

المطلوب منك:
1. اقترح 5-8 أنواع تذاكر جديدة لم يتم ذكرها أعلاه
2. كل نوع يجب أن يكون له: key بالانجليزية (حروف صغيرة و underscores)، nameAr بالعربية، وصف مختصر، والتخصص المناسب
3. خلي الأنواع متنوعة وتغطي مجالات صيانة مختلفة
4. اختر التخصص (specialtyKey) من القائمة أعلاه
5. اقترح 2-3 كلمات مفتاحية لكل نوع جديد

أرجِع ONLY JSON array بالتنسيق التالي (ممنوع markdown):
[
  {
    "key": "facades",
    "nameAr": "واجهات",
    "description": "صيانة وإصلاح واجهات المباني والكسوة الخارجية",
    "specialtyKey": "general",
    "keywords": ["واجهة", "حجر", "الومنيوم", "كلادينج"]
  }
]`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const response = await fetch(`${apiUrl}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    });

    if (!response.ok) {
      res.status(500).json({ error: `Gemini API error: ${response.status}` });
      return;
    }

    const data = await response.json();
    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let suggestedTypes;
    try {
      let clean = rawText.trim();
      if (clean.includes("```")) {
        const lines = clean.split('\n').filter(l => !l.trim().startsWith('```'));
        clean = lines.join('\n').trim();
      }
      const firstBracket = clean.indexOf('[');
      const lastBracket = clean.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) clean = clean.substring(firstBracket, lastBracket + 1);
      suggestedTypes = JSON.parse(clean);
    } catch {
      res.status(500).json({ error: "Failed to parse Gemini response", raw: rawText.slice(0, 500) });
      return;
    }

    if (!Array.isArray(suggestedTypes) || suggestedTypes.length === 0) {
      res.json({ message: "No new types suggested", types: [] });
      return;
    }

    const addedTypes: any[] = [];
    const errors: string[] = [];
    const validSpecialtyKeys = new Set(specialties.map(s => s.key));
    const maxOrder = await prisma.ticketType.aggregate({ _max: { sortOrder: true } });
    let nextOrder = (maxOrder._max.sortOrder || 0) + 1;

    for (const suggestion of suggestedTypes) {
      const key = (suggestion.key || "").trim().toLowerCase();
      const nameAr = (suggestion.nameAr || "").trim();
      const specialtyKey = (suggestion.specialtyKey || "").trim().toLowerCase();
      const keywords: string[] = Array.isArray(suggestion.keywords)
        ? suggestion.keywords.filter((k: any) => typeof k === "string" && k.trim().length > 0).map((k: string) => k.trim().toLowerCase())
        : [];

      if (!key || !nameAr) { errors.push(`Invalid entry: missing key or nameAr`); continue; }
      if (existingKeys.has(key)) { errors.push(`Type "${key}" already exists`); continue; }
      if (!validSpecialtyKeys.has(specialtyKey)) { errors.push(`Type "${key}": specialty "${specialtyKey}" not found`); continue; }

      const matchedSpecialty = specialties.find(s => s.key === specialtyKey);
      const specialtyId = matchedSpecialty?.id || null;

      try {
        const newType = await prisma.ticketType.create({
          data: {
            key, nameAr,
            description: (suggestion.description || "").trim().slice(0, 500),
            specialtyId, sortOrder: nextOrder++, isActive: true,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`, icon: "📋",
          },
        });

        let addedKeywords = 0;
        for (const kw of keywords) {
          if (kw.length < 2) continue;
          try {
            await prisma.ticketTypeKeyword.create({
              data: { keyword: kw, typeId: newType.id, weight: 1.5, source: "gemini_generated", isLearned: false, confidence: 0.9, usageCount: 0 },
            });
            addedKeywords++;
          } catch {}
        }

        addedTypes.push({ key: newType.key, nameAr: newType.nameAr, specialtyKey, keywordsAdded: addedKeywords });
        existingKeys.add(key);
      } catch (err: any) {
        errors.push(`Failed to create "${key}": ${err.message}`);
      }
    }

    invalidateReferenceCache();
    invalidateKeywordCache();

    res.json({ message: `Added ${addedTypes.length} new types`, types: addedTypes, errors: errors.length > 0 ? errors : undefined });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classify/generate-subtypes ────────────────────────────────────
router.post("/generate-subtypes", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { typeKey } = req.body as { typeKey: string };
    if (!typeKey) { res.status(400).json({ error: "typeKey is required" }); return; }

    const parentType = await prisma.ticketType.findUnique({
      where: { key: typeKey },
      include: { specialty: true },
    });
    if (!parentType) { res.status(404).json({ error: `Type "${typeKey}" not found` }); return; }

    const existingSubs = await prisma.ticketSubType.findMany({
      where: { parentTypeId: parentType.id, isActive: true },
      select: { nameAr: true },
    });
    const existingSubNames = new Set(existingSubs.map(s => s.nameAr));

    const prompt = `أنت خبير في الصيانة العقارية.
النوع الرئيسي: "${parentType.nameAr}" (${parentType.key})
التخصص: ${parentType.specialty?.nameAr || "عام"}

الأنواع الفرعية الموجودة حالياً (لا تكررها):
${existingSubs.map(s => `  - ${s.nameAr}`).join("\n") || "  (لا يوجد)"}

المطلوب: اقترح 5-8 أنواع فرعية جديدة وواقعية تحت هذا النوع.
كل نوع فرعي يجب أن يكون له اسم (nameAr) ووصف مختصر.
ركز على مشاكل الصيانة الشائعة.

أرجِع ONLY JSON array:
[
  { "nameAr": "تسريبات مياه من المواسير", "description": "إصلاح تسريبات المياه في المواسير الداخلية والخارجية" }
]`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const response = await fetch(`${apiUrl}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    });

    if (!response.ok) { res.status(500).json({ error: `Gemini API error: ${response.status}` }); return; }
    const data = await response.json();
    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let suggestedSubs;
    try {
      let clean = rawText.trim();
      if (clean.includes("```")) clean = clean.split('\n').filter(l => !l.trim().startsWith('```')).join('\n').trim();
      const fb = clean.indexOf('['), lb = clean.lastIndexOf(']');
      if (fb !== -1 && lb !== -1) clean = clean.substring(fb, lb + 1);
      suggestedSubs = JSON.parse(clean);
    } catch {
      res.status(500).json({ error: "Failed to parse Gemini response", raw: rawText.slice(0, 500) });
      return;
    }

    const maxOrder = await prisma.ticketSubType.aggregate({
      where: { parentTypeId: parentType.id },
      _max: { sortOrder: true },
    });
    let nextOrder = (maxOrder._max.sortOrder || 0) + 1;
    const added: any[] = [];

    for (const sub of suggestedSubs) {
      const nameAr = (sub.nameAr || "").trim();
      if (!nameAr || existingSubNames.has(nameAr)) continue;
      try {
        await prisma.ticketSubType.create({
          data: {
            parentTypeId: parentType.id, nameAr,
            description: (sub.description || "").trim().slice(0, 500),
            sortOrder: nextOrder++, isActive: true,
          },
        });
        added.push({ nameAr });
        existingSubNames.add(nameAr);
      } catch {}
    }

    invalidateReferenceCache();
    res.json({ message: `Added ${added.length} new sub-types for "${parentType.nameAr}"`, subTypes: added });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tickets/import ────────────────────────────────────────────────
router.post("/import", requireAuth, async (req, res) => {
  try {
    const { projectId, tickets: rawTickets } = req.body as {
      projectId: string;
      tickets: {
        ticketId?: string; refNumber?: string; clientId?: string;
        clientName?: string; villaNumber?: string; description?: string;
        type?: string; priority?: number | string; issuedAt?: string;
      }[];
    };

    if (!projectId || !Array.isArray(rawTickets) || rawTickets.length === 0) {
      res.status(400).json({ error: "projectId and tickets array are required" });
      return;
    }

    const projectClients = await prisma.client.findMany({
      where: { projectId },
      select: { id: true, villaNumber: true, name: true, phone: true },
    });
    const clientByVilla = Object.fromEntries(projectClients.map((c: any) => [c.villaNumber, c]));

    const projectSups = await prisma.user.findMany({
      where: { role: "supervisor", projectIds: { has: projectId } },
      select: { uid: true, displayName: true, specialties: true, specialty: true },
    });
    const allSups = projectSups.length > 0 ? projectSups : await prisma.user.findMany({
      where: { role: "supervisor" },
      select: { uid: true, displayName: true, specialties: true, specialty: true },
    });

    const keywords = await loadKeywordsFromDB();
    const typeToSpecialty = await buildTypeToSpecialtyMap();

    const getSpecs = (u: any): string[] => {
      if (Array.isArray(u.specialties) && u.specialties.length > 0) return u.specialties;
      if (u.specialty) return [u.specialty];
      return ["general"];
    };

    const errors: { index: number; reason: string }[] = [];
    const ticketsToCreate: any[] = [];

    for (let i = 0; i < rawTickets.length; i++) {
      const raw = rawTickets[i];
      const description = (raw.description || "").trim();
      const villaNumber = (raw.villaNumber || "").trim();
      const clientId = (raw.clientId || "").trim();

      let matchedClientId = clientId;
      if (!matchedClientId && villaNumber) matchedClientId = clientByVilla[villaNumber]?.id || "";
      if (!matchedClientId) { errors.push({ index: i, reason: "No client found for villa " + villaNumber }); continue; }

      let classification;
      if (GEMINI_API_KEY) {
        const geminiResult = await classifyWithGeminiEnhanced(description, projectId);
        if (geminiResult && ["plumbing","electricity","doors_windows","cracks","ceramics","tank_insulation","drainage","ac_ventilation","pumps","waterproofing","grading","pest_control","cleaning","structural","paints","doors"].includes(geminiResult.primaryType)) {
          classification = { primaryType: geminiResult.primaryType, allTypes: geminiResult.allTypes, confidence: geminiResult.confidence };
          await autoLearnFromClassification(description, geminiResult.primaryType, geminiResult.confidence);
        } else {
          classification = classifyFromKeywordsDB(description, keywords);
        }
      } else {
        classification = classifyFromKeywordsDB(description, keywords);
      }
      const type = raw.type || classification.primaryType;

      const requiredSpecialties = [...new Set(classification.allTypes.map((t: string) => typeToSpecialty[t] || "general"))];
      const matchedSups = allSups.filter((s: any) => getSpecs(s).some((sp: string) => requiredSpecialties.includes(sp)));
      const finalSups = matchedSups.length > 0 ? matchedSups : allSups.filter((s: any) => getSpecs(s).includes("general"));
      const supervisorList = finalSups.length > 0 ? finalSups : allSups;
      const supervisorIds = supervisorList.map((s: any) => s.uid);
      const primarySup = supervisorList[0];
      const priorityNum = raw.priority !== undefined ? parseInt(String(raw.priority), 10) : 3;

      ticketsToCreate.push({
        ticketId: raw.ticketId || String(Date.now() + i).slice(-6),
        refNumber: raw.refNumber || "", projectAbbr: null,
        projectId, clientId: matchedClientId,
        clientName: clientByVilla[villaNumber]?.name || raw.clientName || "",
        villaNumber, issuedAt: raw.issuedAt || null,
        description, type, status: "open",
        priority: isNaN(priorityNum) ? 3 : priorityNum,
        assigneeName: primarySup?.displayName || null,
        assignedSupervisorId: primarySup?.uid || null,
        assignedSupervisorIds: supervisorIds,
        assignedSupervisors: supervisorList.map((s: any) => ({ id: s.uid, name: s.displayName, specialty: getSpecs(s)[0] })),
        detectedTypes: classification.allTypes,
        appointmentTime: null, appointmentNotes: null,
      });
    }

    if (ticketsToCreate.length === 0) {
      res.json({ imported: 0, skipped: rawTickets.length, errors }); return;
    }

    const created = await prisma.ticket.createMany({ data: ticketsToCreate, skipDuplicates: true });
    res.json({ imported: created.count, skipped: rawTickets.length - created.count, errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
