const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const appts = await prisma.ticket.findMany({
    where: {
      appointmentTime: { not: null, startsWith: '2026-06-16' }
    }
  });

  const appts2 = await prisma.ticket.findMany({
    where: {
      appointmentTime: { not: null, startsWith: '2026-06-17' }
    }
  });

  console.log(`Appointments on 2026-06-16: ${appts.length}`);
  console.log(`Appointments on 2026-06-17: ${appts2.length}`);
  
  const total = await prisma.ticket.count({
    where: {
      appointmentTime: { not: null }
    }
  });
  console.log(`Total appointments in DB: ${total}`);
  
  const closedAppts = await prisma.ticket.count({
    where: {
      appointmentTime: { not: null },
      status: { in: ['closed', 'out-of-scope'] }
    }
  });
  console.log(`Closed appointments in DB: ${closedAppts}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
