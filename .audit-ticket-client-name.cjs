const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  try {
    const rows = await prisma.ticket.findMany({
      where: {
        clientId: { not: null },
        clientName: ""
      },
      select: {
        id: true,
        ticketId: true,
        projectId: true,
        projectAbbr: true,
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
      orderBy: [
        { projectAbbr: "asc" },
        { ticketId: "asc" }
      ]
    });

    console.log(JSON.stringify({
      count: rows.length,
      rows
    }, null, 2));
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
