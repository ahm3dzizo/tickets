const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const from = '2026-06-16';
  const to = '2026-06-17';
  
  const appts = await prisma.ticket.findMany({
    where: {
      appointmentTime: { not: null },
      appointmentTime: { startsWith: '2026-06-16' }
    }
  });

  const appts2 = await prisma.ticket.findMany({
    where: {
      appointmentTime: { not: null },
      appointmentTime: { startsWith: '2026-06-17' }
    }
  });

  console.log(`Appointments on 2026-06-16: ${appts.length}`);
  console.log(`Appointments on 2026-06-17: ${appts2.length}`);
  
  // also get total just to be sure
  const total = await prisma.ticket.count({
    where: {
      appointmentTime: { not: null }
    }
  });
  console.log(`Total appointments in DB: ${total}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
