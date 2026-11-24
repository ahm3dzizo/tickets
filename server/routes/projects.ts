import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth, requireAdmin, getRequesterRole } from "../auth.js";
import { addOneWarrantyYear, parseWarrantyDate } from "../services/warranty-import.js";

const router = Router();

function parseCoords(input: any): { lat: number; lng: number } | null {
  if (!input) return null;
  const str = String(input).trim();
  const match = str.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
  }
  return null;
}

// GET /api/projects
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const role = await getRequesterRole(req.uid!);
  const where = role === "admin" ? {} : { users: { some: { uid: req.uid! } } };
  const projects = await prisma.project.findMany({ 
    where,
    include: { users: true },
    orderBy: { createdAt: "desc" } 
  });
  const mapped = projects.map(p => ({
    ...p,
    engineerIds: p.users.filter(u => u.role === "engineer").map(u => u.uid),
    supervisorIds: p.users.filter(u => u.role === "supervisor").map(u => u.uid),
    users: undefined
  }));
  res.json(mapped);
});

// ── GET /api/projects/:id/supervisors ──────────────────────────────────────────
router.get("/:id/supervisors", requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getRequesterRole(req.uid!);
    const where: any = { id: req.params.id };
    if (role !== "admin") {
      where.users = { some: { uid: req.uid! } };
    }

    const project = await prisma.project.findFirst({
      where,
      include: { 
        users: { 
          where: { role: "supervisor", disabled: false },
          select: { uid: true, displayName: true, specialtiesRef: true }
        } 
      },
    });
    if (!project) {
      res.status(404).json({ error: "المشروع غير موجود" });
      return;
    }

    const result = project.users.map((s: any) => ({
      id:          s.uid,
      uid:         s.uid,         // للتوافق مع TicketDetail
      name:        s.displayName,
      displayName: s.displayName, // للتوافق مع TicketDetail
      specialties: s.specialtiesRef?.length > 0 ? s.specialtiesRef.map((ref:any)=>ref.key) : [],
    }));

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:id
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const role = await getRequesterRole(req.uid!);
  const where: any = { id: req.params.id };
  if (role !== "admin") {
    where.users = { some: { uid: req.uid! } };
  }

  const project = await prisma.project.findFirst({
    where,
    include: { users: true },
  });
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  const mapped = {
    ...project,
    engineerIds: project.users.filter(u => u.role === "engineer").map(u => u.uid),
    supervisorIds: project.users.filter(u => u.role === "supervisor").map(u => u.uid),
    users: undefined
  };
  res.json(mapped);
});

// POST /api/projects
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const role = await getRequesterRole(req.uid!);
  if (role !== "admin" && role !== "engineer") {
    res.status(403).json({ error: "غير مسموح لك بإنشاء مشروع" });
    return;
  }

  const data = req.body;
  // Both admins and engineers may assign engineers and supervisors when creating
  // a project. Editing existing projects remains admin-only below.
  const combinedUserIds = [...new Set([
    ...(Array.isArray(data.engineerIds) ? data.engineerIds : []),
    ...(Array.isArray(data.supervisorIds) ? data.supervisorIds : []),
  ])];
  
  let officeLat = data.officeLat !== undefined ? (data.officeLat ? parseFloat(data.officeLat) : null) : null;
  let officeLng = data.officeLng !== undefined ? (data.officeLng ? parseFloat(data.officeLng) : null) : null;
  
  if (data.googleMapsUrl) {
    const coords = parseCoords(data.googleMapsUrl);
    if (coords) {
      officeLat = coords.lat;
      officeLng = coords.lng;
    }
  }

  const project = await prisma.project.create({
    data: {
      name:          data.name,
      location:      data.location,
      abbreviation:  data.abbreviation,
      officeLat,
      officeLng,
      officeAddress: data.officeAddress || null,
      googleMapsUrl: data.googleMapsUrl || null,
      users: { connect: combinedUserIds.map(uid => ({ uid })) },
    },
    include: { users: true }
  });
  
  const mapped = {
    ...project,
    engineerIds: project.users.filter(u => u.role === "engineer").map(u => u.uid),
    supervisorIds: project.users.filter(u => u.role === "supervisor").map(u => u.uid),
    users: undefined
  };
  res.status(201).json(mapped);
});

// PUT /api/projects/:id
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const data = req.body;
  const connectData: any = {};
  
  if (data.engineerIds !== undefined || data.supervisorIds !== undefined) {
    const existing = await prisma.project.findUnique({ where: { id: req.params.id }, include: { users: true } });
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    
    const existingEngineers = existing.users.filter(u=>u.role==="engineer").map(u=>u.uid);
    const existingSupervisors = existing.users.filter(u=>u.role==="supervisor").map(u=>u.uid);
    
    const newEng = data.engineerIds !== undefined ? data.engineerIds : existingEngineers;
    const newSup = data.supervisorIds !== undefined ? data.supervisorIds : existingSupervisors;
    
    const combined = [...newEng, ...newSup];
    connectData.users = { set: combined.map(uid => ({ uid })) };
  }

  let officeLat = data.officeLat !== undefined ? (data.officeLat ? parseFloat(data.officeLat) : null) : undefined;
  let officeLng = data.officeLng !== undefined ? (data.officeLng ? parseFloat(data.officeLng) : null) : undefined;

  if (data.googleMapsUrl) {
    const coords = parseCoords(data.googleMapsUrl);
    if (coords) {
      officeLat = coords.lat;
      officeLng = coords.lng;
    }
  }

  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      name:          data.name          ?? undefined,
      location:      data.location      ?? undefined,
      abbreviation:  data.abbreviation  ?? undefined,
      officeLat,
      officeLng,
      officeAddress: data.officeAddress ?? undefined,
      googleMapsUrl: data.googleMapsUrl !== undefined ? (data.googleMapsUrl || null) : undefined,
      ...connectData
    },
    include: { users: true }
  });
  
  const mapped = {
    ...project,
    engineerIds: project.users.filter(u => u.role === "engineer").map(u => u.uid),
    supervisorIds: project.users.filter(u => u.role === "supervisor").map(u => u.uid),
    users: undefined
  };
  res.json(mapped);
});

// DELETE /api/projects/:id
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// GET /api/projects/:id/blocks
router.get("/:id/blocks", requireAuth, async (req: AuthRequest, res) => {
  try {
    const blocks = await prisma.block.findMany({
      where: { projectId: req.params.id },
      orderBy: { blockNumber: 'asc' }
    });
    res.json(blocks);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:id/units
router.get("/:id/units", requireAuth, async (req: AuthRequest, res) => {
  try {
    const units = await prisma.unit.findMany({
      where: { projectId: req.params.id },
      orderBy: { unitNumber: 'asc' }
    });
    res.json(units);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/unit-details/:id
router.get("/unit-details/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const unit = await prisma.unit.findUnique({
      where: { id: req.params.id },
      include: {
        block: true,
        project: true,
        clients: { include: { client: true } },
        contractorAssignments: { include: { contractor: true } }
      }
    });
    if (!unit) { res.status(404).json({ error: "Unit not found" }); return; }
    
    // اجلب المقاولين المخصصين للبلوك بالكامل (غير مخصصين لوحدة بعينها)
    if (unit.blockId) {
      const blockAssignments = await prisma.contractorAssignment.findMany({
        where: { blockId: unit.blockId, unitId: null },
        include: { contractor: true }
      });
      // دمج المقاولين وتجنب التكرار بنفس التخصص والمقاول (إن وجد)
      const existing = new Set(unit.contractorAssignments.map((a: any) => `${a.contractorId}-${a.specialtyKey}`));
      for (const a of blockAssignments) {
        if (!existing.has(`${a.contractorId}-${a.specialtyKey}`)) {
          unit.contractorAssignments.push(a as any);
        }
      }
    }

    res.json(unit);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


/**
 * Import project structure and optional owners in one atomic operation.
 * A unit may have zero or one owner; a client may own multiple units.
 */
router.post("/:id/import-structure", requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getRequesterRole(req.uid!);
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, ...(role === "admin" ? {} : { users: { some: { uid: req.uid! } } }) },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ error: "المشروع غير موجود أو غير مسموح لك باستيراد بياناته" });
      return;
    }

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length || rows.length > 10000) {
      res.status(422).json({ error: "ملف الاستيراد فارغ أو يتجاوز الحد المسموح (10000 صف)" });
      return;
    }

    const normalized = rows.map((row: any, index: number) => ({
      rowNumber: index + 2,
      unitNumber: String(row?.unitNumber ?? "").trim(),
      blockNumber: String(row?.blockNumber ?? "").trim(),
      name: String(row?.name ?? "").trim(),
      phone: String(row?.phone ?? "").trim(),
      handoverDate: row?.handoverDate ?? "",
      warrantyExpiryDate: row?.warrantyExpiryDate ?? "",
    }));
    const errors: string[] = [];
    const seenUnits = new Set<string>();
    normalized.forEach(row => {
      if (!row.unitNumber) errors.push(`الصف ${row.rowNumber}: رقم الوحدة مطلوب`);
      if (row.name && !row.phone) errors.push(`الصف ${row.rowNumber}: رقم الجوال مطلوب عند إدخال اسم العميل`);
      if (row.phone && !row.name) errors.push(`الصف ${row.rowNumber}: اسم العميل مطلوب عند إدخال رقم الجوال`);
      if (row.handoverDate && !parseWarrantyDate(row.handoverDate)) errors.push(`الصف ${row.rowNumber}: تاريخ التسليم غير صالح`);
      if (row.warrantyExpiryDate && !parseWarrantyDate(row.warrantyExpiryDate)) errors.push(`الصف ${row.rowNumber}: تاريخ انتهاء الضمان غير صالح`);
      if (row.unitNumber) {
        const key = row.unitNumber.toLocaleLowerCase();
        if (seenUnits.has(key)) errors.push(`الصف ${row.rowNumber}: رقم الوحدة مكرر داخل الملف (${row.unitNumber})`);
        seenUnits.add(key);
      }
    });
    if (errors.length) {
      res.status(422).json({ error: "توجد أخطاء في الملف؛ لم يتم حفظ أي بيانات", errors: errors.slice(0, 200) });
      return;
    }

    const result = await prisma.$transaction(async tx => {
      let blocksCreated = 0, unitsCreated = 0, clientsLinked = 0;
      const blockCache = new Map<string, string>();
      for (const row of normalized) {
        let blockId: string | null = null;
        if (row.blockNumber) {
          const blockKey = row.blockNumber.toLocaleLowerCase();
          blockId = blockCache.get(blockKey) || null;
          if (!blockId) {
            const existingBlock = await tx.block.findUnique({
              where: { projectId_blockNumber: { projectId: project.id, blockNumber: row.blockNumber } },
              select: { id: true },
            });
            const block = existingBlock || await tx.block.create({
              data: { projectId: project.id, blockNumber: row.blockNumber },
              select: { id: true },
            });
            if (!existingBlock) blocksCreated++;
            blockId = block.id;
            blockCache.set(blockKey, blockId);
          }
        }

        const existingUnit = await tx.unit.findUnique({
          where: { projectId_unitNumber: { projectId: project.id, unitNumber: row.unitNumber } },
          include: { clients: { select: { clientId: true } } },
        });
        let unit;
        if (existingUnit) {
          if (row.blockNumber && existingUnit.blockId && existingUnit.blockId !== blockId) {
            throw new Error(`الوحدة ${row.unitNumber} مرتبطة ببلوك مختلف بالفعل`);
          }
          unit = await tx.unit.update({
            where: { id: existingUnit.id },
            data: {
              ...(blockId ? { blockId } : {}),
              ...(row.handoverDate ? { handoverDate: parseWarrantyDate(row.handoverDate)! } : {}),
              ...(row.warrantyExpiryDate
                ? { warrantyExpiryDate: parseWarrantyDate(row.warrantyExpiryDate)! }
                : row.handoverDate ? { warrantyExpiryDate: addOneWarrantyYear(parseWarrantyDate(row.handoverDate)!) } : {}),
            },
          });
        } else {
          unit = await tx.unit.create({
            data: {
              projectId: project.id,
              unitNumber: row.unitNumber,
              ...(blockId ? { blockId } : {}),
              ...(row.handoverDate ? { handoverDate: parseWarrantyDate(row.handoverDate)! } : {}),
              ...(row.warrantyExpiryDate
                ? { warrantyExpiryDate: parseWarrantyDate(row.warrantyExpiryDate)! }
                : row.handoverDate ? { warrantyExpiryDate: addOneWarrantyYear(parseWarrantyDate(row.handoverDate)!) } : {}),
            },
          });
          unitsCreated++;
        }

        if (row.phone && row.name) {
          const client = await tx.client.upsert({
            where: { phone: row.phone },
            create: { name: row.name, phone: row.phone },
            update: { name: row.name },
          });
          const owners = existingUnit?.clients || [];
          if (owners.length > 1 || owners.some(owner => owner.clientId !== client.id)) {
            throw new Error("الوحدة " + row.unitNumber + " مرتبطة بعميل آخر بالفعل؛ لم يتم استيراد الملف");
          }
          await tx.clientUnit.upsert({
            where: { clientId_unitId: { clientId: client.id, unitId: unit.id } },
            create: { clientId: client.id, unitId: unit.id, isPrimary: true },
            update: {},
          });
          clientsLinked++;
        }
      }
      return { blocksCreated, unitsCreated, clientsLinked, rows: normalized.length };
    });

    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Project Structure Import]", error);
    res.status(422).json({ error: error?.message || "فشل استيراد بيانات المشروع؛ لم يتم حفظ أي بيانات" });
  }
});

export default router;