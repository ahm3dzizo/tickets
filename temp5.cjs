const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const appts = await prisma.ticket.findMany({
    where: { appointmentTime: { startsWith: '2026-06-15' }, status: 'closed' },
    select: { ticketId: true, villaNumber: true, clientName: true, status: true, appointmentTime: true }
  });
  console.log('\n--- Closed Appointments on 2026-06-15 ---');
  console.table(appts);
}
run().finally(() => prisma.$disconnect());
