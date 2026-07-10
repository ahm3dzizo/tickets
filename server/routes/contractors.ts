import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth } from "../auth.js";

const router = Router();

// GET /api/contractors?projectId=X
// Returns contractors that have at least one assignment in the given project
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.query;

    const contractors = await prisma.contractor.findMany({
      where: projectId
        ? { assignments: { some: { projectId: String(projectId) } } }
        : undefined,
      include: {
        specialties: true,
        assignments: {
          where: projectId ? { projectId: String(projectId) } : undefined,
          include: { block: true, unit: true }
        },
      },
      orderBy: { name: "asc" },
    });
    res.json(contractors);
  } catch (err: any) {
    console.error("[contractors] GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contractors/suggest?villaNumber=X&specialtyKey=Y&projectId=Z
router.get("/suggest", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { villaNumber, specialtyKey, projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    let matchedContractors = new Map();

    if (villaNumber) {
      const unit = await prisma.unit.findUnique({
        where: { projectId_unitNumber: { projectId: String(projectId), unitNumber: String(villaNumber) } }
      });

      if (unit) {
        // ابحث عن التعيينات الخاصة بهذه الوحدة أو بلوك الوحدة
        const assignments = await prisma.contractorAssignment.findMany({
          where: {
            projectId: String(projectId),
            OR: [
              { unitId: unit.id },
              { blockId: unit.blockId, unitId: null }
            ],
            ...(specialtyKey && specialtyKey !== 'all' ? { specialtyKey: String(specialtyKey) } : {})
          },
          include: {
            contractor: { include: { specialties: true, assignments: { include: { block: true, unit: true } } } }
          }
        });

        // ترتيب الأولوية: الوحدة أولاً، ثم البلوك
        assignments.sort((a, b) => {
          if (a.unitId && !b.unitId) return -1;
          if (!a.unitId && b.unitId) return 1;
          return 0;
        });

        for (const a of assignments) {
          if (!matchedContractors.has(a.contractorId)) {
            matchedContractors.set(a.contractorId, a.contractor);
          }
        }
      }
    } else {
      // إذا لم يحدد فيلا، نرجع كل المقاولين في المشروع (اختياريًا حسب التخصص)
      const contractors = await prisma.contractor.findMany({
        where: {
          assignments: { some: { projectId: String(projectId) } },
          ...(specialtyKey && specialtyKey !== 'all' ? { specialties: { some: { specialtyKey: String(specialtyKey) } } } : {})
        },
        include: { specialties: true, assignments: { include: { block: true, unit: true } } }
      });
      for (const c of contractors) {
        matchedContractors.set(c.id, c);
      }
    }

    res.json(Array.from(matchedContractors.values()));
  } catch (err: any) {
    console.error("[contractors] suggest error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contractors/:id
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const contractor = await prisma.contractor.findUnique({
      where: { id: req.params.id },
      include: { specialties: true, assignments: { include: { block: true, unit: true } } },
    });
    if (!contractor) return res.status(404).json({ error: "Not found" });
    res.json(contractor);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contractors
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, phone, specialties = [], assignments = [] } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });

    const contractor = await prisma.contractor.create({
      data: {
        name: String(name).trim(),
        phone: phone ? String(phone).trim() : null,
        specialties: {
          create: (specialties as string[]).map((key: string) => ({ specialtyKey: key })),
        },
        assignments: {
          create: (assignments as any[]).map((a: any) => ({
            projectId: a.projectId,
            specialtyKey: a.specialtyKey || specialties[0] || 'general',
            blockId: a.blockId || null,
            unitId: a.unitId || null,
          })),
        },
      },
      include: { specialties: true, assignments: { include: { block: true, unit: true } } },
    });
    res.status(201).json(contractor);
  } catch (err: any) {
    console.error("[contractors] POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/contractors/:id
router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, phone, specialties, assignments } = req.body;
    const id = req.params.id;

    await prisma.contractor.update({
      where: { id },
      data: {
        name: name !== undefined ? String(name).trim() : undefined,
        phone: phone !== undefined ? (phone ? String(phone).trim() : null) : undefined,
      },
    });

    if (Array.isArray(specialties)) {
      await prisma.contractorSpecialty.deleteMany({ where: { contractorId: id } });
      if (specialties.length > 0) {
        await prisma.contractorSpecialty.createMany({
          data: (specialties as string[]).map((key: string) => ({ contractorId: id, specialtyKey: key })),
          skipDuplicates: true,
        });
      }
    }

    if (Array.isArray(assignments)) {
      await prisma.contractorAssignment.deleteMany({ where: { contractorId: id } });
      if (assignments.length > 0) {
        await prisma.contractorAssignment.createMany({
          data: (assignments as any[]).map((a: any) => ({
            contractorId: id,
            projectId: a.projectId,
            specialtyKey: a.specialtyKey || (specialties && specialties[0]) || 'general',
            blockId: a.blockId || null,
            unitId: a.unitId || null,
          })),
        });
      }
    }

    const updated = await prisma.contractor.findUnique({
      where: { id },
      include: { specialties: true, assignments: { include: { block: true, unit: true } } },
    });
    res.json(updated);
  } catch (err: any) {
    console.error("[contractors] PUT error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/contractors/:id
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    await prisma.contractor.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
