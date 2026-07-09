import { Router } from "express";
import prisma from "../db.js";
import { AuthRequest, requireAuth } from "../auth.js";

const router = Router();

// ─── Helper: parse villa number to int for range comparison ──────────────────
function parseVillaNum(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseInt(String(v).replace(/\D/g, ""), 10);
  return isNaN(n) ? null : n;
}

function matchesList(target: string, dbField: string | null | undefined): boolean {
  if (!dbField) return false;
  // split by spaces, commas, arabic commas, or dashes
  const parts = String(dbField).split(/[\s,،-]+/);
  return parts.includes(String(target).trim());
}

function isVillaInRange(villa: string, assignment: any): boolean {
  if (assignment.villaNumber && matchesList(villa, assignment.villaNumber)) {
    return true;
  }
  if (assignment.fromVilla && assignment.toVilla) {
    const v = parseVillaNum(villa);
    const from = parseVillaNum(assignment.fromVilla);
    const to = parseVillaNum(assignment.toVilla);
    if (v !== null && from !== null && to !== null) {
      return v >= from && v <= to;
    }
  }
  return false;
}

function isBlockInRange(block: string, assignment: any): boolean {
  if (assignment.blockNumber && matchesList(block, assignment.blockNumber)) {
    return true;
  }
  if (assignment.fromBlock && assignment.toBlock) {
    const b = parseVillaNum(block);
    const from = parseVillaNum(assignment.fromBlock);
    const to = parseVillaNum(assignment.toBlock);
    if (b !== null && from !== null && to !== null) {
      return b >= from && b <= to;
    }
  }
  return false;
}

// GET /api/contractors?projectId=X
// Returns contractors that have at least one villa assignment in the given project
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.query;

    const contractors = await prisma.contractor.findMany({
      where: projectId
        ? { assignments: { some: { projectId: String(projectId) } } }
        : undefined,
      include: {
        specialties: true,
        assignments: true,
      },
      orderBy: { name: "asc" },
    });
    res.json(contractors);
  } catch (err: any) {
    console.error("[contractors] GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contractors/suggest?villaNumber=X&specialtyKey=Y&projectId=Z&blockNumber=W
router.get("/suggest", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { villaNumber, specialtyKey, projectId, blockNumber } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    // Load contractors that have assignments in this project
    const contractors = await prisma.contractor.findMany({
      where: { assignments: { some: { projectId: String(projectId) } } },
      include: {
        specialties: true,
        assignments: { where: { projectId: String(projectId) } },
      },
    });

    // Filter by specialty if provided
    const withSpecialty = specialtyKey
      ? contractors.filter(c =>
          c.specialties.length === 0 ||
          c.specialties.some(s => s.specialtyKey === String(specialtyKey))
        )
      : contractors;

    // Filter by villa/block
    let matched = withSpecialty;
    if (villaNumber) {
      const villa = String(villaNumber);
      const block = blockNumber ? String(blockNumber) : null;

      matched = withSpecialty.filter(c => {
        if (c.assignments.length === 0) return true;
        return c.assignments.some(a => {
          // If block is provided, check if it matches the assignment's block logic
          // Note: an assignment might be ONLY for a block (no villa specified).
          // If the assignment has a block criteria but the ticket's block doesn't match, return false.
          let blockMatches = true;
          if (a.blockNumber || (a.fromBlock && a.toBlock)) {
            if (!block || !isBlockInRange(block, a)) {
              blockMatches = false;
            }
          }

          // If the assignment is ONLY a block criteria, and it matched, return true
          if (blockMatches && !a.villaNumber && !a.fromVilla) {
            return true;
          }

          // Otherwise, if block matched (or there was no block criteria on assignment), check villa
          if (blockMatches && isVillaInRange(villa, a)) {
            return true;
          }

          return false;
        });
      });
    }

    res.json(matched);
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
      include: { specialties: true, assignments: true },
    });
    if (!contractor) return res.status(404).json({ error: "Not found" });
    res.json(contractor);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contractors
// body: { name, phone?, specialties?: string[], assignments?: { projectId, villaNumber?, blockNumber?, fromVilla?, toVilla? }[] }
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
            villaNumber: a.villaNumber || null,
            blockNumber: a.blockNumber || null,
            fromVilla: a.fromVilla || null,
            toVilla: a.toVilla || null,
            fromBlock: a.fromBlock || null,
            toBlock: a.toBlock || null,
          })),
        },
      },
      include: { specialties: true, assignments: true },
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
      await prisma.contractorVilla.deleteMany({ where: { contractorId: id } });
      if (assignments.length > 0) {
        await prisma.contractorVilla.createMany({
          data: (assignments as any[]).map((a: any) => ({
            contractorId: id,
            projectId: a.projectId,
            villaNumber: a.villaNumber || null,
            blockNumber: a.blockNumber || null,
            fromVilla: a.fromVilla || null,
            toVilla: a.toVilla || null,
            fromBlock: a.fromBlock || null,
            toBlock: a.toBlock || null,
          })),
        });
      }
    }

    const updated = await prisma.contractor.findUnique({
      where: { id },
      include: { specialties: true, assignments: true },
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
