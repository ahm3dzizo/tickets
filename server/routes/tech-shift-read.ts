import { Router, type NextFunction, type Response } from 'express';
import prisma from '../db.js';
import { requireTechAuth, type TechAuthRequest } from './tech-auth.js';
import techShiftWriteRoutes from './tech-shift-write.js';

const router = Router();

// Keep all technician shift writes ahead of the legacy attendance router.
// This makes Riyadh-safe clock-in/out and the no-auto-finish policy authoritative.
router.use(techShiftWriteRoutes);

function requireTechAuthIfNeeded(req: TechAuthRequest, res: Response, next: NextFunction) {
  // main.ts hot-read preflight already verified the JWT/account and populated the
  // technician id. Keep this router independently safe without doing the same DB
  // auth query twice on a cache miss.
  if (req.technicianId) {
    next();
    return;
  }
  void requireTechAuth(req, res, next);
}

function riyadhTodayBounds() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
  const start = new Date(Date.UTC(get('year'), get('month') - 1, get('day'), -3, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Riyadh-time replacement for the legacy /shift/today read. The old handler
 * used server-local midnight, which makes 00:00-02:59 Saudi time vulnerable to
 * being grouped into the previous day when the host runs UTC.
 */
router.get('/shift/today', requireTechAuthIfNeeded, async (req: TechAuthRequest, res) => {
  try {
    const { start, end } = riyadhTodayBounds();
    const shift = await prisma.shiftLog.findFirst({
      where: {
        technicianId: req.technicianId!,
        clockInAt: { gte: start, lt: end },
      },
      orderBy: { clockInAt: 'desc' },
      include: {
        breaks: { orderBy: { startedAt: 'asc' } },
        workSessions: {
          orderBy: { createdAt: 'asc' },
          include: {
            appointment: {
              select: {
                id: true,
                date: true,
                time: true,
                unit: { select: { unitNumber: true } },
              },
            },
          },
        },
      },
    });
    res.json(shift || null);
  } catch (error: any) {
    console.error('[tech-shift-read] today shift failed:', error);
    res.status(500).json({ error: error?.message || 'Failed to load shift' });
  }
});

export default router;
