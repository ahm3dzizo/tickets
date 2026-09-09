// server/cronJobs.ts — Scheduled push notifications
// Operational dates are evaluated explicitly in Asia/Riyadh.
import cron from 'node-cron';
import prisma from './db.js';
import { sendPushToUser, sendPushToRoles } from './pushService.js';
import { DEFAULT_WORK_HOURS } from './routes/settings.js';

const TZ = 'Asia/Riyadh';
const APPOINTMENT_SNAPSHOT_KEY = 'pushAppointmentSnapshotV1';
const IMPORT_PUSH_PREFIX = 'pushImportNotified:';
const APPOINTMENT_REMINDER_PREFIX = 'pushAppointmentReminder:';

type PushPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
  requireInteraction?: boolean;
};

type TechLanguage = 'ar' | 'en' | 'hi' | 'ur';

// ── helpers ──────────────────────────────────────────────────────────────────

async function getWorkHours() {
  const s = await prisma.systemSetting.findUnique({ where: { key: 'workHours' } });
  return (s?.value as any) || DEFAULT_WORK_HOURS;
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

function today0() {
  return new Date(`${todayDateInRiyadh()}T00:00:00+03:00`);
}

function today24() {
  return new Date(`${todayDateInRiyadh()}T23:59:59.999+03:00`);
}

function appointmentMoment(date: string, time?: string | null): Date | null {
  if (!date || !time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const normalizedTime = time.length === 4 ? `0${time}` : time;
  const d = new Date(`${date}T${normalizedTime}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizedTechLanguage(value?: string | null): TechLanguage {
  return value === 'en' || value === 'hi' || value === 'ur' ? value : 'ar';
}

async function technicianLanguages(ids: string[]): Promise<Map<string, TechLanguage>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return new Map();
  const rows = await prisma.technician.findMany({
    where: { id: { in: uniqueIds }, isActive: true },
    select: { id: true, language: true },
  });
  return new Map(rows.map(row => [row.id, normalizedTechLanguage(row.language)]));
}

function techAppointmentCopy(
  lang: TechLanguage,
  kind: 'morning' | 'reminder' | 'assigned' | 'updated' | 'cancelled' | 'deleted',
  data: { count?: number; unit?: string; date?: string; time?: string | null; mins?: number; summary?: string },
): { title: string; body: string } {
  const unit = data.unit || '—';
  const date = data.date || '';
  const time = data.time ? ` ${data.time}` : '';

  if (lang === 'en') {
    if (kind === 'morning') return { title: `Today's appointments (${data.count || 0})`, body: data.summary || '' };
    if (kind === 'reminder') return { title: 'Appointment coming up', body: `Unit ${unit} at ${data.time || '—'} starts in about ${Math.max(1, data.mins || 1)} minutes.` };
    if (kind === 'assigned') return { title: 'You were assigned an appointment', body: `Unit ${unit} — ${date}${time}` };
    if (kind === 'updated') return { title: 'Appointment updated', body: `New schedule for unit ${unit}: ${date}${time}` };
    if (kind === 'cancelled') return { title: 'Appointment cancelled', body: `Unit ${unit} — ${date}${time}` };
    return { title: 'Appointment removed', body: `Unit ${unit} — ${date}${time}` };
  }

  if (lang === 'hi') {
    if (kind === 'morning') return { title: `आज की अपॉइंटमेंट (${data.count || 0})`, body: data.summary || '' };
    if (kind === 'reminder') return { title: 'अपॉइंटमेंट जल्द शुरू होगी', body: `यूनिट ${unit} की अपॉइंटमेंट लगभग ${Math.max(1, data.mins || 1)} मिनट में शुरू होगी।` };
    if (kind === 'assigned') return { title: 'आपको नई अपॉइंटमेंट दी गई है', body: `यूनिट ${unit} — ${date}${time}` };
    if (kind === 'updated') return { title: 'अपॉइंटमेंट बदली गई', body: `यूनिट ${unit}: ${date}${time}` };
    if (kind === 'cancelled') return { title: 'अपॉइंटमेंट रद्द हुई', body: `यूनिट ${unit} — ${date}${time}` };
    return { title: 'अपॉइंटमेंट हटाई गई', body: `यूनिट ${unit} — ${date}${time}` };
  }

  if (lang === 'ur') {
    if (kind === 'morning') return { title: `آج کی اپائنٹمنٹس (${data.count || 0})`, body: data.summary || '' };
    if (kind === 'reminder') return { title: 'اپائنٹمنٹ قریب ہے', body: `یونٹ ${unit} کی اپائنٹمنٹ تقریباً ${Math.max(1, data.mins || 1)} منٹ میں شروع ہوگی۔` };
    if (kind === 'assigned') return { title: 'آپ کو نئی اپائنٹمنٹ دی گئی ہے', body: `یونٹ ${unit} — ${date}${time}` };
    if (kind === 'updated') return { title: 'اپائنٹمنٹ تبدیل ہوئی', body: `یونٹ ${unit}: ${date}${time}` };
    if (kind === 'cancelled') return { title: 'اپائنٹمنٹ منسوخ ہوئی', body: `یونٹ ${unit} — ${date}${time}` };
    return { title: 'اپائنٹمنٹ حذف ہوئی', body: `یونٹ ${unit} — ${date}${time}` };
  }

  if (kind === 'morning') return { title: `مواعيدك اليوم (${data.count || 0})`, body: data.summary || '' };
  if (kind === 'reminder') return { title: 'موعد يقترب', body: `موعد الوحدة ${unit} الساعة ${data.time || '—'} يبدأ خلال حوالي ${Math.max(1, data.mins || 1)} دقيقة` };
  if (kind === 'assigned') return { title: 'تم تعيينك على موعد', body: `الوحدة ${unit} — ${date}${time ? ` الساعة${time}` : ''}` };
  if (kind === 'updated') return { title: 'تم تعديل الموعد', body: `الموعد الجديد للوحدة ${unit}: ${date}${time ? ` الساعة${time}` : ''}` };
  if (kind === 'cancelled') return { title: 'تم إلغاء الموعد', body: `الوحدة ${unit} — ${date}${time ? ` الساعة${time}` : ''}` };
  return { title: 'تم حذف الموعد', body: `الوحدة ${unit} — ${date}${time ? ` الساعة${time}` : ''}` };
}

async function sendAppointmentPeople(
  supervisorIds: string[],
  technicianIds: string[],
  supervisorPayload: PushPayload,
  techPayload: Omit<PushPayload, 'title' | 'body'> & {
    kind: 'reminder' | 'assigned' | 'updated' | 'cancelled' | 'deleted';
    data: { unit?: string; date?: string; time?: string | null; mins?: number };
  },
) {
  const supervisors = Array.from(new Set(supervisorIds.filter(Boolean)));
  const technicians = Array.from(new Set(technicianIds.filter(Boolean)));
  const languages = await technicianLanguages(technicians);

  await Promise.all(supervisors.map(uid => sendPushToUser(uid, supervisorPayload)));
  await Promise.all(technicians.map(uid => {
    const copy = techAppointmentCopy(languages.get(uid) || 'ar', techPayload.kind, techPayload.data);
    return sendPushToUser(uid, {
      title: copy.title,
      body: copy.body,
      tag: techPayload.tag,
      url: techPayload.url,
      requireInteraction: techPayload.requireInteraction,
    });
  }));
}

// ── 1. Technician morning: today's open appointments (08:00 SA = 05:00 UTC) ──
async function notifyTechniciansAppointments() {
  const appts = await prisma.appointment.findMany({
    where: { date: todayDateInRiyadh(), status: 'scheduled' },
    include: { unit: { include: { block: true } } },
  });

  const byTech: Record<string, typeof appts> = {};
  for (const appointment of appts) {
    const techIds = Array.from(new Set([
      appointment.technicianId,
      ...(appointment.technicianIds || []),
    ].filter(Boolean) as string[]));
    for (const techId of techIds) {
      byTech[techId] ??= [];
      byTech[techId].push(appointment);
    }
  }

  const languages = await technicianLanguages(Object.keys(byTech));
  for (const [techId, list] of Object.entries(byTech)) {
    const lang = languages.get(techId) || 'ar';
    const summary = list.slice(0, 3).map(appointment => {
      const unit = appointment.unit?.unitNumber || '—';
      const note = appointment.notes?.slice(0, 40) || '';
      if (lang === 'en') return `Unit ${unit}${note ? ` — ${note}` : ''}`;
      if (lang === 'hi') return `यूनिट ${unit}${note ? ` — ${note}` : ''}`;
      if (lang === 'ur') return `یونٹ ${unit}${note ? ` — ${note}` : ''}`;
      return `فيلا ${unit}${note ? ` — ${note}` : ''}`;
    }).join('\n');
    const copy = techAppointmentCopy(lang, 'morning', { count: list.length, summary });

    await sendPushToUser(techId, {
      title: copy.title,
      body: copy.body,
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
  for (const ticket of openTickets) {
    if (ticket.projectId) ticketsByProject[ticket.projectId] = (ticketsByProject[ticket.projectId] || 0) + 1;
  }

  const supervisors = await prisma.user.findMany({
    where: { role: 'supervisor' },
    include: { projects: { select: { id: true, name: true } } },
  });

  for (const supervisor of supervisors) {
    const projectIds = supervisor.projects.map(project => project.id);
    if (!projectIds.length) continue;

    const allTechs = await prisma.technician.findMany({
      where: { projectId: { in: projectIds }, isActive: true },
      select: { id: true, name: true },
    });

    const clockedIn = await prisma.shiftLog.findMany({
      where: {
        technicianId: { in: allTechs.map(tech => tech.id) },
        clockInAt: { gte: today0(), lte: today24() },
      },
      select: { technicianId: true },
    });

    const clockedInIds = new Set(clockedIn.map(shift => shift.technicianId));
    const totalTechs = allTechs.length;
    const presentCount = clockedInIds.size;
    const absentCount = totalTechs - presentCount;
    const openCount = projectIds.reduce((count, projectId) => count + (ticketsByProject[projectId] || 0), 0);

    let body = `${presentCount}/${totalTechs} فني سجلوا الحضور`;
    if (absentCount > 0) body += ` — ${absentCount} لم يسجلوا بعد`;
    if (openCount > 0) body += `\n${openCount} تذكرة مفتوحة اليوم`;

    await sendPushToUser(supervisor.uid, {
      title: 'ملخص بداية الدوام',
      body,
      tag: 'supervisor-morning-summary',
      url: '/tickets',
    });
  }
  console.log(`[cron] Notified ${supervisors.length} supervisors about attendance`);
}

// ── 3. Engineer end-of-day: closure summary ─────────────────────────────────
async function notifyEngineersClosureSummary() {
  const closed = await prisma.ticket.findMany({
    where: {
      status: { in: ['closed', 'completed', 'out_of_scope', 'absent'] },
      closedAt: { gte: today0(), lte: today24() },
    },
    select: { projectId: true },
  });

  const engineers = await prisma.user.findMany({
    where: { role: 'engineer' },
    include: { projects: { select: { id: true } } },
  });

  for (const engineer of engineers) {
    const projectIds = new Set(engineer.projects.map(project => project.id));
    const closures = closed.filter(ticket => ticket.projectId && projectIds.has(ticket.projectId));
    if (!closures.length) continue;
    await sendPushToUser(engineer.uid, {
      title: 'ملخص نهاية الدوام',
      body: `تم إغلاق ${closures.length} تذكرة في مشاريعك اليوم`,
      tag: 'engineer-eod-summary',
      url: '/tickets?status=closed',
    });
  }
  console.log(`[cron] Notified ${engineers.length} engineers about end-of-day closures`);
}

// ── 4. Late tickets: open > 24h ──────────────────────────────────────────────
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

  for (const supervisor of supervisors) {
    const projectIds = new Set(supervisor.projects.map(project => project.id));
    const mine = lateTickets.filter(ticket => ticket.projectId && projectIds.has(ticket.projectId));
    if (!mine.length) continue;
    await sendPushToUser(supervisor.uid, {
      title: `تذاكر متأخرة (${mine.length})`,
      body: mine.slice(0, 3).map(ticket => `فيلا ${ticket.unit?.unitNumber || '—'}: ${ticket.description?.slice(0, 50) || ''}`).join('\n'),
      tag: 'late-tickets',
      url: '/tickets?status=open',
      requireInteraction: true,
    });
  }
  console.log(`[cron] Late ticket alerts sent — ${lateTickets.length} tickets`);
}

// ── 5. Admin daily summary ───────────────────────────────────────────────────
async function notifyAdminDailySummary() {
  const [openCount, closedToday, activeTechs] = await Promise.all([
    prisma.ticket.count({ where: { status: 'open' } }),
    prisma.ticket.count({
      where: {
        status: { in: ['closed', 'completed', 'absent', 'out_of_scope'] },
        closedAt: { gte: today0(), lte: today24() },
      },
    }),
    prisma.shiftLog.count({ where: { clockInAt: { gte: today0(), lte: today24() }, clockOutAt: null } }),
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
  for (const appointment of appointments) {
    const when = appointmentMoment(appointment.date, appointment.time);
    if (!when) continue;
    const mins = (when.getTime() - now) / 60000;
    if (mins <= 0 || mins > 30) continue;

    const reminderKey = `${APPOINTMENT_REMINDER_PREFIX}${appointment.id}:${appointment.date}:${appointment.time}`;
    const sent = await prisma.systemSetting.findUnique({ where: { key: reminderKey } });
    if (sent) continue;

    const techIds = Array.from(new Set([
      appointment.technicianId,
      ...(appointment.technicianIds || []),
    ].filter(Boolean) as string[]));
    const unit = appointment.unit?.unitNumber || '—';
    const roundedMins = Math.max(1, Math.round(mins));

    await sendAppointmentPeople(
      appointment.supervisorIds || [],
      techIds,
      {
        title: 'موعد يقترب',
        body: `موعد الوحدة ${unit} الساعة ${appointment.time} يبدأ خلال حوالي ${roundedMins} دقيقة`,
        tag: `appointment-reminder-${appointment.id}`,
        url: `/appointments?appointment=${encodeURIComponent(appointment.id)}`,
        requireInteraction: true,
      },
      {
        kind: 'reminder',
        data: { unit, date: appointment.date, time: appointment.time, mins: roundedMins },
        tag: `appointment-reminder-${appointment.id}`,
        url: `/tech/appointment/${encodeURIComponent(appointment.id)}`,
        requireInteraction: true,
      },
    );

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
  for (const appointment of appointments) {
    current[appointment.id] = {
      date: appointment.date,
      time: appointment.time,
      status: String(appointment.status),
      supervisorIds: appointment.supervisorIds || [],
      technicianId: appointment.technicianId || null,
      technicianIds: appointment.technicianIds || [],
      unitNumber: appointment.unit?.unitNumber || '—',
    };
  }

  const row = await prisma.systemSetting.findUnique({ where: { key: APPOINTMENT_SNAPSHOT_KEY } });
  const previous = (row?.value as Record<string, AppointmentSnapshot> | null) || null;

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
    const newAssignments = newTechIds.filter(technicianId => !oldTechIds.includes(technicianId));
    const techChanged = oldTechIds.join('|') !== newTechIds.join('|');
    const scheduleChanged = old.date !== next.date || old.time !== next.time;
    const cancelledNow = old.status !== 'cancelled' && next.status === 'cancelled';

    if (cancelledNow) {
      const supervisors = Array.from(new Set([...(old.supervisorIds || []), ...(next.supervisorIds || [])]));
      const technicians = Array.from(new Set([...oldTechIds, ...newTechIds]));
      await sendAppointmentPeople(
        supervisors,
        technicians,
        {
          title: 'تم إلغاء الموعد',
          body: `تم إلغاء موعد الوحدة ${next.unitNumber} بتاريخ ${next.date}${next.time ? ` الساعة ${next.time}` : ''}`,
          tag: `appointment-cancelled-${id}`,
          url: `/appointments?appointment=${encodeURIComponent(id)}`,
          requireInteraction: true,
        },
        {
          kind: 'cancelled',
          data: { unit: next.unitNumber, date: next.date, time: next.time },
          tag: `appointment-cancelled-${id}`,
          url: `/tech/appointment/${encodeURIComponent(id)}`,
          requireInteraction: true,
        },
      );
      continue;
    }

    if (newAssignments.length > 0) {
      const languages = await technicianLanguages(newAssignments);
      await Promise.all(newAssignments.map(technicianId => {
        const copy = techAppointmentCopy(languages.get(technicianId) || 'ar', 'assigned', {
          unit: next.unitNumber,
          date: next.date,
          time: next.time,
        });
        return sendPushToUser(technicianId, {
          title: copy.title,
          body: copy.body,
          tag: `appointment-assigned-${id}`,
          url: `/tech/appointment/${encodeURIComponent(id)}`,
          requireInteraction: true,
        });
      }));

      await Promise.all((next.supervisorIds || []).map(uid => sendPushToUser(uid, {
        title: 'تم تعيين فني على الموعد',
        body: `تم تعيين فني على موعد الوحدة ${next.unitNumber} — ${next.date}${next.time ? ` الساعة ${next.time}` : ''}`,
        tag: `appointment-tech-assigned-${id}`,
        url: `/appointments?appointment=${encodeURIComponent(id)}`,
      })));
    }

    if (scheduleChanged) {
      await sendAppointmentPeople(
        next.supervisorIds || [],
        newTechIds,
        {
          title: 'تم تعديل الموعد',
          body: `الموعد الجديد للوحدة ${next.unitNumber}: ${next.date}${next.time ? ` الساعة ${next.time}` : ''}`,
          tag: `appointment-updated-${id}`,
          url: `/appointments?appointment=${encodeURIComponent(id)}`,
          requireInteraction: true,
        },
        {
          kind: 'updated',
          data: { unit: next.unitNumber, date: next.date, time: next.time },
          tag: `appointment-updated-${id}`,
          url: `/tech/appointment/${encodeURIComponent(id)}`,
          requireInteraction: true,
        },
      );
    } else if (techChanged && newAssignments.length === 0) {
      await Promise.all((next.supervisorIds || []).map(uid => sendPushToUser(uid, {
        title: 'تم تعديل الفني على الموعد',
        body: `تم تعديل تعيين الفني لموعد الوحدة ${next.unitNumber}`,
        tag: `appointment-tech-updated-${id}`,
        url: `/appointments?appointment=${encodeURIComponent(id)}`,
      })));
    }
  }

  // Physical deletion is treated as cancellation and notifies the last known people.
  for (const [id, old] of Object.entries(previous)) {
    if (current[id]) continue;
    const techIds = Array.from(new Set([old.technicianId, ...(old.technicianIds || [])].filter(Boolean) as string[]));
    await sendAppointmentPeople(
      old.supervisorIds || [],
      techIds,
      {
        title: 'تم إلغاء الموعد',
        body: `تم حذف/إلغاء موعد الوحدة ${old.unitNumber} بتاريخ ${old.date}${old.time ? ` الساعة ${old.time}` : ''}`,
        tag: `appointment-deleted-${id}`,
        url: '/appointments',
        requireInteraction: true,
      },
      {
        kind: 'deleted',
        data: { unit: old.unitNumber, date: old.date, time: old.time },
        tag: `appointment-deleted-${id}`,
        url: '/tech/appointments',
        requireInteraction: true,
      },
    );
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

    await Promise.all(supervisors.map(supervisor => sendPushToUser(supervisor.uid, {
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

  cron.schedule('* * * * *', runMinutePushJobs, { timezone: 'UTC' });
  void runMinutePushJobs();

  console.log('[cron] Notification jobs scheduled');
}
