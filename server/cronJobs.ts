// server/cronJobs.ts — Scheduled push notifications
// Runs in Saudi Arabia timezone (UTC+3): cron times below are local SA time converted to UTC
// Sun–Thu workweek: day-of-week 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu
import cron from 'node-cron';
import prisma from './db.js';
import { sendPushToUser, sendPushToRole, sendPushToRoles } from './pushService.js';
import { DEFAULT_WORK_HOURS } from './routes/settings.js';

const TZ = 'Asia/Riyadh';

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

// ── 1. Technician morning: today's open appointments (08:00 SA = 05:00 UTC) ──
async function notifyTechniciansAppointments() {
  // Find all technicians with appointments today
  const appts = await prisma.appointment.findMany({
    where: { date: todayDateInRiyadh(), status: 'scheduled' },
    include: { technician: true, unit: { include: { block: true } } },
  });
  // Group by technician
  const byTech: Record<string, typeof appts> = {};
  for (const a of appts) {
    if (!a.technicianId) continue;
    byTech[a.technicianId] ??= [];
    byTech[a.technicianId].push(a);
  }
  for (const [techId, list] of Object.entries(byTech)) {
    await sendPushToUser(techId, {
      title: `📋 مواعيدك اليوم (${list.length})`,
      body: list.slice(0, 3).map(a => `فيلا ${a.unit?.unitNumber || '—'} — ${a.notes?.slice(0, 40) || ''}`).join('\n'),
      tag: 'tech-daily-appointments',
      url: '/tech/appointments',
    });
  }
  console.log(`[cron] Notified ${Object.keys(byTech).length} technicians about today's appointments`);
}

// ── 2. Supervisor morning + 10 min: attendance + open tickets ──────────────
async function notifySupervisorsAttendance() {
  // Get today's open tickets per project
  const openTickets = await prisma.ticket.findMany({
    where: { status: 'open', createdAt: { gte: today0() } },
    select: { projectId: true, id: true },
  });
  const ticketsByProject: Record<string, number> = {};
  for (const t of openTickets) {
    if (t.projectId) ticketsByProject[t.projectId] = (ticketsByProject[t.projectId] || 0) + 1;
  }

  // Get all active technicians per project and how many clocked in today
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
    const totalTechs   = allTechs.length;
    const presentCount = clockedInIds.size;
    const absentCount  = totalTechs - presentCount;

    const openCount = projectIds.reduce((n, pid) => n + (ticketsByProject[pid] || 0), 0);

    let body = `👷 ${presentCount}/${totalTechs} فني سجلوا الحضور`;
    if (absentCount > 0) body += ` — ${absentCount} لم يسجلوا بعد`;
    if (openCount > 0)   body += `\n📋 ${openCount} تذكرة مفتوحة اليوم`;

    await sendPushToUser(sup.uid, {
      title: '☀️ ملخص بداية الدوام',
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
      title: '📊 ملخص نهاية الدوام',
      body: `تم إغلاق ${myClosures.length} تذكرة في مشاريعك اليوم`,
      tag: 'engineer-eod-summary',
      url: '/tickets?status=closed',
    });
  }
  console.log(`[cron] Notified ${engineers.length} engineers about end-of-day closures`);
}

// ── 4. Late tickets: open > 24h — notify supervisors every 2 hours ────────
async function notifyLateTickets() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
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
      title: `⚠️ تذاكر متأخرة (${mine.length})`,
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
    title: '📊 تقرير نهاية اليوم',
    body: `تذاكر مفتوحة: ${openCount} | مغلقة اليوم: ${closedToday} | فنيين نشطين: ${activeTechs}`,
    tag: 'admin-daily-summary',
    url: '/dashboard',
  });
  console.log('[cron] Admin daily summary sent');
}

// ── Schedule ─────────────────────────────────────────────────────────────────
export function startCronJobs() {
  // Sunday–Thursday workweek (0=Sun 1=Mon 2=Tue 3=Wed 4=Thu)
  const WEEKDAYS = '0-4';

  // 08:00 SA = 05:00 UTC — technicians: today's appointments
  cron.schedule(`0 5 * * ${WEEKDAYS}`, notifyTechniciansAppointments, { timezone: 'UTC' });

  // 08:10 SA = 05:10 UTC — supervisors: attendance summary
  cron.schedule(`10 5 * * ${WEEKDAYS}`, notifySupervisorsAttendance, { timezone: 'UTC' });

  // 16:00 SA = 13:00 UTC — engineers: closure summary
  cron.schedule(`0 13 * * ${WEEKDAYS}`, notifyEngineersClosureSummary, { timezone: 'UTC' });

  // 16:00 SA = 13:00 UTC — admins: daily summary
  cron.schedule(`0 13 * * ${WEEKDAYS}`, notifyAdminDailySummary, { timezone: 'UTC' });

  // Every 2 hours 08:00–16:00 SA (05:00–13:00 UTC) — late ticket alerts
  cron.schedule(`0 5,7,9,11,13 * * ${WEEKDAYS}`, notifyLateTickets, { timezone: 'UTC' });

  console.log('[cron] Notification jobs scheduled');
}
