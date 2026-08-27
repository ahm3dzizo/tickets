// server/routes/push.ts — subscribe / unsubscribe / VAPID key endpoint
import { Router } from 'express';
import { requireAuth, AuthRequest } from '../auth.js';
import { requireTechAuth, TechAuthRequest } from './tech-auth.js';
import prisma from '../db.js';
import { getVapidPublicKey, sendPushToUserDetailed } from '../pushService.js';

const router = Router();

router.get('/vapid-public-key', (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post('/subscribe', requireAuth, async (req: AuthRequest, res) => {
  const { endpoint, p256dh, auth } = req.body;
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: 'Missing subscription fields' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { uid: req.uid! }, select: { role: true } });
  const role = user?.role || 'user';
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { uid: req.uid!, role, endpoint, p256dh, auth },
    update: { uid: req.uid!, role, p256dh, auth },
  });
  res.json({ success: true });
});

router.post('/subscribe-tech', requireTechAuth as any, async (req: TechAuthRequest, res) => {
  const { endpoint, p256dh, auth } = req.body;
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: 'Missing subscription fields' });
    return;
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { uid: req.technicianId!, role: 'technician', endpoint, p256dh, auth },
    update: { uid: req.technicianId!, role: 'technician', p256dh, auth },
  });
  res.json({ success: true });
});

router.delete('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } }).catch(() => {});
  }
  res.json({ success: true });
});

router.post('/test-self', requireAuth, async (req: AuthRequest, res) => {
  const uid = req.uid!;
  const results = await sendPushToUserDetailed(uid, {
    title: '🔔 اختبار إشعارات Knot',
    body: 'لو ظهر الإشعار ده، يبقى Web Push شغال على الجهاز الحالي.',
    url: '/settings#notifications',
    tag: `push-self-test-${Date.now()}`,
    requireInteraction: true,
  });
  res.json({
    success: results.some(r => r.ok),
    subscriptions: results.length,
    delivered: results.filter(r => r.ok).length,
    results,
  });
});

router.post('/test-self-tech', requireTechAuth as any, async (req: TechAuthRequest, res) => {
  const uid = req.technicianId!;
  const results = await sendPushToUserDetailed(uid, {
    title: '🔔 اختبار إشعارات الفني',
    body: 'لو ظهر الإشعار ده، يبقى Web Push شغال على جهازك.',
    url: '/tech',
    tag: `push-tech-test-${Date.now()}`,
    requireInteraction: true,
  });
  res.json({
    success: results.some(r => r.ok),
    subscriptions: results.length,
    delivered: results.filter(r => r.ok).length,
    results,
  });
});

export default router;
