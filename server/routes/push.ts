// server/routes/push.ts — subscribe / unsubscribe / VAPID key endpoint
import { Router } from 'express';
import { requireAuth, AuthRequest } from '../auth.js';
import { requireTechAuth, TechAuthRequest } from './tech-auth.js';
import prisma from '../db.js';
import { getVapidPublicKey, sendPushToSubscriptionDetailed, sendEmptyPushToSubscriptionDetailed } from '../pushService.js';

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
  console.log(`[push] subscription saved uid=${req.uid} role=${role} host=${safeHost(endpoint)}`);
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
  console.log(`[push] tech subscription saved uid=${req.technicianId} host=${safeHost(endpoint)}`);
  res.json({ success: true });
});

router.delete('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } }).catch(() => {});
    console.log(`[push] subscription removed host=${safeHost(endpoint)}`);
  }
  res.json({ success: true });
});

router.post('/sw-ack', (req, res) => {
  const { tag, title, receivedAt, endpointHost, href } = req.body || {};
  console.log(
    `[push][SW_ACK] tag=${String(tag || '-')} receivedAt=${String(receivedAt || new Date().toISOString())}` +
    ` endpointHost=${String(endpointHost || '-')} title=${JSON.stringify(String(title || ''))}` +
    ` href=${String(href || '-')}`
  );
  res.json({ success: true });
});

router.post('/test-self', requireAuth, async (req: AuthRequest, res) => {
  const endpoint = String(req.body?.endpoint || '');
  if (!endpoint) {
    res.status(400).json({ error: 'Missing current browser endpoint' });
    return;
  }

  const tag = `push-self-test-${Date.now()}`;
  console.log(`[push][TEST_SEND] uid=${req.uid} tag=${tag} host=${safeHost(endpoint)}`);

  const result = await sendPushToSubscriptionDetailed(req.uid!, endpoint, {
    title: '🔔 اختبار إشعارات Knot',
    body: 'هذا الاختبار موجه لهذا الجهاز والمتصفح تحديدًا.',
    url: '/push-test',
    tag,
    requireInteraction: true,
  });

  if (!result) {
    console.warn(`[push][TEST_RESULT] uid=${req.uid} tag=${tag} result=subscription-not-found`);
    res.status(404).json({ error: 'Current browser subscription is not saved for this user' });
    return;
  }

  console.log(`[push][TEST_RESULT] uid=${req.uid} tag=${tag} ok=${result.ok} status=${result.statusCode || '-'} error=${JSON.stringify(result.error || '')}`);
  res.json({ success: result.ok, delivered: result.ok ? 1 : 0, subscriptions: 1, result, tag });
});

router.post('/test-self-empty', requireAuth, async (req: AuthRequest, res) => {
  const endpoint = String(req.body?.endpoint || '');
  if (!endpoint) {
    res.status(400).json({ error: 'Missing current browser endpoint' });
    return;
  }

  const tag = `push-empty-test-${Date.now()}`;
  console.log(`[push][EMPTY_TEST_SEND] uid=${req.uid} tag=${tag} host=${safeHost(endpoint)}`);
  const result = await sendEmptyPushToSubscriptionDetailed(req.uid!, endpoint);

  if (!result) {
    console.warn(`[push][EMPTY_TEST_RESULT] uid=${req.uid} tag=${tag} result=subscription-not-found`);
    res.status(404).json({ error: 'Current browser subscription is not saved for this user' });
    return;
  }

  console.log(`[push][EMPTY_TEST_RESULT] uid=${req.uid} tag=${tag} ok=${result.ok} status=${result.statusCode || '-'} error=${JSON.stringify(result.error || '')}`);
  res.json({ success: result.ok, delivered: result.ok ? 1 : 0, subscriptions: 1, result, tag });
});

router.post('/test-self-tech', requireTechAuth as any, async (req: TechAuthRequest, res) => {
  const endpoint = String(req.body?.endpoint || '');
  if (!endpoint) {
    res.status(400).json({ error: 'Missing current browser endpoint' });
    return;
  }

  const tag = `push-tech-test-${Date.now()}`;
  console.log(`[push][TEST_SEND] tech=${req.technicianId} tag=${tag} host=${safeHost(endpoint)}`);

  const result = await sendPushToSubscriptionDetailed(req.technicianId!, endpoint, {
    title: '🔔 اختبار إشعارات الفني',
    body: 'هذا الاختبار موجه لهذا الجهاز والمتصفح تحديدًا.',
    url: '/tech',
    tag,
    requireInteraction: true,
  });

  if (!result) {
    console.warn(`[push][TEST_RESULT] tech=${req.technicianId} tag=${tag} result=subscription-not-found`);
    res.status(404).json({ error: 'Current browser subscription is not saved for this technician' });
    return;
  }

  console.log(`[push][TEST_RESULT] tech=${req.technicianId} tag=${tag} ok=${result.ok} status=${result.statusCode || '-'} error=${JSON.stringify(result.error || '')}`);
  res.json({ success: result.ok, delivered: result.ok ? 1 : 0, subscriptions: 1, result, tag });
});

function safeHost(endpoint: string): string {
  try { return new URL(endpoint).hostname; } catch { return 'invalid'; }
}

export default router;
