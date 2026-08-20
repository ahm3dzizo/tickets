
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ticketIds = ['171672', '204763', '204896'];

(async () => {
  try {
    const rows = await prisma.ticket.findMany({
      where: {
        ticketId: { in: ticketIds }
      },
      select: {
        id: true,
        ticketId: true,
        projectAbbr: true,
        projectId: true,
        unitId: true,
        villaNumber: true,
        clientId: true,
        clientName: true,
        client: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        ticketId: 'asc'
      }
    });

    console.log(JSON.stringify(rows, null, 2));

    if (rows.length !== ticketIds.length) {
      console.error(`Expected ${ticketIds.length} tickets, found ${rows.length}`);
      process.exit(2);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
