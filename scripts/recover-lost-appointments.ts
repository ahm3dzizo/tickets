/**
 * recover-lost-appointments.ts
 *
 * يفحص التذاكر المفتوحة التي فقدت مواعيدها (أمس + اليوم) ويحاول استردادها
 * من تذاكر أخرى لنفس الفيلا أو العميل.
 *
 * تشغيل (عرض فقط):
 *   npx tsx scripts/recover-lost-appointments.ts --dry-run
 *
 * تشغيل (استرداد فعلي):
 *   npx tsx scripts/recover-lost-appointments.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

function normalizeVilla(v: any): string {
  if (!v) return '';
  return String(v).trim().replace(/^0+/, '') || String(v).trim();
}

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('   استرداد المواعيد المفقودة');
  console.log(`   الوضع: ${DRY_RUN ? '🔍 عرض فقط' : '✏️  استرداد فعلي'}`);
  console.log('══════════════════════════════════════════\n');

  // نطاق البحث: أمس + اليوم + غداً (للتأكد)
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const tomorrowStr  = tomorrow.toISOString().split('T')[0];

  console.log(`📅 نطاق البحث: ${yesterdayStr} → ${tomorrowStr}\n`);

  // كل التذاكر
  const allTickets = await prisma.ticket.findMany({
    select: {
      id: true,
      ticketId: true,
      villaNumber: true,
      clientId: true,
      clientName: true,
      appointmentTime: true,
      appointmentNotes: true,
      assignedSupervisorIds: true,
      assignedSupervisors: true,
      detectedTypes: true,
      status: true,
      projectId: true,
      type: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // ── 1. التذاكر التي لديها موعد في النطاق (مصدر البيانات) ──────────────────
  const withAppt = allTickets.filter(t => {
    if (!t.appointmentTime) return false;
    const d = t.appointmentTime.split(' ')[0];
    return d >= yesterdayStr && d <= tomorrowStr;
  });

  console.log(`✅ تذاكر عندها موعد في النطاق: ${withAppt.length}`);
  withAppt.forEach(t =>
    console.log(`   Villa: ${t.villaNumber} | Appt: ${t.appointmentTime} | Status: ${t.status} | id: ${t.id}`)
  );

  // ── 2. التذاكر المفتوحة التي فقدت موعدها ────────────────────────────────────
  const openNoAppt = allTickets.filter(t =>
    !t.appointmentTime &&
    t.status !== 'closed' &&
    t.status !== 'completed' &&
    t.status !== 'out_of_scope' &&
    t.status !== 'out-of-scope'
  );

  console.log(`\n⚠️  تذاكر مفتوحة بدون موعد: ${openNoAppt.length}`);

  // ── 3. مطابقة بالفيلا أو العميل ──────────────────────────────────────────────
  const toRecover: Array<{ ticket: typeof openNoAppt[0]; source: typeof withAppt[0] }> = [];

  for (const t of openNoAppt) {
    const villa = normalizeVilla(t.villaNumber);

    // بحث بالفيلا أولاً
    let source = withAppt.find(w => normalizeVilla(w.villaNumber) === villa && villa !== '');

    // بحث بالعميل ثانياً
    if (!source && t.clientId) {
      source = withAppt.find(w => w.clientId === t.clientId);
    }

    if (source) {
      toRecover.push({ ticket: t, source });
    }
  }

  if (toRecover.length === 0) {
    console.log('\n✅ لا توجد تذاكر تحتاج استرداد موعد في هذا النطاق.');
    return;
  }

  console.log(`\n🔄 تذاكر يمكن استرداد مواعيدها: ${toRecover.length}\n`);

  for (const { ticket, source } of toRecover) {
    console.log(`📌 تذكرة: ${ticket.ticketId || ticket.id}`);
    console.log(`   الفيلا: ${ticket.villaNumber} | العميل: ${ticket.clientName}`);
    console.log(`   الموعد المسترد: ${source.appointmentTime}`);
    console.log(`   المصدر: تذكرة ${source.ticketId || source.id} (${source.villaNumber})`);
    if (source.appointmentNotes) console.log(`   الملاحظات: ${source.appointmentNotes}`);
    console.log('');
  }

  if (DRY_RUN) {
    console.log('🔍 وضع العرض — لم يتم أي تعديل.');
    console.log('   لتطبيق الاسترداد:\n   npx tsx scripts/recover-lost-appointments.ts\n');
    return;
  }

  // ── 4. تطبيق الاسترداد ────────────────────────────────────────────────────────
  console.log('✏️  جاري استرداد المواعيد...\n');
  let count = 0;

  for (const { ticket, source } of toRecover) {
    try {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          appointmentTime: source.appointmentTime,
          appointmentNotes: source.appointmentNotes ?? ticket.appointmentNotes,
          // نقل بيانات المشرفين إن كانت فارغة
          ...((!ticket.assignedSupervisorIds || ticket.assignedSupervisorIds.length === 0) && source.assignedSupervisorIds?.length
            ? {
                assignedSupervisorIds: source.assignedSupervisorIds,
                assignedSupervisors: source.assignedSupervisors as any,
              }
            : {}),
          // نقل الـ detectedTypes إن كانت فارغة
          ...((!ticket.detectedTypes || (ticket.detectedTypes as string[]).length === 0) && source.detectedTypes?.length
            ? { detectedTypes: source.detectedTypes }
            : {}),
        },
      });
      count++;
      console.log(`   ✅ تذكرة ${ticket.ticketId || ticket.id} → موعد: ${source.appointmentTime}`);
    } catch (err: any) {
      console.error(`   ❌ فشل تحديث ${ticket.id}: ${err.message}`);
    }
  }

  console.log(`\n🎉 تم استرداد ${count} موعد بنجاح!\n`);
}

main()
  .catch(err => {
    console.error('❌ خطأ:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
