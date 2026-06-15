import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const countWithAppt = await prisma.ticket.count({
    where: {
      status: { in: ['closed', 'out_of_scope'] },
      appointmentTime: { not: null }
    }
  });

  const countWithoutAppt = await prisma.ticket.count({
    where: {
      status: { in: ['closed', 'out_of_scope'] },
      appointmentTime: null
    }
  });

  console.log(`Closed tickets with appointments (hidden): ${countWithAppt}`);
  console.log(`Closed tickets without appointments: ${countWithoutAppt}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
