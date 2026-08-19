import { Router } from "express";
import prisma from "../db.js";
import { requireAuth, AuthRequest, getRequesterRole } from "../auth.js";

const router = Router();

// GET /api/clients
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const role = await getRequesterRole(req.uid!);
  const currentUser = await prisma.user.findUnique({
    where: { uid: req.uid! },
    select: { projects: { select: { id: true } } }
  });
  const projectIds = currentUser?.projects.map(p => p.id) || [];

  const where = role === "admin" ? {} : {
    units: { some: { unit: { projectId: { in: projectIds } } } }
  };

  const clients = await prisma.client.findMany({ 
    where,
    orderBy: { createdAt: "asc" },
    include: {
      units: { include: { unit: { include: { block: true, project: true } } } }
    }
  });
  
  const formatted = clients.map(c => {
    const primaryUnit = c.units.find(u => u.isPrimary)?.unit || c.units[0]?.unit;
    return {
      ...c,
      unitId:      primaryUnit?.id         || null,
      projectId:   primaryUnit?.projectId  || null,
      projectName: primaryUnit?.project?.name || null,
      projectCode: primaryUnit?.project?.abbreviation || null,
      villaNumber: primaryUnit?.unitNumber  || null,
      blockNumber: primaryUnit?.block?.blockNumber || null,
      handoverDate: primaryUnit?.handoverDate || null,
      warrantyExpiryDate: primaryUnit?.warrantyExpiryDate || null,
    };
  });

  res.json(formatted);
});

// GET /api/clients/:id
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const role = await getRequesterRole(req.uid!);
  const currentUser = await prisma.user.findUnique({
    where: { uid: req.uid! },
    select: { projects: { select: { id: true } } }
  });
  const projectIds = currentUser?.projects.map(p => p.id) || [];

  const where: any = { id: req.params.id };
  if (role !== "admin") {
    where.units = { some: { unit: { projectId: { in: projectIds } } } };
  }

  const client = await prisma.client.findFirst({
    where,
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
      units: { include: { unit: { include: { block: true, project: true } } } }
    }
  });

  const formatted = clients.map(c => {
    const primaryUnit = c.units.find(u => u.isPrimary)?.unit || c.units[0]?.unit;
    return {
      ...c,
      unitId:      primaryUnit?.id         || null,
      projectId:   primaryUnit?.projectId  || null,
      projectName: primaryUnit?.project?.name || null,
      projectCode: primaryUnit?.project?.abbreviation || null,
      villaNumber: primaryUnit?.unitNumber  || null,
      blockNumber: primaryUnit?.block?.blockNumber || null,
      handoverDate: primaryUnit?.handoverDate || null,
      warrantyExpiryDate: primaryUnit?.warrantyExpiryDate || null,
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
  try {
    const data = req.body;
    const { name, phone, villaNumber, blockNumber, handoverDate, warrantyExpiryDate } = data;

    // Update client name/phone
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        name: name ?? undefined,
        phone: phone ?? undefined,
      },
    });

    // Sync clientName on all tickets belonging to this client
    if (name !== undefined) {
      await prisma.ticket.updateMany({
        where: { clientId: req.params.id },
        data: { clientName: name },
      });
    }

    // Update the primary unit if unit fields are provided
    if (villaNumber !== undefined || blockNumber !== undefined || handoverDate !== undefined || warrantyExpiryDate !== undefined) {
      const clientUnit = await prisma.clientUnit.findFirst({
        where: { clientId: req.params.id, isPrimary: true },
        include: { unit: { include: { block: true } } },
      });

      if (clientUnit) {
        const unitId = clientUnit.unitId;

        // Resolve blockId if blockNumber changed
        let blockId: string | null | undefined = undefined;
        if (blockNumber !== undefined) {
          if (!blockNumber || blockNumber === '') {
            blockId = null;
          } else {
            const projectId = clientUnit.unit.projectId;
            const block = await prisma.block.upsert({
              where: { projectId_blockNumber: { projectId, blockNumber: String(blockNumber) } },
              create: { projectId, blockNumber: String(blockNumber) },
              update: {},
            });
            blockId = block.id;
          }
        }

        await prisma.unit.update({
          where: { id: unitId },
          data: {
            ...(villaNumber !== undefined ? { unitNumber: String(villaNumber) } : {}),
            ...(blockId !== undefined ? { blockId } : {}),
            ...(handoverDate !== undefined ? { handoverDate: handoverDate || null } : {}),
            ...(warrantyExpiryDate !== undefined ? { warrantyExpiryDate: warrantyExpiryDate || null } : {}),
          },
        });
      }
    }

    res.json(client);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/clients/:id
router.delete("/:id", requireAuth, async (req, res) => {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
