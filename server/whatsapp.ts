import 'dotenv/config';

const WA_URL = (process.env.WA_AUTOMATE_URL ?? 'http://localhost:8002').replace(/\/$/, '');
const WA_KEY = process.env.WA_AUTOMATE_KEY ?? '';

function waHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(WA_KEY ? { 'api-key': WA_KEY } : {}),
  };
}

export async function isWAAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${WA_URL}/health`, {
      headers: waHeaders(),
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getSessionState(sessionId: string): Promise<string> {
  try {
    const res = await fetch(`${WA_URL}/api/getConnectionState`, {
      method: 'POST',
      headers: waHeaders(),
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json() as { response?: string };
    return data.response ?? 'DISCONNECTED';
  } catch {
    return 'DISCONNECTED';
  }
}

export async function getQRCode(sessionId: string): Promise<string | null> {
  try {
    const res = await fetch(`${WA_URL}/api/getQrCode`, {
      method: 'POST',
      headers: waHeaders(),
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json() as { response?: string };
    return data.response ?? null;
  } catch {
    return null;
  }
}

export async function sendWAText(
  sessionId: string,
  phone: string,
  message: string,
): Promise<{ sent: boolean; fallback: boolean }> {
  try {
    const available = await isWAAvailable();
    if (!available) return { sent: false, fallback: true };

    const chatId = normalizePhone(phone);
    const res = await fetch(`${WA_URL}/api/sendText`, {
      method: 'POST',
      headers: waHeaders(),
      body: JSON.stringify({ sessionId, args: { to: chatId, content: message } }),
    });
    const data = await res.json() as { response?: unknown };
    return { sent: !!data.response, fallback: false };
  } catch {
    return { sent: false, fallback: true };
  }
}

export async function requestPairingCode(
  sessionId: string,
  phone: string,
): Promise<string | null> {
  try {
    // Normalize to international format (no +, no @c.us)
    let d = phone.replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = '2' + d;

    const res = await fetch(`${WA_URL}/api/requestPairingCode`, {
      method: 'POST',
      headers: waHeaders(),
      body: JSON.stringify({ sessionId, args: { phone: d } }),
    });
    const data = await res.json() as { response?: string };
    return data.response ?? null;
  } catch {
    return null;
  }
}

export async function sendWAImage(
  sessionId: string,
  phone: string,
  jpgBuffer: Buffer,
  caption = '📊 تقرير الصيانة',
): Promise<{ sent: boolean; fallback: boolean }> {
  try {
    const available = await isWAAvailable();
    if (!available) return { sent: false, fallback: true };

    const chatId = normalizePhone(phone);
    const base64 = `data:image/jpeg;base64,${jpgBuffer.toString('base64')}`;
    const res = await fetch(`${WA_URL}/api/sendImage`, {
      method: 'POST',
      headers: waHeaders(),
      body: JSON.stringify({
        sessionId,
        args: { to: chatId, base64, filename: 'report.jpg', caption },
      }),
    });
    const data = await res.json() as { response?: unknown };
    return { sent: !!data.response, fallback: false };
  } catch {
    return { sent: false, fallback: true };
  }
}

export function buildOpeningMsg(params: {
  ticketId: string;
  clientName: string;
  description: string;
  villaNumber: string;
  date: string;
}): string {
  return `مرحباً ${params.clientName} 👋
تم استلام طلب الصيانة الخاص بك

📋 رقم التذكرة: #${params.ticketId}
📝 الوصف: ${params.description}
🏠 الفيلا: ${params.villaNumber}
📅 التاريخ: ${params.date}

سيتواصل معكم فريق الصيانة في أقرب وقت.
شكراً لثقتكم 🌟`;
}

export function buildClosingMsg(params: {
  ticketId: string;
  clientName: string;
  description: string;
  villaNumber: string;
  closureNotes?: string | null;
}): string {
  const notes = params.closureNotes
    ? `\n📝 ملاحظات الإغلاق: ${params.closureNotes}`
    : '';
  return `مرحباً ${params.clientName} 👋
تمت معالجة تذكرة الصيانة بنجاح ✅

📋 رقم التذكرة: #${params.ticketId}
📝 الوصف: ${params.description}
🏠 الفيلا: ${params.villaNumber}${notes}

شكراً لصبركم وتعاونكم 🌟`;
}

// Egyptian: 01xxxxxxxxx (11 digits) → 201xxxxxxxxx
function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = '2' + d;
  return `${d}@c.us`;
}
