// server/whatsappBot.ts
// ─── بوت أوامر الواتساب للموظفين ────────────────────────────────────────────
// رقم واتساب مخصص (منفصل عن جلسات المستخدمين الشخصية) بيستقبل أوامر نصية من
// موظفين مسجلين في النظام وينفذها بنفس صلاحيات كل مستخدم في التطبيق العادي.

import prisma from './db.js';
import { sendWAJid } from './baileys.js';

export const BOT_USER_ID = 'whatsapp-bot';

// ─── Kill switch ────────────────────────────────────────────────────────────
const BOT_ENABLED_KEY = 'whatsappBotEnabled';

export async function isBotEnabled(): Promise<boolean> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: BOT_ENABLED_KEY } });
    if (!setting) return true; // مفعّل بشكل افتراضي لحد ما حد يقفله
    return (setting.value as any) === true || (setting.value as any)?.enabled === true;
  } catch {
    return true;
  }
}

export async function setBotEnabled(enabled: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: BOT_ENABLED_KEY },
    create: { key: BOT_ENABLED_KEY, value: { enabled } },
    update: { value: { enabled } },
  });
}

// ─── جروب الأوامر المسموح له (اختياري — البوت شغال على الـ DM دايماً) ───────
const BOT_GROUP_KEY = 'whatsappBotGroup';

export async function getBotGroup(): Promise<{ jid: string; subject: string | null } | null> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: BOT_GROUP_KEY } });
  const value = setting?.value as any;
  return value?.jid ? { jid: value.jid, subject: value.subject ?? null } : null;
}

export async function setBotGroup(jid: string | null, subject?: string | null): Promise<void> {
  if (!jid) {
    await prisma.systemSetting.deleteMany({ where: { key: BOT_GROUP_KEY } });
    return;
  }
  await prisma.systemSetting.upsert({
    where: { key: BOT_GROUP_KEY },
    create: { key: BOT_GROUP_KEY, value: { jid, subject: subject ?? null } },
    update: { value: { jid, subject: subject ?? null } },
  });
}

// ─── حماية من تكرار نفس الرسالة (إعادة إرسال واتساب عند إعادة الاتصال) ──────
const processedMsgIds = new Set<string>();
export function isDuplicateMessage(id: string): boolean {
  if (processedMsgIds.has(id)) return true;
  processedMsgIds.add(id);
  if (processedMsgIds.size > 500) {
    const first = processedMsgIds.values().next().value;
    if (first) processedMsgIds.delete(first);
  }
  return false;
}

// ─── تأكيد الأوامر الحساسة ───────────────────────────────────────────────────
interface PendingAction {
  execute: () => Promise<string>;
  expiresAt: number;
}
const pendingActions = new Map<string, PendingAction>(); // key: senderJid
const CONFIRM_WORDS = new Set(['تأكيد', 'أكد', 'اكد', 'ايوه', 'ايوة', 'نعم', 'yes', 'ok', 'اوك']);
const CANCEL_WORDS = new Set(['الغاء', 'إلغاء', 'لغي', 'لا', 'no', 'كنسل']);
const CONFIRM_TTL_MS = 5 * 60_000;

// ─── تسجيل الأوامر ───────────────────────────────────────────────────────────
async function logCommand(senderUid: string, jid: string, rawText: string, intent: string | null, success: boolean, reply: string) {
  try {
    await prisma.botCommandLog.create({ data: { senderUid, jid, rawText, intent, success, reply } });
  } catch (err) {
    console.error('[WA Bot] failed to log command:', err);
  }
}

// ─── ربط رقم المرسل بمستخدم في النظام ────────────────────────────────────────
async function resolveSenderUser(jid: string) {
  const rawPhone = jid.split('@')[0];
  const suffix = rawPhone.slice(-9);
  return prisma.user.findFirst({
    where: { phoneNumber: { endsWith: suffix }, disabled: false },
    include: { projects: { select: { id: true } } },
  });
}

// ─── نطاق المشاريع المسموح بيها — null يعني بدون قيود (أدمن) ────────────────
function scopedProjectIds(user: { role: string; projects: { id: string }[] }): string[] | null {
  if (user.role === 'admin') return null;
  return user.projects.map(p => p.id);
}
function projectWhere(projectIds: string[] | null) {
  return projectIds ? { projectId: { in: projectIds.length ? projectIds : ['__none__'] } } : {};
}

const STATUS_LABELS: Record<string, string> = {
  open: 'مفتوحة', in_progress: 'قيد التنفيذ', pending: 'معلقة', completed: 'مكتملة',
  closed: 'مغلقة', waiting: 'بانتظار العميل', out_of_scope: 'خارج اختصاص',
  absent: 'عدم تواجد', contractor: 'مقاول', note: 'ملاحظة',
};
const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;

function normalizeVilla(raw: string): string {
  return raw.trim().replace(/^0+(?=\d)/, '');
}

// ─── تحليل يوم/تاريخ بالعربي ──────────────────────────────────────────────────
const ARABIC_DAYS: Record<string, number> = {
  'الاحد': 0, 'الأحد': 0,
  'الاثنين': 1, 'الإثنين': 1,
  'الثلاثاء': 2, 'الثلاثا': 2,
  'الاربعاء': 3, 'الأربعاء': 3, 'الاربعا': 3,
  'الخميس': 4,
  'الجمعة': 5, 'الجمعه': 5,
  'السبت': 6,
};

function resolveDate(dayWord: string): string | null {
  const t = dayWord.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (t === 'اليوم') return new Date().toISOString().split('T')[0];
  if (t === 'بكرة' || t === 'بكره' || t === 'غدا' || t === 'غداً') {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  const dayNum = ARABIC_DAYS[t];
  if (dayNum === undefined) return null;
  const now = new Date();
  const diff = (dayNum - now.getDay() + 7) % 7 || 7;
  now.setDate(now.getDate() + diff);
  return now.toISOString().split('T')[0];
}

function parseDayAndTime(dayText: string): { date: string | null; time: string | null } {
  const parts = dayText.trim().split(/\s+/);
  const date = resolveDate(parts[0]);
  let time: string | null = null;
  if (parts[1]) {
    const raw = parts[1].replace(/[^\d:]/g, '');
    if (/^\d{1,2}:\d{2}$/.test(raw)) time = raw.padStart(5, '0');
    else if (/^\d{1,2}$/.test(raw)) time = `${raw.padStart(2, '0')}:00`;
  }
  return { date, time };
}

// ─── تحليل الأوامر ────────────────────────────────────────────────────────────
type Intent =
  | { type: 'help' }
  | { type: 'client_phone'; villa: string }
  | { type: 'ticket_details'; ticketId: string }
  | { type: 'villa_tickets'; villa: string }
  | { type: 'supervisor_tickets'; name: string }
  | { type: 'report' }
  | { type: 'close_ticket'; ticketId: string }
  | { type: 'close_villa_tickets'; villa: string }
  | { type: 'schedule_appointment'; villa: string; dayText: string; notes?: string };

function parseCommand(rawText: string): Intent | null {
  const t = rawText.trim().replace(/\s+/g, ' ');
  if (!t) return null;

  if (/^(مساعدة|help|أوامر|اوامر)$/i.test(t)) return { type: 'help' };

  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(?:اقفل|قفل)\s+تذاكر\s+فيل[ةا]?\s*(\S+)/))) {
    return { type: 'close_villa_tickets', villa: normalizeVilla(m[1]) };
  }
  if ((m = t.match(/^(?:اقفل|قفل)\s+تذكر[ةه]\s*(\d+)/))) {
    return { type: 'close_ticket', ticketId: m[1] };
  }
  if ((m = t.match(/^رقم\s+فيل[ةا]?\s*(\S+)/))) {
    return { type: 'client_phone', villa: normalizeVilla(m[1]) };
  }
  if ((m = t.match(/^(?:تذكر[ةه]|تفاصيل\s+تذكر[ةه])\s*(\d+)/))) {
    return { type: 'ticket_details', ticketId: m[1] };
  }
  if ((m = t.match(/^تذاكر\s+فيل[ةا]?\s*(\S+)/))) {
    return { type: 'villa_tickets', villa: normalizeVilla(m[1]) };
  }
  if ((m = t.match(/^موعد\s+فيل[ةا]?\s*(\S+)\s+(.+?)(?:\s+ملاحظات:?\s*(.*))?$/))) {
    return { type: 'schedule_appointment', villa: normalizeVilla(m[1]), dayText: m[2].trim(), notes: m[3]?.trim() || undefined };
  }
  if ((m = t.match(/^تذاكر\s+(?:المشرف\s+)?(.+)/))) {
    return { type: 'supervisor_tickets', name: m[1].trim() };
  }
  if (/^تقرير/.test(t)) return { type: 'report' };

  return null;
}

const HELP_TEXT = [
  '🤖 الأوامر المتاحة:',
  '• رقم فيلا [رقم] — رقم تليفون العميل',
  '• تذكرة [رقم] — تفاصيل تذكرة',
  '• تذاكر فيلا [رقم] — كل تذاكر الفيلا',
  '• تذاكر [اسم المشرف] — تذاكر مشرف معين المفتوحة',
  '• تقرير — ملخص أعداد التذاكر',
  '• اقفل تذكرة [رقم]',
  '• اقفل تذاكر فيلا [رقم]',
  '• موعد فيلا [رقم] [اليوم] [الوقت] ملاحظات: [نص]',
].join('\n');

// ─── تنفيذ أوامر القراءة ──────────────────────────────────────────────────────

async function cmdClientPhone(villa: string, projectIds: string[] | null): Promise<string> {
  const units = await prisma.unit.findMany({
    where: { unitNumber: villa, ...projectWhere(projectIds) },
    include: { project: { select: { name: true } }, clients: { include: { client: true } } },
  });
  if (units.length === 0) return `❌ مفيش فيلا رقم ${villa} في نطاق صلاحياتك.`;
  return units.map(u => {
    const primary = u.clients.find(c => c.isPrimary) || u.clients[0];
    if (!primary) return `فيلا ${villa} (${u.project.name}): مفيش عميل مسجل.`;
    return `فيلا ${villa} (${u.project.name}): ${primary.client.name} — ${primary.client.phone}`;
  }).join('\n');
}

async function cmdTicketDetails(ticketId: string, projectIds: string[] | null): Promise<string> {
  const ticket = await prisma.ticket.findFirst({ where: { ticketId, ...projectWhere(projectIds) } });
  if (!ticket) return `❌ مفيش تذكرة رقم ${ticketId} في نطاق صلاحياتك.`;
  return [
    `🎫 تذكرة #${ticket.ticketId}`,
    `الفيلا: ${ticket.villaNumber} — ${ticket.clientName}`,
    `الحالة: ${statusLabel(ticket.status)}`,
    `الوصف: ${ticket.description}`,
    ticket.assigneeName ? `المسؤول: ${ticket.assigneeName}` : null,
    ticket.appointmentTime ? `الموعد: ${ticket.appointmentTime}` : null,
  ].filter(Boolean).join('\n');
}

async function cmdVillaTickets(villa: string, projectIds: string[] | null): Promise<string> {
  const tickets = await prisma.ticket.findMany({
    where: { villaNumber: villa, ...projectWhere(projectIds) },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  if (tickets.length === 0) return `مفيش تذاكر لفيلا ${villa} في نطاق صلاحياتك.`;
  return `تذاكر فيلا ${villa} (${tickets.length}):\n` +
    tickets.map(t => `#${t.ticketId} — ${statusLabel(t.status)} — ${t.description.slice(0, 40)}`).join('\n');
}

async function cmdSupervisorTickets(name: string, projectIds: string[] | null): Promise<string> {
  const supervisor = await prisma.user.findFirst({
    where: { role: 'supervisor', displayName: { contains: name, mode: 'insensitive' } },
  });
  if (!supervisor) return `❌ مفيش مشرف اسمه "${name}".`;
  const tickets = await prisma.ticket.findMany({
    where: {
      assignedSupervisorIds: { has: supervisor.uid },
      status: { notIn: ['closed', 'out_of_scope'] },
      ...projectWhere(projectIds),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  if (tickets.length === 0) return `المشرف ${supervisor.displayName} مفيهوش تذاكر مفتوحة في نطاق صلاحياتك.`;
  return `تذاكر ${supervisor.displayName} المفتوحة (${tickets.length}):\n` +
    tickets.map(t => `#${t.ticketId} — فيلا ${t.villaNumber} — ${statusLabel(t.status)}`).join('\n');
}

async function cmdReport(projectIds: string[] | null): Promise<string> {
  const where = projectWhere(projectIds);
  const [open, inProgress, pending, waiting, closed, total] = await Promise.all([
    prisma.ticket.count({ where: { ...where, status: 'open' } }),
    prisma.ticket.count({ where: { ...where, status: 'in_progress' } }),
    prisma.ticket.count({ where: { ...where, status: 'pending' } }),
    prisma.ticket.count({ where: { ...where, status: 'waiting' } }),
    prisma.ticket.count({ where: { ...where, status: 'closed' } }),
    prisma.ticket.count({ where }),
  ]);
  return [
    '📊 تقرير التذاكر',
    `مفتوحة: ${open}`,
    `قيد التنفيذ: ${inProgress}`,
    `معلقة: ${pending}`,
    `بانتظار العميل: ${waiting}`,
    `مغلقة: ${closed}`,
    `الإجمالي: ${total}`,
  ].join('\n');
}

// ─── تنفيذ الأوامر الحساسة (تحتاج تأكيد) ──────────────────────────────────────

async function prepareCloseTicket(ticketId: string, projectIds: string[] | null, uid: string): Promise<PendingAction | string> {
  const ticket = await prisma.ticket.findFirst({ where: { ticketId, ...projectWhere(projectIds) } });
  if (!ticket) return `❌ مفيش تذكرة رقم ${ticketId} في نطاق صلاحياتك.`;
  if (ticket.status === 'closed') return `تذكرة #${ticketId} مقفولة بالفعل.`;
  return {
    expiresAt: Date.now() + CONFIRM_TTL_MS,
    execute: async () => {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'closed', closedAt: new Date() } });
      await prisma.ticketAudit.create({
        data: { ticketId: ticket.id, field: 'status', oldValue: ticket.status, newValue: 'closed', changedBy: `whatsapp-bot:${uid}` },
      });
      return `✅ اتقفلت تذكرة #${ticketId}.`;
    },
  };
}

async function prepareCloseVillaTickets(villa: string, projectIds: string[] | null, uid: string): Promise<PendingAction | string> {
  const tickets = await prisma.ticket.findMany({
    where: { villaNumber: villa, status: { notIn: ['closed', 'out_of_scope'] }, ...projectWhere(projectIds) },
  });
  if (tickets.length === 0) return `مفيش تذاكر مفتوحة لفيلا ${villa} في نطاق صلاحياتك.`;
  return {
    expiresAt: Date.now() + CONFIRM_TTL_MS,
    execute: async () => {
      await prisma.ticket.updateMany({ where: { id: { in: tickets.map(t => t.id) } }, data: { status: 'closed', closedAt: new Date() } });
      await Promise.all(tickets.map(t => prisma.ticketAudit.create({
        data: { ticketId: t.id, field: 'status', oldValue: t.status, newValue: 'closed', changedBy: `whatsapp-bot:${uid}` },
      })));
      return `✅ اتقفلت ${tickets.length} تذكرة لفيلا ${villa}.`;
    },
  };
}

async function prepareScheduleAppointment(
  villa: string, dayText: string, notes: string | undefined,
  projectIds: string[] | null, user: { uid: string; role: string; displayName: string },
): Promise<{ pending: PendingAction; summary: string } | string> {
  const { date, time } = parseDayAndTime(dayText);
  if (!date) return `❌ مش فاهم اليوم "${dayText}". جرب: السبت، الأحد، اليوم، بكرة، أو تاريخ زي 2026-07-20.`;

  const units = await prisma.unit.findMany({
    where: { unitNumber: villa, ...projectWhere(projectIds) },
    include: { project: { select: { id: true, name: true } }, clients: { include: { client: true } } },
  });
  if (units.length === 0) return `❌ مفيش فيلا رقم ${villa} في نطاق صلاحياتك.`;
  if (units.length > 1) return `فيه أكتر من فيلا بنفس الرقم (${units.map(u => u.project.name).join('، ')})، محتاج تحديد المشروع.`;

  const unit = units[0];
  const primary = unit.clients.find(c => c.isPrimary) || unit.clients[0];
  const timeLabel = time ? ` الساعة ${time}` : '';
  const notesLabel = notes ? ` — ملاحظات: ${notes}` : '';

  return {
    summary: `هتحدد موعد لفيلا ${villa} (${unit.project.name}) يوم ${date}${timeLabel}${notesLabel}. رد بـ "تأكيد" للتنفيذ.`,
    pending: {
      expiresAt: Date.now() + CONFIRM_TTL_MS,
      execute: async () => {
        await prisma.appointment.create({
          data: {
            projectId: unit.projectId,
            villaNumber: villa,
            clientId: primary?.client.id || null,
            clientName: primary?.client.name || '',
            clientPhone: primary?.client.phone || null,
            date, time: time || null,
            notes: notes || null,
            supervisorIds: user.role === 'supervisor' ? [user.uid] : [],
            supervisors: user.role === 'supervisor' ? [{ id: user.uid, name: user.displayName, specialty: 'general' }] : [],
            types: [],
          },
        });
        return `✅ اتحدد موعد لفيلا ${villa} يوم ${date}${timeLabel}.`;
      },
    },
  };
}

// ─── نقطة الدخول الرئيسية ─────────────────────────────────────────────────────
// chatJid: فين نرد (DM الشخص، أو الجروب لو الأمر جالي من جروب)
// senderJid: مين اللي بعت فعلياً (نفس chatJid في الـ DM، أو participant في الجروب)

export async function handleBotMessage(chatJid: string, senderJid: string, rawText: string): Promise<void> {
  try {
    await handleBotMessageInner(chatJid, senderJid, rawText);
  } catch (err) {
    console.error('[WA Bot] unexpected error handling message:', err);
    try {
      await sendWAJid(BOT_USER_ID, chatJid, '❌ حصل خطأ غير متوقع في البوت. حاول تاني، ولو المشكلة استمرت بلّغ الأدمن.');
    } catch (sendErr) {
      console.error('[WA Bot] failed to send error reply:', sendErr);
    }
  }
}

async function handleBotMessageInner(chatJid: string, senderJid: string, rawText: string): Promise<void> {
  if (!(await isBotEnabled())) return;

  const user = await resolveSenderUser(senderJid);
  if (!user) {
    await sendWAJid(BOT_USER_ID, chatJid, '❌ رقمك مش مسجل كمستخدم في النظام.');
    return;
  }

  const text = rawText.trim();

  // تأكيد/إلغاء أمر معلّق — لكل شخص بتاعه لوحده حتى لو كل ده جوه نفس الجروب
  const pending = pendingActions.get(senderJid);
  if (pending) {
    pendingActions.delete(senderJid);
    if (Date.now() < pending.expiresAt && CONFIRM_WORDS.has(text)) {
      const reply = await pending.execute();
      await sendWAJid(BOT_USER_ID, chatJid, reply);
      await logCommand(user.uid, chatJid, rawText, 'confirm', true, reply);
      return;
    }
    if (CANCEL_WORDS.has(text)) {
      await sendWAJid(BOT_USER_ID, chatJid, '❌ اتلغى الأمر.');
      await logCommand(user.uid, chatJid, rawText, 'cancel', true, 'اتلغى');
      return;
    }
    // أي رسالة تانية تتعامل كأمر جديد عادي (مش تأكيد ولا إلغاء)
  }

  const intent = parseCommand(text);
  if (!intent) {
    await sendWAJid(BOT_USER_ID, chatJid, HELP_TEXT);
    await logCommand(user.uid, chatJid, rawText, null, false, HELP_TEXT);
    return;
  }

  const projectIds = scopedProjectIds(user);
  let reply: string;

  try {
    switch (intent.type) {
      case 'help':
        reply = HELP_TEXT;
        break;
      case 'client_phone':
        reply = await cmdClientPhone(intent.villa, projectIds);
        break;
      case 'ticket_details':
        reply = await cmdTicketDetails(intent.ticketId, projectIds);
        break;
      case 'villa_tickets':
        reply = await cmdVillaTickets(intent.villa, projectIds);
        break;
      case 'supervisor_tickets':
        reply = await cmdSupervisorTickets(intent.name, projectIds);
        break;
      case 'report':
        reply = await cmdReport(projectIds);
        break;
      case 'close_ticket': {
        const result = await prepareCloseTicket(intent.ticketId, projectIds, user.uid);
        if (typeof result === 'string') { reply = result; }
        else { pendingActions.set(senderJid, result); reply = `هتقفل تذكرة #${intent.ticketId}. رد بـ "تأكيد" للتنفيذ.`; }
        break;
      }
      case 'close_villa_tickets': {
        const result = await prepareCloseVillaTickets(intent.villa, projectIds, user.uid);
        if (typeof result === 'string') { reply = result; }
        else { pendingActions.set(senderJid, result); reply = `هتقفل تذاكر فيلا ${intent.villa}. رد بـ "تأكيد" للتنفيذ.`; }
        break;
      }
      case 'schedule_appointment': {
        const result = await prepareScheduleAppointment(intent.villa, intent.dayText, intent.notes, projectIds, user);
        if (typeof result === 'string') { reply = result; }
        else { pendingActions.set(senderJid, result.pending); reply = result.summary; }
        break;
      }
    }
  } catch (err) {
    console.error('[WA Bot] command error:', err);
    reply = '❌ حصل خطأ أثناء تنفيذ الأمر.';
  }

  await sendWAJid(BOT_USER_ID, chatJid, reply);
  await logCommand(user.uid, chatJid, rawText, intent.type, true, reply);
}
