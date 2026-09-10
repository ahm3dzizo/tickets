import { Router } from 'express';
import prisma from '../db.js';
import { requireTechAuth, type TechAuthRequest } from './tech-auth.js';
import { DEFAULT_WORK_HOURS, type WorkHoursSettings, toMins } from './settings.js';

const router = Router();

const MAX_ATTENDANCE_DISTANCE_M = 200;
const MAX_GPS_ACCURACY_M = 100;
const MAX_LOCATION_AGE_MS = 30_000;
const MAX_SAMPLE_SPREAD_M = 100;
const OPEN_VISIT_PHASES = ['claimed', 'en_route', 'arrived', 'in_progress', 'paused'];

function riyadhDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function riyadhDateValue(date = new Date()): Date {
  return new Date(`${riyadhDateString(date)}T00:00:00.000Z`);
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function locationNumbers(body: any) {
  return {
    lat: Number(body?.lat),
    lng: Number(body?.lng),
    accuracy: Number(body?.accuracy),
    sampledAt: Number(body?.sampledAt),
    sampleCount: Number(body?.sampleCount),
    sampleSpreadM: Number(body?.sampleSpreadM),
    speed: body?.speed === null || body?.speed === undefined ? null : Number(body.speed),
    altitudeAccuracy: body?.altitudeAccuracy === null || body?.altitudeAccuracy === undefined
      ? null
      : Number(body.altitudeAccuracy),
  };
}

router.post('/shift/clock-in', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    const loc = locationNumbers(req.body);

    if (!projectId) {
      res.status(422).json({ error: 'لم يتم تحديد مشروع الفني.' });
      return;
    }
    if (
      !Number.isFinite(loc.lat) || loc.lat < -90 || loc.lat > 90
      || !Number.isFinite(loc.lng) || loc.lng < -180 || loc.lng > 180
      || !Number.isFinite(loc.accuracy) || loc.accuracy <= 0
    ) {
      res.status(422).json({ error: 'تعذر التحقق من موقعك. فعّل GPS وحاول مرة أخرى.' });
      return;
    }
    if (!Number.isFinite(loc.sampleCount) || loc.sampleCount < 3 || !Number.isFinite(loc.sampleSpreadM)) {
      res.status(422).json({ error: 'لم نحصل على قراءات موقع كافية. انتظر ثوانٍ وحاول مرة أخرى.' });
      return;
    }
    if (loc.accuracy > MAX_GPS_ACCURACY_M) {
      res.status(422).json({ error: `دقة الموقع ضعيفة (${Math.round(loc.accuracy)}م). انتقل لمكان مفتوح وحاول مرة أخرى.` });
      return;
    }
    if (loc.sampleSpreadM > MAX_SAMPLE_SPREAD_M) {
      res.status(422).json({ error: 'قراءات GPS غير مستقرة. انتظر حتى يثبت الموقع ثم حاول مرة أخرى.' });
      return;
    }
    const locationAge = Date.now() - loc.sampledAt;
    if (!Number.isFinite(loc.sampledAt) || locationAge > MAX_LOCATION_AGE_MS || locationAge < -5_000) {
      res.status(422).json({ error: 'قراءة الموقع قديمة أو وقت الجهاز غير صحيح. حدّث الوقت وحاول مرة أخرى.' });
      return;
    }

    const [technician, project] = await Promise.all([
      prisma.technician.findUnique({
        where: { id: technicianId },
        select: { projectId: true, isActive: true },
      }),
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, officeLat: true, officeLng: true },
      }),
    ]);

    if (!technician?.isActive || technician.projectId !== projectId) {
      res.status(403).json({ error: 'المشروع المحدد غير مخصص لهذا الفني.' });
      return;
    }
    if (!project || project.officeLat == null || project.officeLng == null) {
      res.status(400).json({ error: 'لم يتم إعداد موقع مكتب المشروع.' });
      return;
    }

    const shiftDate = riyadhDateValue();
    const existing = await prisma.shiftLog.findUnique({
      where: {
        technicianId_shiftDate_projectId: {
          technicianId,
          shiftDate,
          projectId,
        },
      },
      select: { id: true, status: true, clockInAt: true, clockOutAt: true },
    });
    if (existing) {
      res.status(409).json({
        code: 'SHIFT_ALREADY_RECORDED',
        error: existing.status === 'COMPLETED'
          ? 'تم تسجيل وردية هذا اليوم بالفعل.'
          : 'يوجد تسجيل حضور نشط لهذا اليوم بالفعل.',
        shift: existing,
      });
      return;
    }

    const distance = haversineMeters(loc.lat, loc.lng, project.officeLat, project.officeLng);
    if (distance > MAX_ATTENDANCE_DISTANCE_M) {
      res.status(422).json({
        code: 'OUTSIDE_ATTENDANCE_GEOFENCE',
        error: `لا يمكن تسجيل الحضور من هذا المكان. أنت على بُعد ${Math.round(distance)}م والحد الأقصى ${MAX_ATTENDANCE_DISTANCE_M}م.`,
        distanceM: Math.round(distance),
        maxDistanceM: MAX_ATTENDANCE_DISTANCE_M,
      });
      return;
    }

    const riskSignals: string[] = [];
    if (loc.accuracy < 2) riskSignals.push('gps_unrealistic_precision');
    if (loc.speed !== null && Number.isFinite(loc.speed) && loc.speed > 55) riskSignals.push('gps_impossible_speed');
    if (loc.altitudeAccuracy !== null && Number.isFinite(loc.altitudeAccuracy) && loc.altitudeAccuracy === 0) {
      riskSignals.push('gps_suspicious_altitude_accuracy');
    }

    const shift = await prisma.shiftLog.create({
      data: {
        technicianId,
        projectId,
        shiftDate,
        status: 'ACTIVE',
        clockInAt: new Date(),
        clockInLat: loc.lat,
        clockInLng: loc.lng,
        clockInAccuracy: loc.accuracy,
        clockInDistanceM: distance,
        isFlagged: riskSignals.length > 0,
        flagReason: riskSignals.length ? riskSignals.join(',') : null,
      },
    });

    res.json(shift);
  } catch (err: any) {
    console.error('[tech-shift] clock-in failed:', err);
    res.status(500).json({ error: 'تعذر تسجيل الحضور.' });
  }
});

router.post('/shift/clock-out', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;

    const unfinished = await prisma.appointmentWorkSession.findFirst({
      where: { technicianId, status: { in: OPEN_VISIT_PHASES } },
      select: { appointmentId: true, status: true },
    });
    if (unfinished) {
      res.status(409).json({
        code: 'UNFINISHED_APPOINTMENT',
        error: 'لا يمكن تسجيل الانصراف قبل إنهاء أو تأجيل الموعد الجاري.',
        activeAppointmentId: unfinished.appointmentId,
        sessionStatus: unfinished.status,
      });
      return;
    }

    const shift = await prisma.shiftLog.findFirst({
      where: { technicianId, status: { in: ['ACTIVE', 'ON_BREAK'] } },
      orderBy: { clockInAt: 'desc' },
    });
    if (!shift) {
      res.status(409).json({ error: 'لا توجد وردية نشطة.' });
      return;
    }

    const now = new Date();
    const openBreak = await prisma.shiftBreakLog.findFirst({
      where: { shiftLogId: shift.id, endedAt: null },
    });
    if (openBreak) {
      const durationMins = Math.max(0, Math.round((now.getTime() - openBreak.startedAt.getTime()) / 60000));
      await prisma.shiftBreakLog.update({
        where: { id: openBreak.id },
        data: { endedAt: now, durationMins },
      });
    }

    const [setting, breaks] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'work_hours' } }),
      prisma.shiftBreakLog.findMany({ where: { shiftLogId: shift.id } }),
    ]);

    const wh = (setting?.value as unknown as WorkHoursSettings) || DEFAULT_WORK_HOURS;
    const projectWh = wh.byProject?.[shift.projectId] || wh.default;
    const totalElapsedMinutes = Math.max(0, Math.round((now.getTime() - shift.clockInAt.getTime()) / 60000));
    const totalBreakMinutes = breaks.reduce((sum, entry) => {
      if (entry.id === openBreak?.id) {
        return sum + Math.max(0, Math.round((now.getTime() - entry.startedAt.getTime()) / 60000));
      }
      return sum + (entry.durationMins || 0);
    }, 0);

    let regularMinutes = 8 * 60;
    if (projectWh.enabled && projectWh.hasMorning && projectWh.hasAfternoon) {
      regularMinutes = Math.max(0,
        (toMins(projectWh.morning.end) - toMins(projectWh.morning.start))
        + (toMins(projectWh.afternoon.end) - toMins(projectWh.afternoon.start)),
      );
    }

    const netShiftMinutes = Math.max(0, totalElapsedMinutes - totalBreakMinutes);
    const overtimeMinutes = Math.max(0, netShiftMinutes - regularMinutes);
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);

    const updated = await prisma.shiftLog.update({
      where: { id: shift.id },
      data: {
        clockOutAt: now,
        clockOutLat: Number.isFinite(lat) ? lat : null,
        clockOutLng: Number.isFinite(lng) ? lng : null,
        clockOutNote: typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) || null : null,
        status: 'COMPLETED',
        totalWorkMinutes: netShiftMinutes,
        totalBreakMinutes,
        regularMinutes: Math.min(regularMinutes, netShiftMinutes),
        overtimeMinutes,
      },
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[tech-shift] clock-out failed:', err);
    res.status(500).json({ error: 'تعذر تسجيل الانصراف.' });
  }
});

router.post('/shift/break/start', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const activeVisit = await prisma.appointmentWorkSession.findFirst({
      where: { technicianId, status: { in: ['claimed', 'en_route', 'arrived', 'in_progress'] } },
      select: { appointmentId: true, status: true },
    });
    if (activeVisit) {
      res.status(409).json({
        code: 'PAUSE_APPOINTMENT_FIRST',
        error: 'أوقف/عالج الموعد الجاري قبل بدء الاستراحة.',
        activeAppointmentId: activeVisit.appointmentId,
        visitPhase: activeVisit.status,
      });
      return;
    }

    const shift = await prisma.shiftLog.findFirst({
      where: { technicianId, status: 'ACTIVE' },
      orderBy: { clockInAt: 'desc' },
    });
    if (!shift) {
      res.status(409).json({ error: 'لا توجد وردية نشطة.' });
      return;
    }

    const breakLog = await prisma.$transaction(async tx => {
      await tx.shiftLog.update({ where: { id: shift.id }, data: { status: 'ON_BREAK' } });
      return tx.shiftBreakLog.create({
        data: {
          shiftLogId: shift.id,
          breakType: typeof req.body?.breakType === 'string' ? req.body.breakType.slice(0, 40) : 'MEAL',
          startedAt: new Date(),
        },
      });
    });

    res.json(breakLog);
  } catch (err: any) {
    console.error('[tech-shift] break start failed:', err);
    res.status(500).json({ error: 'تعذر بدء الاستراحة.' });
  }
});

router.post('/shift/break/end', requireTechAuth, async (req: TechAuthRequest, res) => {
  try {
    const technicianId = req.technicianId!;
    const shift = await prisma.shiftLog.findFirst({
      where: { technicianId, status: 'ON_BREAK' },
      orderBy: { clockInAt: 'desc' },
    });
    if (!shift) {
      res.status(409).json({ error: 'لا توجد استراحة نشطة.' });
      return;
    }

    const openBreak = await prisma.shiftBreakLog.findFirst({
      where: { shiftLogId: shift.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!openBreak) {
      res.status(409).json({ error: 'تعذر العثور على سجل الاستراحة المفتوح.' });
      return;
    }

    const now = new Date();
    const durationMins = Math.max(0, Math.round((now.getTime() - openBreak.startedAt.getTime()) / 60000));
    const updated = await prisma.$transaction(async tx => {
      await tx.shiftBreakLog.update({
        where: { id: openBreak.id },
        data: { endedAt: now, durationMins },
      });
      return tx.shiftLog.update({
        where: { id: shift.id },
        data: { status: 'ACTIVE' },
      });
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[tech-shift] break end failed:', err);
    res.status(500).json({ error: 'تعذر إنهاء الاستراحة.' });
  }
});

export default router;
