import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import pino from 'pino';
import fs from 'fs';
import qrcode from 'qrcode';
import prisma from './db.js';
import { getIO } from './socket.js';
import { BOT_USER_ID, handleBotMessage, isDuplicateMessage, getBotGroup, setBotGroup } from './whatsappBot.js';

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
    } else {
      // تنظيف تلقائي: لو ملفات الجلسة تجاوزت 200 ملف، امسحها وابدأ من أول
      // ده بيحصل لما الجلسة تنكسر كتير وتتراكم الملفات وتثقّل السيرفر
      try {
        const sessionFiles = fs.readdirSync(SESSION_DIR);
        if (sessionFiles.length > 200) {
          console.warn(`[WA] Session dir for ${userId} has ${sessionFiles.length} files — cleaning up to prevent server freeze`);
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          fs.mkdirSync(SESSION_DIR, { recursive: true });
        }
      } catch (cleanErr) {
        console.error(`[WA] Failed to clean session dir for ${userId}:`, cleanErr);
      }
    }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    markOnlineOnConnect: false,
  });

  sessions.set(userId, sock);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      statuses.set(userId, 'WAITING_AUTH');
      qrcode.toDataURL(qr).then((dataUrl) => {
        qrCodes.set(userId, dataUrl);
        getIO()?.emit(`wa-status-${userId}`, { running: true, connected: false, state: 'WAITING_AUTH', qr: dataUrl });
      }).catch(() => {
        qrCodes.set(userId, qr);
        getIO()?.emit(`wa-status-${userId}`, { running: true, connected: false, state: 'WAITING_AUTH', qr });
      });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      sessions.delete(userId);
      statuses.set(userId, 'DISCONNECTED');
      qrCodes.set(userId, null);
      linkedPhones.delete(userId);

      if (shouldReconnect) {
        setTimeout(() => startWA(userId), 3000);
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
      // نجبر الحساب يبان "غير متصل" — markOnlineOnConnect:false بيمنع البث التلقائي بس مش كافي لوحده
      sock.sendPresenceUpdate('unavailable').catch(() => {});
      getIO()?.emit(`wa-status-${userId}`, { running: true, connected: true, state: 'CONNECTED', linkedPhone: getLinkedPhone(userId) });
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ─── معالجة الردود الواردة (موافقة / رفض / تقييم) ─────────────────────────
  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    if (type !== 'notify') return;
    for (const msg of msgs) {
      if (!msg.message || msg.key.fromMe) continue;

      const senderJid = msg.key.remoteJid!;
      const isGroupMsg = senderJid.endsWith('@g.us');

      // ─── جلسة بوت الأوامر — مسار منفصل تماماً عن ردود العملاء ───────────────
      if (userId === BOT_USER_ID) {
        try {
          // البوت بيرد بس على الجروب المربوط — أي رسالة خاصة (DM) للرقم بتاعه بتتجاهل تماماً
          let allowed = false;
          if (isGroupMsg) {
            const group = await getBotGroup();
            allowed = !!group && group.jid === senderJid;
          }
          if (!allowed) continue;

          const msgId = msg.key.id || `${senderJid}-${msg.messageTimestamp}`;
          if (isDuplicateMessage(msgId)) continue;

          // في الجروب، remoteJid هو جروب الـ JID مش الشخص — الشخص الفعلي في participant
          // participant ممكن يكون @lid (معرّف مجهول) — participantAlt هو رقم الهاتف الحقيقي لو متاح
          const botSenderJid = isGroupMsg ? (msg.key.participantAlt || msg.key.participant || senderJid) : senderJid;
          const botText = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text || ''
          ).trim();
          if (botText) await handleBotMessage(senderJid, botSenderJid, botText);
        } catch (err) {
          console.error('[WA Bot] failed before reaching handler:', err);
          try {
            await sendWAJid(BOT_USER_ID, senderJid, '❌ حصل خطأ غير متوقع في البوت. حاول تاني، ولو المشكلة استمرت بلّغ الأدمن.');
          } catch { /* تجاهل — لو فشل الرد كمان، الخطأ مسجل في اللوج */ }
        }
        continue;
      }

      // تجاهل رسائل المجموعات، القنوات (newsletters)، والحالات (لغير جلسة البوت)
      if (isGroupMsg || senderJid.includes('@newsletter') || senderJid.includes('@broadcast')) {
        continue;
      }

      const rawPhone = senderJid.split('@')[0];
      const suffix = rawPhone.slice(-9);

      // التحقق من أن رقم المرسل مسجل كعميل في النظام
      const isClient = await prisma.client.findFirst({
        where: { phone: { endsWith: suffix } },
        select: { id: true }
      });

      if (!isClient) {
        continue; // تجاهل أي رسالة من رقم غير مسجل كعميل
      }

      console.log(`[WA] Received message from ${senderJid}`);

      // ① list response (WhatsApp Business API — unlikely on personal accts)
      const listResp = msg.message.listResponseMessage;
      if (listResp?.singleSelectReply?.selectedRowId) {
        await handleWAListReply(userId, listResp.singleSelectReply.selectedRowId, senderJid);
        continue;
      }

      // ② plain text reply (works on all accounts)
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text || ''
      ).trim();
      
      const quotedText = (
        msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
        msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || ''
      ).trim();

      if (text) {
        console.log(`[WA] Extracted text: "${text}" from ${senderJid}`);
        await handleWATextReply(userId, senderJid, text, quotedText);
      } else {
        console.log(`[WA] No text extracted. Message type:`, Object.keys(msg.message));
      }
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
  if (!phone) return '';
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
  const d = cleanPhone(phone);
  if (!d) throw new Error('رقم الهاتف غير صالح.');

  if (getWAStatus(userId) === 'CONNECTED') {
    throw new Error('واتساب مرتبط بالفعل.');
  }

  // تنظيف وإعادة تهيئة كاملة للجلسة
  await stopWA(userId, true);
  await startWA(userId);

  const sock = sessions.get(userId);
  if (!sock) {
    throw new Error('تعذر تهيئة خدمة الواتساب.');
  }

  // انتظار حتى يصبح الـ socket في حالة WAITING_AUTH (يعني متصل بسيرفرات واتساب وجاهز)
  // بدلاً من waitForSocketOpen() غير الموثوقة، نستخدم polling على الـ status
  const waitForReady = (): Promise<void> => new Promise((resolve, reject) => {
    let attempts = 0;
    const check = setInterval(() => {
      attempts++;
      const status = getWAStatus(userId);
      if (status === 'WAITING_AUTH' || qrCodes.get(userId)) {
        clearInterval(check);
        resolve();
      } else if (status === 'DISCONNECTED' && attempts > 3) {
        clearInterval(check);
        reject(new Error('فشل الاتصال بخوادم واتساب'));
      } else if (attempts >= 20) { // max 10 seconds
        clearInterval(check);
        resolve(); // try anyway
      }
    }, 500);
  });

  try {
    await waitForReady();
    console.log(`[WA] Socket ready for pairing (status: ${getWAStatus(userId)})`);
    return await sock.requestPairingCode(d);
  } catch (err: any) {
    console.warn(`[WA] Pairing attempt failed for ${userId}: ${err?.message}. Retrying...`);
    try {
      await stopWA(userId, true);
      await startWA(userId);
      const retrySock = sessions.get(userId);
      if (retrySock) {
        await waitForReady();
        return await retrySock.requestPairingCode(d);
      }
    } catch (retryErr: any) {
      console.error('[WA] Pairing code retry error:', retryErr);
      throw new Error('تعذر توليد كود الربط: ' + (retryErr.message || 'Connection closed'));
    }
    throw new Error('تعذر توليد كود الربط: ' + (err.message || 'Connection closed'));
  }
}

// ─── ربط جروب بوت الأوامر عن طريق رابط الدعوة ────────────────────────────────
function extractGroupInviteCode(inviteLink: string): string {
  const m = inviteLink.trim().match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
  const code = m ? m[1] : inviteLink.trim();
  if (!code) throw new Error('رابط الدعوة غير صالح.');
  return code;
}

export async function joinBotGroupByInvite(inviteLink: string): Promise<{ jid: string; subject: string }> {
  const sock = sessions.get(BOT_USER_ID);
  if (!sock || getWAStatus(BOT_USER_ID) !== 'CONNECTED') {
    throw new Error('لازم تربط رقم البوت الأول قبل ما تضيفه لجروب.');
  }
  const code = extractGroupInviteCode(inviteLink);
  const jid = await sock.groupAcceptInvite(code);
  let subject = jid;
  try {
    const meta = await sock.groupMetadata(jid);
    subject = meta.subject || jid;
  } catch { /* اسم الجروب مش أساسي */ }
  await setBotGroup(jid, subject);
  return { jid, subject };
}

export async function leaveBotGroup(): Promise<void> {
  const group = await getBotGroup();
  if (!group) return;
  const sock = sessions.get(BOT_USER_ID);
  try {
    if (sock && getWAStatus(BOT_USER_ID) === 'CONNECTED') {
      await sock.groupLeave(group.jid);
    }
  } catch { /* استمر حتى لو فشل الخروج الفعلي — المهم نلغي الربط */ }
  await setBotGroup(null);
}

// إرسال مباشر لـ JID جاهز (جروب أو شخص) — من غير تطبيع رقم أو فحص onWhatsApp
// (onWhatsApp بيشتغل بس على أرقام أفراد، وبيفشل دايماً على جروبات @g.us)
export async function sendWAJid(userId: string, jid: string, message: string): Promise<{ sent: boolean; error?: string }> {
  const sock = sessions.get(userId);
  if (getWAStatus(userId) !== 'CONNECTED' || !sock) {
    return { sent: false, error: 'NOT_CONNECTED' };
  }
  try {
    await sock.sendMessage(jid, { text: message });
    sock.sendPresenceUpdate('unavailable').catch(() => {});
    return { sent: true };
  } catch (err) {
    console.error('Baileys Error sending text to JID:', err);
    return { sent: false, error: 'SEND_FAILED' };
  }
}

export async function sendWAText(userId: string, phone: string, message: string): Promise<{ sent: boolean; fallback: boolean, error?: string }> {
  const sock = sessions.get(userId);
  if (getWAStatus(userId) !== 'CONNECTED' || !sock) {
    return { sent: false, fallback: true, error: 'NOT_CONNECTED' };
  }
  try {
    const jid = normalizePhone(phone);
    const [result] = await sock.onWhatsApp(jid);
    if (!result?.exists) {
      return { sent: false, fallback: true, error: 'NOT_ON_WHATSAPP' };
    }
    await sock.sendMessage(jid, { text: message });
    return { sent: true, fallback: false };
  } catch (err) {
    console.error('Baileys Error sending text:', err);
    return { sent: false, fallback: true, error: 'SEND_FAILED' };
  }
}

export async function sendWAImage(userId: string, phone: string, jpgBuffer: Buffer, caption = '📊 تقرير الصيانة'): Promise<{ sent: boolean; fallback: boolean, error?: string }> {
  const sock = sessions.get(userId);
  if (getWAStatus(userId) !== 'CONNECTED' || !sock) {
    return { sent: false, fallback: true, error: 'NOT_CONNECTED' };
  }
  try {
    const jid = normalizePhone(phone);
    const [result] = await sock.onWhatsApp(jid);
    if (!result?.exists) {
      return { sent: false, fallback: true, error: 'NOT_ON_WHATSAPP' };
    }
    await sock.sendMessage(jid, { image: jpgBuffer, caption });
    return { sent: true, fallback: false };
  } catch (err) {
    console.error('Baileys Error sending image:', err);
    return { sent: false, fallback: true, error: 'SEND_FAILED' };
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
    .replace(/{ticketId}/g, params.ticketId)
    .replace(/{description}/g, params.description)
    .replace(/{villaNumber}/g, params.villaNumber)
    .replace(/{date}/g, params.date || '')
    .replace(/{closureNotes}/g, params.closureNotes || '');
}

export async function buildOpeningMsg(params: MsgParams): Promise<string> {
  const defaultMsg = `السلام عليكم،\nتم استلام طلب الصيانة الخاص بك\n\nرقم التذكرة: #{ticketId}\nالوصف: {description}\nالفيلا: {villaNumber}\nالتاريخ: {date}\n\nسيتواصل معكم فريق الصيانة في أقرب وقت.\nشكراً لثقتكم.`;
  const template = await getTemplate('openingMsg', defaultMsg);
  return replaceVars(template, params);
}

export async function buildClosingMsg(params: MsgParams): Promise<string> {
  const notesStr = params.closureNotes ? `\nملاحظات الإغلاق: {closureNotes}` : '';
  const defaultMsg = `السلام عليكم،\nتمت معالجة تذكرة الصيانة بنجاح\n\nرقم التذكرة: #{ticketId}\nالوصف: {description}\nالفيلا: {villaNumber}${notesStr}\n\nشكراً لصبركم وتعاونكم.`;
  const template = await getTemplate('closingMsg', defaultMsg);
  return replaceVars(template, params);
}

export async function buildAbsentMsg(params: MsgParams): Promise<string> {
  const defaultMsg = `السلام عليكم،\n\nتم زيارة وحدتكم رقم {villaNumber} بخصوص بلاغ الصيانة #{ticketId}،\nولم يتمكن الفريق من الدخول نظراً لعدم التواجد.\n\nيرجى رفع تذكرة جديدة عند تواجدكم لإعادة جدولة الزيارة.\n\nشكراً لتفهمكم.`;
  const template = await getTemplate('absentMsg', defaultMsg);
  return replaceVars(template, params);
}

export async function buildOutOfScopeMsg(params: MsgParams): Promise<string> {
  const defaultMsg = `السلام عليكم،\n\nبخصوص بلاغ الصيانة #{ticketId} لوحدتكم رقم {villaNumber}،\nبعد المعاينة تبيّن أن المشكلة خارج نطاق الضمان.\n\nشكراً لتفهمكم.`;
  const template = await getTemplate('outOfScopeMsg', defaultMsg);
  return replaceVars(template, params);
}

// ─── رسالة موعد بنطاق زمني (Range) ─────────────────────────────────────────

type AppointmentRangeParams = {
  clientName: string;
  ticketId: string;
  villaNumber: string;
  startDate: string;   
  endDate: string;     
  preferredTime: string; 
  notes?: string | null;
};

export async function buildAppointmentRangeMsg(params: AppointmentRangeParams): Promise<string> {
  const defaultOpeningMsg = `السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم {villaNumber}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`;
  
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'whatsapp_templates' } });
  const templates = (setting?.value ?? {}) as Record<string, string>;
  const baseMsg = templates.openingMsg || defaultOpeningMsg;

  let msg = baseMsg
    .replace(/{ticketId}/g, params.ticketId)
    .replace(/{villaNumber}/g, params.villaNumber);

  msg += `\n\nتفاصيل الموعد المقترح:\n`;
  msg += `من ${params.startDate}\n`;
  msg += `إلى ${params.endDate}\n\n`;
  msg += `الوقت المفضل: ${params.preferredTime}\n`;
  if (params.notes) {
    msg += `ملاحظات: ${params.notes}\n`;
  }
  
  return msg;
}

// ─── طلب موافقة العميل عبر قائمة واتساب ───────────────────────────────────

export async function sendApprovalRequest(
  userId: string,
  phone: string,
  ticketId: string,
  clientName: string,
  villaNumber: string,
  closureNotes?: string | null
): Promise<{ sent: boolean; fallback: boolean, error?: string }> {
  const sock = sessions.get(userId);
  if (getWAStatus(userId) !== 'CONNECTED' || !sock) {
    return { sent: false, fallback: true, error: 'NOT_CONNECTED' };
  }
  try {
    const jid = normalizePhone(phone);
    const [result] = await sock.onWhatsApp(jid);
    if (!result?.exists) {
      return { sent: false, fallback: true, error: 'NOT_ON_WHATSAPP' };
    }
    const text =
      `السلام عليكم،\n\n` +
      `نرجو منكم تأكيد الموافقة على إغلاق تذكرة الصيانة رقم: *#${ticketId}* لوحدتكم.\n\n` +
      `الرجاء الرد بـ:\n` +
      `*1* — للموافقة\n` +
      `*2* — للرفض\n\n` +
      `شكراً لتعاونكم.`;
    await sock.sendMessage(jid, { text });
    return { sent: true, fallback: false };
  } catch (err) {
    console.error('[WA] sendApprovalRequest error:', err);
    return { sent: false, fallback: true, error: 'SEND_FAILED' };
  }
}

// ─── طلب تقييم بعد الموافقة ────────────────────────────────────────────────

export async function sendRatingRequest(
  userId: string,
  phone: string,
  ticketId: string,
  clientName: string
): Promise<{ sent: boolean; fallback: boolean, error?: string }> {
  const sock = sessions.get(userId);
  if (getWAStatus(userId) !== 'CONNECTED' || !sock) {
    return { sent: false, fallback: true, error: 'NOT_CONNECTED' };
  }
  try {
    const jid = normalizePhone(phone);
    const [result] = await sock.onWhatsApp(jid);
    if (!result?.exists) {
      return { sent: false, fallback: true, error: 'NOT_ON_WHATSAPP' };
    }
    const text =
      `شكراً على موافقتكم!\n\n` +
      `كيف تُقيّم خدمة الصيانة؟\n` +
      `أرسل رقماً من 1 إلى 5:\n\n` +
      `*5* — ممتاز\n` +
      `*4* — جيد جداً\n` +
      `*3* — جيد\n` +
      `*2* — مقبول\n` +
      `*1* — ضعيف\n\n` +
      `فريق ريتال للصيانة`;
    await sock.sendMessage(jid, { text });
    return { sent: true, fallback: false };
  } catch (err) {
    console.error('[WA] sendRatingRequest error:', err);
    return { sent: false, fallback: true, error: 'SEND_FAILED' };
  }
}

// ─── معالجة رد العميل النصي (1/2 للموافقة ، 1-5 للتقييم) ─────────────────

async function handleWATextReply(userId: string, senderJid: string, text: string, quotedText?: string) {
  try {
    const rawPhone = senderJid.split('@')[0];
    const suffix = rawPhone.slice(-9);
    console.log(`[WA] handleWATextReply: rawPhone=${rawPhone}, suffix=${suffix}, quotedText=${quotedText}`);
    
    // ابحث أولاً عن التذكرة التي تنتظر رد الموعد من خلال رقم الهاتف نفسه في جدول Tickets (في حال لم يكن مرتبطاً بـ Client)
    // أو من خلال العميل
    const client = await prisma.client.findFirst({
      where: { phone: { endsWith: suffix } },
    });
    
    console.log(`[WA] Found client:`, client ? client.id : 'None');
    
    // هل العميل ينتظر موافقة؟
    if (client) {
      const pendingApproval = await prisma.ticket.findFirst({
        where: { clientId: client.id, approvalState: 'sent' },
        orderBy: { approvalSentAt: 'desc' },
      });
      if (pendingApproval && (text === '1' || text === '2')) {
        const rowId = text === '1'
          ? `approve_${pendingApproval.id}`
          : `reject_${pendingApproval.id}`;
        await handleWAListReply(userId, rowId, senderJid);
        return;
      }

      // هل العميل ينتظر تقييم؟
      const pendingRating = await prisma.ticket.findFirst({
        where: { clientId: client.id, approvalState: 'awaiting_rating' },
        orderBy: { clientApprovedAt: 'desc' },
      });
      if (pendingRating && ['1', '2', '3', '4', '5'].includes(text)) {
        await handleWAListReply(userId, `rate_${text}_${pendingRating.id}`, senderJid);
        return;
      }
    }

  } catch (err) {
    console.error('[WA] handleWATextReply error:', err);
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
