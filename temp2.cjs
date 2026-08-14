const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const from = '2026-06-14';
  const to = '2026-06-18';
  const tickets = await prisma.ticket.findMany({
    where: { appointmentTime: { not: null } },
    select: { ticketId: true, status: true, appointmentTime: true }
  });
  const filtered = tickets.filter(t => {
    if (!t.appointmentTime) return false;
    const d = t.appointmentTime.split(' ')[0];
    return d >= from && d <= to;
  });
  console.log('Filtered calendar items:', filtered.length);
}
run().finally(() => prisma.$disconnect());
