/**
 * migrate-to-blocks.ts
 *
 * يحول البيانات الحالية من الهيكل القديم (Client + ContractorVilla) إلى الهيكل الجديد:
 *   Client (قديم) → Block + Unit + Client (جديد) + ClientUnit
 *   ContractorVilla → ContractorAssignment
 *   Ticket.villaNumber → Ticket.unitId
 *
 * تشغيل: npx tsx prisma/migrate-to-blocks.ts
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function normalizeVilla(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[^0-9A-Za-z]/g, '').replace(/^0+/, '') || raw.trim();
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' Migration: إنشاء Block + Unit + ClientUnit');
  console.log('═══════════════════════════════════════════\n');

  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  console.log(`المشاريع الموجودة: ${projects.length}\n`);

  for (const project of projects) {
    console.log(`\n▶ مشروع: ${project.name} (${project.id})`);

    // ── 1. قراءة كل العملاء القدامى في المشروع (عبر SQL مباشر لأن الـ Schema تغير) ───
    const oldClients: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, "projectId", name, phone, "villaNumber", "blockNumber", "handoverDate", "warrantyExpiryDate", "createdAt"
       FROM "Client"
       WHERE "projectId" = $1
       ORDER BY "createdAt" ASC`,
      project.id
    );

    if (oldClients.length === 0) {
      console.log('  لا يوجد عملاء — تم التخطي');
      continue;
    }
    console.log(`  عملاء قدامى: ${oldClients.length}`);

    // ── 2. إنشاء البلوكات الفريدة ──────────────────────────────────────────
    const blockNumbers = [...new Set(
      oldClients.map((c: any) => c.blockNumber).filter(Boolean) as string[]
    )];

    const blockMap = new Map<string, string>(); // blockNumber → Block.id

    for (const bn of blockNumbers) {
      const block = await prisma.block.upsert({
        where: { projectId_blockNumber: { projectId: project.id, blockNumber: bn } },
        create: { projectId: project.id, blockNumber: bn },
        update: {},
      });
      blockMap.set(bn, block.id);
    }
    console.log(`  بلوكات تم إنشاؤها: ${blockNumbers.length}`);

    // ── 3. إنشاء الوحدات وربطها بالعملاء ─────────────────────────────────
    let unitsCreated = 0;
    let clientsCreated = 0;
    let clientUnitsCreated = 0;

    for (const old of oldClients) {
      const unitNumber = normalizeVilla(String(old.villaNumber || ''));
      if (!unitNumber) continue;

      const blockId = old.blockNumber ? blockMap.get(old.blockNumber) ?? null : null;

      // أنشئ أو احصل على Unit
      const unit = await prisma.unit.upsert({
        where: { projectId_unitNumber: { projectId: project.id, unitNumber } },
        create: {
          projectId: project.id,
          blockId,
          unitNumber,
          handoverDate: old.handoverDate ?? null,
          warrantyExpiryDate: old.warrantyExpiryDate ?? null,
        },
        update: {
          blockId: blockId ?? undefined,
          handoverDate: old.handoverDate ?? undefined,
          warrantyExpiryDate: old.warrantyExpiryDate ?? undefined,
        },
      });
      if (unit.createdAt.getTime() > Date.now() - 5000) unitsCreated++;

      // أنشئ أو احصل على Client (مستقل بالهاتف) — يستخدم raw SQL لأن projectId لا يزال موجوداً في DB القديمة
      const phone = old.phone?.trim() || `unknown-${old.id}`;
      const existingClients: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, name FROM "Client" WHERE phone = $1 LIMIT 1`,
        phone
      );
      
      let clientId: string;
      if (existingClients.length > 0) {
        clientId = existingClients[0].id;
        clientsCreated; // already exists
      } else {
        // إنشاء Client جديد مع projectId (لا يزال مطلوباً في الـ schema الحالي على السيرفر)
        const newClients: any[] = await prisma.$queryRawUnsafe(
          `INSERT INTO "Client" (id, "projectId", name, phone, "villaNumber", "blockNumber", "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, '', '', NOW())
           ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          project.id, old.name, phone
        );
        clientId = newClients[0].id;
        clientsCreated++;
      }

      // اربط العميل بالوحدة
      await prisma.$queryRawUnsafe(
        `INSERT INTO "ClientUnit" (id, "clientId", "unitId", "isPrimary")
         VALUES (gen_random_uuid()::text, $1, $2, true)
         ON CONFLICT ("clientId", "unitId") DO NOTHING`,
        clientId, unit.id
      );
      clientUnitsCreated++;

      // حدّث التذاكر المرتبطة بهذه الفيلا لتشير إلى unitId
      await prisma.$queryRawUnsafe(
        `UPDATE "Ticket" SET "unitId" = $1, "clientId" = $2, "clientName" = $3
         WHERE "projectId" = $4 AND "villaNumber" = $5 AND "unitId" IS NULL`,
        unit.id, clientId, old.name, project.id, unitNumber
      );
    }

    console.log(`  وحدات جديدة: ${unitsCreated}`);
    console.log(`  عملاء جدد: ${clientsCreated}`);
    console.log(`  روابط ClientUnit: ${clientUnitsCreated}`);

    // ── 4. تحويل ContractorVilla → ContractorAssignment ───────────────────
    const oldAssignments: any[] = await prisma.$queryRawUnsafe(
      `SELECT cv.id, cv."contractorId", cv."projectId", cv."villaNumber", cv."blockNumber",
              cv."fromVilla", cv."toVilla", cv."fromBlock", cv."toBlock",
              cs."specialtyKey"
       FROM "ContractorVilla" cv
       LEFT JOIN "ContractorSpecialty" cs ON cs."contractorId" = cv."contractorId"
       WHERE cv."projectId" = $1`,
      project.id
    );

    let assignmentsCreated = 0;
    for (const old of oldAssignments) {
      const specialtyKey = old.specialtyKey ?? 'general';

      // حدد blockId
      let blockId: string | null = null;
      if (old.blockNumber) {
        blockId = blockMap.get(old.blockNumber) ?? null;
      }

      // حدد unitId (الوحدة المحددة تتغلب على البلوك)
      let unitId: string | null = null;
      if (old.villaNumber) {
        // قد يحتوي villaNumber على قيم متعددة مفصولة بفاصلة
        const villas = String(old.villaNumber).split(/[,،\s]+/).map(v => normalizeVilla(v)).filter(Boolean);
        for (const v of villas) {
          const unit = await prisma.unit.findUnique({
            where: { projectId_unitNumber: { projectId: project.id, unitNumber: v } },
          });
          if (unit) {
            // أنشئ assignment منفصل لكل وحدة
            await prisma.contractorAssignment.create({
              data: {
                contractorId: old.contractorId,
                specialtyKey,
                projectId: project.id,
                blockId: null,
                unitId: unit.id,
              },
            });
            assignmentsCreated++;
          }
        }
        continue; // تم معالجة الوحدات الفردية
      }

      // البلوك كامل
      if (blockId) {
        await prisma.contractorAssignment.create({
          data: {
            contractorId: old.contractorId,
            specialtyKey,
            projectId: project.id,
            blockId,
            unitId: null,
          },
        });
        assignmentsCreated++;
      }
    }
    console.log(`  ContractorAssignment جديد: ${assignmentsCreated}`);
  }

  console.log('\n══════════════════════');
  console.log(' Migration اكتمل ✓');
  console.log('══════════════════════\n');

  // ── 5. تقرير ختامي ──────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.block.count(),
    prisma.unit.count(),
    prisma.client.count(),
    prisma.clientUnit.count(),
    prisma.contractorAssignment.count(),
    prisma.ticket.count({ where: { unitId: { not: null } } }),
    prisma.ticket.count({ where: { unitId: null } }),
  ]);

  console.log('التقرير النهائي:');
  console.log(`  Block:                ${counts[0]}`);
  console.log(`  Unit:                 ${counts[1]}`);
  console.log(`  Client:               ${counts[2]}`);
  console.log(`  ClientUnit:           ${counts[3]}`);
  console.log(`  ContractorAssignment: ${counts[4]}`);
  console.log(`  Tickets مع unitId:    ${counts[5]}`);
  console.log(`  Tickets بدون unitId:  ${counts[6]}`);
}

main()
  .catch(e => { console.error('❌ خطأ:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
