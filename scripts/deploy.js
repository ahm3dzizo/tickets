import { execSync } from 'child_process';

// ── Config ──────────────────────────────────────────
const SSH_HOST  = 'knot';
const API_DIR   = '/opt/retal-api';
const PM2_NAME  = 'retal-api';
const GIT_BRANCH = 'main';           // ← غيّره لو الـ branch مختلف

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
  run(`git push origin ${GIT_BRANCH}`);
  ok('تم رفع الكود بنجاح ✓');
}

console.log('');

// ════════════════════════════════════════
//  PART 2 — SERVER via SSH
// ════════════════════════════════════════
log(`الاتصال بالسيرفر (${SSH_HOST})...`);

// كتابة السكريبت في ملف مؤقت على السيرفر وتشغيله
// عشان نتجنب مشكلة الـ quoting على Windows
const remoteLines = [
  `cd ${API_DIR}`,
  `git fetch origin`,
  `git checkout ${GIT_BRANCH}`,
  `git pull origin ${GIT_BRANCH}`,
  `npm install --silent`,
  `npm run build`,
  `sudo cp -r dist/* /var/www/retal/`,
  `pm2 restart ${PM2_NAME} --update-env`,
  `pm2 list`,
];

// كتابة كل أمر على سطر منفصل وتمريره عبر stdin
const remoteScript = remoteLines.join('\n');

try {
  execSync(`ssh ${SSH_HOST} bash`, {
    input: remoteScript,
    stdio: ['pipe', 'inherit', 'inherit'],
    encoding: 'utf8',
  });
} catch {
  fail('فشل اتصال السيرفر');
}

console.log('');
ok('═══════════════════════════════');
ok(' Deploy اكتمل بنجاح 🚀');
ok('═══════════════════════════════');
console.log('');