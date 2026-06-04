import { Router } from 'express';
import { AuthRequest, requireAuth } from '../auth.js';
import prisma from '../db.js';

const router = Router();

const DEFAULTS = {
  openingMsg:     `السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم {villaNumber}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`,
  closingMsg:     `السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم رقم {villaNumber}، تم الانتهاء من الصيانة المطلوبة. نرجو التفضل بالتوقيع على نموذج الإغلاق المرفق.\nشكراً لتعاونكم.`,
  absentMsg:      `السلام عليكم،\nتم زيارة وحدتكم رقم {villaNumber} بخصوص بلاغ الصيانة #{ticketId}، ولم يتمكن الفريق من الدخول نظراً لعدم التواجد.\nيرجى رفع تذكرة جديدة عند تواجدكم لإعادة جدولة الزيارة.\nشكراً لتفهمكم.`,
  outOfScopeMsg:  `السلام عليكم،\nبخصوص بلاغ الصيانة #{ticketId} لوحدتكم رقم {villaNumber}، بعد المعاينة تبيّن أن المشكلة خارج نطاق الضمان.\nشكراً لتفهمكم.`,
  workHours: [
    { label: 'الصباح (8 ص - 12 م)', value: 'الصباح (8 ص - 12 م)' },
    { label: 'الظهر (12 م - 3 م)', value: 'الظهر (12 م - 3 م)' },
    { label: 'المساء (3 م - 6 م)', value: 'المساء (3 م - 6 م)' },
  ],
};

// ─── GET /api/settings/whatsapp-templates ────────────────────────────────────
router.get('/whatsapp-templates', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'whatsapp_templates' } });
    const saved = (setting?.value ?? {}) as Record<string, string>;
    res.json({
      openingMsg:    saved.openingMsg    || DEFAULTS.openingMsg,
      closingMsg:    saved.closingMsg    || DEFAULTS.closingMsg,
      absentMsg:     saved.absentMsg     || DEFAULTS.absentMsg,
      outOfScopeMsg: saved.outOfScopeMsg || DEFAULTS.outOfScopeMsg,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/settings/whatsapp-templates ────────────────────────────────────
router.put('/whatsapp-templates', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { openingMsg, closingMsg, absentMsg, outOfScopeMsg } = req.body;
    if (!openingMsg || !closingMsg) {
      res.status(400).json({ error: 'openingMsg و closingMsg مطلوبان' });
      return;
    }
    const value = {
      openingMsg,
      closingMsg,
      absentMsg:     absentMsg     || DEFAULTS.absentMsg,
      outOfScopeMsg: outOfScopeMsg || DEFAULTS.outOfScopeMsg,
    };
    const updated = await prisma.systemSetting.upsert({
      where:  { key: 'whatsapp_templates' },
      update: { value },
      create: { key: 'whatsapp_templates', value },
    });
    res.json(updated.value);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/settings/work-hours ────────────────────────────────────────────
router.get('/work-hours', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'work_hours' } });
    const saved = setting?.value as { label: string; value: string }[] | undefined;
    res.json(saved || DEFAULTS.workHours);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/settings/work-hours ────────────────────────────────────────────
router.put('/work-hours', requireAuth, async (req: AuthRequest, res) => {
  try {
    const workHours = req.body;
    if (!Array.isArray(workHours)) {
      res.status(400).json({ error: 'workHours يجب أن يكون مصفوفة' });
      return;
    }
    const updated = await prisma.systemSetting.upsert({
      where:  { key: 'work_hours' },
      update: { value: workHours },
      create: { key: 'work_hours', value: workHours },
    });
    res.json(updated.value);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
