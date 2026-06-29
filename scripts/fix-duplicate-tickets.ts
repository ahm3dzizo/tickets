/**
 * fix-duplicate-tickets.ts
 * يبحث عن التذاكر المكررة بسبب الأصفار البادئة (مثل 19350 و 0019350)
 * ويحذف النسخة الزائدة مع الاحتفاظ بالأقدم (أو الأكثر بيانات)
 * 
 * تشغيل: npx tsx scripts/fix-duplicate-tickets.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

function normalizeTicketId(raw: string): string {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return String(parseInt(trimmed, 10));
  return trimmed;
}

async function main() {
  console.log(`\n══════════════════════════════════════`);
  console.log(`   بحث وإصلاح التذاكر المكررة`);
  console.log(`   الوضع: ${DRY_RUN ? '🔍 عرض فقط (dry-run)' : '🗑️  حذف فعلي'}`);
  console.log(`══════════════════════════════════════\n`);

  // جلب كل التذاكر مع ticketId
  const allTickets = await prisma.ticket.findMany({
    select: {
      id: true,
      ticketId: true,
      createdAt: true,
      status: true,
      description: true,
      closureNotes: true,
      appointmentTime: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`📊 إجمالي التذاكر في قاعدة البيانات: ${allTickets.length}\n`);

  // تجميع التذاكر حسب الـ normalized ticketId
  const groupMap = new Map<string, typeof allTickets>();
  for (const ticket of allTickets) {
    const normalized = normalizeTicketId(ticket.ticketId || '');
    if (!normalized) continue;
    const group = groupMap.get(normalized) || [];
    group.push(ticket);
    groupMap.set(normalized, group);
  }

  // إيجاد المجموعات التي فيها أكثر من تذكرة
  const duplicateGroups = [...groupMap.entries()].filter(([, group]) => group.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('✅ لا توجد تذاكر مكررة!');
    return;
  }

  console.log(`⚠️  وجدنا ${duplicateGroups.length} مجموعة مكررة:\n`);

  const toDelete: string[] = [];

  for (const [normalizedId, group] of duplicateGroups) {
    // الاحتفاظ بالتذكرة الأقدم (أول واحدة في الترتيب الزمني)
    // أو التي فيها بيانات أكثر (closureNotes أو appointmentTime)
    const sorted = [...group].sort((a, b) => {
      // أولوية 1: التذاكر المغلقة أو المكتملة
      const closedStatuses = ['closed', 'completed', 'out_of_scope'];
      const aIsClosed = closedStatuses.includes(a.status) ? 1 : 0;
      const bIsClosed = closedStatuses.includes(b.status) ? 1 : 0;
      if (bIsClosed !== aIsClosed) return bIsClosed - aIsClosed;
      // أولوية 2: التي فيها ملاحظات إغلاق
      const aScore = (a.closureNotes ? 2 : 0) + (a.appointmentTime ? 1 : 0);
      const bScore = (b.closureNotes ? 2 : 0) + (b.appointmentTime ? 1 : 0);
      if (bScore !== aScore) return bScore - aScore;
      // ثالثاً: الأقدم
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const [keep, ...duplicates] = sorted;

    console.log(`🔑 ticketId: ${normalizedId}`);
    console.log(`   ✅ يحتفظ بـ: id=${keep.id} | ticketId="${keep.ticketId}" | status=${keep.status} | created=${new Date(keep.createdAt).toLocaleDateString('ar-EG')}`);
    for (const dup of duplicates) {
      console.log(`   🗑️  يحذف:    id=${dup.id} | ticketId="${dup.ticketId}" | status=${dup.status} | created=${new Date(dup.createdAt).toLocaleDateString('ar-EG')}`);
      toDelete.push(dup.id);
    }
    console.log('');
  }

  console.log(`\n📋 ملخص:`);
  console.log(`   مجموعات مكررة: ${duplicateGroups.length}`);
  console.log(`   تذاكر ستُحذف: ${toDelete.length}`);

  if (DRY_RUN) {
    console.log(`\n🔍 وضع العرض فقط — لم يُحذف شيء.`);
    console.log(`   لتطبيق الحذف الفعلي، شغّل بدون --dry-run:\n`);
    console.log(`   npx tsx scripts/fix-duplicate-tickets.ts\n`);
    return;
  }

  if (toDelete.length === 0) {
    console.log('\n✅ لا شيء يحتاج للحذف.');
    return;
  }

  console.log(`\n🗑️  جاري حذف ${toDelete.length} تذكرة مكررة...`);
  const result = await prisma.ticket.deleteMany({
    where: { id: { in: toDelete } },
  });
  console.log(`✅ تم حذف ${result.count} تذكرة بنجاح!\n`);

  // تحديث الـ ticketId لإزالة الأصفار البادئة من التذاكر المتبقية
  console.log(`🔄 تحديث الـ ticketId لإزالة الأصفار البادئة من التذاكر المتبقية...`);
  let updatedCount = 0;
  for (const ticket of allTickets) {
    if (toDelete.includes(ticket.id)) continue; // تخطي المحذوفة
    const normalized = normalizeTicketId(ticket.ticketId || '');
    if (normalized !== ticket.ticketId) {
      try {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { ticketId: normalized },
        });
        updatedCount++;
        console.log(`   ✏️  ${ticket.ticketId} → ${normalized}`);
      } catch (err: any) {
        console.warn(`   ⚠️  تعذّر تحديث ${ticket.ticketId}: ${err.message}`);
      }
    }
  }
  console.log(`\n✅ تم تحديث ${updatedCount} ticketId بإزالة الأصفار البادئة.`);
  console.log(`\n🎉 اكتمل الإصلاح!\n`);
}

main()
  .catch(err => {
    console.error('❌ خطأ:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
