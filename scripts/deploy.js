import { execSync } from 'child_process';
import { createRequire } from 'module';

// ── Config ──────────────────────────────────────────
const SSH_HOST = 'knot';
const API_DIR  = '/opt/retal-api';
const PM2_NAME = 'retal-api';

// ── Colors ───────────────────────────────────────────
const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
};

const log  = (s) => console.log(c.cyan  (`▶  ${s}`));
const ok   = (s) => console.log(c.green (`✔  ${s}`));
const warn = (s) => console.log(c.yellow(`⚠  ${s}`));
const fail = (s) => { console.log(c.red (`✘  ${s}`)); process.exit(1); };

const run = (cmd) => {
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch {
    fail(`فشل الأمر: ${cmd}`);
  }
};

const runCapture = (cmd) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  } catch {
    return '';
  }
};

// ── Commit message ────────────────────────────────────
const args = process.argv.slice(2);
const now  = new Date().toLocaleString('sv').replace('T', ' ').slice(0, 16);
const msg  = args[0] || `update: ${now}`;

console.log('');
console.log(c.cyan('══════════════════════════════════════'));
console.log(c.cyan('   Retal Deploy                       '));
console.log(c.cyan('══════════════════════════════════════'));
console.log('');

// ════════════════════════════════════════
//  PART 1 — LOCAL: git commit + push
// ════════════════════════════════════════
log('التحقق من التغييرات المحلية...');

const status = runCapture('git status --porcelain');

if (!status) {
  warn('لا يوجد تغييرات — سيتم تخطي الـ commit');
} else {
  log('إضافة الملفات...');
  run('git add -A');

  log(`كوميت: "${msg}"`);
  run(`git commit -m "${msg}"`);

  log('رفع الكود على GitHub...');
  run('git push');
  ok('تم رفع الكود بنجاح ✓');
}

console.log('');

// ════════════════════════════════════════
//  PART 2 — SERVER: pull + restart
// ════════════════════════════════════════
log(`الاتصال بالسيرفر (${SSH_HOST})...`);

const remoteScript = [
  `cd ${API_DIR}`,
  'git pull',
  'npm install --omit=dev --silent',
  `pm2 restart ${PM2_NAME} --update-env`,
  'echo "✔ API جاهز"',
  'pm2 list',
].join(' && ');

run(`ssh ${SSH_HOST} "${remoteScript}"`);

console.log('');
ok('═══════════════════════════════');
ok(' Deploy اكتمل بنجاح 🚀');
ok('═══════════════════════════════');
console.log('');