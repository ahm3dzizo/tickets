const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const dates = ['2026-06-16', '2026-06-17'];
  for (const d of dates) {
    const appts = await prisma.ticket.findMany({
      where: { appointmentTime: { startsWith: d } },
      select: { ticketId: true, villaNumber: true, clientName: true, status: true, appointmentTime: true }
    });
    console.log('\n--- Appointments on ' + d + ' ---');
    console.table(appts);
  }
}
run().finally(() => prisma.$disconnect());
