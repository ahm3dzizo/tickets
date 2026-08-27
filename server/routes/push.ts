// server/routes/push.ts — subscribe / unsubscribe / VAPID key endpoint
import { Router } from 'express';
import { requireAuth, AuthRequest } from '../auth.js';
import { requireTechAuth, TechAuthRequest } from './tech-auth.js';
import prisma from '../db.js';
import { getVapidPublicKey, sendPushToSubscriptionDetailed } from '../pushService.js';

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
  const endpoint = String(req.body?.endpoint || '');
  if (!endpoint) {
    res.status(400).json({ error: 'Missing current browser endpoint' });
    return;
  }

  const result = await sendPushToSubscriptionDetailed(req.uid!, endpoint, {
    title: '🔔 اختبار إشعارات Knot',
    body: 'هذا الاختبار موجه لهذا الجهاز والمتصفح تحديدًا.',
    url: '/push-test',
    tag: `push-self-test-${Date.now()}`,
    requireInteraction: true,
  });

  if (!result) {
    res.status(404).json({ error: 'Current browser subscription is not saved for this user' });
    return;
  }

  res.json({ success: result.ok, delivered: result.ok ? 1 : 0, subscriptions: 1, result });
});

router.post('/test-self-tech', requireTechAuth as any, async (req: TechAuthRequest, res) => {
  const endpoint = String(req.body?.endpoint || '');
  if (!endpoint) {
    res.status(400).json({ error: 'Missing current browser endpoint' });
    return;
  }

  const result = await sendPushToSubscriptionDetailed(req.technicianId!, endpoint, {
    title: '🔔 اختبار إشعارات الفني',
    body: 'هذا الاختبار موجه لهذا الجهاز والمتصفح تحديدًا.',
    url: '/tech',
    tag: `push-tech-test-${Date.now()}`,
    requireInteraction: true,
  });

  if (!result) {
    res.status(404).json({ error: 'Current browser subscription is not saved for this technician' });
    return;
  }

  res.json({ success: result.ok, delivered: result.ok ? 1 : 0, subscriptions: 1, result });
});

export default router;
