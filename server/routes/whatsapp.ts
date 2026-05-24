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
    + `--session-data-path ${SESSIONS_PATH} --use-chrome --no-sandbox --headful`;
  const args = extraArgs ? `${baseArgs} ${extraArgs}` : baseArgs;

  const cfg = `module.exports = {
  apps: [{
    name: 'wa-automate',
    script: '/opt/retal-api/node_modules/.bin/wa-automate',
    args: '${args}',
    cwd: '/opt/retal-api',
    env: {
      DISPLAY: ':1',
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
    res.status(503).json({ error: 'خدمة الواتساب التلقائي غير متاحة حالياً' });
    return;
  }
  const qr = await getQRCode('session');
  if (!qr) {
    res.status(404).json({ error: 'لا يوجد QR متاح — ربما الجلسة مرتبطة بالفعل' });
    return;
  }
  res.json({ qr });
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
// Restarts wa-automate with --link-code PHONE and returns the 8-digit code.
router.post('/pair', requireAuth, async (req: AuthRequest, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone?.trim()) {
    res.status(400).json({ error: 'رقم الهاتف مطلوب' });
    return;
  }

  const digits = phoneDigits(phone.trim());

  try {
    // Restart wa-automate with link-code for this phone number
    await restartWA(`--link-code ${digits}`);

    // Wait for wa-automate to generate and log the pairing code
    const code = await waitForLinkCode(50_000);

    if (!code) {
      res.status(408).json({
        error: 'انتهت مهلة انتظار كود الربط — تأكد من صحة الرقم وحاول مجدداً',
      });
      return;
    }

    res.json({ code });
  } catch (err: any) {
    console.error('WA pair error:', err);
    res.status(500).json({ error: 'تعذّر بدء عملية الربط' });
  }
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
