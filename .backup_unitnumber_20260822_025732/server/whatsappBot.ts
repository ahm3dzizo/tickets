// server/whatsappBot.ts
// ─── بوت أوامر الواتساب للموظفين ────────────────────────────────────────────
// رقم واتساب مخصص (منفصل عن جلسات المستخدمين الشخصية) بيستقبل أوامر نصية من
// موظفين مسجلين في النظام وينفذها بنفس صلاحيات كل مستخدم في التطبيق العادي.

import { spawn } from 'child_process';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import prisma from './db.js';
import { sendWAJid, sendWAText, sendWAImage, buildClosingMsg, buildAbsentMsg, buildOutOfScopeMsg, getWAStatus } from './baileys.js';
import { DEFAULT_WORK_HOURS, autoCorrectMins, type WorkHoursConfig } from './routes/settings.js';
import { __dirname } from './config.js';

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

// ─── تطبيع النص العربي (يتعامل مع فروق الإملاء: ة/ه، أ/إ/آ/ا، ى/ي) ──────────
// ملحوظة: الاستبدال حرف-لحرف فبيحافظ على نفس طول النص، عشان نقدر نستخرج نص حر
// (زي الملاحظات) من النص الأصلي مباشرة بنفس الإحداثيات.
function normalizeArabic(s: string): string {
  return s.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

// ─── تأكيد الأوامر الحساسة ───────────────────────────────────────────────────
interface PendingAction {
  execute: () => Promise<string>;
  expiresAt: number;
}
const pendingActions = new Map<string, PendingAction>(); // key: senderJid
const CONFIRM_WORDS = new Set(['تأكيد', 'اكد', 'ايوه', 'ايوة', 'نعم', 'yes', 'ok', 'اوك'].map(normalizeArabic));
const CANCEL_WORDS = new Set(['الغاء', 'لغي', 'لا', 'no', 'كنسل'].map(normalizeArabic));
const CONFIRM_TTL_MS = 5 * 60_000;

// ─── نوع الإغلاق (نفس أنواع الإغلاق المستخدمة في التطبيق) ───────────────────
type ClosureType = 'normal' | 'absent' | 'out_of_scope';
const CLOSURE_TYPE_LABELS: Record<ClosureType, string> = {
  normal: 'إغلاق عادي',
  absent: 'عدم التواجد',
  out_of_scope: 'خارج الاختصاص',
};
const CLOSURE_PROMPT = 'اختار نوع الإغلاق:\n1. إغلاق عادي\n2. عدم التواجد\n3. خارج الاختصاص\n(رد برقم أو بالاسم، أو "الغاء" للتراجع)';

function parseClosureTypeReply(text: string): ClosureType | null {
  const t = normalizeArabic(text.trim());
  if (['1', 'عادي', 'اغلاق عادي', 'عاديه'].includes(t)) return 'normal';
  if (['2', 'عدم تواجد', 'عدم التواجد', 'مش موجود', 'غير متواجد'].includes(t)) return 'absent';
  if (['3', 'خارج الاختصاص', 'خارج اختصاص', 'خارج نطاق الضمان', 'خارج الضمان'].includes(t)) return 'out_of_scope';
  return null;
}

interface PendingClosureChoice {
  kind: 'ticket' | 'villa' | 'tickets_list';
  ticketId?: string;
  villa?: string;
  ticketIds?: string[];
  expiresAt: number;
}
const pendingClosureChoices = new Map<string, PendingClosureChoice>(); // key: senderJid

function closureDataFor(closureType: ClosureType): { status: 'closed' | 'out_of_scope'; closedAt: Date | null } {
  if (closureType === 'out_of_scope') return { status: 'out_of_scope', closedAt: new Date() };
  if (closureType === 'absent') return { status: 'closed', closedAt: null };
  return { status: 'closed', closedAt: new Date() };
}

function buildClosureReport(items: { ticketId: string; villaNumber: string }[], closureType: ClosureType, closedBy: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return [
    '📋 تقرير إغلاق',
    ...items.map(i => `#${i.ticketId} — فيلا ${i.villaNumber}`),
    `النوع: ${CLOSURE_TYPE_LABELS[closureType]}`,
    `بواسطة: ${closedBy}`,
    `الوقت: ${stamp}`,
  ].join('\n');
}

// ─── توليد صورة التقرير عبر Python ────────────────────────────────────────────
async function generateReportBuffer(payload: Record<string, unknown>): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'report_generator.py');
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    const python = spawn(pythonBin, [scriptPath, '--stdin'], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    let output = '';
    let errorOutput = '';
    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();
    python.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    python.stderr.on('data', (d: Buffer) => { errorOutput += d.toString(); });
    python.on('close', (code: number | null) => {
      if (code !== 0) {
        console.error('[WA Bot] report generation failed:', errorOutput);
        resolve(null);
        return;
      }
      const jpgPath = output.trim().split(/\r?\n/).pop() ?? '';
      if (!jpgPath || !existsSync(jpgPath)) {
        console.error('[WA Bot] report file not found:', jpgPath);
        resolve(null);
        return;
      }
      try {
        const buf = readFileSync(jpgPath);
        unlinkSync(jpgPath);
        resolve(buf);
      } catch {
        resolve(null);
      }
    });
  });
}

// ─── إشعار العميل بإغلاق تذكرته — نفس رسالة التطبيق بالظبط (نفس القالب المحفوظ) ─
async function notifyClientOfClosure(
  ticket: {
    ticketId: string; clientId: string | null; clientName: string;
    description: string; villaNumber: string; closureNotes?: string | null;
    projectId?: string | null; projectAbbr?: string | null;
    issuedAt?: string | Date | null; priority?: number | null;
  },
  closureType: ClosureType,
  senderUid?: string,
): Promise<{ sent: boolean; reason?: string }> {
  if (!ticket.clientId) return { sent: false, reason: 'no_client' };
  // نبعت من رقم المشرف/المهندس لو واتساب متوصل، وإلا من رقم البوت
  const senderId = senderUid && getWAStatus(senderUid) === 'CONNECTED' ? senderUid : BOT_USER_ID;
  try {
    const client = await prisma.client.findUnique({ where: { id: ticket.clientId } });
    if (!client?.phone) return { sent: false, reason: 'no_phone' };

    const params = {
      ticketId: ticket.ticketId, clientName: ticket.clientName,
      description: ticket.description, villaNumber: ticket.villaNumber,
      closureNotes: ticket.closureNotes,
    };

    // الإغلاق العادي: نولّد صورة التقرير ونبعتها للعميل مع رسالة الإغلاق كـ caption
    if (closureType === 'normal') {
      try {
        let projectName = '';
        if (ticket.projectId) {
          const project = await prisma.project.findUnique({
            where: { id: ticket.projectId }, select: { name: true },
          });
          projectName = project?.name || '';
        }
        const priorityMap: Record<string, string> = {
          '3': 'منخفضة', '4': 'عادية', '6': 'متوسطة', '7': 'عالية', '9': 'عاجلة جداً',
        };
        const reportPayload = {
          ticket_num: ticket.ticketId,
          villa: ticket.villaNumber,
          customer_name: ticket.clientName,
          phone: client.phone,
          maint_items: [[ticket.description.replace(/(https?:\/\/[^\s]+)/g, '').trim(), 'تم']],
          notes: ticket.closureNotes || '',
          block: (client as any).blockNumber || '',
          project: projectName,
          ticket_date: ticket.issuedAt ? (typeof ticket.issuedAt === 'string' ? ticket.issuedAt : (ticket.issuedAt as Date).toISOString()) : '',
          priority: priorityMap[String(ticket.priority)] || '',
          nhc: ticket.projectAbbr || '',
          status: 'تم',
        };
        const imgBuffer = await generateReportBuffer(reportPayload);
        if (imgBuffer) {
          const caption = await buildClosingMsg(params);
          await sendWAImage(senderId, client.phone, imgBuffer, caption);
          return { sent: true };
        }
      } catch (err) {
        console.error('[WA Bot] failed to generate report image, falling back to text:', err);
      }
    }

    // إغلاق عدم تواجد / خارج اختصاص — أو fallback لو فشل توليد التقرير
    const msg = closureType === 'absent' ? await buildAbsentMsg(params)
      : closureType === 'out_of_scope' ? await buildOutOfScopeMsg(params)
      : await buildClosingMsg(params);
    await sendWAText(senderId, client.phone, msg);
    return { sent: true };
  } catch (err) {
    console.error('[WA Bot] failed to notify client of closure:', err);
    return { sent: false, reason: 'error' };
  }
}

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
// المشرف يشوف تذاكره هو بس — المهندس/الأدمن يشوف الكل
function supervisorWhere(user: { uid: string; role: string }) {
  if (user.role === 'supervisor') return { assignedSupervisorIds: { has: user.uid } };
  return {};
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

// ─── إعدادات أوقات الدوام (لتفسير الأوقات الناقصة صباح/مساء) ────────────────
async function getWorkHoursConfigForProject(projectId: string): Promise<WorkHoursConfig> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'work_hours' } });
    const value = (setting?.value as any) || DEFAULT_WORK_HOURS;
    return value.byProject?.[projectId] || value.default || DEFAULT_WORK_HOURS.default;
  } catch {
    return DEFAULT_WORK_HOURS.default;
  }
}

// ─── تحليل يوم/تاريخ بالعربي ──────────────────────────────────────────────────
const ARABIC_DAYS: Record<string, number> = {
  'الاحد': 0, 'الاثنين': 1, 'الثلاثاء': 2, 'الثلاثا': 2,
  'الاربعاء': 3, 'الاربعا': 3, 'الخميس': 4, 'الجمعه': 5, 'السبت': 6,
};
const FILLER_DAY_WORDS = new Set(['القادم', 'القادمه', 'الجاي', 'الجايه', 'جاي', 'جايه'].map(normalizeArabic));

function resolveDate(dayWordRaw: string): string | null {
  const t = normalizeArabic(dayWordRaw.trim());
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (t === 'اليوم') return new Date().toISOString().split('T')[0];
  if (t === normalizeArabic('بكرة') || t === normalizeArabic('بكره') || t === normalizeArabic('غدا') || t === normalizeArabic('غداً')) {
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

// بيرجع التاريخ + عدد التوكنز اللي استهلكها (عشان "بعد بكرة" توكنين، وباقي الكلمات بتتصفى بعدين)
function resolveDateTokens(tokens: string[]): { date: string | null; consumed: number } {
  if (tokens.length >= 2) {
    const first = normalizeArabic(tokens[0]);
    const second = normalizeArabic(tokens[1]);
    if (first === normalizeArabic('بعد') && ['بكره', 'بكرة', 'غدا', 'غداً'].map(normalizeArabic).includes(second)) {
      const d = new Date(); d.setDate(d.getDate() + 2);
      return { date: d.toISOString().split('T')[0], consumed: 2 };
    }
  }
  if (tokens[0]) {
    const date = resolveDate(tokens[0]);
    if (date) return { date, consumed: 1 };
  }
  return { date: null, consumed: 0 };
}

// بيفهم صيغ زي: "8"، "الساعة 3"، "5 مساء"، "17:30" — ولو مفيش صباح/مساء محدد،
// بيستنتج بناء على جدول أوقات الدوام (autoCorrectMins) زي ما التطبيق بيعمل بالظبط.
function parseTimeToken(rawInput: string, cfg: WorkHoursConfig): string | null {
  let s = normalizeArabic(rawInput.trim());
  if (!s) return null;
  s = s.replace(/الساعه/g, '').trim();
  const explicitPM = /مساء|(?:^|\s)م(?:\s|$)|pm/i.test(s);
  const explicitAM = /صباحا|صباح|(?:^|\s)ص(?:\s|$)|am/i.test(s);
  s = s.replace(/مساء|صباحا|صباح|pm|am/gi, '').replace(/(?:^|\s)[صم](?:\s|$)/g, ' ').trim();

  let hh: number, mm = 0;
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    hh = parseInt(hm[1], 10); mm = parseInt(hm[2], 10);
  } else {
    const hOnly = s.match(/^(\d{1,2})$/);
    if (!hOnly) return null;
    hh = parseInt(hOnly[1], 10);
  }
  if (hh > 23 || mm > 59) return null;

  let mins = hh * 60 + mm;
  if (explicitPM && hh <= 12) mins = (hh % 12 + 12) * 60 + mm;
  else if (explicitAM) mins = (hh % 12) * 60 + mm;
  else {
    const corrected = autoCorrectMins(mins, cfg);
    if (corrected !== null) mins = corrected;
  }
  const outH = Math.floor(mins / 60) % 24;
  const outM = mins % 60;
  return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
}

function parseDayAndTime(dayText: string, cfg: WorkHoursConfig): { date: string | null; time: string | null } {
  const tokens = dayText.trim().split(/\s+/).filter(Boolean);
  const { date, consumed } = resolveDateTokens(tokens);
  const rest = tokens.slice(consumed).filter(tok => !FILLER_DAY_WORDS.has(normalizeArabic(tok)));
  const restText = rest.join(' ').trim();
  const time = restText ? parseTimeToken(restText, cfg) : null;
  return { date, time };
}

const NO_NOTES_WORDS = new Set(['لا', 'لأ', 'مفيش', 'بدون', 'ولا حاجة', 'ولا حاجه', '-', 'لأ لا يوجد', 'لا يوجد'].map(normalizeArabic));

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
  | { type: 'close_tickets_list'; ticketIds: string[] }
  | { type: 'schedule_appointment'; villa: string; dayText: string; notes?: string };

function parseCommand(rawText: string): Intent | null {
  const orig = rawText.trim().replace(/\s+/g, ' ');
  if (!orig) return null;
  const t = normalizeArabic(orig); // نفس الطول بالظبط — نستخدمه بس للتعرف على الكلمات المفتاحية

  if (/^(مساعده|help|اوامر|قائمه|الاوامر)$/i.test(t)) return { type: 'help' };

  let m: RegExpMatchArray | null;

  if ((m = t.match(/^(?:اقفل|قفل|اغلق|سكر)\s+(?:تذاكر\s+)?(?:ال)?فيل[ها]?\s*(\S+)/))) {
    return { type: 'close_villa_tickets', villa: normalizeVilla(m[1]) };
  }
  if ((m = t.match(/^(?:اقفل|قفل|اغلق|سكر)\s+(?:تذاكر|تذكره)\s+([\d\s,،و]+)$/))) {
    const ticketIds = m[1].split(/[\s,،و]+/).filter(Boolean);
    if (ticketIds.length > 1) return { type: 'close_tickets_list', ticketIds };
    return { type: 'close_ticket', ticketId: ticketIds[0] };
  }
  if ((m = t.match(/^رقم\s+(?:ال)?فيل[ها]?\s*(\S+)/))) {
    return { type: 'client_phone', villa: normalizeVilla(m[1]) };
  }
  if ((m = t.match(/^(?:تذكره|تفاصيل\s+تذكره)\s*(\d+)/))) {
    return { type: 'ticket_details', ticketId: m[1] };
  }
  if ((m = t.match(/^تذاكر\s+(?:ال)?فيل[ها]?\s*(\S+)/))) {
    return { type: 'villa_tickets', villa: normalizeVilla(m[1]) };
  }
  if ((m = t.match(/^موعد\s+(?:ال)?فيل[ها]?\s*(\S+)\s*(.*)$/))) {
    const villa = normalizeVilla(m[1]);
    // نستخرج الملاحظات وباقي الوقت/اليوم من النص الأصلي (مش المطبَّع) للحفاظ عليه زي ما هو
    const restOrig = orig.slice(orig.length - m[2].length);
    const notesMatch = restOrig.match(/ملاحظات:?\s*([\s\S]*)$/);
    const notes = notesMatch?.[1]?.trim() || undefined;
    const dayTimePart = restOrig.replace(/ملاحظات:?[\s\S]*$/, '').trim();
    return { type: 'schedule_appointment', villa, dayText: dayTimePart, notes };
  }
  if ((m = orig.match(/^تذاكر\s+(?:المشرف\s+)?(.+)/))) {
    return { type: 'supervisor_tickets', name: m[1].trim() };
  }
  if (/^تقرير/.test(t)) return { type: 'report' };

  return null;
}

const HELP_TEXT = [
  '🤖 الأوامر المتاحة (تقدر تكتبها بالعامية أو الفصحى):',
  '',
  '📞 رقم فيلا [رقم] — رقم تليفون العميل',
  '🎫 تذكرة [رقم] أو تفاصيل تذكرة [رقم]',
  '📋 تذاكر فيلا [رقم] — كل تذاكر الفيلا',
  '👤 تذاكر [اسم المشرف] — التذاكر المفتوحة بتاعته',
  '📊 تقرير — ملخص أعداد التذاكر',
  '🔒 اقفل/قفل/اغلق/سكر تذكرة [رقم] — هيسألك نوع الإغلاق',
  '🔒 اقفل تذاكر [رقم1,رقم2,رقم3] — قفل أكتر من تذكرة مرة واحدة',
  '🔒 اقفل/قفل/اغلق/سكر تذاكر فيلا [رقم] — هيسألك نوع الإغلاق لكل التذاكر المفتوحة',
  '📅 موعد فيلا [رقم] [اليوم] [الوقت] ملاحظات: [نص]',
  '   أمثلة: "موعد فيلا 540 بكرة الساعة 8"، "موعد فيلا 540 السبت"، "موعد فيلا 540 بعد بكرة 5 مساء"',
  '   لو اليوم مكتوب من غير وقت أو ملاحظات، البوت هيسألك عليهم لوحدهم.',
  '',
  'أوامر إضافية: "تأكيد" و"الغاء" للرد على أي طلب معلّق.',
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

type BotUser = { uid: string; role: string; displayName: string; projects: { id: string }[] };

async function cmdTicketDetails(ticketId: string, user: BotUser): Promise<string> {
  const projectIds = scopedProjectIds(user);
  const ticket = await prisma.ticket.findFirst({
    where: { ticketId, ...projectWhere(projectIds), ...supervisorWhere(user) },
    include: { appointment: { select: { date: true, time: true } } },
  });
  if (!ticket) return `❌ مفيش تذكرة رقم ${ticketId} في نطاق صلاحياتك.`;
  const appt = (ticket as any).appointment;
  const appointmentTime = appt ? `${appt.date}${appt.time ? ' ' + appt.time : ''}` : null;
  return [
    `🎫 تذكرة #${ticket.ticketId}`,
    `الفيلا: ${ticket.villaNumber} — ${ticket.clientName}`,
    `الحالة: ${statusLabel(ticket.status)}`,
    `الوصف: ${ticket.description}`,
    ticket.assigneeName ? `المسؤول: ${ticket.assigneeName}` : null,
    appointmentTime ? `الموعد: ${appointmentTime}` : null,
  ].filter(Boolean).join('\n');
}

async function cmdVillaTickets(villa: string, user: BotUser): Promise<string> {
  const projectIds = scopedProjectIds(user);
  const tickets = await prisma.ticket.findMany({
    where: { villaNumber: villa, ...projectWhere(projectIds), ...supervisorWhere(user) },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  if (tickets.length === 0) return `مفيش تذاكر لفيلا ${villa} في نطاق صلاحياتك.`;
  return `تذاكر فيلا ${villa} (${tickets.length}):\n` +
    tickets.map(t => `#${t.ticketId} — ${statusLabel(t.status)} — ${t.description.slice(0, 40)}`).join('\n');
}

async function cmdSupervisorTickets(name: string, user: BotUser): Promise<string> {
  const projectIds = scopedProjectIds(user);
  // المشرف يشوف تذاكره بس مهما كان الاسم المكتوب
  if (user.role === 'supervisor') {
    const tickets = await prisma.ticket.findMany({
      where: {
        assignedSupervisorIds: { has: user.uid },
        status: { notIn: ['closed', 'out_of_scope'] },
        ...projectWhere(projectIds),
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (tickets.length === 0) return `مفيهوش تذاكر مفتوحة في نطاقك.`;
    return `تذاكرك المفتوحة (${tickets.length}):\n` +
      tickets.map(t => `#${t.ticketId} — فيلا ${t.villaNumber} — ${statusLabel(t.status)}`).join('\n');
  }
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

async function cmdReport(user: BotUser): Promise<string> {
  const projectIds = scopedProjectIds(user);
  const where = { ...projectWhere(projectIds), ...supervisorWhere(user) };
  const [open, inProgress, pending, waiting, closed, total] = await Promise.all([
    prisma.ticket.count({ where: { ...where, status: 'open' } }),
    prisma.ticket.count({ where: { ...where, status: 'in_progress' } }),
    prisma.ticket.count({ where: { ...where, status: 'pending' } }),
    prisma.ticket.count({ where: { ...where, status: 'waiting' } }),
    prisma.ticket.count({ where: { ...where, status: 'closed' } }),
    prisma.ticket.count({ where }),
  ]);
  const label = user.role === 'supervisor' ? 'تقريرك' : 'تقرير التذاكر';
  return [
    `📊 ${label}`,
    `مفتوحة: ${open}`,
    `قيد التنفيذ: ${inProgress}`,
    `معلقة: ${pending}`,
    `بانتظار العميل: ${waiting}`,
    `مغلقة: ${closed}`,
    `الإجمالي: ${total}`,
  ].join('\n');
}

// ─── تنفيذ الأوامر الحساسة (تحتاج تأكيد) ──────────────────────────────────────

async function prepareCloseTicket(
  ticketId: string, projectIds: string[] | null, user: BotUser, closureType: ClosureType,
): Promise<PendingAction | string> {
  const ticket = await prisma.ticket.findFirst({ where: { ticketId, ...projectWhere(projectIds), ...supervisorWhere(user) } });
  if (!ticket) return `❌ مفيش تذكرة رقم ${ticketId} في نطاق صلاحياتك.`;
  if (ticket.status === 'closed' || ticket.status === 'out_of_scope') return `تذكرة #${ticketId} مقفولة بالفعل.`;
  return {
    expiresAt: Date.now() + CONFIRM_TTL_MS,
    execute: async () => {
      const { status, closedAt } = closureDataFor(closureType);
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status, closedAt } });
      await prisma.ticketAudit.create({
        data: { ticketId: ticket.id, field: 'status', oldValue: ticket.status, newValue: status, changedBy: user.uid },
      });
      const notifyResult = await notifyClientOfClosure(ticket, closureType, user.uid);
      let report = buildClosureReport([{ ticketId: ticket.ticketId, villaNumber: ticket.villaNumber }], closureType, user.displayName);
      if (!notifyResult.sent && notifyResult.reason === 'not_connected') {
        report += `\n⚠️ لم يتم إرسال إشعار للعميل لأن رقمك مش مربوط بالواتساب في النظام.`;
      }
      return report;
    },
  };
}

async function prepareCloseVillaTickets(
  villa: string, projectIds: string[] | null, user: BotUser, closureType: ClosureType,
): Promise<PendingAction | string> {
  const tickets = await prisma.ticket.findMany({
    where: { villaNumber: villa, status: { notIn: ['closed', 'out_of_scope'] }, ...projectWhere(projectIds), ...supervisorWhere(user) },
  });
  if (tickets.length === 0) return `مفيش تذاكر مفتوحة لفيلا ${villa} في نطاق صلاحياتك.`;
  return {
    expiresAt: Date.now() + CONFIRM_TTL_MS,
    execute: async () => {
      const { status, closedAt } = closureDataFor(closureType);
      await prisma.ticket.updateMany({ where: { id: { in: tickets.map(t => t.id) } }, data: { status, closedAt } });
      await Promise.all(tickets.map(t => prisma.ticketAudit.create({
        data: { ticketId: t.id, field: 'status', oldValue: t.status, newValue: status, changedBy: user.uid },
      })));
      const notifyResults = await Promise.all(tickets.map(t => notifyClientOfClosure(t, closureType, user.uid)));
      let report = buildClosureReport(tickets.map(t => ({ ticketId: t.ticketId, villaNumber: t.villaNumber })), closureType, user.displayName);
      if (notifyResults.some(r => !r.sent && r.reason === 'not_connected')) {
        report += `\n⚠️ لم يتم إرسال إشعار للعملاء لأن رقمك مش مربوط بالواتساب في النظام.`;
      }
      return report;
    },
  };
}

async function prepareCloseTicketsList(
  ticketIds: string[], projectIds: string[] | null, user: BotUser, closureType: ClosureType,
): Promise<PendingAction | string> {
  const tickets = await prisma.ticket.findMany({ where: { ticketId: { in: ticketIds }, ...projectWhere(projectIds), ...supervisorWhere(user) } });
  if (tickets.length === 0) return `❌ مفيش تذاكر بالأرقام دي في نطاق صلاحياتك.`;
  const openTickets = tickets.filter(t => t.status !== 'closed' && t.status !== 'out_of_scope');
  const alreadyClosed = tickets.filter(t => t.status === 'closed' || t.status === 'out_of_scope');
  const notFound = ticketIds.filter(id => !tickets.some(t => t.ticketId === id));
  if (openTickets.length === 0) return `كل التذاكر دي مقفولة بالفعل.`;
  return {
    expiresAt: Date.now() + CONFIRM_TTL_MS,
    execute: async () => {
      const { status, closedAt } = closureDataFor(closureType);
      await prisma.ticket.updateMany({ where: { id: { in: openTickets.map(t => t.id) } }, data: { status, closedAt } });
      await Promise.all(openTickets.map(t => prisma.ticketAudit.create({
        data: { ticketId: t.id, field: 'status', oldValue: t.status, newValue: status, changedBy: user.uid },
      })));
      const notifyResults = await Promise.all(openTickets.map(t => notifyClientOfClosure(t, closureType, user.uid)));
      let report = buildClosureReport(openTickets.map(t => ({ ticketId: t.ticketId, villaNumber: t.villaNumber })), closureType, user.displayName);
      if (alreadyClosed.length) report += `\n⚠️ كانت مقفولة بالفعل: ${alreadyClosed.map(t => t.ticketId).join('، ')}`;
      if (notFound.length) report += `\n⚠️ مش موجودة: ${notFound.join('، ')}`;
      if (notifyResults.some(r => !r.sent && r.reason === 'not_connected')) {
        report += `\n⚠️ لم يتم إرسال إشعار للعملاء لأن رقمك مش مربوط بالواتساب في النظام.`;
      }
      return report;
    },
  };
}

// ─── جدولة موعد — بيُجمّع الحقول الناقصة (وقت/ملاحظات) على مراحل ────────────
interface PendingAppointmentDraft {
  villa: string;
  projectId: string;
  projectName: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string | null;
  date: string;
  time: string | null;
  notes: string | undefined;
  workHoursCfg: WorkHoursConfig;
  awaiting: 'time' | 'notes' | null;
  expiresAt: number;
}
const pendingAppointmentDrafts = new Map<string, PendingAppointmentDraft>(); // key: senderJid

function finalizeAppointmentDraft(draft: PendingAppointmentDraft, user: { uid: string; role: string; displayName: string }): { pending: PendingAction; summary: string } {
  const timeLabel = draft.time ? ` الساعة ${draft.time}` : '';
  const notesLabel = draft.notes ? ` — ملاحظات: ${draft.notes}` : '';
  return {
    summary: `هتحدد موعد لفيلا ${draft.villa} (${draft.projectName}) يوم ${draft.date}${timeLabel}${notesLabel}. رد بـ "تأكيد" للتنفيذ.`,
    pending: {
      expiresAt: Date.now() + CONFIRM_TTL_MS,
      execute: async () => {
        await prisma.appointment.create({
          data: {
            projectId: draft.projectId,
            villaNumber: draft.villa,
            clientId: draft.clientId,
            clientName: draft.clientName,
            clientPhone: draft.clientPhone,
            date: draft.date, time: draft.time || null,
            notes: draft.notes || null,
            supervisorIds: user.role === 'supervisor' ? [user.uid] : [],
            supervisors: user.role === 'supervisor' ? [{ id: user.uid, name: user.displayName, specialty: 'general' }] : [],
            types: [],
          },
        });
        return `✅ اتحدد موعد لفيلا ${draft.villa} يوم ${draft.date}${timeLabel}.`;
      },
    },
  };
}

async function prepareScheduleAppointment(
  villa: string, dayText: string, notes: string | undefined,
  projectIds: string[] | null, senderJid: string, user: { uid: string; role: string; displayName: string },
): Promise<{ pending: PendingAction; summary: string } | string> {
  const units = await prisma.unit.findMany({
    where: { unitNumber: villa, ...projectWhere(projectIds) },
    include: { project: { select: { id: true, name: true } }, clients: { include: { client: true } } },
  });
  if (units.length === 0) return `❌ مفيش فيلا رقم ${villa} في نطاق صلاحياتك.`;
  if (units.length > 1) return `فيه أكتر من فيلا بنفس الرقم (${units.map(u => u.project.name).join('، ')})، محتاج تحديد المشروع.`;

  const unit = units[0];
  const workHoursCfg = await getWorkHoursConfigForProject(unit.projectId);
  const { date, time } = parseDayAndTime(dayText, workHoursCfg);
  if (!date) return `❌ مش فاهم اليوم "${dayText}". جرب: السبت، الأحد، اليوم، بكرة، بعد بكرة، أو تاريخ زي 2026-07-20.`;

  const primary = unit.clients.find(c => c.isPrimary) || unit.clients[0];
  const draft: PendingAppointmentDraft = {
    villa, projectId: unit.projectId, projectName: unit.project.name,
    clientId: primary?.client.id || null, clientName: primary?.client.name || '', clientPhone: primary?.client.phone || null,
    date, time, notes, workHoursCfg, awaiting: null, expiresAt: Date.now() + CONFIRM_TTL_MS,
  };

  if (!draft.time) {
    draft.awaiting = 'time';
    pendingAppointmentDrafts.set(senderJid, draft);
    return '🕐 الموعد الساعة كام؟ (مثال: 10، الساعة 3، 5 مساءً)';
  }
  if (draft.notes === undefined) {
    draft.awaiting = 'notes';
    pendingAppointmentDrafts.set(senderJid, draft);
    return '📝 في ملاحظات تحب تضيفها؟ (اكتب الملاحظات، أو اكتب "لا" لو مفيش)';
  }
  return finalizeAppointmentDraft(draft, user);
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

  const projectIds = scopedProjectIds(user);
  const text = rawText.trim();
  const normText = normalizeArabic(text);

  // ① جمع بيانات موعد ناقصة (وقت ثم ملاحظات) على مراحل
  const draft = pendingAppointmentDrafts.get(senderJid);
  if (draft && Date.now() < draft.expiresAt) {
    if (CANCEL_WORDS.has(normText)) {
      pendingAppointmentDrafts.delete(senderJid);
      await sendWAJid(BOT_USER_ID, chatJid, '❌ اتلغى تحديد الموعد.');
      await logCommand(user.uid, chatJid, rawText, 'cancel', true, 'اتلغى');
      return;
    }
    if (draft.awaiting === 'time') {
      const parsedTime = parseTimeToken(text, draft.workHoursCfg);
      if (!parsedTime) {
        await sendWAJid(BOT_USER_ID, chatJid, '❌ مش فاهم الوقت. اكتب مثلا: 10، الساعة 3، أو 5 مساءً.');
        return;
      }
      draft.time = parsedTime;
      if (draft.notes === undefined) {
        draft.awaiting = 'notes';
        pendingAppointmentDrafts.set(senderJid, draft);
        await sendWAJid(BOT_USER_ID, chatJid, '📝 في ملاحظات تحب تضيفها؟ (اكتب الملاحظات، أو اكتب "لا" لو مفيش)');
        return;
      }
      pendingAppointmentDrafts.delete(senderJid);
      const result = finalizeAppointmentDraft(draft, user);
      pendingActions.set(senderJid, result.pending);
      await sendWAJid(BOT_USER_ID, chatJid, result.summary);
      await logCommand(user.uid, chatJid, rawText, 'schedule_appointment', true, result.summary);
      return;
    }
    if (draft.awaiting === 'notes') {
      draft.notes = NO_NOTES_WORDS.has(normText) ? '' : text;
      pendingAppointmentDrafts.delete(senderJid);
      const result = finalizeAppointmentDraft(draft, user);
      pendingActions.set(senderJid, result.pending);
      await sendWAJid(BOT_USER_ID, chatJid, result.summary);
      await logCommand(user.uid, chatJid, rawText, 'schedule_appointment', true, result.summary);
      return;
    }
  }

  // ② اختيار نوع الإغلاق قبل تأكيد أي أمر إغلاق
  const closureChoice = pendingClosureChoices.get(senderJid);
  if (closureChoice && Date.now() < closureChoice.expiresAt) {
    if (CANCEL_WORDS.has(normText)) {
      pendingClosureChoices.delete(senderJid);
      await sendWAJid(BOT_USER_ID, chatJid, '❌ اتلغى الإغلاق.');
      await logCommand(user.uid, chatJid, rawText, 'cancel', true, 'اتلغى');
      return;
    }
    const closureType = parseClosureTypeReply(text);
    if (!closureType) {
      await sendWAJid(BOT_USER_ID, chatJid, `❌ مش فاهم. ${CLOSURE_PROMPT}`);
      return;
    }
    pendingClosureChoices.delete(senderJid);
    const result = closureChoice.kind === 'ticket'
      ? await prepareCloseTicket(closureChoice.ticketId!, projectIds, user, closureType)
      : closureChoice.kind === 'villa'
      ? await prepareCloseVillaTickets(closureChoice.villa!, projectIds, user, closureType)
      : await prepareCloseTicketsList(closureChoice.ticketIds!, projectIds, user, closureType);
    if (typeof result === 'string') {
      await sendWAJid(BOT_USER_ID, chatJid, result);
      await logCommand(user.uid, chatJid, rawText, 'close_confirm', false, result);
    } else {
      pendingActions.set(senderJid, result);
      const target = closureChoice.kind === 'ticket' ? `تذكرة #${closureChoice.ticketId}`
        : closureChoice.kind === 'villa' ? `تذاكر فيلا ${closureChoice.villa}`
        : `${closureChoice.ticketIds!.length} تذكرة (${closureChoice.ticketIds!.join('، ')})`;
      const confirmMsg = `هتقفل ${target} (${CLOSURE_TYPE_LABELS[closureType]}). رد بـ "تأكيد" للتنفيذ.`;
      await sendWAJid(BOT_USER_ID, chatJid, confirmMsg);
      await logCommand(user.uid, chatJid, rawText, 'close_confirm', true, confirmMsg);
    }
    return;
  }

  // ③ تأكيد/إلغاء أمر معلّق نهائي — لكل شخص بتاعه لوحده حتى لو كل ده جوه نفس الجروب
  const pending = pendingActions.get(senderJid);
  if (pending) {
    pendingActions.delete(senderJid);
    if (Date.now() < pending.expiresAt && CONFIRM_WORDS.has(normText)) {
      const reply = await pending.execute();
      await sendWAJid(BOT_USER_ID, chatJid, reply);
      await logCommand(user.uid, chatJid, rawText, 'confirm', true, reply);
      return;
    }
    if (CANCEL_WORDS.has(normText)) {
      await sendWAJid(BOT_USER_ID, chatJid, '❌ اتلغى الأمر.');
      await logCommand(user.uid, chatJid, rawText, 'cancel', true, 'اتلغى');
      return;
    }
    // أي رسالة تانية تتعامل كأمر جديد عادي (مش تأكيد ولا إلغاء)
  }

  // ④ أمر جديد
  const intent = parseCommand(text);
  if (!intent) {
    await sendWAJid(BOT_USER_ID, chatJid, HELP_TEXT);
    await logCommand(user.uid, chatJid, rawText, null, false, HELP_TEXT);
    return;
  }

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
        reply = await cmdTicketDetails(intent.ticketId, user);
        break;
      case 'villa_tickets':
        reply = await cmdVillaTickets(intent.villa, user);
        break;
      case 'supervisor_tickets':
        reply = await cmdSupervisorTickets(intent.name, user);
        break;
      case 'report':
        reply = await cmdReport(user);
        break;
      case 'close_ticket': {
        const ticket = await prisma.ticket.findFirst({ where: { ticketId: intent.ticketId, ...projectWhere(projectIds), ...supervisorWhere(user) } });
        if (!ticket) { reply = `❌ مفيش تذكرة رقم ${intent.ticketId} في نطاق صلاحياتك.`; break; }
        if (ticket.status === 'closed' || ticket.status === 'out_of_scope') { reply = `تذكرة #${intent.ticketId} مقفولة بالفعل.`; break; }
        pendingClosureChoices.set(senderJid, { kind: 'ticket', ticketId: intent.ticketId, expiresAt: Date.now() + CONFIRM_TTL_MS });
        reply = `هتقفل تذكرة #${intent.ticketId}.\n${CLOSURE_PROMPT}`;
        break;
      }
      case 'close_villa_tickets': {
        const tickets = await prisma.ticket.findMany({
          where: { villaNumber: intent.villa, status: { notIn: ['closed', 'out_of_scope'] }, ...projectWhere(projectIds), ...supervisorWhere(user) },
        });
        if (tickets.length === 0) { reply = `مفيش تذاكر مفتوحة لفيلا ${intent.villa} في نطاق صلاحياتك.`; break; }
        pendingClosureChoices.set(senderJid, { kind: 'villa', villa: intent.villa, expiresAt: Date.now() + CONFIRM_TTL_MS });
        reply = `هتقفل ${tickets.length} تذكرة لفيلا ${intent.villa}.\n${CLOSURE_PROMPT}`;
        break;
      }
      case 'close_tickets_list': {
        const tickets = await prisma.ticket.findMany({
          where: { ticketId: { in: intent.ticketIds }, status: { notIn: ['closed', 'out_of_scope'] }, ...projectWhere(projectIds), ...supervisorWhere(user) },
        });
        if (tickets.length === 0) { reply = `❌ مفيش تذاكر مفتوحة بالأرقام دي في نطاق صلاحياتك.`; break; }
        pendingClosureChoices.set(senderJid, { kind: 'tickets_list', ticketIds: intent.ticketIds, expiresAt: Date.now() + CONFIRM_TTL_MS });
        reply = `هتقفل ${tickets.length} تذكرة (${tickets.map(t => t.ticketId).join('، ')}).\n${CLOSURE_PROMPT}`;
        break;
      }
      case 'schedule_appointment': {
        const result = await prepareScheduleAppointment(intent.villa, intent.dayText, intent.notes, projectIds, senderJid, user);
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
