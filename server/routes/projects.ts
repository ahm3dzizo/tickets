import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

// GET /api/projects
router.get("/", requireAuth, async (_req, res) => {
  const projects = await prisma.project.findMany({ 
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
router.get("/:id/supervisors", requireAuth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { 
        users: { 
          where: { role: "supervisor", disabled: false },
          select: { uid: true, displayName: true, specialtiesRef: true, specialty: true } 
        } 
      },
    });
    if (!project) {
      res.status(404).json({ error: "المشروع غير موجود" });
      return;
    }

    const result = project.users.map((s: any) => ({
      id:          s.uid,
      name:        s.displayName,
      specialties: s.specialtiesRef?.length > 0 ? s.specialtiesRef.map((ref:any)=>ref.key) : (s.specialty ? [s.specialty] : []),
    }));

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:id
router.get("/:id", requireAuth, async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: { clients: true, users: true },
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
router.post("/", requireAuth, async (req, res) => {
  const data = req.body;
  const combinedUserIds = [...(data.engineerIds || []), ...(data.supervisorIds || [])];
  
  const project = await prisma.project.create({
    data: {
      name:         data.name,
      location:     data.location,
      abbreviation: data.abbreviation,
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
router.put("/:id", requireAuth, async (req, res) => {
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

  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      name:          data.name          ?? undefined,
      location:      data.location      ?? undefined,
      abbreviation:  data.abbreviation  ?? undefined,
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
router.delete("/:id", requireAuth, async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;