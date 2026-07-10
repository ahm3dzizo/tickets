import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

// GET /api/clients
router.get("/", requireAuth, async (_req, res) => {
  const clients = await prisma.client.findMany({ 
    orderBy: { createdAt: "asc" },
    include: {
      units: { include: { unit: { include: { block: true } } } }
    }
  });
  
  const formatted = clients.map(c => {
    const primaryUnit = c.units.find(u => u.isPrimary)?.unit || c.units[0]?.unit;
    return {
      ...c,
      projectId: primaryUnit?.projectId || null,
      villaNumber: primaryUnit?.villaNumber || null,
      blockNumber: primaryUnit?.block?.blockNumber || null,
    };
  });
  
  res.json(formatted);
});

// GET /api/clients/:id
router.get("/:id", requireAuth, async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      units: { include: { unit: { include: { block: true, project: true } } } },
    }
  });
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  res.json(client);
});

// GET /api/projects/:projectId/clients
router.get("/by-project/:projectId", requireAuth, async (req, res) => {
  const clients = await prisma.client.findMany({
    where: { units: { some: { unit: { projectId: req.params.projectId } } } },
    orderBy: { name: "asc" },
    include: {
      units: { include: { unit: { include: { block: true } } } }
    }
  });

  const formatted = clients.map(c => {
    const primaryUnit = c.units.find(u => u.isPrimary)?.unit || c.units[0]?.unit;
    return {
      ...c,
      projectId: primaryUnit?.projectId || null,
      villaNumber: primaryUnit?.villaNumber || null,
      blockNumber: primaryUnit?.block?.blockNumber || null,
    };
  });
  
  res.json(formatted);
});

// POST /api/projects/:projectId/clients
router.post("/by-project/:projectId", requireAuth, async (req, res) => {
  // In new schema, creating a client directly tied to a project via this endpoint 
  // might just create the client. To link to a unit, use the units API.
  const data = req.body;
  const client = await prisma.client.create({
    data: {
      name: data.name,
      phone: data.phone,
    },
  });
  res.status(201).json(client);
});

// PUT /api/clients/:id
router.put("/:id", requireAuth, async (req, res) => {
  const data = req.body;
  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      name: data.name ?? undefined,
      phone: data.phone ?? undefined,
    },
  });
  res.json(client);
});

// DELETE /api/clients/:id
router.delete("/:id", requireAuth, async (req, res) => {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
