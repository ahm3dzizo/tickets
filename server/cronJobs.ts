// server/cronJobs.ts — Scheduled push notifications
// Runs in Saudi Arabia timezone (UTC+3): cron times below are local SA time converted to UTC
// Sun–Thu workweek: day-of-week 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu
import cron from 'node-cron';
import prisma from './db.js';
import { sendPushToUser, sendPushToRoles } from './pushService.js';
import { DEFAULT_WORK_HOURS } from './routes/settings.js';

const TZ = 'Asia/Riyadh';
const APPOINTMENT_SNAPSHOT_KEY = 'pushAppointmentSnapshotV1';
const IMPORT_PUSH_PREFIX = 'pushImportNotified:';
const APPOINTMENT_REMINDER_PREFIX = 'pushAppointmentReminder:';

// ── helpers ──────────────────────────────────────────────────────────────────

async function getWorkHours() {
  const s = await prisma.systemSetting.findUnique({ where: { key: 'workHours' } });
  return (s?.value as any) || DEFAULT_WORK_HOURS;
}

function today0() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function today24() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function todayDateInRiyadh() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function appointmentMoment(date: string, time?: string | null): Date | null {
  if (!date || !time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const normalizedTime = time.length === 4 ? `0${time}` : time;
  const d = new Date(`${date}T${normalizedTime}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function sendToAppointmentPeople(
  supervisorIds: string[],
  technicianIds: string[],
  payload: { title: string; body: string; tag: string; url: string; requireInteraction?: boolean },
) {
  const recipients = new Set<string>([...supervisorIds, ...technicianIds].filter(Boolean));
  await Promise.all([...recipients].map(uid => sendPushToUser(uid, payload)));
}

// ── 1. Technician morning: today's open appointments (08:00 SA = 05:00 UTC) ──
async function notifyTechniciansAppointments() {
  const appts = await prisma.appointment.findMany({
    where: { date: todayDateInRiyadh(), status: 'scheduled' },
    include: { technician: true, unit: { include: { block: true } } },
  });
  const byTech: Record<string, typeof appts> = {};
  for (const a of appts) {
    if (!a.technicianId) continue;
    byTech[a.technicianId] ??= [];
    byTech[a.technicianId].push(a);
  }
  for (const [techId, list] of Object.entries(byTech)) {
    await sendPushToUser(techId, {
      title: `مواعيدك اليوم (${list.length})`,
      body: list.slice(0, 3).map(a => `فيلا ${a.unit?.unitNumber || '—'} — ${a.notes?.slice(0, 40) || ''}`).join('\n'),
      tag: 'tech-daily-appointments',
      url: '/tech/appointments',
    });
  }
  console.log(`[cron] Notified ${Object.keys(byTech).length} technicians about today's appointments`);
}

// ── 2. Supervisor morning + 10 min: attendance + open tickets ──────────────
async function notifySupervisorsAttendance() {
  const openTickets = await prisma.ticket.findMany({
    where: { status: 'open', createdAt: { gte: today0() } },
    select: { projectId: true, id: true },
  });
  const ticketsByProject: Record<string, number> = {};
  for (const t of openTickets) {
    if (t.projectId) ticketsByProject[t.projectId] = (ticketsByProject[t.projectId] || 0) + 1;
  }

  const supervisors = await prisma.user.findMany({
    where: { role: 'supervisor' },
    include: { projects: { select: { id: true, name: true } } },
  });

  for (const sup of supervisors) {
    const projectIds = sup.projects.map(p => p.id);
    if (!projectIds.length) continue;

    const allTechs = await prisma.technician.findMany({
      where: { projectId: { in: projectIds }, isActive: true },
      select: { id: true, name: true },
    });

    const clockedIn = await prisma.shiftLog.findMany({
      where: {
        technicianId: { in: allTechs.map(t => t.id) },
        clockInAt: { gte: today0() },
      },
      select: { technicianId: true },
    });

    const clockedInIds = new Set(clockedIn.map(s => s.technicianId));
    const totalTechs = allTechs.length;
    const presentCount = clockedInIds.size;
    const absentCount = totalTechs - presentCount;
    const openCount = projectIds.reduce((n, pid) => n + (ticketsByProject[pid] || 0), 0);

    let body = `${presentCount}/${totalTechs} فني سجلوا الحضور`;
    if (absentCount > 0) body += ` — ${absentCount} لم يسجلوا بعد`;
    if (openCount > 0) body += `\n${openCount} تذكرة مفتوحة اليوم`;

    await sendPushToUser(sup.uid, {
      title: 'ملخص بداية الدوام',
      body,
      tag: 'supervisor-morning-summary',
      url: '/tickets',
    });
  }
  console.log(`[cron] Notified ${supervisors.length} supervisors about attendance`);
}

// ── 3. Engineer end-of-day: closure summary by supervisors ────────────────
async function notifyEngineersClosureSummary() {
  const closed = await prisma.ticket.findMany({
    where: {
      status: { in: ['closed', 'out_of_scope', 'absent'] },
      closedAt: { gte: today0(), lte: today24() },
    },
    select: { projectId: true },
  });

  const engineers = await prisma.user.findMany({
    where: { role: 'engineer' },
    include: { projects: { select: { id: true } } },
  });

  for (const eng of engineers) {
    const myProjectIds = new Set(eng.projects.map(p => p.id));
    const myClosures = closed.filter(t => t.projectId && myProjectIds.has(t.projectId));
    if (myClosures.length === 0) continue;

    await sendPushToUser(eng.uid, {
      title: 'ملخص نهاية الدوام',
      body: `تم إغلاق ${myClosures.length} تذكرة في مشاريعك اليوم`,
      tag: 'engineer-eod-summary',
      url: '/tickets?status=closed',
    });
  }
  console.log(`[cron] Notified ${engineers.length} engineers about end-of-day closures`);
}

// ── 4. Late tickets: open > 24h — notify supervisors every 2 hours ────────
async function notifyLateTickets() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const lateTickets = await prisma.ticket.findMany({
    where: { status: 'open', createdAt: { lte: cutoff } },
    select: {
      id: true,
      description: true,
      projectId: true,
      unit: { select: { unitNumber: true } },
    },
  });
  if (!lateTickets.length) return;

  const supervisors = await prisma.user.findMany({
    where: { role: 'supervisor' },
    include: { projects: { select: { id: true } } },
  });

  for (const sup of supervisors) {
    const myProjectIds = new Set(sup.projects.map(p => p.id));
    const mine = lateTickets.filter(t => t.projectId && myProjectIds.has(t.projectId));
    if (!mine.length) continue;

    await sendPushToUser(sup.uid, {
      title: `تذاكر متأخرة (${mine.length})`,
      body: mine.slice(0, 3).map(t => `فيلا ${t.unit?.unitNumber || '—'}: ${t.description?.slice(0, 50) || ''}`).join('\n'),
      tag: 'late-tickets',
      url: '/tickets?status=open',
      requireInteraction: true,
    });
  }
  console.log(`[cron] Late ticket alerts sent — ${lateTickets.length} tickets`);
}

// ── 5. Admin daily summary at shift end (16:00 SA = 13:00 UTC) ────────────
async function notifyAdminDailySummary() {
  const [openCount, closedToday, activeTechs] = await Promise.all([
    prisma.ticket.count({ where: { status: 'open' } }),
    prisma.ticket.count({
      where: {
        status: { in: ['closed', 'absent', 'out_of_scope'] },
        closedAt: { gte: today0(), lte: today24() },
      },
    }),
    prisma.shiftLog.count({ where: { clockInAt: { gte: today0() }, clockOutAt: null } }),
  ]);

  await sendPushToRoles(['admin'], {
    title: 'تقرير نهاية اليوم',
    body: `تذاكر مفتوحة: ${openCount} | مغلقة اليوم: ${closedToday} | فنيين نشطين: ${activeTechs}`,
    tag: 'admin-daily-summary',
    url: '/dashboard',
  });
  console.log('[cron] Admin daily summary sent');
}

// ── 6. Appointment reminder: supervisor + technician, 30 min before ─────────
async function notifyUpcomingAppointments() {
  const today = todayDateInRiyadh();
  const appointments = await prisma.appointment.findMany({
    where: { date: today, status: 'scheduled', time: { not: null } },
    select: {
      id: true,
      date: true,
      time: true,
      supervisorIds: true,
      technicianId: true,
      technicianIds: true,
      unit: { select: { unitNumber: true } },
    },
  });

  const now = Date.now();
  for (const a of appointments) {
    const when = appointmentMoment(a.date, a.time);
    if (!when) continue;
    const mins = (when.getTime() - now) / 60000;
    if (mins <= 0 || mins > 30) continue;

    const reminderKey = `${APPOINTMENT_REMINDER_PREFIX}${a.id}:${a.date}:${a.time}`;
    const sent = await prisma.systemSetting.findUnique({ where: { key: reminderKey } });
    if (sent) continue;

    const techIds = Array.from(new Set([a.technicianId, ...(a.technicianIds || [])].filter(Boolean) as string[]));
    const unit = a.unit?.unitNumber || '—';
    await sendToAppointmentPeople(a.supervisorIds || [], techIds, {
      title: 'موعد يقترب',
      body: `موعد الوحدة ${unit} الساعة ${a.time} يبدأ خلال حوالي ${Math.max(1, Math.round(mins))} دقيقة`,
      tag: `appointment-reminder-${a.id}`,
      url: '/appointments',
      requireInteraction: true,
    });

    await prisma.systemSetting.create({
      data: { key: reminderKey, value: { sentAt: new Date().toISOString() } },
    }).catch(() => {});
  }
}

type AppointmentSnapshot = {
  date: string;
  time: string | null;
  status: string;
  supervisorIds: string[];
  technicianId: string | null;
  technicianIds: string[];
  unitNumber: string;
};

// ── 7. Appointment assignment / edit / cancellation watcher ─────────────────
async function notifyAppointmentChanges() {
  const appointments = await prisma.appointment.findMany({
    select: {
      id: true,
      date: true,
      time: true,
      status: true,
      supervisorIds: true,
      technicianId: true,
      technicianIds: true,
      unit: { select: { unitNumber: true } },
    },
  });

  const current: Record<string, AppointmentSnapshot> = {};
  for (const a of appointments) {
    current[a.id] = {
      date: a.date,
      time: a.time,
      status: String(a.status),
      supervisorIds: a.supervisorIds || [],
      technicianId: a.technicianId || null,
      technicianIds: a.technicianIds || [],
      unitNumber: a.unit?.unitNumber || '—',
    };
  }

  const row = await prisma.systemSetting.findUnique({ where: { key: APPOINTMENT_SNAPSHOT_KEY } });
  const previous = (row?.value as Record<string, AppointmentSnapshot> | null) || null;

  // First run only seeds the snapshot, to avoid flooding everyone after deploy.
  if (!previous) {
    await prisma.systemSetting.upsert({
      where: { key: APPOINTMENT_SNAPSHOT_KEY },
      create: { key: APPOINTMENT_SNAPSHOT_KEY, value: current },
      update: { value: current },
    });
    return;
  }

  for (const [id, next] of Object.entries(current)) {
    const old = previous[id];
    if (!old) continue;

    const oldTechIds = Array.from(new Set([old.technicianId, ...(old.technicianIds || [])].filter(Boolean) as string[]));
    const newTechIds = Array.from(new Set([next.technicianId, ...(next.technicianIds || [])].filter(Boolean) as string[]));
    const newAssignments = newTechIds.filter(t => !oldTechIds.includes(t));
    const techChanged = oldTechIds.join('|') !== newTechIds.join('|');
    const scheduleChanged = old.date !== next.date || old.time !== next.time;
    const cancelledNow = old.status !== 'cancelled' && next.status === 'cancelled';

    if (cancelledNow) {
      await sendToAppointmentPeople(
        Array.from(new Set([...(old.supervisorIds || []), ...(next.supervisorIds || [])])),
        Array.from(new Set([...oldTechIds, ...newTechIds])),
        {
          title: 'تم إلغاء الموعد',
          body: `تم إلغاء موعد الوحدة ${next.unitNumber} بتاريخ ${next.date}${next.time ? ` الساعة ${next.time}` : ''}`,
          tag: `appointment-cancelled-${id}`,
          url: '/appointments',
          requireInteraction: true,
        },
      );
      continue;
    }

    if (newAssignments.length > 0) {
      await Promise.all(newAssignments.map(techId => sendPushToUser(techId, {
        title: 'تم تعيينك على موعد',
        body: `الوحدة ${next.unitNumber} — ${next.date}${next.time ? ` الساعة ${next.time}` : ''}`,
        tag: `appointment-assigned-${id}`,
        url: '/tech/appointments',
        requireInteraction: true,
      })));

      await Promise.all((next.supervisorIds || []).map(uid => sendPushToUser(uid, {
        title: 'تم تعيين فني على الموعد',
        body: `تم تعيين فني على موعد الوحدة ${next.unitNumber} — ${next.date}${next.time ? ` الساعة ${next.time}` : ''}`,
        tag: `appointment-tech-assigned-${id}`,
        url: '/appointments',
      })));
    }

    if (scheduleChanged) {
      await sendToAppointmentPeople(next.supervisorIds || [], newTechIds, {
        title: 'تم تعديل الموعد',
        body: `الموعد الجديد للوحدة ${next.unitNumber}: ${next.date}${next.time ? ` الساعة ${next.time}` : ''}`,
        tag: `appointment-updated-${id}`,
        url: '/appointments',
        requireInteraction: true,
      });
    } else if (techChanged && newAssignments.length === 0) {
      await Promise.all((next.supervisorIds || []).map(uid => sendPushToUser(uid, {
        title: 'تم تعديل الفني على الموعد',
        body: `تم تعديل تعيين الفني لموعد الوحدة ${next.unitNumber}`,
        tag: `appointment-tech-updated-${id}`,
        url: '/appointments',
      })));
    }
  }

  // Physical deletion is treated as cancellation and notifies the last known people.
  for (const [id, old] of Object.entries(previous)) {
    if (current[id]) continue;
    const oldTechIds = Array.from(new Set([old.technicianId, ...(old.technicianIds || [])].filter(Boolean) as string[]));
    await sendToAppointmentPeople(old.supervisorIds || [], oldTechIds, {
      title: 'تم إلغاء الموعد',
      body: `تم حذف/إلغاء موعد الوحدة ${old.unitNumber} بتاريخ ${old.date}${old.time ? ` الساعة ${old.time}` : ''}`,
      tag: `appointment-deleted-${id}`,
      url: '/appointments',
      requireInteraction: true,
    });
  }

  await prisma.systemSetting.upsert({
    where: { key: APPOINTMENT_SNAPSHOT_KEY },
    create: { key: APPOINTMENT_SNAPSHOT_KEY, value: current },
    update: { value: current },
  });
}

// ── 8. Import summary: supervisors receive NEW ticket count 5 min after import ─
async function notifySupervisorsAfterImports() {
  const historyRow = await prisma.systemSetting.findUnique({ where: { key: 'importHistory' } });
  const history = (historyRow?.value as any[]) || [];
  if (!history.length) return;

  const now = Date.now();
  for (const item of history.slice(0, 20)) {
    const timestamp = String(item?.timestamp || '');
    const added = Number(item?.added || 0);
    const projectName = String(item?.project || '');
    if (!timestamp || !projectName || added <= 0) continue;

    const importedAt = new Date(timestamp).getTime();
    if (!Number.isFinite(importedAt)) continue;
    const ageMs = now - importedAt;
    if (ageMs < 5 * 60 * 1000 || ageMs > 24 * 60 * 60 * 1000) continue;

    const markerKey = `${IMPORT_PUSH_PREFIX}${timestamp}`;
    const marker = await prisma.systemSetting.findUnique({ where: { key: markerKey } });
    if (marker) continue;

    const project = await prisma.project.findFirst({
      where: { name: projectName },
      select: { id: true, name: true },
    });
    if (!project) continue;

    const supervisors = await prisma.user.findMany({
      where: {
        role: 'supervisor',
        projects: { some: { id: project.id } },
      },
      select: { uid: true },
    });

    await Promise.all(supervisors.map(sup => sendPushToUser(sup.uid, {
      title: 'تذاكر جديدة بعد الاستيراد',
      body: `تمت إضافة ${added} تذكرة جديدة في مشروع ${project.name}`,
      tag: `import-new-tickets-${project.id}-${importedAt}`,
      url: `/tickets?projectId=${encodeURIComponent(project.id)}`,
      requireInteraction: true,
    })));

    await prisma.systemSetting.create({
      data: {
        key: markerKey,
        value: { notifiedAt: new Date().toISOString(), projectId: project.id, added },
      },
    }).catch(() => {});

    console.log(`[cron] Import push sent project=${project.name} added=${added} supervisors=${supervisors.length}`);
  }
}

async function runMinutePushJobs() {
  try { await notifyUpcomingAppointments(); } catch (err) { console.error('[cron] upcoming appointment push failed:', err); }
  try { await notifyAppointmentChanges(); } catch (err) { console.error('[cron] appointment change push failed:', err); }
  try { await notifySupervisorsAfterImports(); } catch (err) { console.error('[cron] import summary push failed:', err); }
}

// ── Schedule ─────────────────────────────────────────────────────────────────
export function startCronJobs() {
  const WEEKDAYS = '0-4';
  const ADMIN_DAYS = '0-4,6';

  cron.schedule(`0 5 * * ${WEEKDAYS}`, notifyTechniciansAppointments, { timezone: 'UTC' });
  cron.schedule(`10 5 * * ${WEEKDAYS}`, notifySupervisorsAttendance, { timezone: 'UTC' });
  cron.schedule(`0 13 * * ${WEEKDAYS}`, notifyEngineersClosureSummary, { timezone: 'UTC' });
  cron.schedule(`0 13 * * ${ADMIN_DAYS}`, notifyAdminDailySummary, { timezone: 'UTC' });
  cron.schedule(`0 5,7,9,11,13 * * ${WEEKDAYS}`, notifyLateTickets, { timezone: 'UTC' });

  // Operational notifications: every minute, all days.
  cron.schedule('* * * * *', runMinutePushJobs, { timezone: 'UTC' });
  void runMinutePushJobs();

  console.log('[cron] Notification jobs scheduled');
}
