import { Router } from 'express';
import prisma from '../db.js';
import { requireTechAuth, type TechAuthRequest } from './tech-auth.js';

const router = Router();

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function riyadhDateBoundary(date: string, endOfDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000+03:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return endOfDay
    ? new Date(parsed.getTime() + 24 * 60 * 60 * 1000 - 1)
    : parsed;
}

router.get('/history', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const page = positiveInt(req.query.page, 1, 100000);
    const pageSize = positiveInt(req.query.pageSize, 15, 30);
    const skip = (page - 1) * pageSize;
    const from = typeof req.query.from === 'string' ? riyadhDateBoundary(req.query.from) : null;
    const to = typeof req.query.to === 'string' ? riyadhDateBoundary(req.query.to, true) : null;

    const where: any = { technicianId };
    if (from || to) {
      where.clockInAt = {};
      if (from) where.clockInAt.gte = from;
      if (to) where.clockInAt.lte = to;
    }

    const [total, shifts] = await Promise.all([
      prisma.shiftLog.count({ where }),
      prisma.shiftLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { clockInAt: 'desc' },
        select: {
          id: true,
          shiftDate: true,
          status: true,
          clockInAt: true,
          clockOutAt: true,
          totalWorkMinutes: true,
          totalBreakMinutes: true,
          regularMinutes: true,
          overtimeMinutes: true,
          isFlagged: true,
          project: { select: { id: true, name: true, abbreviation: true } },
          breaks: {
            orderBy: { startedAt: 'asc' },
            select: {
              id: true,
              breakType: true,
              startedAt: true,
              endedAt: true,
              durationMins: true,
            },
          },
          workSessions: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              appointmentId: true,
              status: true,
              claimedAt: true,
              finishedAt: true,
              pausedAt: true,
              totalPausedMins: true,
              totalDurationMins: true,
              totalElapsedMins: true,
              completionNotes: true,
              appointment: {
                select: {
                  id: true,
                  date: true,
                  time: true,
                  status: true,
                  unit: { select: { unitNumber: true } },
                  tickets: {
                    select: { id: true, ticketId: true, status: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const items = shifts.map(shift => ({
      ...shift,
      appointmentsWorked: shift.workSessions.length,
      ticketsWorked: shift.workSessions.reduce(
        (sum, session) => sum + (session.appointment?.tickets.length || 0),
        0,
      ),
    }));

    res.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: skip + items.length < total,
      },
    });
  } catch (error: any) {
    console.error('[tech-history] failed:', error);
    res.status(500).json({ error: 'تعذر تحميل سجل العمل.' });
  }
});

export default router;
