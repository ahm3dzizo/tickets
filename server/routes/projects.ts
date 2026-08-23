import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth, requireAdmin, getRequesterRole } from "../auth.js";

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
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const data = req.body;
  const combinedUserIds = [...(data.engineerIds || []), ...(data.supervisorIds || [])];
  
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

export default router;