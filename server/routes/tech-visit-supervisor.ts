import { Router } from 'express';
import prisma from '../db.js';
import { requireAuth, type AuthRequest } from '../auth.js';

const router = Router();
const OPEN_VISIT_PHASES = ['claimed', 'en_route', 'arrived', 'in_progress', 'paused'];

function riyadhTodayBounds() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  // Saudi Arabia is UTC+03 year-round.
  const start = new Date(Date.UTC(year, month - 1, day, -3, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Phase-aware replacement for the legacy /attendance/live endpoint.
 * Mounted before attendance.ts so supervisors can see reservation/travel/arrival,
 * not only the in_progress maintenance phase. Project scoping is enforced here
 * rather than exposing every active technician to every authenticated account.
 */
router.get('/attendance/live', requireAuth, async (req: AuthRequest, res) => {
  try {
    const requester = await prisma.user.findUnique({
      where: { uid: req.uid! },
      select: {
        role: true,
        disabled: true,
        projects: { select: { id: true } },
      },
    });
    if (!requester || requester.disabled) {
      res.status(403).json({ error: 'غير مصرح بعرض الحضور الحي.' });
      return;
    }

    const allowedProjectIds = requester.projects.map(project => project.id);
    const requestedProjectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
    const where: any = {
      status: { in: ['ACTIVE', 'ON_BREAK'] },
    };

    const { start, end } = riyadhTodayBounds();
    where.clockInAt = { gte: start, lt: end };

    if (requester.role === 'admin') {
      if (requestedProjectId && requestedProjectId !== 'all') where.projectId = requestedProjectId;
    } else if (requestedProjectId && requestedProjectId !== 'all') {
      if (!allowedProjectIds.includes(requestedProjectId)) {
        res.status(403).json({ error: 'لا تملك صلاحية عرض حضور هذا المشروع.' });
        return;
      }
      where.projectId = requestedProjectId;
    } else {
      where.projectId = { in: allowedProjectIds.length ? allowedProjectIds : ['__none__'] };
    }

    const shifts = await prisma.shiftLog.findMany({
      where,
      select: {
        technicianId: true,
        projectId: true,
        status: true,
        clockInAt: true,
        totalWorkMinutes: true,
        technician: {
          select: {
            id: true,
            name: true,
            specialty: true,
            employeeId: true,
            phoneNumber: true,
          },
        },
        workSessions: {
          where: { status: { in: OPEN_VISIT_PHASES } },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            appointmentId: true,
            status: true,
            claimedAt: true,
            pausedAt: true,
            pauseReason: true,
            totalPausedMins: true,
            appointment: {
              select: {
                id: true,
                date: true,
                time: true,
                unit: { select: { unitNumber: true } },
                client: { select: { name: true, phone: true } },
              },
            },
          },
        },
      },
      orderBy: { clockInAt: 'asc' },
    });

    res.json(shifts.map(shift => ({
      technicianId: shift.technicianId,
      projectId: shift.projectId,
      name: shift.technician?.name || '',
      employeeId: shift.technician?.employeeId || null,
      phoneNumber: shift.technician?.phoneNumber || null,
      specialty: shift.technician?.specialty || null,
      shiftStatus: shift.status,
      clockInAt: shift.clockInAt,
      currentSession: shift.workSessions[0] || null,
      visitPhase: shift.workSessions[0]?.status || null,
      totalWorkMinutes: shift.totalWorkMinutes,
    })));
  } catch (error: any) {
    console.error('[tech-visit-supervisor] live attendance failed:', error);
    res.status(500).json({ error: error?.message || 'Failed to load live attendance' });
  }
});

export default router;
