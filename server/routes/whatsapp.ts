import { Router } from 'express';
import { AuthRequest, requireAuth } from '../auth.js';
import { getWAStatus, getWAQRCode, getLinkedPhone, startWA, stopWA, sendWAText, pairWACode } from '../baileys.js';
import qrcode from 'qrcode';

const router = Router();

// ─── GET /api/whatsapp/status ────────────────────────────────────────────────
router.get('/status', requireAuth, async (req: AuthRequest, res) => {
  const uid = req.uid!;
  const status = getWAStatus(uid);
  res.json({ 
    running: status !== 'DISCONNECTED', 
    connected: status === 'CONNECTED', 
    state: status,
    linkedPhone: getLinkedPhone(uid)
  });
});

// ─── GET /api/whatsapp/qr ────────────────────────────────────────────────────
router.get('/qr', requireAuth, async (req: AuthRequest, res) => {
  const uid = req.uid!;
  const status = getWAStatus(uid);

  if (status === 'DISCONNECTED') {
    res.status(503).json({ error: 'خدمة الواتساب غير مشغلة. اضغط تشغيل أولاً.' });
    return;
  }
  if (status === 'CONNECTED') {
    res.json({ qr: null, state: 'CONNECTED' });
    return;
  }
  
  const qrCodeStr = getWAQRCode(uid);
  if (!qrCodeStr) {
    res.json({ qr: null, state: 'STARTING' });
    return;
  }
  
  try {
    const dataUrl = await qrcode.toDataURL(qrCodeStr);
    res.json({ qr: dataUrl, state: 'WAITING_AUTH' });
  } catch (err) {
    res.status(500).json({ error: 'فشل توليد صورة QR' });
  }
});

// ─── GET /api/whatsapp/logs ───────────────────────────────────────────────────
router.get('/logs', requireAuth, async (_req: AuthRequest, res) => {
  res.json({ logs: "Logs are managed via internal server console now." });
});

// ─── POST /api/whatsapp/send ─────────────────────────────────────────────────
router.post('/send', requireAuth, async (req: AuthRequest, res) => {
  const uid = req.uid!;
  const { phone, message } = req.body as { phone?: string; message?: string };
  if (!phone?.trim() || !message?.trim()) {
    res.status(400).json({ error: 'phone و message مطلوبان' });
    return;
  }
  const result = await sendWAText(uid, phone.trim(), message.trim());
  res.json(result);
});

// ─── POST /api/whatsapp/pair ─────────────────────────────────────────────────
router.post('/pair', requireAuth, async (req: AuthRequest, res) => {
  const uid = req.uid!;
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    res.status(400).json({ error: 'رقم الهاتف مطلوب' });
    return;
  }
  try {
    const code = await pairWACode(uid, phone);
    res.json({ code });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/verify ───────────────────────────────────────────────
router.post('/verify', requireAuth, async (req: AuthRequest, res) => {
  const uid = req.uid!;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (getWAStatus(uid) === 'CONNECTED') {
      res.json({ connected: true });
      return;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  res.json({ connected: false });
});

// ─── POST /api/whatsapp/start ────────────────────────────────────────────────
router.post('/start', requireAuth, async (req: AuthRequest, res) => {
  const uid = req.uid!;
  try {
    startWA(uid); // start in background
    res.json({ success: true, message: 'جاري تشغيل خدمة الواتساب...' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/restart ──────────────────────────────────────────────
router.post('/restart', requireAuth, async (req: AuthRequest, res) => {
  const uid = req.uid!;
  try {
    await stopWA(uid, true); // clean session
    startWA(uid);
    res.json({ success: true, message: 'تمت إعادة تهيئة الخدمة وجاري توليد رمز QR جديد...' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
