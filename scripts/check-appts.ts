import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tickets = await prisma.ticket.findMany({
    where: { appointmentTime: { not: null } },
    select: { ticketId: true, appointmentTime: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  console.log(tickets);
}
main().finally(() => prisma.$disconnect());
