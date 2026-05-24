import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AuthRequest, requireAuth } from '../auth.js';
import { isWAAvailable, getSessionState, getQRCode, sendWAText } from '../whatsapp.js';

const execAsync = promisify(exec);
const router = Router();

const WA_KEY  = process.env.WA_AUTOMATE_KEY ?? '';
const WA_PORT = 8002;
const SESSIONS_PATH = '/opt/retal-api/wa-sessions';
const ECOSYSTEM_PATH = '/opt/retal-api/wa-ecosystem.config.cjs';

/** Normalise Egyptian phone → international digits only (no @c.us) */
function phoneDigits(phone: string): string {
  let d = phone.replace(/\D/g, '').replace(/^00/, '');
  if (d.startsWith('0') && d.length === 11) d = '2' + d;
  if (!d.startsWith('2')) d = '2' + d;
  return d;
}

/** Write ecosystem config and (re)start wa-automate via PM2 */
async function restartWA(extraArgs = ''): Promise<void> {
  const baseArgs = `--port ${WA_PORT} --api-key ${WA_KEY} `
    + `--session-data-path ${SESSIONS_PATH} --use-chrome --no-sandbox --headless --qr-timeout 0 --auth-timeout 0`;
  const args = extraArgs ? `${baseArgs} ${extraArgs}` : baseArgs;

  const cfg = `module.exports = {
  apps: [{
    name: 'wa-automate',
    script: '/opt/retal-api/node_modules/.bin/wa-automate',
    args: '${args}',
    cwd: '/opt/retal-api',
    env: {
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium',
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
      NODE_ENV: 'production'
    },
    autorestart: true,
    restart_delay: 10000,
    max_restarts: 5
  }]
};`;

  // write config
  const fs = await import('fs');
  fs.writeFileSync(ECOSYSTEM_PATH, cfg, 'utf8');

  // stop + clear sessions + start
  await execAsync('pm2 stop wa-automate').catch(() => {});
  await execAsync(`rm -rf ${SESSIONS_PATH} && mkdir -p ${SESSIONS_PATH}`);
  await execAsync('pm2 flush wa-automate').catch(() => {});
  await execAsync(`pm2 start ${ECOSYSTEM_PATH}`);
}

/** Poll PM2 logs until the Link Code line appears (up to maxWaitMs) */
async function waitForLinkCode(maxWaitMs = 45_000): Promise<string | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const { stdout } = await execAsync('pm2 logs wa-automate --lines 80 --nostream 2>&1');
      // wa-automate logs: "- Link Code please use this to login … : ABCD-EFGH"
      const m = stdout.match(/Link Code please use this to login[^:]*:\s*([A-Z0-9]{4}[-– ]?[A-Z0-9]{4})/i);
      if (m) return m[1].replace(/[-– ]/g, '-');
    } catch { /* ignore */ }
  }
  return null;
}

// ─── GET /api/whatsapp/status ────────────────────────────────────────────────
router.get('/status', requireAuth, async (_req: AuthRequest, res) => {
  const running = await isWAAvailable();
  if (!running) {
    // Check if PM2 process is at least running (waiting for auth)
    try {
      const { stdout } = await execAsync('pm2 jlist 2>&1');
      const list = JSON.parse(stdout) as any[];
      const wa = list.find((p: any) => p.name === 'wa-automate');
      if (wa && wa.pm2_env?.status === 'online') {
        res.json({ running: true, connected: false, state: 'WAITING_AUTH' });
        return;
      }
    } catch { /* ignore */ }
    res.json({ running: false, connected: false });
    return;
  }
  const state = await getSessionState('session');
  res.json({ running: true, connected: state === 'CONNECTED', state });
});

// ─── GET /api/whatsapp/qr ────────────────────────────────────────────────────
router.get('/qr', requireAuth, async (_req: AuthRequest, res) => {
  const running = await isWAAvailable();
  if (!running) {
    // Check PM2 status to give a more descriptive error
    let detail = 'خدمة الواتساب التلقائي غير متاحة حالياً';
    let pm2Status = 'unknown';
    let restarts = 0;
    try {
      const { stdout } = await execAsync('pm2 jlist 2>&1');
      const list = JSON.parse(stdout) as any[];
      const wa = list.find((p: any) => p.name === 'wa-automate');
      if (wa) {
        pm2Status = wa.pm2_env?.status ?? 'unknown';
        restarts = wa.pm2_env?.restart_time ?? 0;
        if (pm2Status === 'online') {
          detail = 'الخدمة تعمل لكن لم تتصل بعد — انتظر لحظة وأعد المحاولة';
        } else if (pm2Status === 'errored') {
          detail = `الخدمة توقفت بسبب خطأ (restarts: ${restarts}) — تحقق من السيرفر`;
        } else {
          detail = `حالة الخدمة: ${pm2Status} (restarts: ${restarts})`;
        }
      } else {
        detail = 'خدمة wa-automate غير موجودة في PM2';
      }
    } catch { /* ignore */ }
    res.status(503).json({ error: detail, pm2Status, restarts });
    return;
  }
  const qr = await getQRCode('session');
  if (!qr) {
    res.status(404).json({ error: 'لا يوجد QR متاح — ربما الجلسة مرتبطة بالفعل' });
    return;
  }
  res.json({ qr });
});

// ─── GET /api/whatsapp/logs ───────────────────────────────────────────────────
// Returns last 50 lines of wa-automate PM2 logs for debugging
router.get('/logs', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const { stdout } = await execAsync('pm2 logs wa-automate --lines 50 --nostream 2>&1');
    res.json({ logs: stdout });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/send ─────────────────────────────────────────────────
router.post('/send', requireAuth, async (req: AuthRequest, res) => {
  const { phone, message } = req.body as { phone?: string; message?: string };
  if (!phone?.trim() || !message?.trim()) {
    res.status(400).json({ error: 'phone و message مطلوبان' });
    return;
  }
  const result = await sendWAText('session', phone.trim(), message.trim());
  res.json(result);
});

// ─── POST /api/whatsapp/pair ─────────────────────────────────────────────────
// Pairing code is currently disabled due to wa-automate/WhatsApp Web compatibility issues.
router.post('/pair', requireAuth, async (req: AuthRequest, res) => {
  res.status(400).json({
    error: 'طريقة ربط رقم الهاتف غير مدعومة حالياً بسبب تحديثات واتساب ويب. يرجى الانتقال إلى الإعدادات واستخدام رمز QR بدلاً من ذلك.',
  });
});

// ─── POST /api/whatsapp/verify ───────────────────────────────────────────────
// Called after the user enters the code in WhatsApp — waits for API to come up
router.post('/verify', requireAuth, async (_req: AuthRequest, res) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ok = await isWAAvailable();
    if (ok) {
      const state = await getSessionState('session');
      if (state === 'CONNECTED') {
        res.json({ connected: true });
        return;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  res.json({ connected: false });
});

export default router;
