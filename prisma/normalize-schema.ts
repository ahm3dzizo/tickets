/**
 * normalize-schema.ts
 *
 * خطوة التهيئة قبل تطبيق schema.prisma الجديد.
 * آمن للتشغيل أكثر من مرة (كل خطوة IF NOT EXISTS أو WHERE IS NULL).
 *
 * الترتيب:
 *   1. إضافة unitId لـ Appointment (إذا لم يكن موجوداً)
 *   2. ملء Appointment.unitId من villaNumber
 *   3. ملء Ticket.unitId من villaNumber
 *   4. ملء Appointment.clientId من ClientUnit
 *   5. ملء Ticket.clientId من ClientUnit (للتذاكر اللي عندها unitId بس مش clientId)
 *   6. نقل Appointment.technicians JSON → technicianId + technicianIds
 *   7. حل contractorName → contractorId بالبحث بالاسم
 *   8. إلغاء contractorId الوهمية (ID مش موجود في Contractor)
 *   9. نقل User.specialty → _UserSpecialties
 *
 * تشغيل:
 *   npx tsx prisma/normalize-schema.ts
 * ثم:
 *   npx prisma db push --accept-data-loss
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('── بدء تهيئة البيانات ──\n');

  // ── 1. تأكد أن عمود unitId موجود في Appointment ──────────────────────────
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "unitId" TEXT;
  `);
  console.log('✔ 1. تمت إضافة عمود unitId لـ Appointment (أو موجودة بالفعل)');

  // ── 2. ملء Appointment.unitId من villaNumber ──────────────────────────────
  const apptUnitResult = await prisma.$executeRawUnsafe(`
    UPDATE "Appointment" a
    SET "unitId" = u.id
    FROM "Unit" u
    WHERE u."projectId" = a."projectId"
      AND u."unitNumber" = a."villaNumber"
      AND a."unitId" IS NULL
      AND a."villaNumber" IS NOT NULL
      AND a."villaNumber" <> '';
  `);
  console.log(`✔ 2. تم ربط ${apptUnitResult} موعد بوحداتهم`);

  // ── 3. ملء Ticket.unitId الفارغة من villaNumber ───────────────────────────
  const ticketUnitResult = await prisma.$executeRawUnsafe(`
    UPDATE "Ticket" t
    SET "unitId" = u.id
    FROM "Unit" u
    WHERE u."projectId" = t."projectId"
      AND u."unitNumber" = t."villaNumber"
      AND t."unitId" IS NULL
      AND t."villaNumber" IS NOT NULL
      AND t."villaNumber" <> '';
  `);
  console.log(`✔ 3. تم ربط ${ticketUnitResult} تذكرة بوحداتها`);

  // ── 4. ملء Appointment.clientId الفارغة من ClientUnit ───────────────────
  const apptClientResult = await prisma.$executeRawUnsafe(`
    UPDATE "Appointment" a
    SET "clientId" = cu."clientId"
    FROM "ClientUnit" cu
    WHERE cu."unitId" = a."unitId"
      AND a."clientId" IS NULL
      AND a."unitId" IS NOT NULL
      AND cu."isPrimary" = true;
  `);
  console.log(`✔ 4. تم ربط ${apptClientResult} موعد بعملائهم`);

  // ── 5. ملء Ticket.clientId الفارغة من ClientUnit ─────────────────────────
  const ticketClientResult = await prisma.$executeRawUnsafe(`
    UPDATE "Ticket" t
    SET "clientId" = cu."clientId"
    FROM "ClientUnit" cu
    WHERE cu."unitId" = t."unitId"
      AND t."clientId" IS NULL
      AND t."unitId" IS NOT NULL
      AND cu."isPrimary" = true;
  `);
  console.log(`✔ 5. تم ربط ${ticketClientResult} تذكرة بعملائها`);

  // ── 6. نقل Appointment.technicians JSON → technicianId + technicianIds ────
  // 6a: technicianId ← أول عنصر في المصفوفة (إذا كان فارغاً)
  const techIdResult = await prisma.$executeRawUnsafe(`
    UPDATE "Appointment"
    SET "technicianId" = "technicians"->0->>'id'
    WHERE "technicianId" IS NULL
      AND "technicians" IS NOT NULL
      AND jsonb_typeof("technicians") = 'array'
      AND jsonb_array_length("technicians") > 0
      AND "technicians"->0->>'id' IS NOT NULL
      AND "technicians"->0->>'id' <> '';
  `);
  console.log(`✔ 6a. تم نقل technicianId لـ ${techIdResult} موعد`);

  // 6b: technicianIds ← كل IDs الفنيين من المصفوفة (إذا كانت فارغة)
  const techIdsResult = await prisma.$executeRawUnsafe(`
    UPDATE "Appointment" a
    SET "technicianIds" = (
      SELECT array_agg(elem->>'id')
      FROM jsonb_array_elements(a."technicians") AS elem
      WHERE elem->>'id' IS NOT NULL AND elem->>'id' <> ''
    )
    WHERE (a."technicianIds" IS NULL OR a."technicianIds" = '{}')
      AND a."technicians" IS NOT NULL
      AND jsonb_typeof(a."technicians") = 'array'
      AND jsonb_array_length(a."technicians") > 0;
  `);
  console.log(`✔ 6b. تم نقل technicianIds لـ ${techIdsResult} موعد`);

  // ── 7. حل contractorName → contractorId (بحث بالاسم) ────────────────────
  // للتذاكر اللي عندها contractorName بس مش contractorId
  const contractorNameResult = await prisma.$executeRawUnsafe(`
    UPDATE "Ticket" t
    SET "contractorId" = c.id
    FROM "Contractor" c
    WHERE t."contractorId" IS NULL
      AND t."contractorName" IS NOT NULL
      AND t."contractorName" <> ''
      AND LOWER(TRIM(c.name)) = LOWER(TRIM(t."contractorName"));
  `);
  console.log(`✔ 7. تم ربط ${contractorNameResult} تذكرة بمقاولها (بالاسم)`);

  // ── 8. إلغاء contractorId الوهمية (ID مش موجود في Contractor) ─────────────
  // ضروري قبل db push لأن الـ FK الجديد هيرفض IDs وهمية
  const orphanResult = await prisma.$executeRawUnsafe(`
    UPDATE "Ticket"
    SET "contractorId" = NULL
    WHERE "contractorId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Contractor" WHERE id = "Ticket"."contractorId"
      );
  `);
  console.log(`✔ 8. تم إلغاء ${orphanResult} contractorId وهمية (مقاول غير موجود)`);

  // ── 9. نقل User.specialty → _UserSpecialties قبل حذف العمود ─────────────
  let specialtyMigrated = 0;
  let specialtySkipped  = 0;
  try {
    const usersWithSpecialty = await prisma.$queryRawUnsafe<Array<{ uid: string; specialty: string }>>(
      `SELECT uid, specialty FROM "User" WHERE specialty IS NOT NULL AND specialty <> ''`
    );
    for (const u of usersWithSpecialty) {
      const sp = await prisma.specialty.findUnique({ where: { key: u.specialty } });
      if (sp) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "_UserSpecialties" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          sp.id, u.uid
        );
        specialtyMigrated++;
      } else {
        specialtySkipped++;
        console.log(`  ⚠ تخصص غير موجود في جدول Specialty: "${u.specialty}" (المستخدم: ${u.uid})`);
      }
    }
  } catch (err: any) {
    // إذا العمود اتحذف بالفعل في run سابق، نتجاهل الخطأ
    if (!err.message?.includes('column') && !err.message?.includes('specialty')) throw err;
    console.log('  ℹ عمود specialty غير موجود، تم تخطي هذه الخطوة');
  }
  console.log(`✔ 9. تم نقل تخصص ${specialtyMigrated} مستخدم إلى _UserSpecialties${specialtySkipped ? ` (${specialtySkipped} تخصص غير معروف تم تخطيه)` : ''}`);

  // ── تقرير ختامي ──────────────────────────────────────────────────────────
  const [ticketCount, apptCount, userCount] = await Promise.all([
    prisma.ticket.count(),
    prisma.appointment.count(),
    prisma.user.count(),
  ]);

  console.log('\n── اكتملت التهيئة ──');
  console.log(`   التذاكر: ${ticketCount} | المواعيد: ${apptCount} | المستخدمين: ${userCount}`);
  console.log('');
  console.log('الخطوة التالية:');
  console.log('  npx prisma db push --accept-data-loss');
  console.log('');
  console.log('ملاحظة: --accept-data-loss ستحذف الأعمدة التالية نهائياً:');
  console.log('  • Appointment.technicians  (تم نقل البيانات في خطوة 6)');
  console.log('  • Ticket.contractorName    (تم حل الـ contractorId في خطوة 7)');
  console.log('  • User.specialty           (تم نقل البيانات في خطوة 9)');
}

main()
  .catch(e => { console.error('\n❌ فشل التهيئة:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
