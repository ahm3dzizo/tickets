import { Router } from 'express';
import { AuthRequest, requireAuth } from '../auth.js';
import prisma from '../db.js';

const router = Router();

// ─── GET /api/settings/whatsapp-templates ────────────────────────────────────
router.get('/whatsapp-templates', requireAuth, async (req: AuthRequest, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'whatsapp_templates' }
    });
    
    // Default templates if not set yet
    const defaults = {
      openingMsg: `السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم {villaNumber}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`,
      closingMsg: `السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم رقم {villaNumber} ، تم الانتهاء من الصيانة المطلوبة. نرجو التفضل بالتوقيع على نموذج الإغلاق المرفق.\n شكراً لتعاونكم.`
    };

    if (setting && setting.value) {
      const saved = setting.value as any;
      res.json({
        openingMsg: saved.openingMsg || defaults.openingMsg,
        closingMsg: saved.closingMsg || defaults.closingMsg,
      });
    } else {
      res.json(defaults);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/settings/whatsapp-templates ────────────────────────────────────
// Only accessible to users who are admins (or all employees for now, we'll check role if needed)
router.put('/whatsapp-templates', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { openingMsg, closingMsg } = req.body;
    
    if (!openingMsg || !closingMsg) {
      res.status(400).json({ error: 'openingMsg و closingMsg مطلوبان' });
      return;
    }

    const value = { openingMsg, closingMsg };

    const updated = await prisma.systemSetting.upsert({
      where: { key: 'whatsapp_templates' },
      update: { value },
      create: { key: 'whatsapp_templates', value }
    });

    res.json(updated.value);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
