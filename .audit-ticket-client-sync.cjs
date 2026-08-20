const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  try {
    const rows = await prisma.ticket.findMany({
      where: {
        clientId: { not: null }
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
      }
    });

    const mismatches = rows.filter(t => {
      const dbName = (t.clientName || '').trim();
      const realName = (t.client?.name || '').trim();

      return dbName !== realName;
    });

    console.log('\n============================================================');
    console.log('CLIENT NAME CONSISTENCY AUDIT');
    console.log('============================================================');
    console.log(`Tickets with clientId : ${rows.length}`);
    console.log(`Name mismatches       : ${mismatches.length}`);
    console.log('============================================================');

    if (mismatches.length) {
      for (const t of mismatches) {
        console.log(`
TICKET       : ${t.ticketId}
PROJECT      : ${t.projectAbbr}
UNIT         : ${t.villaNumber}
CLIENT ID    : ${t.clientId}
TICKET NAME  : ${JSON.stringify(t.clientName)}
CLIENT NAME  : ${JSON.stringify(t.client?.name)}
`);
      }
    } else {
      console.log('OK: All ticket clientName values match Client.name');
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
