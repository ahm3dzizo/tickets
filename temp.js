const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const a = await prisma.ticket.findMany({
    where: { appointmentTime: { startsWith: '2026-06-16' } },
    select: { ticketId: true, status: true, appointmentTime: true, closedAt: true }
  });
  console.log(a);
}
run().finally(() => prisma.$disconnect());
