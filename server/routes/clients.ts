import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

// GET /api/clients
router.get("/", requireAuth, async (_req, res) => {
  const clients = await prisma.client.findMany({ orderBy: { createdAt: "asc" } });
  res.json(clients);
});

// GET /api/projects/:projectId/clients
router.get("/by-project/:projectId", requireAuth, async (req, res) => {
  const clients = await prisma.client.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { name: "asc" },
  });
  res.json(clients);
});

// POST /api/projects/:projectId/clients
router.post("/by-project/:projectId", requireAuth, async (req, res) => {
  const data = req.body;
  const client = await prisma.client.create({
    data: {
      projectId: req.params.projectId,
      name: data.name,
      phone: data.phone,
      villaNumber: data.villaNumber,
      blockNumber: data.blockNumber || null,
      handoverDate: data.handoverDate || null,
      warrantyExpiryDate: data.warrantyExpiryDate || null,
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
      villaNumber: data.villaNumber ?? undefined,
      blockNumber: data.blockNumber ?? undefined,
      handoverDate: data.handoverDate ?? undefined,
      warrantyExpiryDate: data.warrantyExpiryDate ?? undefined,
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
