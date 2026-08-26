import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
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
const reconnectAttempts = new Map<string, number>(); // عداد محاولات إعادة الاتصال
const reconnectTimers = new Map<string, NodeJS.Timeout>();
const sessionGenerations = new Map<string, number>();
const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_SWEEP_MS = 6 * 60 * 60 * 1000;
const SESSION_META_DIR = path.join(BASE_SESSIONS, '.session-meta');
let staleSessionSweep: NodeJS.Timeout | null = null;

const logger = pino({ level: 'silent' }); // نخفّت اللوجز — rc13 verbose جداً

// libsignal 6 logs the complete session object (including private/root keys)
// directly through console.info. Suppress only those exact dependency messages.
const originalConsoleInfo = console.info.bind(console);
const originalConsoleWarn = console.warn.bind(console);
console.info = (...args: unknown[]) => {
  if (args[0] === 'Closing session:') return;
  originalConsoleInfo(...args);
};
console.warn = (...args: unknown[]) => {
  if (args[0] === 'Closing open session in favor of incoming prekey bundle' || args[0] === 'Session already closed') return;
  originalConsoleWarn(...args);
};

function safeUserId(userId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error('Invalid WhatsApp session id');
  return userId;
}

function sessionDir(userId: string): string {
  return path.join(BASE_SESSIONS, `auth_${safeUserId(userId)}`);
}

function activityFile(userId: string): string {
  return path.join(SESSION_META_DIR, `${safeUserId(userId)}.json`);
}

function touchSessionActivity(userId: string): void {
  try {
    fs.mkdirSync(SESSION_META_DIR, { recursive: true });
    const target = activityFile(userId);
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ lastActivityAt: new Date().toISOString() }), { mode: 0o600 });
    fs.renameSync(temp, target);
  } catch (err) {
    console.error(`[WA] Could not update activity for ${userId}:`, err instanceof Error ? err.message : err);
  }
}

function getLastActivity(userId: string): number {
  try {
    const raw = JSON.parse(fs.readFileSync(activityFile(userId), 'utf8'));
    const timestamp = Date.parse(raw.lastActivityAt);
    if (Number.isFinite(timestamp)) return timestamp;
  } catch { /* migrate existing sessions from their credentials timestamp */ }

  try {
    return fs.statSync(path.join(sessionDir(userId), 'creds.json')).mtimeMs;
  } catch {
    return Date.now();
  }
}

function purgeSessionFiles(userId: string): void {
  const dir = sessionDir(userId);
  if (fs.existsSync(dir)) {
    const tombstone = path.join(BASE_SESSIONS, `.deleting-auth_${safeUserId(userId)}-${Date.now()}`);
    try {
      fs.renameSync(dir, tombstone);
      fs.rmSync(tombstone, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[WA] Could not remove session files for ${userId}:`, err instanceof Error ? err.message : err);
    }
  }
  try { fs.rmSync(activityFile(userId), { force: true }); } catch { /* already absent */ }
}

function cancelReconnect(userId: string): void {
  const timer = reconnectTimers.get(userId);
  if (timer) clearTimeout(timer);
  reconnectTimers.delete(userId);
  reconnectAttempts.delete(userId);
}

async function removeStaleSessions(): Promise<void> {
  if (!fs.existsSync(BASE_SESSIONS)) return;
  const cutoff = Date.now() - SESSION_IDLE_MS;
  for (const dir of fs.readdirSync(BASE_SESSIONS)) {
    if (!dir.startsWith('auth_')) continue;
    const userId = dir.slice('auth_'.length);
    if (getLastActivity(userId) >= cutoff) continue;
    console.warn(`[WA] Removing inactive session for ${userId} (unused for 7 days)`);
    await stopWA(userId, true, 'inactive');
  }
}

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
  }
  await removeStaleSessions();
  if (!staleSessionSweep) {
    staleSessionSweep = setInterval(() => void removeStaleSessions(), SESSION_SWEEP_MS);
    staleSessionSweep.unref();
  }
  const dirs = fs.readdirSync(BASE_SESSIONS);
  for (const dir of dirs) {
    if (dir.startsWith('auth_')) {
      const userId = dir.replace('auth_', '');
      // فقط شغّل الجلسات اللي عندها creds.json فعلية — الفولدرات الفاضية = ربط ناقص
      const credsPath = path.join(BASE_SESSIONS, dir, 'creds.json');
      if (!fs.existsSync(credsPath)) {
        console.log(`[WA] Skipping empty session for: ${userId} (no creds.json)`);
        continue;
      }
      console.log(`[WA] Auto-starting session for user: ${userId}`);
      startWA(userId, false).catch(() => {});
    }
  }
}

const initializingSessions = new Map<string, Promise<void>>();

export function startWA(userId: string, userInitiated = true): Promise<void> {
  if (sessions.has(userId)) return Promise.resolve();
  const existing = initializingSessions.get(userId);
  if (existing) return existing;

  const initialization = Promise.resolve().then(async () => {
    try {
    statuses.set(userId, 'WAITING_AUTH');
    qrCodes.set(userId, null);

    const SESSION_DIR = sessionDir(userId);
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

  const generation = (sessionGenerations.get(userId) || 0) + 1;
  sessionGenerations.set(userId, generation);

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  // جلب أحدث إصدار من واتساب ويب — إصدارات قديمة بتتسبب في رفض الاتصال
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[WA] Using WA version: ${version.join('.')} for ${userId}`);

  // The session may have been stopped/purged while the async setup was running.
  if (sessionGenerations.get(userId) !== generation) return;

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
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
      const error = lastDisconnect?.error;
      const statusCode = (error as any)?.output?.statusCode;
      // An old socket may close after a replacement was already created.
      if (sessionGenerations.get(userId) !== generation || sessions.get(userId) !== sock) return;
      console.log(`[WA] Connection closed for ${userId}. Reason: ${error?.message || 'unknown'} (Code: ${statusCode})`);
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      sessions.delete(userId);
      statuses.set(userId, 'DISCONNECTED');
      qrCodes.set(userId, null);
      linkedPhones.delete(userId);

      if (isLoggedOut) {
        // حُذفت الجلسة من الهاتف — امسح الملفات
        purgeSessionFiles(userId);
        reconnectAttempts.delete(userId);
      } else {
        // هل عندنا credentials محفوظة؟
        const hasCreds = fs.existsSync(path.join(SESSION_DIR, 'creds.json'));
        const attempts = (reconnectAttempts.get(userId) || 0) + 1;
        reconnectAttempts.set(userId, attempts);

        // لو ما عندناش creds (جلسة جديدة للـ pairing)، وقف بعد 3 محاولات
        // لو عندنا creds (جلسة موجودة بتتعافى)، أعد المحاولة مع backoff
        const maxAttempts = hasCreds ? 10 : 3;
        if (attempts <= maxAttempts) {
          const delay = Math.min(3000 * Math.pow(1.5, attempts - 1), 30000); // max 30s
          console.log(`[WA] Reconnecting ${userId} (attempt ${attempts}/${maxAttempts}) in ${Math.round(delay/1000)}s`);
          const timer = setTimeout(() => {
            reconnectTimers.delete(userId);
            void startWA(userId, false);
          }, delay);
          reconnectTimers.set(userId, timer);
        } else {
          console.warn(`[WA] Max reconnect attempts reached for ${userId} — stopping`);
          reconnectAttempts.delete(userId);
        }
      }
      getIO()?.emit(`wa-status-${userId}`, { running: false, connected: false, state: 'DISCONNECTED' });
    } else if (connection === 'open') {
      reconnectAttempts.delete(userId);
      if (userInitiated) touchSessionActivity(userId);
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
    touchSessionActivity(userId);
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

    }
  });

    } finally {
      if (initializingSessions.get(userId) === initialization) initializingSessions.delete(userId);
    }
  });
  initializingSessions.set(userId, initialization);
  return initialization;
}

export async function stopWA(userId: string, cleanSession = false, reason = 'manual') {
  cancelReconnect(userId);
  sessionGenerations.set(userId, (sessionGenerations.get(userId) || 0) + 1);
  await initializingSessions.get(userId)?.catch(() => {});
  const sock = sessions.get(userId);
  if (sock) {
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.end(undefined);
    } catch {}
    sessions.delete(userId);
  }
  statuses.set(userId, 'DISCONNECTED');
  qrCodes.set(userId, null);
  linkedPhones.delete(userId);

  if (cleanSession) {
    purgeSessionFiles(userId);
    console.log(`[WA] Session files removed for ${userId} (${reason})`);
  }
}

export async function closeAllSessions() {
  if (staleSessionSweep) clearInterval(staleSessionSweep);
  staleSessionSweep = null;
  for (const userId of [...sessions.keys()]) {
    await stopWA(userId, false, 'shutdown');
  }
}

export function cleanPhone(phone: string): string {
  if (!phone) return '';
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  
  // Saudi without country code or 0: 5xxxxxxxx (9 digits) -> 9665xxxxxxxx
  if (d.length === 9 && d.startsWith('5')) {
    d = '966' + d;
  }
  // Saudi with 0: 05xxxxxxxx (10 digits) -> 9665xxxxxxxx
  else if (d.length === 10 && d.startsWith('05')) {
    d = '966' + d.substring(1);
  }
  // Egypt without country code or 0: 1xxxxxxxxx (10 digits starting with 1) -> 201xxxxxxxxx
  else if (d.length === 10 && d.startsWith('1')) {
    d = '20' + d;
  }
  // Egypt with 0: 01xxxxxxxxx (11 digits starting with 01) -> 201xxxxxxxxx
  else if (d.length === 11 && d.startsWith('01')) {
    d = '2' + d;
  }
  
  return d;
}

export function normalizePhone(phone: string): string {
  return `${cleanPhone(phone)}@s.whatsapp.net`;
}

export async function pairWACode(userId: string, phone: string): Promise<string> {
  const d = cleanPhone(phone);
  if (!d || d.length < 8) {
    throw new Error('رقم الهاتف غير صالح. يرجى إدخال رقم صحيح يبدأ بـ 05 أو مع كود الدولة.');
  }
  if (getWAStatus(userId) === 'CONNECTED') {
    throw new Error('واتساب مرتبط بالفعل.');
  }

  // كل محاولة ربط جديدة تبدأ من مجلد نظيف حتى لا تختلط مفاتيح قديمة بجديدة.
  await stopWA(userId, true, 'relink');
  touchSessionActivity(userId);
  await startWA(userId);
  const sock = sessions.get(userId);

  if (!sock) {
    throw new Error('تعذر بدء جلسة واتساب. حاول مجدداً.');
  }

  return new Promise<string>((resolve, reject) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('انتهت مهلة استلام كود الربط من واتساب. تأكد من اتصال الإنترنت وصحة الرقم ثم أعد المحاولة.'));
      }
    }, 45000);

    const executeRequest = async (targetSock: any) => {
      if (resolved) return;
      try {
        console.log(`[WA] Requesting pairing code for ${userId}`);
        const code = await targetSock.requestPairingCode(d);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.log(`[WA] Pairing code successfully received for ${userId}`);
          getIO()?.emit(`wa-status-${userId}`, { running: true, connected: false, state: 'WAITING_AUTH', pairingCode: code });
          resolve(code);
        }
      } catch (err: any) {
        console.warn(`[WA] Pairing code request error for ${userId}: ${err?.message}`);
        if (!resolved) {
          // إعادة محاولة سريعة بعد 2.5 ثانية إذا كانت الجلسة قيد التهيئة
          setTimeout(async () => {
            if (resolved) return;
            try {
              const retrySock = sessions.get(userId);
              if (retrySock) {
                const retryCode = await retrySock.requestPairingCode(d);
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  console.log(`[WA] Pairing code generated on retry for ${userId}`);
                  getIO()?.emit(`wa-status-${userId}`, { running: true, connected: false, state: 'WAITING_AUTH', pairingCode: retryCode });
                  resolve(retryCode);
                }
              }
            } catch (retryErr: any) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(new Error(retryErr?.message || 'فشل توليد كود الربط من واتساب. تأكد من صحة الرقم.'));
              }
            }
          }, 2500);
        }
      }
    };

    // إذا كان السوكيت قد أنتج QR بالفعل، فهذا يعني أن Noise Handshake اكتمل والسيرفر جاهز للربط فوراً
    if (qrCodes.get(userId)) {
      setTimeout(() => {
        const currentSock = sessions.get(userId);
        if (currentSock) executeRequest(currentSock);
      }, 500);
    } else {
      // ننتظر أول إشعار جاهزية من السوكيت
      const connListener = (update: any) => {
        if (update.qr || update.connection === 'open') {
          sock?.ev.off('connection.update', connListener);
          setTimeout(() => {
            const currentSock = sessions.get(userId);
            if (currentSock) executeRequest(currentSock);
          }, 1000);
        }
      };

      sock.ev.on('connection.update', connListener);

      // صمام أمان في حال عدم وصول الحدث
      setTimeout(() => {
        if (!resolved) {
          const currentSock = sessions.get(userId);
          if (currentSock) executeRequest(currentSock);
        }
      }, 3500);
    }
  });
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
    touchSessionActivity(userId);
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
    touchSessionActivity(userId);
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
    touchSessionActivity(userId);
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
  unitNumber: string;
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
    .replace(/{unitNumber}/g, params.unitNumber)
    .replace(/{date}/g, params.date || '')
    .replace(/{closureNotes}/g, params.closureNotes || '');
}

export async function buildOpeningMsg(params: MsgParams): Promise<string> {
  const defaultMsg = `السلام عليكم،\nتم استلام طلب الصيانة الخاص بك\n\nرقم التذكرة: #{ticketId}\nالوصف: {description}\nالفيلا: {unitNumber}\nالتاريخ: {date}\n\nسيتواصل معكم فريق الصيانة في أقرب وقت.\nشكراً لثقتكم.`;
  const template = await getTemplate('openingMsg', defaultMsg);
  return replaceVars(template, params);
}

export async function buildClosingMsg(params: MsgParams): Promise<string> {
  const notesStr = params.closureNotes ? `\nملاحظات الإغلاق: {closureNotes}` : '';
  const defaultMsg = `السلام عليكم،\nتمت معالجة تذكرة الصيانة بنجاح\n\nرقم التذكرة: #{ticketId}\nالوصف: {description}\nالفيلا: {unitNumber}${notesStr}\n\nشكراً لصبركم وتعاونكم.`;
  const template = await getTemplate('closingMsg', defaultMsg);
  return replaceVars(template, params);
}

export async function buildAbsentMsg(params: MsgParams): Promise<string> {
  const defaultMsg = `السلام عليكم،\n\nتم زيارة وحدتكم رقم {unitNumber} بخصوص بلاغ الصيانة #{ticketId}،\nولم يتمكن الفريق من الدخول نظراً لعدم التواجد.\n\nيرجى رفع تذكرة جديدة عند تواجدكم لإعادة جدولة الزيارة.\n\nشكراً لتفهمكم.`;
  const template = await getTemplate('absentMsg', defaultMsg);
  return replaceVars(template, params);
}

export async function buildOutOfScopeMsg(params: MsgParams): Promise<string> {
  const defaultMsg = `السلام عليكم،\n\nبخصوص بلاغ الصيانة #{ticketId} لوحدتكم رقم {unitNumber}،\nبعد المعاينة تبيّن أن المشكلة خارج نطاق الضمان.\n\nشكراً لتفهمكم.`;
  const template = await getTemplate('outOfScopeMsg', defaultMsg);
  return replaceVars(template, params);
}

// ─── رسالة موعد بنطاق زمني (Range) ─────────────────────────────────────────

type AppointmentRangeParams = {
  clientName: string;
  ticketId: string;
  unitNumber: string;
  startDate: string;   
  endDate: string;     
  preferredTime: string; 
  notes?: string | null;
};

export async function buildAppointmentRangeMsg(params: AppointmentRangeParams): Promise<string> {
  const defaultOpeningMsg = `السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم {unitNumber}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`;
  
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'whatsapp_templates' } });
  const templates = (setting?.value ?? {}) as Record<string, string>;
  const baseMsg = templates.openingMsg || defaultOpeningMsg;

  let msg = baseMsg
    .replace(/{ticketId}/g, params.ticketId)
    .replace(/{unitNumber}/g, params.unitNumber);

  msg += `\n\nتفاصيل الموعد المقترح:\n`;
  msg += `من ${params.startDate}\n`;
  msg += `إلى ${params.endDate}\n\n`;
  msg += `الوقت المفضل: ${params.preferredTime}\n`;
  if (params.notes) {
    msg += `ملاحظات: ${params.notes}\n`;
  }
  
  return msg;
}
