// server/routes/push.ts — subscribe / unsubscribe / VAPID key endpoint
import { Router } from 'express';
import { requireAuth, AuthRequest } from '../auth.js';
import { requireTechAuth, TechAuthRequest } from './tech-auth.js';
import prisma from '../db.js';
import { getVapidPublicKey } from '../pushService.js';

const router = Router();

// GET /api/push/vapid-public-key — no auth needed (needed before login to set up SW)
router.get('/vapid-public-key', (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// POST /api/push/subscribe — for app users (admin / engineer / supervisor)
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
    update: { uid: req.uid!, role },
  });
  res.json({ success: true });
});

// POST /api/push/subscribe-tech — for technicians (tech JWT)
router.post('/subscribe-tech', requireTechAuth as any, async (req: TechAuthRequest, res) => {
  const { endpoint, p256dh, auth } = req.body;
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: 'Missing subscription fields' });
    return;
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { uid: req.technicianId!, role: 'technician', endpoint, p256dh, auth },
    update: { uid: req.technicianId! },
  });
  res.json({ success: true });
});

// DELETE /api/push/unsubscribe
router.delete('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } }).catch(() => {});
  }
  res.json({ success: true });
});

export default router;
