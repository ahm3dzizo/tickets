/**
 * delete-tickets.ts
 * سكريبت لحذف التذاكر من Firestore
 *
 * الاستخدام:
 *   npx tsx scripts/delete-tickets.ts                         ← حذف كل التذاكر
 *   npx tsx scripts/delete-tickets.ts --project <projectId>   ← حذف تذاكر مشروع معين
 *   npx tsx scripts/delete-tickets.ts --status open           ← حذف تذاكر بحالة معينة
 *   npx tsx scripts/delete-tickets.ts --dry-run               ← معاينة بدون حذف فعلي
 *
 * أو استخدم npm run:
 *   npm run delete-tickets
 *   npm run delete-tickets:dry
 *
 * متغيرات البيئة (اختياري):
 *   EMAIL=admin@example.com
 *   PASSWORD=yourpassword
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, writeBatch, QueryConstraint } from 'firebase/firestore';
import * as readline from 'readline';

// ── Firebase Config ───────────────────────────────────────────────────────────
const firebaseConfig = {
  projectId:         'tickets-f4541',
  appId:             '1:558417282259:web:61889ae0cac470703c0026',
  apiKey:            'AIzaSyBGiYZkcKfmTET0B6sqC6QuiLDvoq68Z5o',
  authDomain:        'tickets-f4541.firebaseapp.com',
  storageBucket:     'tickets-f4541.firebasestorage.app',
  messagingSenderId: '558417282259',
};

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg  = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (flag: string) => args.includes(flag);

const filterProject = getArg('--project');
const filterStatus  = getArg('--status');
const dryRun        = hasFlag('--dry-run');

// ── Prompt helper ─────────────────────────────────────────────────────────────
function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🗑  سكريبت مسح التذاكر — Firestore Ticket Deleter');
  console.log('─'.repeat(52));

  if (dryRun)        console.log('🔍  وضع المعاينة (dry-run) — لن يتم حذف أي شيء');
  if (filterProject) console.log(`📁  فلتر المشروع:  ${filterProject}`);
  if (filterStatus)  console.log(`📌  فلتر الحالة:   ${filterStatus}`);
  if (!filterProject && !filterStatus) console.log('⚠️   لا يوجد فلتر — سيتم حذف جميع التذاكر');

  // ── Auth ──────────────────────────────────────────────────────────────────
  const email    = process.env.EMAIL    || await ask('\nالبريد الإلكتروني (مدير النظام): ');
  const password = process.env.PASSWORD || await ask('كلمة المرور: ');

  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  process.stdout.write('\n⏳  تسجيل الدخول...');
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log(' ✅');
  } catch (err: any) {
    console.log(`\n❌  فشل تسجيل الدخول: ${err.code ?? err.message}`);
    process.exit(1);
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const constraints: QueryConstraint[] = [];
  if (filterProject) constraints.push(where('projectId', '==', filterProject));
  if (filterStatus)  constraints.push(where('status',    '==', filterStatus));

  const finalQuery = constraints.length > 0
    ? query(collection(db, 'tickets'), ...constraints)
    : query(collection(db, 'tickets'));

  process.stdout.write('⏳  جارٍ جلب التذاكر...');
  const snap = await getDocs(finalQuery);
  const total = snap.docs.length;
  console.log(`  وجد ${total} تذكرة`);

  if (total === 0) {
    console.log('✅  لا توجد تذاكر مطابقة.');
    process.exit(0);
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  console.log('\n📋  عينة من التذاكر:');
  snap.docs.slice(0, 8).forEach(d => {
    const t = d.data() as any;
    console.log(`   • [${t.ticketId || d.id.slice(0, 6)}]  ${String(t.clientName || '---').padEnd(20)}  فيلا ${String(t.villaNumber || '---').padEnd(6)}  ${t.status}`);
  });
  if (total > 8) console.log(`   ... و ${total - 8} تذاكر أخرى`);

  if (dryRun) {
    console.log('\n✅  dry-run: لم يتم حذف أي شيء.');
    process.exit(0);
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  const answer = await ask(`\n⛔  هل تريد حذف ${total} تذكرة؟ اكتب  حذف  للتأكيد: `);
  if (answer !== 'حذف') {
    console.log('❌  تم الإلغاء بدون حذف.');
    process.exit(0);
  }

  // ── Delete in chunks of 499 ───────────────────────────────────────────────
  const CHUNK = 499;
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(CHUNK, snap.docs.length - i);
    console.log(`🗑  تم حذف ${deleted} / ${total}...`);
  }

  console.log(`\n✅  اكتمل — تم حذف ${deleted} تذكرة بنجاح.`);
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ خطأ غير متوقع:', err.message);
  process.exit(1);
});
