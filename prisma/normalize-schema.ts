/**
 * normalize-schema.ts
 *
 * خطوة التهيئة قبل تطبيق schema.prisma الجديد.
 * آمن للتشغيل أكثر من مرة (كل خطوة IF NOT EXISTS أو WHERE IS NULL).
 * جميع الخطوات داخل transaction واحدة — لو حصل خطأ يتم ROLLBACK تلقائياً.
 *
 * الترتيب:
 *   1. إضافة unitId لـ Appointment (إذا لم يكن موجوداً)
 *   2. ملء Appointment.unitId من villaNumber      [يُتخطى إذا العمود اتحذف]
 *   3. ملء Ticket.unitId من villaNumber           [يُتخطى إذا العمود اتحذف]
 *   4. ملء Appointment.clientId من ClientUnit
 *   5. ملء Ticket.clientId من ClientUnit
 *   6. نقل Appointment.technicians JSON → technicianId + technicianIds  [يُتخطى إذا العمود اتحذف]
 *   7. حل contractorName → contractorId بالبحث بالاسم  [يُتخطى إذا العمود اتحذف]
 *   8. إلغاء contractorId الوهمية (ID مش موجود في Contractor)
 *   9. نقل User.specialty → _UserSpecialties       [يُتخطى إذا العمود اتحذف]
 *
 * تشغيل:
 *   npx tsx prisma/normalize-schema.ts
 * ثم:
 *   npx prisma db push --accept-data-loss
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count
     FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2`,
    table, column
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function main() {
  console.log('── بدء تهيئة البيانات ──\n');

  // فحص وجود الأعمدة خارج الـ transaction (information_schema لا تتأثر)
  const hasApptVillaNumber    = await columnExists('Appointment', 'villaNumber');
  const hasTicketVillaNumber  = await columnExists('Ticket',      'villaNumber');
  const hasTechnicians        = await columnExists('Appointment', 'technicians');
  const hasContractorName     = await columnExists('Ticket',      'contractorName');
  const hasUserSpecialty      = await columnExists('User',        'specialty');

  console.log('فحص الأعمدة:');
  console.log(`  Appointment.villaNumber : ${hasApptVillaNumber   ? 'موجود' : 'محذوف'}`);
  console.log(`  Ticket.villaNumber      : ${hasTicketVillaNumber ? 'موجود' : 'محذوف'}`);
  console.log(`  Appointment.technicians : ${hasTechnicians        ? 'موجود' : 'محذوف'}`);
  console.log(`  Ticket.contractorName   : ${hasContractorName    ? 'موجود' : 'محذوف'}`);
  console.log(`  User.specialty          : ${hasUserSpecialty     ? 'موجود' : 'محذوف'}`);
  console.log('');

  // ── بداية الـ Transaction ─────────────────────────────────────────────────
  await prisma.$executeRawUnsafe('BEGIN');

  try {

    // ── 1. تأكد أن عمود unitId موجود في Appointment ──────────────────────────
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "unitId" TEXT;
    `);
    console.log('✔ 1. تمت إضافة عمود unitId لـ Appointment (أو موجودة بالفعل)');

    // ── 2. ملء Appointment.unitId من villaNumber ──────────────────────────────
    if (hasApptVillaNumber) {
      const n = await prisma.$executeRawUnsafe(`
        UPDATE "Appointment" a
        SET "unitId" = u.id
        FROM "Unit" u
        WHERE u."projectId" = a."projectId"
          AND u."unitNumber" = a."villaNumber"
          AND a."unitId" IS NULL
          AND a."villaNumber" IS NOT NULL
          AND a."villaNumber" <> '';
      `);
      console.log(`✔ 2. تم ربط ${n} موعد بوحداتهم`);
    } else {
      console.log('  ℹ 2. villaNumber في Appointment غير موجود — تم التخطي');
    }

    // ── 3. ملء Ticket.unitId الفارغة من villaNumber ───────────────────────────
    if (hasTicketVillaNumber) {
      const n = await prisma.$executeRawUnsafe(`
        UPDATE "Ticket" t
        SET "unitId" = u.id
        FROM "Unit" u
        WHERE u."projectId" = t."projectId"
          AND u."unitNumber" = t."villaNumber"
          AND t."unitId" IS NULL
          AND t."villaNumber" IS NOT NULL
          AND t."villaNumber" <> '';
      `);
      console.log(`✔ 3. تم ربط ${n} تذكرة بوحداتها`);
    } else {
      console.log('  ℹ 3. villaNumber في Ticket غير موجود — تم التخطي');
    }

    // ── 4. ملء Appointment.clientId الفارغة من ClientUnit ───────────────────
    const apptClient = await prisma.$executeRawUnsafe(`
      UPDATE "Appointment" a
      SET "clientId" = cu."clientId"
      FROM "ClientUnit" cu
      WHERE cu."unitId" = a."unitId"
        AND a."clientId" IS NULL
        AND a."unitId" IS NOT NULL
        AND cu."isPrimary" = true;
    `);
    console.log(`✔ 4. تم ربط ${apptClient} موعد بعملائهم`);

    // ── 5. ملء Ticket.clientId الفارغة من ClientUnit ─────────────────────────
    const ticketClient = await prisma.$executeRawUnsafe(`
      UPDATE "Ticket" t
      SET "clientId" = cu."clientId"
      FROM "ClientUnit" cu
      WHERE cu."unitId" = t."unitId"
        AND t."clientId" IS NULL
        AND t."unitId" IS NOT NULL
        AND cu."isPrimary" = true;
    `);
    console.log(`✔ 5. تم ربط ${ticketClient} تذكرة بعملائها`);

    // ── 6. نقل Appointment.technicians JSON → technicianId + technicianIds ────
    if (hasTechnicians) {
      const techId = await prisma.$executeRawUnsafe(`
        UPDATE "Appointment"
        SET "technicianId" = "technicians"->0->>'id'
        WHERE "technicianId" IS NULL
          AND "technicians" IS NOT NULL
          AND jsonb_typeof("technicians") = 'array'
          AND jsonb_array_length("technicians") > 0
          AND "technicians"->0->>'id' IS NOT NULL
          AND "technicians"->0->>'id' <> '';
      `);
      console.log(`✔ 6a. تم نقل technicianId لـ ${techId} موعد`);

      const techIds = await prisma.$executeRawUnsafe(`
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
      console.log(`✔ 6b. تم نقل technicianIds لـ ${techIds} موعد`);
    } else {
      console.log('  ℹ 6. technicians في Appointment غير موجود — تم التخطي');
    }

    // ── 7. حل contractorName → contractorId (بحث بالاسم) ────────────────────
    if (hasContractorName) {
      const n = await prisma.$executeRawUnsafe(`
        UPDATE "Ticket" t
        SET "contractorId" = c.id
        FROM "Contractor" c
        WHERE t."contractorId" IS NULL
          AND t."contractorName" IS NOT NULL
          AND t."contractorName" <> ''
          AND LOWER(TRIM(c.name)) = LOWER(TRIM(t."contractorName"));
      `);
      console.log(`✔ 7. تم ربط ${n} تذكرة بمقاولها (بالاسم)`);
    } else {
      console.log('  ℹ 7. contractorName في Ticket غير موجود — تم التخطي');
    }

    // ── 8. إلغاء contractorId الوهمية ────────────────────────────────────────
    const orphan = await prisma.$executeRawUnsafe(`
      UPDATE "Ticket"
      SET "contractorId" = NULL
      WHERE "contractorId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Contractor" WHERE id = "Ticket"."contractorId"
        );
    `);
    console.log(`✔ 8. تم إلغاء ${orphan} contractorId وهمية (مقاول غير موجود)`);

    // ── 9. نقل User.specialty → _UserSpecialties ─────────────────────────────
    if (hasUserSpecialty) {
      let migrated = 0;
      let skipped  = 0;
      const users = await prisma.$queryRawUnsafe<Array<{ uid: string; specialty: string }>>(
        `SELECT uid, specialty FROM "User" WHERE specialty IS NOT NULL AND specialty <> ''`
      );
      for (const u of users) {
        const sp = await prisma.specialty.findUnique({ where: { key: u.specialty } });
        if (sp) {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "_UserSpecialties" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            sp.id, u.uid
          );
          migrated++;
        } else {
          skipped++;
          console.log(`  ⚠ تخصص غير معروف: "${u.specialty}" (المستخدم: ${u.uid})`);
        }
      }
      console.log(`✔ 9. تم نقل تخصص ${migrated} مستخدم إلى _UserSpecialties${skipped ? ` (${skipped} تخصص غير معروف تم تخطيه)` : ''}`);
    } else {
      console.log('  ℹ 9. specialty في User غير موجود — تم التخطي');
    }

    // ── COMMIT ───────────────────────────────────────────────────────────────
    await prisma.$executeRawUnsafe('COMMIT');
    console.log('\n✅ تم تطبيق جميع التغييرات بنجاح (COMMIT)\n');

  } catch (err: any) {
    await prisma.$executeRawUnsafe('ROLLBACK');
    console.error('\n❌ حدث خطأ — تم التراجع عن جميع التغييرات (ROLLBACK)');
    throw err;
  }

  // ── تقرير ختامي (بعد COMMIT) ─────────────────────────────────────────────
  const [ticketCount, apptCount, userCount] = await Promise.all([
    prisma.ticket.count(),
    prisma.appointment.count(),
    prisma.user.count(),
  ]);

  const [apptNoUnit] = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*) as count FROM "Appointment" WHERE "unitId" IS NULL`
  );
  const [ticketNoUnit] = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*) as count FROM "Ticket" WHERE "unitId" IS NULL`
  );

  console.log('── تقرير ──');
  console.log(`   التذاكر: ${ticketCount} | المواعيد: ${apptCount} | المستخدمين: ${userCount}`);

  const apptNoUnitN   = Number(apptNoUnit?.count   ?? 0);
  const ticketNoUnitN = Number(ticketNoUnit?.count  ?? 0);
  if (apptNoUnitN   > 0) console.log(`   ⚠ مواعيد بدون unitId : ${apptNoUnitN}  (رقم الفيلا غير موجود في جدول Unit)`);
  if (ticketNoUnitN > 0) console.log(`   ⚠ تذاكر بدون unitId  : ${ticketNoUnitN} (رقم الفيلا غير موجود في جدول Unit)`);

  console.log('');
  console.log('الخطوة التالية:');
  console.log('  npx prisma db push --accept-data-loss');
  console.log('');
  console.log('ملاحظة: --accept-data-loss ستحذف الأعمدة التالية (إذا كانت لا تزال موجودة):');
  console.log('  • Appointment.technicians');
  console.log('  • Ticket.contractorName');
  console.log('  • User.specialty');
}

main()
  .catch(e => { console.error('\n❌ فشل التهيئة:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
