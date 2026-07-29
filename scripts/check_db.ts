import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({ take: 2 });
  console.log("Clients:", clients);
  const tickets = await prisma.ticket.findMany({ take: 2 });
  console.log("Tickets:", tickets);
}
main().finally(() => prisma.$disconnect());
