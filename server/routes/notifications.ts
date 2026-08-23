import { Router } from 'express';
import { AuthRequest, requireAuth } from '../auth.js';
import prisma from '../db.js';

const router = Router();

// GET /api/notifications — last 30 notifications for current user
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const uid = req.uid!;
  const notifications = await prisma.appNotification.findMany({
    where: { uid },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.json(notifications);
});

// POST /api/notifications/read-all
router.post('/read-all', requireAuth, async (req: AuthRequest, res) => {
  await prisma.appNotification.updateMany({
    where: { uid: req.uid!, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  await prisma.appNotification.updateMany({
    where: { id: req.params.id, uid: req.uid! },
    data: { read: true },
  });
  res.json({ ok: true });
});

export default router;
