import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tickets = await prisma.ticket.findMany({
    where: { 
      status: { notIn: ['closed', 'completed', 'out_of_scope'] },
      appointmentTime: { not: null }
    }
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let count = 0;
  for (const t of tickets) {
    if (t.appointmentTime) {
      const apptDate = new Date(t.appointmentTime);
      // If it's a valid date and strictly before today
      if (!isNaN(apptDate.getTime()) && apptDate < todayStart) {
        await prisma.ticket.update({
          where: { id: t.id },
          data: { appointmentTime: null }
        });
        count++;
        console.log(`Cleared appointment for ${t.ticketId}: ${t.appointmentTime}`);
      }
    }
  }
  console.log(`Done! Cleared ${count} expired appointments from open tickets.`);
}
main().finally(() => prisma.$disconnect());
