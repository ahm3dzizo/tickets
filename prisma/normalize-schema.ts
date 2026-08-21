/**
 * normalize-schema.ts
 *
 * خطوة التهيئة قبل تطبيق schema.prisma الجديد:
 *   1. يضيف عمود unitId لجدول Appointment ويملؤه من villaNumber
 *   2. يملأ unitId الفارغة في Ticket من villaNumber
 *
 * تشغيل:
 *   npx tsx prisma/normalize-schema.ts
 * ثم:
 *   npx prisma db push --accept-data-loss
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('── بدء تهيئة البيانات ──');

  // ── 1. تأكد أن عمود unitId موجود في Appointment ──────────────────────────
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "unitId" TEXT;
  `);
  console.log('✔ تمت إضافة عمود unitId لـ Appointment');

  // ── 2. ملء Appointment.unitId من villaNumber ──────────────────────────────
  const apptResult = await prisma.$executeRawUnsafe(`
    UPDATE "Appointment" a
    SET "unitId" = u.id
    FROM "Unit" u
    WHERE u."projectId" = a."projectId"
      AND u."unitNumber" = a."villaNumber"
      AND a."unitId" IS NULL
      AND a."villaNumber" IS NOT NULL
      AND a."villaNumber" <> '';
  `);
  console.log(`✔ تم ربط ${apptResult} موعد بوحداتهم`);

  // ── 3. ملء Ticket.unitId الفارغة من villaNumber ───────────────────────────
  const ticketResult = await prisma.$executeRawUnsafe(`
    UPDATE "Ticket" t
    SET "unitId" = u.id
    FROM "Unit" u
    WHERE u."projectId" = t."projectId"
      AND u."unitNumber" = t."villaNumber"
      AND t."unitId" IS NULL
      AND t."villaNumber" IS NOT NULL
      AND t."villaNumber" <> '';
  `);
  console.log(`✔ تم ربط ${ticketResult} تذكرة بوحداتها`);

  // ── 4. ملء Appointment.clientId الفارغة من clientUnit ───────────────────
  const clientResult = await prisma.$executeRawUnsafe(`
    UPDATE "Appointment" a
    SET "clientId" = cu."clientId"
    FROM "ClientUnit" cu
    WHERE cu."unitId" = a."unitId"
      AND a."clientId" IS NULL
      AND a."unitId" IS NOT NULL
      AND cu."isPrimary" = true;
  `);
  console.log(`✔ تم ربط ${clientResult} موعد بعملائهم`);

  // ── 5. نقل User.specialty → _UserSpecialties قبل حذف العمود ────────────────
  const usersWithSpecialty = await prisma.$queryRawUnsafe<Array<{ uid: string; specialty: string }>>(
    `SELECT uid, specialty FROM "User" WHERE specialty IS NOT NULL AND specialty <> ''`
  );
  let specialtyMigrated = 0;
  for (const u of usersWithSpecialty) {
    const sp = await prisma.specialty.findUnique({ where: { key: u.specialty } });
    if (sp) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_UserSpecialties" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        sp.id, u.uid
      );
      specialtyMigrated++;
    }
  }
  console.log(`✔ تم نقل تخصص ${specialtyMigrated} مستخدم إلى _UserSpecialties`);

  console.log('── اكتملت التهيئة ──');
  console.log('');
  console.log('الخطوة التالية:');
  console.log('  npx prisma db push --accept-data-loss');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
