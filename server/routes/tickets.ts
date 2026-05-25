import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth, asTrimmedString } from "../auth.js";
import { getIO } from "../socket.js";
import { classifyTicket } from "../classifier/classify.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB, invalidateReferenceCache } from "../classifier/db-helpers.js";
import { invalidateKeywordCache } from "../classifier/keywords.js";
import { sendWAText, buildOpeningMsg, buildClosingMsg } from "../baileys.js";

const router = Router();

async function shouldAutoSendWA(uid: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { uid },
      select: { notifPrefs: true },
    });
    const prefs = user?.notifPrefs as Record<string, boolean> | null;
    return prefs?.whatsapp !== false;
  } catch {
    return true;
  }
}

async function autoSendOpening(uid: string, ticket: any) {
  try {
    if (!(await shouldAutoSendWA(uid))) return;
    const client = await prisma.client.findUnique({
      where: { id: ticket.clientId },
      select: { phone: true, name: true },
    });
    if (!client?.phone) return;
    const msg = await buildOpeningMsg({
      ticketId: ticket.ticketId,
      clientName: client.name,
      description: ticket.description,
      villaNumber: ticket.villaNumber,
      date: new Date().toLocaleDateString('ar-EG'),
    });
    await sendWAText(uid, client.phone, msg);
  } catch {}
}

async function autoSendClosing(uid: string, ticket: any) {
  try {
    if (!(await shouldAutoSendWA(uid))) return;
    const client = await prisma.client.findUnique({
      where: { id: ticket.clientId },
      select: { phone: true, name: true },
    });
    if (!client?.phone) return;
    const msg = await buildClosingMsg({
      ticketId: ticket.ticketId,
      clientName: client.name,
      description: ticket.description,
      villaNumber: ticket.villaNumber,
      closureNotes: ticket.closureNotes,
    });
    await sendWAText(uid, client.phone, msg);
  } catch {}
}

async function classifyInBackground(description: string, ticketId: string, projectId?: string, keepManualSupervisors?: boolean) {
  try {
    const classification = await classifyTicket(description, projectId);

    // 3) حدّث التذكرة والمشرفين
    const typeToSpecialty = await buildTypeToSpecialtyMap();
    const allTypes: string[] = classification.allTypes;
    const requiredSpecialties = [...new Set(allTypes.map((t: string) => typeToSpecialty[t] || "general"))] as string[];

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

    const updateData: any = {
      type: classification.primaryType,
      detectedTypes: classification.allTypes,
    };

    if (!keepManualSupervisors) {
      updateData.assignedSupervisorId = primarySupId;
      updateData.assignedSupervisorIds = supervisorIds;
      updateData.assignedSupervisors = supervisorList.length > 0 ? supervisorList : undefined;
    }

    await prisma.ticket.updateMany({
      where: { id: ticketId },
      data: updateData,
    });

    invalidateReferenceCache();
    invalidateKeywordCache();
  } catch (err) {
    console.warn(` ⚠️ Background classify failed for ticket ${ticketId}:`, err);
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

// GET /api/tickets/next-id
router.get("/next-id", requireAuth, async (req, res) => {
  const { projectId } = req.query as { projectId?: string };
  try {
    const where = projectId ? { projectId } : {};
    
    // Fetch all ticketIds to safely find the maximum numeric ID
    const tickets = await prisma.ticket.findMany({
      where,
      select: { ticketId: true },
    });
    
    let maxId = 0;
    for (const t of tickets) {
      const trimmed = (t.ticketId || '').trim();
      if (!trimmed) continue;
      // Only consider pure numeric IDs to avoid parsing prefixes unexpectedly
      if (/^\d+$/.test(trimmed)) {
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed) && parsed > maxId) {
          maxId = parsed;
        }
      }
    }
    
    const nextId = maxId + 1;
    res.json({ nextId: nextId.toString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id
router.get("/:id", requireAuth, async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) { res.status(404).json({ error: "Not found" }); return; }
  res.json(ticket);
});

// POST /api/tickets
router.post("/", requireAuth, async (req, res) => {
  const data = req.body;
  try {
    const projectId = asTrimmedString(data.projectId);
    const clientId = asTrimmedString(data.clientId);
    if (!projectId) {
      res.status(400).json({ error: "يجب تحديد المشروع لإنشاء التذكرة" });
      return;
    }

    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, projectId: true },
      });
      if (!client || client.projectId !== projectId) {
        res.status(400).json({ error: "العميل المحدد غير موجود أو لا ينتمي لهذا المشروع" });
        return;
      }
    }

    const assignedSupervisorIds = Array.isArray(data.assignedSupervisorIds)
      ? data.assignedSupervisorIds.filter((id: unknown) => typeof id === "string" && id.trim().length > 0 && !id.startsWith('pending_'))
      : [];

    let priority = 3;
    if (data.priority !== undefined) {
      const parsed = parseInt(data.priority, 10);
      priority = isNaN(parsed) ? 3 : parsed;
    }

    const ticket = await prisma.ticket.create({
      data: {
        ticketId: data.ticketId || String(Date.now()).slice(-6),
        refNumber: data.refNumber,
        projectAbbr: data.projectAbbr || null,
        projectId, clientId: clientId || null,
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

    const hasManualSups = assignedSupervisorIds.length > 0;

    const description = (data.description || "").trim();
    if (description.length >= 5) {
      classifyInBackground(description, ticket.id, projectId, hasManualSups).catch(() => {});
    }

    const senderUid = (req as AuthRequest).uid;
    if (senderUid) autoSendOpening(senderUid, ticket).catch(() => {});

    getIO().emit("ticket:created", ticket);
    res.status(201).json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/tickets/bulk
router.post("/bulk", requireAuth, async (req, res) => {
  const tickets: any[] = req.body.tickets;
  if (!Array.isArray(tickets)) { res.status(400).json({ error: "tickets must be array" }); return; }
  try {
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
      } else if (!t.projectId) {
        invalidClientRefs.push(t);
      }
    }

    if (invalidClientRefs.length > 0) {
      const sample = invalidClientRefs.slice(0, 5).map(t => t.ticketId || t.refNumber || `row-${t.index+1}`).join(", ");
      res.status(400).json({ error: `هناك ${invalidClientRefs.length} تذاكر بدون عميل أو لا تنتمي لهذا المشروع (نماذج: ${sample})` });
      return;
    }

    const created = await prisma.ticket.createMany({
      data: normalized.map(t => ({
        ticketId: t.ticketId, refNumber: t.refNumber, projectAbbr: t.projectAbbr,
        projectId: t.projectId, clientId: t.clientId || null, clientName: t.clientName,
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

    if (created.count > 0) {
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
router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
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
        clientId: data.clientId ?? undefined,
        clientName: data.clientName ?? undefined,
        villaNumber: data.villaNumber ?? undefined,
      },
    });

    const closingStatuses = ['closed', 'completed'];
    if (data.status && closingStatuses.includes(data.status) && req.uid) {
      autoSendClosing(req.uid, ticket).catch(() => {});
    }

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

// POST /api/tickets/bulk-update-imported
router.post("/bulk-update-imported", requireAuth, async (req, res) => {
  const { updates } = req.body as { updates: { id: string; status: string; closedAt?: string | null }[] };
  if (!Array.isArray(updates)) { res.status(400).json({ error: "updates must be array" }); return; }
  try {
    const updatePromises = updates.map(u => 
      prisma.ticket.update({
        where: { id: u.id },
        data: {
          status: u.status,
          closedAt: u.closedAt ? new Date(u.closedAt) : null,
        }
      })
    );
    await Promise.all(updatePromises);
    res.json({ count: updates.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/tickets/auto-link
router.post("/auto-link", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.body;
    const where: any = { clientId: null };
    if (projectId) where.projectId = projectId;

    const unlinkedTickets = await prisma.ticket.findMany({
      where,
      select: { id: true, villaNumber: true, projectId: true }
    });

    if (unlinkedTickets.length === 0) {
      return res.json({ count: 0, message: "لا توجد تذاكر غير مربوطة." });
    }

    const projectsToFetch = projectId ? [projectId] : [...new Set(unlinkedTickets.map(t => t.projectId))];
    const clients = await prisma.client.findMany({
      where: { projectId: { in: projectsToFetch } },
      select: { id: true, projectId: true, villaNumber: true, name: true }
    });

    const clientMap = new Map();
    for (const c of clients) {
      const key = `${c.projectId}:${(c.villaNumber || "").trim()}`;
      clientMap.set(key, c);
    }

    let linkedCount = 0;
    for (const ticket of unlinkedTickets) {
      const villa = (ticket.villaNumber || "").trim();
      const key = `${ticket.projectId}:${villa}`;
      const matchedClient = clientMap.get(key);

      if (matchedClient) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            clientId: matchedClient.id,
            clientName: matchedClient.name,
          }
        });
        linkedCount++;
      }
    }

    res.json({ count: linkedCount, message: `تم ربط ${linkedCount} تذاكر بنجاح.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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