import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Starting Production Data Restoration & Migration...");

  try {
    // 1. Insert Blocks
    console.log("Migrating Blocks...");
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Block" (id, "projectId", "blockNumber")
      SELECT gen_random_uuid(), "projectId", "blockNumber"
      FROM (
        SELECT DISTINCT "projectId", "blockNumber"
        FROM "Client_Backup_Refactor"
        WHERE "blockNumber" IS NOT NULL AND "blockNumber" != ''
      ) as b
      ON CONFLICT ("projectId", "blockNumber") DO NOTHING;
    `);

    // 2. Insert Units
    console.log("Migrating Units...");
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Unit" (id, "projectId", "blockId", "unitNumber")
      SELECT gen_random_uuid(), c."projectId", b.id, c."villaNumber"
      FROM "Client_Backup_Refactor" c
      LEFT JOIN "Block" b ON b."projectId" = c."projectId" AND b."blockNumber" = c."blockNumber"
      WHERE c."villaNumber" IS NOT NULL AND c."villaNumber" != ''
      ON CONFLICT ("projectId", "unitNumber") DO NOTHING;
    `);

    // 3. Link Clients to Units
    console.log("Linking Clients to Units...");
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ClientUnit" ("clientId", "unitId", "isPrimary")
      SELECT c.id, u.id, true
      FROM "Client_Backup_Refactor" c
      JOIN "Unit" u ON u."projectId" = c."projectId" AND u."unitNumber" = c."villaNumber"
      ON CONFLICT ("clientId", "unitId") DO NOTHING;
    `);

    // 4. Migrate Contractors
    console.log("Migrating Contractor Assignments...");
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ContractorAssignment" (id, "contractorId", "projectId", "blockId", "unitId", "specialtyKey")
      SELECT 
        gen_random_uuid(), 
        cv."contractorId", 
        cv."projectId", 
        b.id, 
        u.id, 
        'general'
      FROM "ContractorVilla_Backup_Refactor" cv
      LEFT JOIN "Block" b ON b."projectId" = cv."projectId" AND b."blockNumber" = cv."blockNumber"
      LEFT JOIN "Unit" u ON u."projectId" = cv."projectId" AND u."unitNumber" = cv."villaNumber"
    `);
    
    // Fix any null unitId assignments by linking tickets directly? 
    // Actually, tickets will be fixed using the API we built or automatically when opened.

    console.log("Data Restoration Completed Successfully!");
  } catch (err) {
    console.error("Error restoring data:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
