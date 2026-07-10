import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Starting Production Data Migration...");

  try {
    // 1. Create a backup table of the Client data before any drops occur
    console.log("Creating Client_Backup_Refactor table...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Client_Backup_Refactor" AS SELECT * FROM "Client";
    `);
    
    console.log("Creating ContractorVilla_Backup_Refactor table...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ContractorVilla_Backup_Refactor" AS SELECT * FROM "ContractorVilla";
    `);

    // 2. We need to create Block and Unit and ClientUnit if they don't exist yet!
    // Since we are running this BEFORE prisma db push, the tables might not exist!
    // Wait! If the tables don't exist, we can't insert into them.
    // We MUST run `npx prisma db push --accept-data-loss` FIRST, which creates the tables AND drops the columns!
    // But if we drop the columns first, we lose the data!
    console.log("Backups created successfully!");
    console.log("Now we can safely run 'npx prisma db push --accept-data-loss' to create new tables, and then run a second script to migrate from the backup tables!");
  } catch (err) {
    console.error("Error creating backups:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
