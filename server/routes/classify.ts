import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth, requireAdmin } from "../auth.js";
import { classifyTicket } from "../classifier/classify.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB, invalidateReferenceCache } from "../classifier/db-helpers.js";
import { loadKeywordsFromDB, invalidateKeywordCache, classifyFromKeywordsDB, normalizeArabic } from "../classifier/keywords.js";
import { geminiEnabled } from "../classifier/gemini.js";
import { nudgeReclassifyWorker } from "../classifier/reclassify-worker.js";

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

    res.json({
      primaryType: classification.primaryType,
      allTypes: classification.allTypes,
      subType: classification.subType || undefined,
      requiredSpecialties,
      confidence: classification.confidence,
      source: classification.source,
      supervisors,
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
        where: { role: "supervisor", projects: { some: { id: pid } } },
        select: { uid: true, displayName: true, specialtiesRef: { select: { key: true } }, specialty: true },
      });
      if (supervisorCache[pid].length === 0) {
        supervisorCache[pid] = await prisma.user.findMany({
          where: { role: "supervisor" },
          select: { uid: true, displayName: true, specialtiesRef: { select: { key: true } }, specialty: true },
        });
      }
    }

    const getSpecs = (u: any): string[] => {
      if (Array.isArray(u.specialtiesRef) && u.specialtiesRef.length > 0) return u.specialtiesRef.map((s: any) => s.key);
      if (u.specialty) return [u.specialty];
      return ["general"];
    };

    const keywords = await loadKeywordsFromDB();

    const results = items.map((item) => {
      const classification = classifyFromKeywordsDB(item.description, keywords);
      const requiredSpecialties = [...new Set(classification.allTypes.map((t: string) => typeToSpecialty[t] || "general"))];
      const projectSups = supervisorCache[item.projectId] || [];

      const matched = projectSups.filter((s: any) =>
        getSpecs(s).some((sp: string) => requiredSpecialties.includes(sp))
      );
      const fallback = matched.length > 0 ? matched : projectSups.filter((s: any) => getSpecs(s).includes("general"));
      const finalSups = fallback.length > 0 ? fallback : projectSups;

      return {
        primaryType:        classification.primaryType,
        allTypes:           classification.allTypes,
        typeId:             classification.typeId    ?? null,
        subType:            classification.subType   ?? null,
        subTypeId:          classification.subTypeId ?? null,
        requiredSpecialties,
        confidence:         classification.confidence,
        source:             "keywords",
        supervisors: finalSups.map((u: any) => ({ id: u.uid, name: u.displayName, specialties: getSpecs(u) })),
      };
    });

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
      "السلام","عليكم","ورحمة","الله","وبركاته","شكرا","تحياتي","نرجو","برجاء",
      "ارجو","الرجاء","لدي","عندي","مشكلة","صيانة","تعمل","يعمل","بشكل","جيد",
      "تحتاج","يحتاج","تغيير","تعديل","اصلاح","فضلا","نامل","صورة","مرفق",
      "عاجل","للضرورة","جميع","احد","احدى","التي","عدم","تعليق"
    ]);

    const words = normalizeArabic(description)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    let updated = 0;
    for (const word of [...new Set(words)]) {
      const existing = await prisma.ticketTypeKeyword.findFirst({
        where: { keyword: word, typeId: correctType.id },
      });
      if (existing) {
        await prisma.ticketTypeKeyword.update({
          where: { id: existing.id },
          data: { usageCount: existing.usageCount + 1, isLearned: true, pendingReclassify: true },
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
          data: {
            keyword:           word,
            typeId:            correctType.id,
            weight:            1.0,
            isLearned:         true,
            source:            "learned",
            confidence:        0.8,
            usageCount:        1,
            pendingReclassify: true,
          },
        });
        updated++;
      }
    }

    invalidateKeywordCache();
    invalidateReferenceCache();
    nudgeReclassifyWorker();

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

    const normKeyword = normalizeArabic(keyword);

    const existing = await prisma.ticketTypeKeyword.findFirst({
      where: { keyword: normKeyword, typeId: type.id },
    });

    if (existing) {
      await prisma.ticketTypeKeyword.update({
        where: { id: existing.id },
        data: { weight: weight ?? existing.weight, source: "manual", pendingReclassify: true },
      });
    } else {
      await prisma.ticketTypeKeyword.create({
        data: {
          keyword:           normKeyword,
          typeId:            type.id,
          weight:            weight ?? 1.0,
          source:            "manual",
          isLearned:         false,
          confidence:        1.0,
          pendingReclassify: true,
        },
      });
    }

    invalidateKeywordCache();
    nudgeReclassifyWorker();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/classify/retry-failed ──────────────────────────────────────
router.post("/retry-failed", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const failedTickets = await prisma.ticket.findMany({
      where: {
        status: { not: "closed" },
        OR: [
          { detectedTypes: { equals: [] } },
          { type: "unclassified" },
          { type: null },
          { AND: [{ type: { in: ["plumbing", "general"] } }, { detectedTypes: { equals: ["plumbing"] } }] },
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
    const typeToSpecialty = await buildTypeToSpecialtyMap();

    for (const ticket of failedTickets) {
      if (!ticket.description || ticket.description.length < 5) continue;

      const classification = await classifyTicket(ticket.description, ticket.projectId || undefined, { forceReclassify: true });

      // classifyTicket already filters out low-confidence results — just check primaryType
      if (classification.primaryType !== "unclassified") {
        const requiredSpecialties = [...new Set(classification.allTypes.map((t: string) => typeToSpecialty[t] || "general"))];
        
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            type: classification.primaryType,
            detectedTypes: classification.allTypes.filter((t: string) => t !== "unclassified"),
          },
        });

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
    const [totalTickets, withDetectedTypes, typeDistribution, keywordsCount] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { detectedTypes: { isEmpty: false } } }),
      prisma.ticket.groupBy({ by: ["type"], _count: true, orderBy: { _count: { type: "desc" } }, take: 20 }),
      prisma.ticketTypeKeyword.count({ where: { source: { equals: "auto_learned" } } }),
    ]);

    res.json({
      totalTickets,
      classifiedTickets: withDetectedTypes,
      classificationRate: totalTickets > 0 ? Math.round((withDetectedTypes / totalTickets) * 100) : 0,
      typeDistribution: typeDistribution.map((t: any) => ({ type: t.type, count: t._count })),
      learnedKeywords: { total: keywordsCount, auto: 0 },
      geminiEnabled: geminiEnabled(),
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

    const projectUnits = await prisma.unit.findMany({
      where: { projectId },
      include: { clients: { include: { client: true } } },
    });
    const clientByVilla: Record<string, any> = {};
    for (const u of projectUnits) {
      const c = u.clients.find((c: any) => c.isPrimary)?.client || u.clients[0]?.client;
      if (c) {
        clientByVilla[u.unitNumber] = { id: c.id, villaNumber: u.unitNumber, name: c.name, phone: c.phone, unitId: u.id };
      }
    }

    const projectSups = await prisma.user.findMany({
      where: { role: "supervisor", projects: { some: { id: projectId } } },
      select: { uid: true, displayName: true, specialtiesRef: { select: { key: true } }, specialty: true },
    });
    const allSups = projectSups.length > 0 ? projectSups : await prisma.user.findMany({
      where: { role: "supervisor" },
      select: { uid: true, displayName: true, specialtiesRef: { select: { key: true } }, specialty: true },
    });

    const keywords = await loadKeywordsFromDB();
    const typeToSpecialty = await buildTypeToSpecialtyMap();

    const getSpecs = (u: any): string[] => {
      if (Array.isArray(u.specialtiesRef) && u.specialtiesRef.length > 0) return u.specialtiesRef.map((s: any) => s.key);
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

      const classification = classifyFromKeywordsDB(description, keywords);
      const rawType = classification.primaryType === "unclassified" ? null : classification.primaryType;
      const type = raw.type || rawType;

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
        projectId, clientId: matchedClientId || null,
        unitId: clientByVilla[villaNumber]?.unitId || null,
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
