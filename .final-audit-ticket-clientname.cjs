
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

    const mismatches = rows.filter(t => {
      const ticketName = (t.clientName || '').trim();
      const realName = (t.client?.name || '').trim();

      return ticketName !== realName;
    });

    console.log('\n============================================================');
    console.log('FINAL CLIENT NAME AUDIT');
    console.log('============================================================');
    console.log(`Tickets checked : ${rows.length}`);
    console.log(`Mismatches      : ${mismatches.length}`);
    console.log('============================================================');

    for (const t of rows) {
      console.log(
        `${t.ticketId} | clientId=${t.clientId} | ` +
        `ticketName=${JSON.stringify(t.clientName)} | ` +
        `clientName=${JSON.stringify(t.client?.name)}`
      );
    }

    if (rows.length !== ticketIds.length) {
      process.exit(2);
    }

    if (mismatches.length > 0) {
      process.exit(3);
    }

    console.log('\nFINAL AUDIT: PASS');

  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
