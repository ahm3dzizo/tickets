const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const closedAppts = await prisma.ticket.count({ where: { status: 'closed', appointmentTime: { not: null } } });
  console.log('Closed tickets with appointmentTime:', closedAppts);
}
run().finally(() => prisma.$disconnect());
