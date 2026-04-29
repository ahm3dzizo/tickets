import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

// GET /api/projects
router.get("/", requireAuth, async (_req, res) => {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  res.json(projects);
});

// GET /api/projects/:id
router.get("/:id", requireAuth, async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: { clients: true },
  });
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  res.json(project);
});

// POST /api/projects
router.post("/", requireAuth, async (req, res) => {
  const data = req.body;
  const project = await prisma.project.create({
    data: {
      name: data.name,
      location: data.location,
      abbreviation: data.abbreviation,
      engineerIds: data.engineerIds || [],
      supervisorIds: data.supervisorIds || [],
    },
  });
  res.status(201).json(project);
});

// PUT /api/projects/:id
router.put("/:id", requireAuth, async (req, res) => {
  const data = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      name: data.name ?? undefined,
      location: data.location ?? undefined,
      abbreviation: data.abbreviation ?? undefined,
      engineerIds: data.engineerIds ?? undefined,
      supervisorIds: data.supervisorIds ?? undefined,
    },
  });
  res.json(project);
});

// DELETE /api/projects/:id
router.delete("/:id", requireAuth, async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
