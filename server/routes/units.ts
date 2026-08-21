import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

// ── GET /api/units/:id ────────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const unit = await prisma.unit.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
        block: true,
        clients: { include: { client: true } },
        contractorAssignments: { include: { contractor: true } },
      },
    });
    if (!unit) { res.status(404).json({ error: "الوحدة غير موجودة" }); return; }
    res.json(unit);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/units/:id ────────────────────────────────────────────────────────
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { unitNumber, blockNumber, handoverDate, warrantyExpiryDate } = req.body;

    const existing = await prisma.unit.findUnique({ where: { id: req.params.id } });
    if (!existing) { res.status(404).json({ error: "الوحدة غير موجودة" }); return; }

    let blockId: string | null | undefined = undefined;
    if (blockNumber !== undefined) {
      if (!blockNumber || blockNumber === "") {
        blockId = null;
      } else {
        const block = await prisma.block.upsert({
          where: { projectId_blockNumber: { projectId: existing.projectId, blockNumber: String(blockNumber) } },
          create: { projectId: existing.projectId, blockNumber: String(blockNumber) },
          update: {},
        });
        blockId = block.id;
      }
    }

    const unit = await prisma.unit.update({
      where: { id: req.params.id },
      data: {
        ...(unitNumber !== undefined && { unitNumber: String(unitNumber) }),
        ...(blockId !== undefined && { blockId }),
        ...(handoverDate !== undefined && { handoverDate: handoverDate || null }),
        ...(warrantyExpiryDate !== undefined && { warrantyExpiryDate: warrantyExpiryDate || null }),
      },
      include: { project: true, block: true, clients: { include: { client: true } } },
    });

    // Keep villaNumber in sync on tickets
    if (unitNumber !== undefined) {
      await prisma.ticket.updateMany({
        where: { unitId: req.params.id },
        data: { villaNumber: String(unitNumber) },
      });
    }

    res.json(unit);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/units/:id ─────────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const ticketCount = await prisma.ticket.count({ where: { unitId: req.params.id } });
    if (ticketCount > 0) {
      res.status(400).json({ error: `لا يمكن حذف الوحدة — تحتوي على ${ticketCount} تذكرة` });
      return;
    }
    await prisma.unit.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/units/:id/clients ───────────────────────────────────────────────
// Link an existing client (by clientId or phone) to this unit.
// Body: { clientId } OR { name, phone }
router.post("/:id/clients", requireAuth, async (req, res) => {
  try {
    const { clientId, name, phone, isPrimary = false } = req.body;

    const unit = await prisma.unit.findUnique({ where: { id: req.params.id } });
    if (!unit) { res.status(404).json({ error: "الوحدة غير موجودة" }); return; }

    let resolvedClientId = clientId as string | undefined;

    if (!resolvedClientId && phone) {
      const trimPhone = String(phone).trim();
      const client = await prisma.client.upsert({
        where: { phone: trimPhone },
        create: { name: name?.trim() || trimPhone, phone: trimPhone },
        update: name ? { name: name.trim() } : {},
      });
      resolvedClientId = client.id;
    }

    if (!resolvedClientId) {
      res.status(400).json({ error: "clientId أو phone مطلوب" });
      return;
    }

    const link = await prisma.clientUnit.upsert({
      where: { clientId_unitId: { clientId: resolvedClientId, unitId: req.params.id } },
      create: { clientId: resolvedClientId, unitId: req.params.id, isPrimary: Boolean(isPrimary) },
      update: { isPrimary: Boolean(isPrimary) },
      include: { client: true },
    });

    res.status(201).json(link);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/units/:id/clients/:clientId ───────────────────────────────────
router.delete("/:id/clients/:clientId", requireAuth, async (req, res) => {
  try {
    await prisma.clientUnit.deleteMany({
      where: { unitId: req.params.id, clientId: req.params.clientId },
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
