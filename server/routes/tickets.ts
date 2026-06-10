import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth, requireAdmin, getRequesterRole, asTrimmedString } from "../auth.js";
import { getIO } from "../socket.js";
import { classifyTicket } from "../classifier/classify.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB, invalidateReferenceCache } from "../classifier/db-helpers.js";
import { invalidateKeywordCache } from "../classifier/keywords.js";
import { sendWAText, buildOpeningMsg, buildClosingMsg, buildAbsentMsg, buildOutOfScopeMsg } from "../baileys.js";

const router = Router();

// ── Enrich tickets: replace stored supervisor names with live names from DB ──
async function enrichSupervisorNames<T extends { assignedSupervisorIds?: string[]; assignedSupervisors?: any }>(
  tickets: T[]
): Promise<T[]> {
  // collect all unique supervisor UIDs across all tickets
  const allIds = new Set<string>();
  for (const t of tickets) {
    for (const id of (t.assignedSupervisorIds || [])) {
      if (id) allIds.add(id);
    }
  }
  if (allIds.size === 0) return tickets;

  // fetch current names from DB — User PK is `uid`, name is `displayName`
  const users = await prisma.user.findMany({
    where: { uid: { in: [...allIds] } },
    select: { uid: true, displayName: true, specialty: true },
  });
  const nameMap = new Map(users.map(u => [u.uid, u]));

  // patch each ticket's assignedSupervisors with live data
  return tickets.map(t => {
    const ids = t.assignedSupervisorIds || [];
    if (ids.length === 0) return t;
    const supervisors = ids
      .map(id => {
        const u = nameMap.get(id);
        if (!u) return null;
        const stored = Array.isArray(t.assignedSupervisors)
          ? (t.assignedSupervisors as any[]).find((s: any) => s.id === id)
          : null;
        return { id: u.uid, name: u.displayName, specialty: stored?.specialty || u.specialty || "general" };
      })
      .filter(Boolean);
    return { ...t, assignedSupervisors: supervisors };
  });
}

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

async function autoSendAbsent(uid: string, ticket: any) {
  try {
    if (!(await shouldAutoSendWA(uid))) return;
    const client = await prisma.client.findUnique({ where: { id: ticket.clientId }, select: { phone: true, name: true } });
    if (!client?.phone) return;
    const msg = await buildAbsentMsg({ ticketId: ticket.ticketId, clientName: client.name, description: ticket.description, villaNumber: ticket.villaNumber });
    await sendWAText(uid, client.phone, msg);
  } catch {}
}

async function autoSendOutOfScope(uid: string, ticket: any) {
  try {
    if (!(await shouldAutoSendWA(uid))) return;
    const client = await prisma.client.findUnique({ where: { id: ticket.clientId }, select: { phone: true, name: true } });
    if (!client?.phone) return;
    const msg = await buildOutOfScopeMsg({ ticketId: ticket.ticketId, clientName: client.name, description: ticket.description, villaNumber: ticket.villaNumber });
    await sendWAText(uid, client.phone, msg);
  } catch {}
}

async function classifyInBackground(description: string, ticketId: string, projectId?: string, keepManualSupervisors?: boolean) {
  try {
    // لا نُعيد تصنيف التذاكر التي لها تصنيف موثوق (من Excel أو مستخدم) — فقط unclassified
    const existing = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { type: true },
    });
    if (existing?.type && existing.type !== "unclassified") return;

    const classification = await classifyTicket(description, projectId);
    if (classification.primaryType === "unclassified") return; // لا نحفظ unclassified من keywords

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

    // حل typeId من قاعدة البيانات
    const typeRecord = classification.typeId
      ? null
      : await prisma.ticketType.findFirst({ where: { key: classification.primaryType }, select: { id: true } });
    const resolvedTypeId = classification.typeId || typeRecord?.id || null;

    const updateData: any = {
      type: classification.primaryType,
      detectedTypes: classification.allTypes,
      typeId: resolvedTypeId,
      subTypeId: classification.subTypeId || null,
    };

    if (!keepManualSupervisors) {
      updateData.assignedSupervisorId = primarySupId;
      updateData.assignedSupervisorIds = supervisorIds;
      updateData.assignedSupervisors = supervisorList.length > 0 ? supervisorList : undefined;
    }

    await prisma.ticket.updateMany({ where: { id: ticketId }, data: updateData });
    invalidateReferenceCache();
    invalidateKeywordCache();
  } catch (err) {
    console.warn(` ⚠️ Background classify failed for ticket ${ticketId}:`, err);
  }
}

// GET /api/tickets
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const role = await getRequesterRole(req.uid!);
  const currentUser = await prisma.user.findUnique({
    where: { uid: req.uid! },
    select: { projects: { select: { id: true } } }
  });
  const userProjectIds = currentUser?.projects.map(p => p.id) || [];

  const { projectId, projectIds, supervisorId, status } = req.query as Record<string, string>;
  const where: any = {};
  if (projectId) where.projectId = projectId;
  if (projectIds) where.projectId = { in: projectIds.split(",") };
  if (supervisorId) where.assignedSupervisorIds = { has: supervisorId };
  if (status) where.status = status;

  if (req.query.includeDirectAppts !== 'true') {
    where.NOT = { description: { startsWith: 'موعد صيانة مجدول يدوياً للمشرف' } };
  }

  if (role !== "admin") {
    // Only allow tickets in user's projects
    if (where.projectId && typeof where.projectId === 'string') {
      if (!userProjectIds.includes(where.projectId)) where.projectId = { in: [] };
    } else if (where.projectId && where.projectId.in) {
      where.projectId.in = where.projectId.in.filter((id: string) => userProjectIds.includes(id));
      if (where.projectId.in.length === 0) where.projectId.in = ["__none__"];
    } else {
      where.projectId = { in: userProjectIds.length ? userProjectIds : ["__none__"] };
    }
  }

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { ticketSubType: { select: { id: true, nameAr: true } } },
  });
  const enriched = await enrichSupervisorNames(tickets);
  res.json(enriched.map(t => ({ ...t, subTypeName: (t as any).ticketSubType?.nameAr ?? null })));
});

// GET /api/tickets/ticketids — للكشف عن المكررات في الاستيراد (خفيف)
router.get("/ticketids", requireAuth, async (req, res) => {
  const { projectId } = req.query as { projectId?: string };
  const where: any = projectId ? { projectId } : {};
  const rows = await prisma.ticket.findMany({
    where,
    select: { ticketId: true, id: true, type: true, status: true, closedAt: true },
  });
  res.json(rows);
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

// POST /api/tickets/:id/special-close  — عدم تواجد أو خارج الاختصاص
router.post("/:id/special-close", requireAuth, async (req: AuthRequest, res) => {
  const { closeType, notes } = req.body as { closeType: 'absent' | 'out_of_scope'; notes?: string };
  if (!['absent', 'out_of_scope'].includes(closeType)) {
    res.status(400).json({ error: "closeType غير صالح" }); return;
  }
  const status = closeType === 'out_of_scope' ? 'out_of_scope' : 'closed';
  try {
    const uid = req.uid!;
    
    // جلب بيانات التذكرة والعميل قبل الإغلاق
    const ticketInfo = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: { client: { select: { phone: true, name: true } } }
    });

    if (!ticketInfo) {
      res.status(404).json({ error: "التذكرة غير موجودة" }); return;
    }

    // محاولة إرسال الرسالة أولاً إذا كانت الخدمة مفعلة
    if (await shouldAutoSendWA(uid)) {
      const phone = ticketInfo.client?.phone;
      if (phone) {
        let msg = '';
        if (closeType === 'absent') {
          msg = await buildAbsentMsg({ ticketId: ticketInfo.ticketId, clientName: ticketInfo.client?.name || '', description: ticketInfo.description || '', villaNumber: ticketInfo.villaNumber || '' });
        } else {
          msg = await buildOutOfScopeMsg({ ticketId: ticketInfo.ticketId, clientName: ticketInfo.client?.name || '', description: ticketInfo.description || '', villaNumber: ticketInfo.villaNumber || '' });
        }
        
        const sendResult = await sendWAText(uid, phone, msg);
        if (!sendResult.sent && sendResult.error === 'NOT_ON_WHATSAPP') {
          res.status(400).json({ error: "تعذر إغلاق التذكرة: رقم العميل غير مسجل في الواتساب. يرجى تصحيح الرقم أو تغيير الحالة يدوياً." });
          return;
        } else if (!sendResult.sent && sendResult.error === 'NOT_CONNECTED') {
          res.status(400).json({ error: "تعذر إغلاق التذكرة: خدمة الواتساب غير متصلة. يرجى توصيل الواتساب أو الإغلاق يدوياً." });
          return;
        }
      } else {
        res.status(400).json({ error: "لا يوجد رقم هاتف مسجل للعميل. يرجى إضافة رقم أو تغيير الحالة يدوياً." });
        return;
      }
    }

    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { status, closureNotes: notes || null, closedAt: closeType === 'out_of_scope' ? new Date() : null },
      select: { id: true, ticketId: true, clientId: true, description: true, villaNumber: true, status: true },
    });
    
    res.json({ ok: true, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const role = await getRequesterRole(req.uid!);
  const currentUser = await prisma.user.findUnique({
    where: { uid: req.uid! },
    select: { projects: { select: { id: true } } }
  });
  const userProjectIds = currentUser?.projects.map(p => p.id) || [];

  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: { ticketSubType: { select: { id: true, nameAr: true } } },
  });
  if (!ticket) { res.status(404).json({ error: "Not found" }); return; }
  
  if (role !== "admin" && ticket.projectId && !userProjectIds.includes(ticket.projectId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [enriched] = await enrichSupervisorNames([ticket]);
  res.json({ ...enriched, subTypeName: (ticket as any).ticketSubType?.nameAr ?? null });
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

    // حل typeId تلقائيًا من key
    const typeKey = data.type || "general";
    const typeRecord = await prisma.ticketType.findFirst({ where: { key: typeKey }, select: { id: true } });

    const ticket = await prisma.ticket.create({
      data: {
        ticketId: data.ticketId || String(Date.now()).slice(-6),
        refNumber: data.refNumber,
        projectAbbr: data.projectAbbr || null,
        projectId, clientId: clientId || null,
        clientName: data.clientName, villaNumber: data.villaNumber,
        issuedAt: data.issuedAt || null,
        description: data.description,
        type: typeKey,
        typeId: data.typeId || typeRecord?.id || null,
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
    // بناءً على طلب المستخدم: تم إيقاف إرسال رسالة الترحيب التلقائية عند إنشاء التذكرة
    // if (senderUid) autoSendOpening(senderUid, ticket).catch(() => {});

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
    // جلب خريطة typeId مرة واحدة لكل الطلب
    const allTicketTypes = await prisma.ticketType.findMany({ select: { id: true, key: true } });
    const typeIdMap = new Map(allTicketTypes.map(t => [t.key, t.id]));

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
        typeId:   (t.typeId   && typeof t.typeId   === 'string' && t.typeId.length > 0) ? t.typeId   : (typeIdMap.get(t.type) || null),
        subTypeId:(t.subTypeId && typeof t.subTypeId === 'string' && t.subTypeId.length > 0) ? t.subTypeId : null,
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
        type: t.type, typeId: t.typeId, subTypeId: t.subTypeId,
        status: t.status, priority: t.priority,
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
        select: { id: true, description: true, projectId: true, type: true },
        take: tickets.length,
      });

      // نصنف في الخلفية فقط التذاكر غير المصنفة — نحمي تصنيف Excel
      for (const t of createdTickets) {
        if (t.type !== "unclassified") continue;
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
    // ── Build base update payload ──────────────────────────────────────────
    const updatePayload: Record<string, any> = {
      status:               data.status               ?? undefined,
      priority:             data.priority !== undefined ? Number(data.priority) : undefined,
      assigneeName:         data.assigneeName         ?? undefined,
      assignedSupervisorId: data.assignedSupervisorId !== undefined
        ? (data.assignedSupervisorId && String(data.assignedSupervisorId).trim() ? data.assignedSupervisorId : null)
        : undefined,
      assignedSupervisorIds: data.assignedSupervisorIds
        ? (data.assignedSupervisorIds as string[]).filter((id: string) => id && id.trim())
        : undefined,
      assignedSupervisors:  data.assignedSupervisors  ?? undefined,
      appointmentTime:      data.appointmentTime      ?? undefined,
      appointmentNotes:     data.appointmentNotes     ?? undefined,
      closureNotes:         data.closureNotes         ?? undefined,
      maintenanceItems:     data.maintenanceItems     ?? undefined,
      closedAt:             data.closedAt !== undefined ? (data.closedAt ? new Date(data.closedAt) : null) : undefined,
      description:          data.description          ?? undefined,
      type:                 data.type                 ?? undefined,
      detectedTypes:        data.detectedTypes        ?? undefined,
      clientId:             data.clientId             ?? undefined,
      clientName:           data.clientName           ?? undefined,
      villaNumber:          data.villaNumber          ?? undefined,
    };

    // ── Auto-reassign supervisor when classification changes ───────────────
    // Only when type/detectedTypes are being updated AND no explicit supervisor override
    const typeChanged = data.type !== undefined || data.detectedTypes !== undefined;
    const supervisorExplicit = data.assignedSupervisorId !== undefined;

    if (typeChanged && !supervisorExplicit) {
      // Get the ticket's projectId (need the current record)
      const existing = await prisma.ticket.findUnique({
        where: { id: req.params.id },
        select: { projectId: true, type: true },
      });

      const newTypes: string[] = data.detectedTypes?.length
        ? data.detectedTypes
        : data.type && data.type !== "unclassified"
          ? [data.type]
          : [];

      if (existing?.projectId && newTypes.length > 0) {
        try {
          const typeToSpecialty = await buildTypeToSpecialtyMap();
          const specialties     = [...new Set(newTypes.map((t) => typeToSpecialty[t] || "general"))];
          const supervisors     = await findSupervisorsDB(existing.projectId, specialties);

          if (supervisors.length > 0) {
            updatePayload.assignedSupervisorId  = supervisors[0].id;
            updatePayload.assignedSupervisorIds = supervisors.map((s) => s.id);
            updatePayload.assignedSupervisors   = supervisors.map((s) => ({
              id: s.id, name: s.name, specialty: s.specialties[0] || "general",
            }));
          }
        } catch { /* non-fatal — keep old supervisor */ }
      }
    }

    // ── Fetch old values for audit trail ────────────────────────────────────
    const oldTicket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      select: { status: true, type: true, assignedSupervisorId: true, appointmentTime: true, priority: true },
    });

    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data:  updatePayload,
    });

    // ── Log audit entries ────────────────────────────────────────────────────
    if (req.uid && oldTicket) {
      const AUDIT_FIELDS: Record<string, string> = {
        status: 'الحالة', type: 'التصنيف',
        assignedSupervisorId: 'المشرف', appointmentTime: 'الموعد', priority: 'الأولوية',
      };
      const auditRows: { ticketId: string; field: string; oldValue: string | null; newValue: string | null; changedBy: string }[] = [];
      for (const [key, label] of Object.entries(AUDIT_FIELDS)) {
        const oldVal = String((oldTicket as any)[key] ?? '');
        const newVal = String((updatePayload as any)[key] ?? (oldTicket as any)[key] ?? '');
        if (updatePayload[key] !== undefined && oldVal !== newVal) {
          auditRows.push({ ticketId: ticket.id, field: label, oldValue: oldVal || null, newValue: newVal || null, changedBy: req.uid });
        }
      }
      if (auditRows.length > 0) {
        prisma.ticketAudit.createMany({ data: auditRows }).catch(() => {});
      }
    }

    const closingStatuses = ['closed', 'completed'];
    if (data.status && closingStatuses.includes(data.status) && req.uid) {
      // autoSendClosing(req.uid, ticket).catch(() => {});
    }

    // ── إشعار المشرفين الآخرين عند تحديد موعد ──────────────────────────────
    const apptChanged = data.appointmentTime !== undefined &&
      data.appointmentTime !== (oldTicket as any)?.appointmentTime;

    if (apptChanged && data.appointmentTime && ticket.assignedSupervisorIds?.length) {
      const senderUid = req.uid!;
      const io = getIO();

      // جلب اسم المشرف المُرسِل
      const sender = await prisma.user.findUnique({
        where: { uid: senderUid },
        select: { displayName: true },
      }).catch(() => null);

      // إرسال إشعار Socket.io لكل مشرف في التذكرة (بما فيهم المُرسِل — لعرضه في واجهته)
      for (const supId of ticket.assignedSupervisorIds) {
        io.emit(`notification:supervisor:${supId}`, {
          type: 'appointment_set',
          ticketId: ticket.id,
          ticketRef: ticket.ticketId,
          clientName: ticket.clientName,
          villaNumber: ticket.villaNumber,
          appointmentTime: data.appointmentTime,
          setBy: sender?.displayName || 'مشرف',
          setByUid: senderUid,
          isShared: ticket.assignedSupervisorIds.length > 1,
        });
      }
    }

    res.json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/tickets/bulk-status
router.patch("/bulk-status", requireAuth, async (req, res) => {
  const { ids, status } = req.body as { ids: string[]; status: any };
  await prisma.ticket.updateMany({ where: { id: { in: ids } }, data: { status } });
  res.json({ count: ids.length });
});

// POST /api/tickets/bulk-update-imported
router.post("/bulk-update-imported", requireAuth, async (req, res) => {
  const { updates } = req.body as {
    updates: { id: string; status: any; closedAt?: string | null; type?: string; detectedTypes?: string[] }[]
  };
  if (!Array.isArray(updates)) { res.status(400).json({ error: "updates must be array" }); return; }
  try {
    // جلب typeId map مرة واحدة
    const allTypes = await prisma.ticketType.findMany({ select: { id: true, key: true } });
    const typeIdMap = new Map(allTypes.map(t => [t.key, t.id]));

    const updatePromises = updates.map(u =>
      prisma.ticket.update({
        where: { id: u.id },
        data: {
          status:        u.status,
          closedAt:      u.closedAt ? new Date(u.closedAt) : null,
          ...(u.type && u.type !== 'unclassified' ? {
            type:          u.type,
            typeId:        typeIdMap.get(u.type) || null,
            detectedTypes: u.detectedTypes ?? [u.type],
          } : {}),
        },
      })
    );
    await Promise.all(updatePromises);
    res.json({ count: updates.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/tickets/import-log — تسجيل نتائج كل عملية استيراد
router.post("/import-log", requireAuth, async (req, res) => {
  try {
    const log = req.body;
    const logEntry = {
      ...log,
      savedAt: new Date().toISOString(),
    };
    // حفظ في SystemSetting (آخر 50 استيراد)
    const existing = await prisma.systemSetting.findUnique({ where: { key: 'importHistory' } });
    const history: any[] = (existing?.value as any[]) || [];
    history.unshift(logEntry);
    const trimmed = history.slice(0, 50);
    await prisma.systemSetting.upsert({
      where: { key: 'importHistory' },
      create: { key: 'importHistory', value: trimmed },
      update: { value: trimmed },
    });
    // طباعة في اللوج للمتابعة الفورية
    console.log(
      `[Import] ${logEntry.project} | ` +
      `ملف: ${logEntry.fileRows} صف (${logEntry.uniqueInFile} فريد) | ` +
      `جديد: ${logEntry.newTickets} | ` +
      `موجود: ${logEntry.duplicatesFound} (تحديث حالة: ${logEntry.statusUpdates}, تصنيف: ${logEntry.typeUpdates}, بدون تغيير: ${logEntry.unchangedDuplicates}) | ` +
      `${logEntry.timestamp}`
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  await prisma.ticket.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// DELETE /api/tickets (all)
router.delete("/", requireAuth, requireAdmin, async (_req, res) => {
  const result = await prisma.ticket.deleteMany();
  res.json({ count: result.count });
});

export default router;