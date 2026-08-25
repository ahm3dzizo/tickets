import { Router } from 'express';
import prisma from '../db.js';
import { AuthRequest, requireAuth } from '../auth.js';
import * as XLSX from 'xlsx';

const router = Router();

// ── Warehouse Items ────────────────────────────────────────────────────────────

// GET /api/warehouse/items?projectId=
router.get('/items', requireAuth, async (req: AuthRequest, res) => {
  const { projectId } = req.query as Record<string, string>;
  if (!projectId) { res.status(400).json({ error: 'projectId مطلوب' }); return; }
  const items = await prisma.warehouseItem.findMany({
    where: { projectId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  res.json(items);
});

// POST /api/warehouse/items
router.post('/items', requireAuth, async (req: AuthRequest, res) => {
  const { projectId, name, category, quantity, unit, minQuantity, notes } = req.body;
  if (!projectId || !name) { res.status(400).json({ error: 'projectId و name مطلوبان' }); return; }
  const item = await prisma.warehouseItem.create({
    data: { projectId, name, category: category || null, quantity: quantity ?? 0, unit: unit || 'قطعة', minQuantity: minQuantity ?? null, notes: notes || null },
  });
  res.status(201).json(item);
});

// PUT /api/warehouse/items/:id
router.put('/items/:id', requireAuth, async (req: AuthRequest, res) => {
  const { name, category, quantity, unit, minQuantity, notes } = req.body;
  try {
    const item = await prisma.warehouseItem.update({
      where: { id: req.params.id },
      data: { name, category: category ?? undefined, quantity, unit, minQuantity: minQuantity ?? null, notes: notes ?? null },
    });
    res.json(item);
  } catch { res.status(404).json({ error: 'العنصر غير موجود' }); }
});

// DELETE /api/warehouse/items/:id
router.delete('/items/:id', requireAuth, async (req: AuthRequest, res) => {
  await prisma.warehouseItem.delete({ where: { id: req.params.id } }).catch(() => {});
  res.json({ ok: true });
});

// ── Material Requests ──────────────────────────────────────────────────────────

// GET /api/warehouse/requests?projectId=
router.get('/requests', requireAuth, async (req: AuthRequest, res) => {
  const { projectId } = req.query as Record<string, string>;
  const requests = await prisma.materialRequest.findMany({
    where: projectId ? { projectId } : {},
    include: {
      requester: { select: { uid: true, displayName: true } },
      project:   { select: { id: true, name: true, abbreviation: true } },
      items:     true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(requests);
});

// POST /api/warehouse/requests
router.post('/requests', requireAuth, async (req: AuthRequest, res) => {
  const { projectId, title, notes, items } = req.body;
  if (!projectId) { res.status(400).json({ error: 'projectId مطلوب' }); return; }
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: 'يجب إضافة بند واحد على الأقل' }); return; }

  const request = await prisma.materialRequest.create({
    data: {
      projectId,
      requesterId: req.uid!,
      title: title || null,
      notes: notes || null,
      items: {
        create: items.map((it: any) => ({
          name:     it.name,
          quantity: it.quantity,
          unit:     it.unit || 'قطعة',
          urgency:  it.urgency || 'medium',
          notes:    it.notes || null,
        })),
      },
    },
    include: {
      requester: { select: { uid: true, displayName: true } },
      project:   { select: { id: true, name: true, abbreviation: true } },
      items:     true,
    },
  });
  res.status(201).json(request);
});

// PUT /api/warehouse/requests/:id
router.put('/requests/:id', requireAuth, async (req: AuthRequest, res) => {
  const { title, notes, items } = req.body;
  try {
    await prisma.materialRequestItem.deleteMany({ where: { requestId: req.params.id } });
    const request = await prisma.materialRequest.update({
      where: { id: req.params.id },
      data: {
        title: title || null,
        notes: notes || null,
        items: {
          create: (items || []).map((it: any) => ({
            name:     it.name,
            quantity: it.quantity,
            unit:     it.unit || 'قطعة',
            urgency:  it.urgency || 'medium',
            notes:    it.notes || null,
          })),
        },
      },
      include: {
        requester: { select: { uid: true, displayName: true } },
        project:   { select: { id: true, name: true, abbreviation: true } },
        items:     true,
      },
    });
    res.json(request);
  } catch { res.status(404).json({ error: 'الطلب غير موجود' }); }
});

// DELETE /api/warehouse/requests/:id
router.delete('/requests/:id', requireAuth, async (req: AuthRequest, res) => {
  await prisma.materialRequest.delete({ where: { id: req.params.id } }).catch(() => {});
  res.json({ ok: true });
});

// GET /api/warehouse/requests/:id/export  — Excel download
router.get('/requests/:id/export', requireAuth, async (req: AuthRequest, res) => {
  const request = await prisma.materialRequest.findUnique({
    where: { id: req.params.id },
    include: {
      requester: { select: { displayName: true } },
      project:   { select: { name: true, abbreviation: true } },
      items:     true,
    },
  });
  if (!request) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }

  const urgencyLabel: Record<string, string> = { low: 'عادي', medium: 'متوسط', high: 'عاجل' };
  const rows = request.items.map((it, i) => ({
    '#':            i + 1,
    'اسم الخامة':   it.name,
    'الكمية':       it.quantity,
    'الوحدة':       it.unit,
    'الأولوية':     urgencyLabel[it.urgency] || it.urgency,
    'ملاحظات':      it.notes || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { origin: 'A3' });

  // Header info rows
  XLSX.utils.sheet_add_aoa(ws, [
    [`طلب مواد — ${request.project.name} (${request.project.abbreviation})`],
    [`المشرف: ${request.requester.displayName}    |    التاريخ: ${new Date(request.createdAt).toLocaleDateString('ar-EG')}    |    ${request.title || ''}`],
  ], { origin: 'A1' });

  ws['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];

  XLSX.utils.book_append_sheet(wb, ws, 'طلب المواد');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = `material-request-${request.project.abbreviation}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

export default router;
