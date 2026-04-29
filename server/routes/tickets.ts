import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth, asTrimmedString } from "../auth.js";
import { getIO } from "../socket.js";
import { classifyTicket, buildTypeToSpecialtyMap, findSupervisorsDB, autoLearnFromClassification, invalidateKeywordCache, invalidateReferenceCache } from "../classifier/classify.js";
import { loadKeywordsFromDB, classifyFromKeywordsDB } from "../classifier/keywords.js";
import { classifyWithGeminiEnhanced } from "../classifier/gemini.js";
import { GEMINI_API_KEY, VALID_TYPES } from "../config.js";

const router = Router();

// ── وظيفة تصنيف في الخلفية ──────────────────────────────────────────────
// بتشتغل بعد الاستيراد عشان ما تأخرش المستخدم
async function classifyInBackground(description: string, ticketId: string, projectId?: string) {
  try {
    let classification;
    
    // 1) حاول بـ Gemini (الـ Rate Limiter جوا classifyWithGeminiEnhanced دلوقتي)
    if (GEMINI_API_KEY) {
      const geminiResult = await classifyWithGeminiEnhanced(description, projectId);
      if (geminiResult && VALID_TYPES.includes(geminiResult.primaryType)) {
        classification = {
          primaryType: geminiResult.primaryType,
          allTypes: geminiResult.allTypes as string[],
          confidence: geminiResult.confidence,
          source: "gemini" as const,
          subType: geminiResult.suggestedNewSubType || null,
        };

        if (classification.confidence >= 6) {
          autoLearnFromClassification(description, classification.primaryType, classification.confidence).catch(() => {});
        }

        if (geminiResult.suggestedNewType) {
          const { learnNewTypeFromGemini, learnNewSubTypeFromGemini } = await import("../classifier/gemini.js");
          learnNewTypeFromGemini(geminiResult.suggestedNewType, geminiResult.primaryType, description).catch(() => {});
          if (geminiResult.suggestedNewSubType) {
            learnNewSubTypeFromGemini(geminiResult.primaryType, geminiResult.suggestedNewSubType, description).catch(() => {});
          }
        }
      }
    }

    // 2) فشل Gemini → keywords
    if (!classification) {
      const keywords = await loadKeywordsFromDB();
      const kwResult = classifyFromKeywordsDB(description, keywords);
      classification = {
        primaryType: kwResult.primaryType,
        allTypes: kwResult.allTypes as string[],
        confidence: kwResult.confidence,
        source: "keywords" as const,
        subType: null,
      };
    }

    // 3) حدّث التذكرة والمشرفين
    const typeToSpecialty = await buildTypeToSpecialtyMap();
    const allTypes: string[] = classification.allTypes;
    const requiredSpecialties = [...new Set(allTypes.map((t: string) => typeToSpecialty[t] || "general"))] as string[];

    // جيب المشرفين
    let supervisorIds: string[] = [];
    let primarySupId: string | null = null;
    let supervisorList: { id: string; name: string; specialty: string }[] = [];

    if (projectId) {
      const matchedSups = await findSupervisorsDB(projectId, requiredSpecialties);
      supervisorList = matchedSups.map((s: any) => ({
        id: s.id, name: s.name,
        specialty: Array.isArray(s.specialties) ? s.specialties[0] || "general" : "general",
      }));
      supervisorIds = supervisorList.map((s: any) => s.id);
      primarySupId = supervisorList[0]?.id || null;
    }

    await prisma.ticket.updateMany({
      where: { id: ticketId },
      data: {
        type: classification.primaryType,
        detectedTypes: classification.allTypes,
        assignedSupervisorId: primarySupId,
        assignedSupervisorIds: supervisorIds,
        assignedSupervisors: supervisorList.length > 0 ? supervisorList : undefined,
      },
    });

    invalidateReferenceCache();
    invalidateKeywordCache();
  } catch (err) {
    console.warn(`  ⚠️ Background classify failed for ticket ${ticketId}:`, err);
  }
}

// GET /api/tickets
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { projectId, projectIds, supervisorId, status } = req.query as Record<string, string>;
  const where: any = {};
  if (projectId) where.projectId = projectId;
  if (projectIds) where.projectId = { in: projectIds.split(",") };
  if (supervisorId) where.assignedSupervisorIds = { has: supervisorId };
  if (status) where.status = status;
  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  res.json(tickets);
});

// GET /api/tickets/:id
router.get("/:id", requireAuth, async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) { res.status(404).json({ error: "Not found" }); return; }
  res.json(ticket);
});

// POST /api/tickets — نشوف التذكرة فوراً والتصنيف في الخلفية
router.post("/", requireAuth, async (req, res) => {
  const data = req.body;
  try {
    const projectId = asTrimmedString(data.projectId);
    const clientId = asTrimmedString(data.clientId);
    if (!projectId || !clientId) {
      res.status(400).json({ error: "يجب تحديد المشروع والعميل لإنشاء التذكرة" });
      return;
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, projectId: true },
    });
    if (!client || client.projectId !== projectId) {
      res.status(400).json({ error: "العميل المحدد غير موجود أو لا ينتمي لهذا المشروع" });
      return;
    }

    const assignedSupervisorIds = Array.isArray(data.assignedSupervisorIds)
      ? data.assignedSupervisorIds.filter((id: unknown) => typeof id === "string" && id.trim().length > 0 && !id.startsWith('pending_'))
      : [];

    let priority = 3;
    if (data.priority !== undefined) {
      const parsed = parseInt(data.priority, 10);
      priority = isNaN(parsed) ? 3 : parsed;
    }

    // نشوف التذكرة فوراً بالـ type اللي جايلها (أو general)
    const ticket = await prisma.ticket.create({
      data: {
        ticketId: data.ticketId || String(Date.now()).slice(-6),
        refNumber: data.refNumber,
        projectAbbr: data.projectAbbr || null,
        projectId, clientId,
        clientName: data.clientName, villaNumber: data.villaNumber,
        issuedAt: data.issuedAt || null,
        description: data.description,
        type: data.type || "general",
        typeId: null,
        status: data.status || "open", priority,
        assigneeName: data.assigneeName || null,
        assignedSupervisorId: (assignedSupervisorIds[0] && !assignedSupervisorIds[0].startsWith('pending_')) ? assignedSupervisorIds[0] : null,
        assignedSupervisorIds,
        assignedSupervisors: data.assignedSupervisors ?? undefined,
        detectedTypes: data.detectedTypes || [],
        appointmentTime: data.appointmentTime || null,
        appointmentNotes: data.appointmentNotes || null,
        closureNotes: data.closureNotes || null,
        maintenanceItems: data.maintenanceItems ?? undefined,
        closedAt: data.closedAt ? new Date(data.closedAt) : null,
      },
    });

    // التصنيف في الخلفية — ما يأخرش المستخدم
    const description = (data.description || "").trim();
    if (description.length >= 5) {
      classifyInBackground(description, ticket.id, projectId).catch(() => {});
    }

    getIO().emit("ticket:created", ticket);
    res.status(201).json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/tickets/bulk — نشوف الكل فوراً والتصنيف في الخلفية
router.post("/bulk", requireAuth, async (req, res) => {
  const tickets: any[] = req.body.tickets;
  if (!Array.isArray(tickets)) { res.status(400).json({ error: "tickets must be array" }); return; }
  try {
    // نجهز الداتا بسرعة — من غير تصنيف
    const now = Date.now();
    const normalized = tickets.map((t, index) => {
      let assignedSupervisorIds = Array.isArray(t.assignedSupervisorIds)
        ? t.assignedSupervisorIds.filter((id: string) => id && !id.startsWith('pending_'))
        : [];
      let assignedSupervisorId = t.assignedSupervisorId && !t.assignedSupervisorId.startsWith('pending_')
        ? t.assignedSupervisorId
        : (assignedSupervisorIds[0] || null);

      let priority = 3;
      if (t.priority !== undefined) {
        const parsed = parseInt(t.priority, 10);
        priority = isNaN(parsed) ? 3 : parsed;
      }

      return {
        index,
        ticketId: t.ticketId || String(now + Math.random()).slice(-6),
        refNumber: t.refNumber || "", projectAbbr: t.projectAbbr || null,
        projectId: asTrimmedString(t.projectId) || "",
        clientId: asTrimmedString(t.clientId) || "",
        clientName: t.clientName, villaNumber: t.villaNumber,
        issuedAt: t.issuedAt || null,
        description: t.description, type: t.type || "general",
        status: t.status || "open", priority,
        assigneeName: t.assigneeName || null,
        assignedSupervisorId: (assignedSupervisorId && !assignedSupervisorId.startsWith('pending_')) ? assignedSupervisorId : null,
        assignedSupervisorIds,
        detectedTypes: t.detectedTypes || [],
        appointmentTime: t.appointmentTime || null,
        appointmentNotes: t.appointmentNotes || null,
        closedAt: t.closedAt ? new Date(t.closedAt) : null,
        closureNotes: t.closureNotes || null,
      };
    });

    // Validate client-project relationship (ضروري عشان البيانات متصحش)
    const invalidClientRefs: any[] = [];
    const clientCache = new Map<string, boolean>();
    for (const t of normalized) {
      if (t.projectId && t.clientId) {
        const cacheKey = `${t.projectId}:${t.clientId}`;
        let valid = clientCache.get(cacheKey);
        if (valid === undefined) {
          const client = await prisma.client.findFirst({
            where: { id: t.clientId, projectId: t.projectId },
            select: { id: true }
          });
          valid = !!client;
          clientCache.set(cacheKey, valid);
        }
        if (!valid) invalidClientRefs.push(t);
      } else {
        invalidClientRefs.push(t);
      }
    }
    if (invalidClientRefs.length > 0) {
      const sample = invalidClientRefs.slice(0, 5).map(t => t.ticketId || t.refNumber || `row-${t.index+1}`).join(", ");
      res.status(400).json({ error: `هناك ${invalidClientRefs.length} تذاكر بدون عميل أو لا تنتمي لهذا المشروع (نماذج: ${sample})` });
      return;
    }

    // نشوف الكل مرة واحدة
    const created = await prisma.ticket.createMany({
      data: normalized.map(t => ({
        ticketId: t.ticketId, refNumber: t.refNumber, projectAbbr: t.projectAbbr,
        projectId: t.projectId, clientId: t.clientId, clientName: t.clientName,
        villaNumber: t.villaNumber, issuedAt: t.issuedAt, description: t.description,
        type: t.type, status: t.status, priority: t.priority,
        assigneeName: t.assigneeName, assignedSupervisorId: t.assignedSupervisorId,
        assignedSupervisorIds: t.assignedSupervisorIds, detectedTypes: t.detectedTypes,
        appointmentTime: t.appointmentTime, appointmentNotes: t.appointmentNotes,
        closedAt: t.closedAt,
        closureNotes: t.closureNotes,
      })),
      skipDuplicates: true,
    });

    // التصنيف في الخلفية لكل التذاكر
    if (created.count > 0) {
      // نجيب IDs التذاكر اللي اتعملت عشان نصنفها
      const ticketIds = normalized.map(t => t.ticketId);
      const createdTickets = await prisma.ticket.findMany({
        where: { ticketId: { in: ticketIds } },
        select: { id: true, description: true, projectId: true },
        take: tickets.length,
      });

      for (const t of createdTickets) {
        const desc = (t.description || "").trim();
        if (desc.length >= 5) {
          classifyInBackground(desc, t.id, t.projectId || undefined).catch(() => {});
        }
      }
    }

    res.status(201).json({ count: created.count });
  } catch (err: any) {
    console.error("Bulk import error:", err);
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/tickets/:id
router.put("/:id", requireAuth, async (req, res) => {
  const data = req.body;
  try {
    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data: {
        status: data.status ?? undefined,
        priority: data.priority !== undefined ? Number(data.priority) : undefined,
        assigneeName: data.assigneeName ?? undefined,
        assignedSupervisorId: data.assignedSupervisorId ?? undefined,
        assignedSupervisorIds: data.assignedSupervisorIds ?? undefined,
        assignedSupervisors: data.assignedSupervisors ?? undefined,
        appointmentTime: data.appointmentTime ?? undefined,
        appointmentNotes: data.appointmentNotes ?? undefined,
        closureNotes: data.closureNotes ?? undefined,
        maintenanceItems: data.maintenanceItems ?? undefined,
        closedAt: data.closedAt !== undefined ? (data.closedAt ? new Date(data.closedAt) : null) : undefined,
        description: data.description ?? undefined,
        type: data.type ?? undefined,
      },
    });
    res.json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/tickets/bulk-status
router.patch("/bulk-status", requireAuth, async (req, res) => {
  const { ids, status } = req.body as { ids: string[]; status: string };
  await prisma.ticket.updateMany({ where: { id: { in: ids } }, data: { status } });
  res.json({ count: ids.length });
});

// DELETE /api/tickets/:id
router.delete("/:id", requireAuth, async (req, res) => {
  await prisma.ticket.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// DELETE /api/tickets (all)
router.delete("/", requireAuth, async (_req, res) => {
  const result = await prisma.ticket.deleteMany();
  res.json({ count: result.count });
});

export default router;
