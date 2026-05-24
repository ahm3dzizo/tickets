import { Router } from 'express';
import { AuthRequest, requireAuth } from '../auth.js';
import { isWAAvailable, getSessionState, getQRCode, sendWAText, requestPairingCode } from '../whatsapp.js';

const router = Router();

// GET /api/whatsapp/status
router.get('/status', requireAuth, async (req: AuthRequest, res) => {
  const running = await isWAAvailable();
  if (!running) {
    res.json({ running: false, connected: false });
    return;
  }
  const state = await getSessionState(req.uid!);
  res.json({ running: true, connected: state === 'CONNECTED', state });
});

// GET /api/whatsapp/qr
router.get('/qr', requireAuth, async (req: AuthRequest, res) => {
  const running = await isWAAvailable();
  if (!running) {
    res.status(503).json({ error: 'خدمة الواتساب التلقائي غير متاحة حالياً' });
    return;
  }
  const qr = await getQRCode(req.uid!);
  if (!qr) {
    res.status(404).json({ error: 'لا يوجد QR متاح — ربما الجلسة مرتبطة بالفعل' });
    return;
  }
  res.json({ qr });
});

// POST /api/whatsapp/send
router.post('/send', requireAuth, async (req: AuthRequest, res) => {
  const { phone, message } = req.body as { phone?: string; message?: string };
  if (!phone?.trim() || !message?.trim()) {
    res.status(400).json({ error: 'phone و message مطلوبان' });
    return;
  }
  const result = await sendWAText(req.uid!, phone.trim(), message.trim());
  res.json(result);
});

// POST /api/whatsapp/pair — request a phone-number pairing code
router.post('/pair', requireAuth, async (req: AuthRequest, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone?.trim()) {
    res.status(400).json({ error: 'رقم الهاتف مطلوب' });
    return;
  }
  const running = await isWAAvailable();
  if (!running) {
    res.status(503).json({ error: 'خدمة الواتساب التلقائي غير متاحة حالياً' });
    return;
  }
  const code = await requestPairingCode(req.uid!, phone.trim());
  if (!code) {
    res.status(500).json({ error: 'تعذّر طلب كود الربط — تأكد أن الجلسة غير مرتبطة بالفعل' });
    return;
  }
  res.json({ code });
});

export default router;
