const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.ticket.count();
  console.log(`Total tickets in DB: ${count}`);
  
  if (count === 0) {
    console.log('No tickets to delete.');
    return;
  }

  console.log(`Deleting ${count} tickets...`);
  const result = await prisma.ticket.deleteMany({});
  console.log(`✅ Deleted ${result.count} tickets successfully.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
