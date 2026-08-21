/**
 * Run once: npx tsx prisma/fix-garage-door-specialty.ts
 * Changes garage_door specialty from mechanics → general in the live DB.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const general = await prisma.specialty.findUnique({ where: { key: 'general' } });
  if (!general) {
    console.error('❌ Specialty "general" not found in DB');
    process.exit(1);
  }

  const updated = await prisma.ticketType.updateMany({
    where: { key: 'garage_door' },
    data: { specialtyId: general.id },
  });

  if (updated.count === 0) {
    console.warn('⚠️  garage_door type not found — nothing changed');
  } else {
    console.log('✅ garage_door specialty updated → general');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
