import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import pino from 'pino';
import fs from 'fs';
import prisma from './db.js';
import { getIO } from './socket.js';

const isProd = process.env.NODE_ENV === 'production';
const BASE_SESSIONS = isProd ? '/opt/retal-api/wa-sessions' : path.join(process.cwd(), 'wa-sessions');

export type WAStatus = 'DISCONNECTED' | 'WAITING_AUTH' | 'CONNECTED';

const sessions = new Map<string, ReturnType<typeof makeWASocket>>();
const statuses = new Map<string, WAStatus>();
const qrCodes = new Map<string, string | null>();
const linkedPhones = new Map<string, string | null>();

const logger = pino({ level: 'info' });

export function getWAStatus(userId: string): WAStatus {
  return statuses.get(userId) || 'DISCONNECTED';
}

export function getWAQRCode(userId: string): string | null {
  return qrCodes.get(userId) || null;
}

export function getLinkedPhone(userId: string): string | null {
  const phone = linkedPhones.get(userId);
  if (phone) {
    return phone.split(':')[0].split('@')[0];
  }
  return null;
}

export async function initAllSessions() {
  if (!fs.existsSync(BASE_SESSIONS)) {
    fs.mkdirSync(BASE_SESSIONS, { recursive: true });
    return;
  }
  const dirs = fs.readdirSync(BASE_SESSIONS);
  for (const dir of dirs) {
    if (dir.startsWith('auth_')) {
      const userId = dir.replace('auth_', '');
      console.log(`[WA] Auto-starting session for user: ${userId}`);
      startWA(userId).catch(() => {});
    }
  }
}

const initializingSessions = new Set<string>();

export async function startWA(userId: string) {
  if (sessions.has(userId) || initializingSessions.has(userId)) return;
  initializingSessions.add(userId);

  try {
    statuses.set(userId, 'WAITING_AUTH');
    qrCodes.set(userId, null);

    const SESSION_DIR = path.join(BASE_SESSIONS, `auth_${userId}`);
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  sessions.set(userId, sock);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodes.set(userId, qr);
      statuses.set(userId, 'WAITING_AUTH');
      getIO()?.emit(`wa-status-${userId}`, { running: true, connected: false, state: 'WAITING_AUTH', qr });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      sessions.delete(userId);
      statuses.set(userId, 'DISCONNECTED');
      qrCodes.set(userId, null);
      linkedPhones.delete(userId);

      if (shouldReconnect) {
        startWA(userId);
      } else {
        if (fs.existsSync(SESSION_DIR)) {
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        }
      }
      getIO()?.emit(`wa-status-${userId}`, { running: false, connected: false, state: 'DISCONNECTED' });
    } else if (connection === 'open') {
      statuses.set(userId, 'CONNECTED');
      qrCodes.set(userId, null);
      if (sock.user?.id) {
        linkedPhones.set(userId, sock.user.id);
      }
      getIO()?.emit(`wa-status-${userId}`, { running: true, connected: true, state: 'CONNECTED', linkedPhone: getLinkedPhone(userId) });
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ─── معالجة الردود الواردة (موافقة / رفض / تقييم) ─────────────────────────
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;
    for (const msg of msgs) {
      if (!msg.message) continue;
      const listResp = msg.message.listResponseMessage;
      if (!listResp) continue;
      const rowId = listResp.singleSelectReply?.selectedRowId;
      if (!rowId) continue;
      await handleWAListReply(userId, rowId, msg.key.remoteJid!);
    }
  });

  } finally {
    initializingSessions.delete(userId);
  }
}

export async function stopWA(userId: string, cleanSession = false) {
  const sock = sessions.get(userId);
  if (sock) {
    sock.logout().catch(() => {});
    sock.end(undefined);
    sessions.delete(userId);
  }
  statuses.set(userId, 'DISCONNECTED');
  qrCodes.set(userId, null);
  linkedPhones.delete(userId);

  const SESSION_DIR = path.join(BASE_SESSIONS, `auth_${userId}`);
  if (cleanSession && fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }
}

export async function closeAllSessions() {
  for (const [userId, sock] of sessions.entries()) {
    try {
      sock.end(undefined);
    } catch (err) {
      console.error(`Error closing session for ${userId}:`, err);
    }
  }
}

function cleanPhone(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  
  // Egyptian: 01xxxxxxxxx (11 digits) -> 201xxxxxxxxx
  if (d.length === 11 && d.startsWith('01')) {
    d = '2' + d;
  }
  // Saudi: 05xxxxxxxx (10 digits) -> 9665xxxxxxxx
  else if (d.length === 10 && d.startsWith('05')) {
    d = '966' + d.substring(1);
  }
  
  return d;
}

function normalizePhone(phone: string): string {
  return `${cleanPhone(phone)}@s.whatsapp.net`;
}

export async function pairWACode(userId: string, phone: string): Promise<string> {
  let sock = sessions.get(userId);
  if (!sock) {
    await startWA(userId);
    sock = sessions.get(userId);
  }
  if (!sock) {
    throw new Error('تعذر تهيئة خدمة الواتساب.');
  }
  if (getWAStatus(userId) === 'CONNECTED') {
    throw new Error('واتساب مرتبط بالفعل.');
  }
  try {
    const d = cleanPhone(phone);
    
    if (sock.waitForSocketOpen) {
      await sock.waitForSocketOpen();
    }
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds safety buffer

    const code = await sock.requestPairingCode(d);
    return code;
  } catch (err: any) {
    console.error('Pairing code error:', err);
    throw new Error('تعذر توليد كود الربط: ' + err.message);
  }
}

export async function sendWAText(userId: string, phone: string, message: string): Promise<{ sent: boolean; fallback: boolean }> {
  const sock = sessions.get(userId);
  if (getWAStatus(userId) !== 'CONNECTED' || !sock) {
    return { sent: false, fallback: true };
  }
  try {
    const jid = normalizePhone(phone);
    await sock.sendMessage(jid, { text: message });
    return { sent: true, fallback: false };
  } catch (err) {
    console.error('Baileys Error sending text:', err);
    return { sent: false, fallback: true };
  }
}

export async function sendWAImage(userId: string, phone: string, jpgBuffer: Buffer, caption = '📊 تقرير الصيانة'): Promise<{ sent: boolean; fallback: boolean }> {
  const sock = sessions.get(userId);
  if (getWAStatus(userId) !== 'CONNECTED' || !sock) {
    return { sent: false, fallback: true };
  }
  try {
    const jid = normalizePhone(phone);
    await sock.sendMessage(jid, { image: jpgBuffer, caption });
    return { sent: true, fallback: false };
  } catch (err) {
    console.error('Baileys Error sending image:', err);
    return { sent: false, fallback: true };
  }
}

// ─── رسائل القوالب الديناميكية ───────────────────────────────────────────────

type MsgParams = {
  ticketId: string;
  clientName: string;
  description: string;
  villaNumber: string;
  date?: string;
  closureNotes?: string | null;
};

async function getTemplate(key: string, defaultText: string): Promise<string> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'whatsapp_templates' } });
    if (setting && setting.value && typeof setting.value === 'object') {
      const templates = setting.value as Record<string, string>;
      if (templates[key]) return templates[key];
    }
  } catch {}
  return defaultText;
}

function replaceVars(template: string, params: MsgParams): string {
  return template
    .replace(/{clientName}/g, params.clientName)
    .replace(/{ticketId}/g, params.ticketId)
    .replace(/{description}/g, params.description)
    .replace(/{villaNumber}/g, params.villaNumber)
    .replace(/{date}/g, params.date || '')
    .replace(/{closureNotes}/g, params.closureNotes || '');
}

export async function buildOpeningMsg(params: MsgParams): Promise<string> {
  const defaultMsg = `مرحباً {clientName} 👋\nتم استلام طلب الصيانة الخاص بك\n\n📋 رقم التذكرة: #{ticketId}\n📝 الوصف: {description}\n🏠 الفيلا: {villaNumber}\n📅 التاريخ: {date}\n\nسيتواصل معكم فريق الصيانة في أقرب وقت.\nشكراً لثقتكم 🌟`;
  const template = await getTemplate('openingMsg', defaultMsg);
  return replaceVars(template, params);
}

export async function buildClosingMsg(params: MsgParams): Promise<string> {
  const notesStr = params.closureNotes ? `\n📝 ملاحظات الإغلاق: {closureNotes}` : '';
  const defaultMsg = `مرحباً {clientName} 👋\nتمت معالجة تذكرة الصيانة بنجاح ✅\n\n📋 رقم التذكرة: #{ticketId}\n📝 الوصف: {description}\n🏠 الفيلا: {villaNumber}${notesStr}\n\nشكراً لصبركم وتعاونكم 🌟`;
  const template = await getTemplate('closingMsg', defaultMsg);
  return replaceVars(template, params);
}

// ─── طلب موافقة العميل عبر قائمة واتساب ───────────────────────────────────

export async function sendApprovalRequest(
  userId: string,
  phone: string,
  ticketId: string,
  clientName: string,
  villaNumber: string,
  closureNotes?: string | null
): Promise<{ sent: boolean; fallback: boolean }> {
  const sock = sessions.get(userId);
  if (getWAStatus(userId) !== 'CONNECTED' || !sock) {
    return { sent: false, fallback: true };
  }
  try {
    const jid = normalizePhone(phone);
    const notes = closureNotes ? `\n📝 ${closureNotes}` : '';
    await sock.sendMessage(jid, {
      text: `مرحباً ${clientName}،\nتم إنهاء أعمال الصيانة في فيلا ${villaNumber}.${notes}\n\nيرجى تأكيد إغلاق التذكرة:`,
      footer: 'فريق ريتال للصيانة',
      title: 'تأكيد إغلاق تذكرة الصيانة',
      buttonText: 'اختر رداً',
      listType: 1,
      sections: [
        {
          title: '',
          rows: [
            { rowId: `approve_${ticketId}`, title: '✅ موافق على الإغلاق', description: 'تم الانتهاء من الصيانة بشكل مُرضٍ' },
            { rowId: `reject_${ticketId}`,  title: '❌ لديّ اعتراض',       description: 'لم تُحل المشكلة بالكامل' },
          ],
        },
      ],
    } as any);
    return { sent: true, fallback: false };
  } catch (err) {
    console.error('[WA] sendApprovalRequest error:', err);
    return { sent: false, fallback: true };
  }
}

// ─── طلب تقييم بعد الموافقة ────────────────────────────────────────────────

export async function sendRatingRequest(
  userId: string,
  phone: string,
  ticketId: string,
  clientName: string
): Promise<{ sent: boolean; fallback: boolean }> {
  const sock = sessions.get(userId);
  if (getWAStatus(userId) !== 'CONNECTED' || !sock) {
    return { sent: false, fallback: true };
  }
  try {
    const jid = normalizePhone(phone);
    await sock.sendMessage(jid, {
      text: `شكراً ${clientName} على موافقتك! 🌟\nكيف تُقيّم خدمة الصيانة التي تلقيتها؟`,
      footer: 'فريق ريتال للصيانة',
      title: 'تقييم خدمة الصيانة',
      buttonText: 'اختر تقييمك',
      listType: 1,
      sections: [
        {
          title: '',
          rows: [
            { rowId: `rate_5_${ticketId}`, title: '⭐⭐⭐⭐⭐  ممتاز',    description: 'خدمة رائعة وممتازة' },
            { rowId: `rate_4_${ticketId}`, title: '⭐⭐⭐⭐     جيد جداً', description: 'خدمة جيدة جداً' },
            { rowId: `rate_3_${ticketId}`, title: '⭐⭐⭐        جيد',     description: 'خدمة جيدة' },
            { rowId: `rate_2_${ticketId}`, title: '⭐⭐           مقبول',  description: 'خدمة مقبولة' },
            { rowId: `rate_1_${ticketId}`, title: '⭐              ضعيف',  description: 'تحتاج تحسين' },
          ],
        },
      ],
    } as any);
    return { sent: true, fallback: false };
  } catch (err) {
    console.error('[WA] sendRatingRequest error:', err);
    return { sent: false, fallback: true };
  }
}

// ─── معالجة رد العميل على قائمة الموافقة / التقييم ────────────────────────

async function handleWAListReply(userId: string, rowId: string, jid: string) {
  try {
    if (rowId.startsWith('approve_')) {
      const ticketId = rowId.slice('approve_'.length);
      const ticket = await prisma.ticket.update({
        where: { id: ticketId },
        data: { approvalState: 'awaiting_rating', clientApproved: true, clientApprovedAt: new Date() },
        include: { client: true },
      });
      getIO()?.emit('ticket-approval', { ticketId, approved: true });
      // أرسل طلب التقييم
      const phone = (ticket as any).client?.phone;
      if (phone) {
        await sendRatingRequest(userId, phone, ticketId, ticket.clientName);
      }

    } else if (rowId.startsWith('reject_')) {
      const ticketId = rowId.slice('reject_'.length);
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { approvalState: 'rejected', clientApproved: false, clientApprovedAt: new Date() },
      });
      getIO()?.emit('ticket-approval', { ticketId, approved: false });

    } else if (rowId.startsWith('rate_')) {
      // format: rate_<stars>_<ticketId>
      const withoutPrefix = rowId.slice('rate_'.length);     // "5_abc123"
      const underIdx = withoutPrefix.indexOf('_');
      const rating = parseInt(withoutPrefix.slice(0, underIdx), 10);
      const ticketId = withoutPrefix.slice(underIdx + 1);
      const ticket = await prisma.ticket.update({
        where: { id: ticketId },
        data: { approvalState: 'rated', clientRating: rating },
      });
      getIO()?.emit('ticket-rated', { ticketId, rating });
      // رسالة شكر
      const sock = sessions.get(userId);
      if (sock) {
        await sock.sendMessage(jid, {
          text: `شكراً ${ticket.clientName}! 🌟\nتم تسجيل تقييمك (${rating}/5).\nنسعد بخدمتكم دائماً. 💚`,
        });
      }
    }
  } catch (err) {
    console.error('[WA] handleWAListReply error:', err);
  }
}
