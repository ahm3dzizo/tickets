import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const t = await prisma.ticket.findMany({
    where: { appointmentTime: { not: null } },
    select: { id: true, appointmentTime: true, status: true }
  });
  console.log("Total appointments:", t.length);
  console.log("Sample appointments:");
  console.log(t.slice(0, 10));
}
check().catch(console.error).finally(() => prisma.$disconnect());
