// server/routes/whatsapp-bot.ts
// ─── إدارة جلسة بوت الأوامر (رقم منفصل عن جلسات المستخدمين) ─────────────────
import { Router } from 'express';
import { AuthRequest, requireAuth, requireAdmin } from '../auth.js';
import { getWAStatus, getWAQRCode, getLinkedPhone, startWA, stopWA, pairWACode, joinBotGroupByInvite, leaveBotGroup } from '../baileys.js';
import { BOT_USER_ID, isBotEnabled, setBotEnabled, getBotGroup } from '../whatsappBot.js';
import qrcode from 'qrcode';
import prisma from '../db.js';

const router = Router();

// كل مسارات إدارة البوت للأدمن بس — لازم requireAuth الأول عشان يفك التوكن
// ويحط req.uid، وبعدين requireAdmin يتحقق من الدور
router.use(requireAuth, requireAdmin);

// ─── GET /api/whatsapp-bot/status ────────────────────────────────────────────
router.get('/status', async (_req: AuthRequest, res) => {
  const status = getWAStatus(BOT_USER_ID);
  res.json({
    running: status !== 'DISCONNECTED',
    connected: status === 'CONNECTED',
    state: status,
    linkedPhone: getLinkedPhone(BOT_USER_ID),
    enabled: await isBotEnabled(),
  });
});

// ─── GET /api/whatsapp-bot/qr ─────────────────────────────────────────────────
router.get('/qr', async (_req: AuthRequest, res) => {
  const status = getWAStatus(BOT_USER_ID);
  if (status === 'DISCONNECTED') {
    res.status(503).json({ error: 'جلسة البوت غير مشغلة. اضغط تشغيل أولاً.' });
    return;
  }
  if (status === 'CONNECTED') {
    res.json({ qr: null, state: 'CONNECTED' });
    return;
  }
  const qrCodeStr = getWAQRCode(BOT_USER_ID);
  if (!qrCodeStr) {
    res.json({ qr: null, state: 'STARTING' });
    return;
  }
  try {
    const dataUrl = await qrcode.toDataURL(qrCodeStr);
    res.json({ qr: dataUrl, state: 'WAITING_AUTH' });
  } catch {
    res.status(500).json({ error: 'فشل توليد صورة QR' });
  }
});

// ─── POST /api/whatsapp-bot/start ────────────────────────────────────────────
router.post('/start', async (_req: AuthRequest, res) => {
  try {
    startWA(BOT_USER_ID);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp-bot/pair ─────────────────────────────────────────────
router.post('/pair', async (req: AuthRequest, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) { res.status(400).json({ error: 'phone مطلوب' }); return; }
  try {
    const code = await pairWACode(BOT_USER_ID, phone);
    res.json({ code });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp-bot/stop ─────────────────────────────────────────────
router.post('/stop', async (req: AuthRequest, res) => {
  const { cleanSession } = req.body as { cleanSession?: boolean };
  try {
    await stopWA(BOT_USER_ID, !!cleanSession);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp-bot/toggle ───────────────────────────────────────────
// مفتاح إيقاف سريع — يقفل تنفيذ الأوامر فوراً من غير قطع الاتصال أو ديبلوي
router.post('/toggle', async (req: AuthRequest, res) => {
  const { enabled } = req.body as { enabled: boolean };
  await setBotEnabled(!!enabled);
  res.json({ ok: true, enabled: !!enabled });
});

// ─── GET /api/whatsapp-bot/group ──────────────────────────────────────────────
router.get('/group', async (_req: AuthRequest, res) => {
  const group = await getBotGroup();
  res.json({ group });
});

// ─── POST /api/whatsapp-bot/group/join ───────────────────────────────────────
router.post('/group/join', async (req: AuthRequest, res) => {
  const { inviteLink } = req.body as { inviteLink?: string };
  if (!inviteLink) { res.status(400).json({ error: 'inviteLink مطلوب' }); return; }
  try {
    const group = await joinBotGroupByInvite(inviteLink);
    res.json({ ok: true, group });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp-bot/group/leave ──────────────────────────────────────
router.post('/group/leave', async (_req: AuthRequest, res) => {
  try {
    await leaveBotGroup();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp-bot/logs ──────────────────────────────────────────────
router.get('/logs', async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const logs = await prisma.botCommandLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json(logs);
});

export default router;
