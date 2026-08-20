
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
        clientName: true
      }
    });

    const backup = {
      createdAt: new Date().toISOString(),
      ticketIds,
      rows
    };

    console.log(JSON.stringify(backup, null, 2));

  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
