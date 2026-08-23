import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../auth.js";
import { invalidateReferenceCache } from "../classifier/db-helpers.js";
import { invalidateKeywordCache } from "../classifier/keywords.js";

const router = Router();

// ── GET /api/admin/ticket-types ─────────────────────────────────────────────
router.get("/", requireAuth, async (_req, res) => {
  try {
    const types = await prisma.ticketType.findMany({
      include: {
        specialty: { select: { id: true, key: true, nameAr: true } },
        subTypes: {
          orderBy: { sortOrder: "asc" },
          include: {
            specialty: { select: { id: true, key: true, nameAr: true } },
            keywords: { orderBy: { weight: "desc" }, take: 20 },
            _count: { select: { tickets: true } },
          },
        },
        keywords: { orderBy: { weight: "desc" }, take: 30 },
        _count: { select: { tickets: true, keywords: true, subTypes: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    // check which types have an ML sub-type model
    const fs = await import("fs");
    const path = await import("path");
    const mlDir = path.default.resolve("ml");
    const withMlModel = types.map(t => ({
      ...t,
      hasSubtypeModel: fs.default.existsSync(path.default.join(mlDir, `model_subtype_${t.key}.pkl`)),
    }));

    res.json(withMlModel);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/ticket-types/specialties ──────────────────────────────────
router.get("/specialties", requireAuth, async (_req, res) => {
  try {
    const specialties = await prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json(specialties);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/ticket-types/specialties ─────────────────────────────────
router.post("/specialties", requireAuth, async (req, res) => {
  try {
    const { key, nameAr } = req.body;
    if (!key?.trim() || !nameAr?.trim()) {
      res.status(400).json({ error: "key و nameAr مطلوبان" });
      return;
    }
    const maxOrder = await prisma.specialty.aggregate({ _max: { sortOrder: true } });
    const specialty = await prisma.specialty.create({
      data: {
        key: key.trim().toLowerCase().replace(/\s+/g, "_"),
        nameAr: nameAr.trim(),
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        isActive: true,
      },
    });
    invalidateReferenceCache();
    res.status(201).json(specialty);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── PUT /api/admin/ticket-types/specialties/:specId ──────────────────────────
router.put("/specialties/:specId", requireAuth, async (req, res) => {
  try {
    const { nameAr, isActive, sortOrder } = req.body;
    const specialty = await prisma.specialty.update({
      where: { id: req.params.specId },
      data: {
        ...(nameAr !== undefined && { nameAr: nameAr.trim() }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      },
    });
    invalidateReferenceCache();
    res.json(specialty);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /api/admin/ticket-types/specialties/:specId (soft) ────────────────
router.delete("/specialties/:specId", requireAuth, async (req, res) => {
  try {
    const count = await prisma.ticketType.count({
      where: { specialtyId: req.params.specId, isActive: true },
    });
    if (count > 0) {
      res.status(400).json({ error: `لا يمكن حذف التخصص — يحتوي على ${count} نوع نشط` });
      return;
    }
    await prisma.specialty.update({
      where: { id: req.params.specId },
      data: { isActive: false },
    });
    invalidateReferenceCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/admin/ticket-types ─────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const { key, nameAr, description, specialtyId } = req.body;
    if (!key?.trim() || !nameAr?.trim()) {
      res.status(400).json({ error: "key و nameAr مطلوبان" });
      return;
    }

    const existing = await prisma.ticketType.findUnique({ where: { key: key.trim().toLowerCase() } });
    if (existing) {
      res.status(400).json({ error: `النوع "${key}" موجود مسبقاً` });
      return;
    }

    const maxOrder = await prisma.ticketType.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1;

    const type = await prisma.ticketType.create({
      data: {
        key: key.trim().toLowerCase(),
        nameAr: nameAr.trim(),
        description: description?.trim() || null,
        specialtyId: specialtyId || null,
        isActive: true,
        sortOrder,
      },
      include: {
        specialty: { select: { id: true, key: true, nameAr: true } },
        subTypes: { include: { specialty: true, keywords: true } },
        keywords: { orderBy: { weight: "desc" }, take: 30 },
        _count: { select: { tickets: true, keywords: true, subTypes: true } },
      },
    });

    invalidateReferenceCache();
    res.status(201).json(type);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── PUT /api/admin/ticket-types/:id ─────────────────────────────────────────
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { nameAr, description, specialtyId, isActive, sortOrder } = req.body;

    const type = await prisma.ticketType.update({
      where: { id: req.params.id },
      data: {
        ...(nameAr !== undefined && { nameAr: nameAr.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(specialtyId !== undefined && { specialtyId: specialtyId || null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      },
      include: {
        specialty: { select: { id: true, key: true, nameAr: true } },
        subTypes: {
          orderBy: { sortOrder: "asc" },
          include: { specialty: true, keywords: { orderBy: { weight: "desc" }, take: 20 } },
        },
        keywords: { orderBy: { weight: "desc" }, take: 30 },
        _count: { select: { tickets: true, keywords: true, subTypes: true } },
      },
    });

    invalidateReferenceCache();
    invalidateKeywordCache();
    res.json(type);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /api/admin/ticket-types/:id (soft) ────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await prisma.ticketType.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    invalidateReferenceCache();
    invalidateKeywordCache();
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// SubTypes
// ═══════════════════════════════════════════════════════

router.post("/:id/subtypes", requireAuth, async (req, res) => {
  try {
    const { nameAr, description, specialtyId } = req.body;
    if (!nameAr?.trim()) { res.status(400).json({ error: "nameAr مطلوب" }); return; }

    const parentType = await prisma.ticketType.findUnique({ where: { id: req.params.id } });
    if (!parentType) { res.status(404).json({ error: "النوع الأساسي غير موجود" }); return; }

    const existing = await prisma.ticketSubType.findFirst({
      where: { parentTypeId: req.params.id, nameAr: nameAr.trim(), isActive: true },
    });
    if (existing) { res.status(400).json({ error: `"${nameAr}" موجود مسبقاً في هذا النوع` }); return; }

    const maxOrder = await prisma.ticketSubType.aggregate({
      where: { parentTypeId: req.params.id }, _max: { sortOrder: true },
    });

    const subType = await prisma.ticketSubType.create({
      data: {
        parentTypeId: req.params.id,
        nameAr: nameAr.trim(),
        description: description?.trim() || null,
        specialtyId: specialtyId || null,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        isActive: true,
      },
      include: { specialty: { select: { id: true, key: true, nameAr: true } }, keywords: true },
    });

    invalidateReferenceCache();
    res.status(201).json(subType);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id/subtypes/:subId", requireAuth, async (req, res) => {
  try {
    const { nameAr, description, specialtyId, isActive, sortOrder } = req.body;
    const subType = await prisma.ticketSubType.update({
      where: { id: req.params.subId },
      data: {
        ...(nameAr !== undefined && { nameAr: nameAr.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(specialtyId !== undefined && { specialtyId: specialtyId || null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      },
      include: { specialty: { select: { id: true, key: true, nameAr: true } }, keywords: true },
    });
    invalidateReferenceCache();
    res.json(subType);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id/subtypes/:subId", requireAuth, async (req, res) => {
  try {
    await prisma.ticketSubType.update({ where: { id: req.params.subId }, data: { isActive: false } });
    invalidateReferenceCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// Keywords — for TicketType
// ═══════════════════════════════════════════════════════

router.get("/:id/keywords", requireAuth, async (req, res) => {
  try {
    const keywords = await prisma.ticketTypeKeyword.findMany({
      where: { typeId: req.params.id },
      orderBy: { weight: "desc" },
    });
    res.json(keywords);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/keywords", requireAuth, async (req, res) => {
  try {
    const { keyword, weight } = req.body;
    if (!keyword?.trim()) { res.status(400).json({ error: "keyword مطلوب" }); return; }

    const kw = await prisma.ticketTypeKeyword.upsert({
      where: {
        keyword_typeId: { keyword: keyword.trim().toLowerCase(), typeId: req.params.id },
      },
      update: { weight: weight ? Number(weight) : undefined, source: "manual" },
      create: {
        keyword: keyword.trim().toLowerCase(),
        typeId: req.params.id,
        weight: weight ? Number(weight) : 1.5,
        isLearned: false,
        source: "manual",
        confidence: 1.0,
        usageCount: 0,
      },
    });

    invalidateKeywordCache();
    res.status(201).json(kw);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id/keywords/:kwId", requireAuth, async (req, res) => {
  try {
    await prisma.ticketTypeKeyword.delete({ where: { id: req.params.kwId } });
    invalidateKeywordCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// Keywords — for TicketSubType
// ═══════════════════════════════════════════════════════

router.get("/:id/subtypes/:subId/keywords", requireAuth, async (req, res) => {
  try {
    const keywords = await prisma.ticketTypeKeyword.findMany({
      where: { subTypeId: req.params.subId },
      orderBy: { weight: "desc" },
    });
    res.json(keywords);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/subtypes/:subId/keywords", requireAuth, async (req, res) => {
  try {
    const { keyword, weight } = req.body;
    if (!keyword?.trim()) { res.status(400).json({ error: "keyword مطلوب" }); return; }

    const kw = await prisma.ticketTypeKeyword.upsert({
      where: {
        keyword_subTypeId: { keyword: keyword.trim().toLowerCase(), subTypeId: req.params.subId },
      },
      update: { weight: weight ? Number(weight) : undefined, source: "manual" },
      create: {
        keyword: keyword.trim().toLowerCase(),
        subTypeId: req.params.subId,
        weight: weight ? Number(weight) : 1.5,
        isLearned: false,
        source: "manual",
        confidence: 1.0,
        usageCount: 0,
      },
    });

    invalidateKeywordCache();
    res.status(201).json(kw);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id/subtypes/:subId/keywords/:kwId", requireAuth, async (req, res) => {
  try {
    await prisma.ticketTypeKeyword.delete({ where: { id: req.params.kwId } });
    invalidateKeywordCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;