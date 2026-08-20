
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.ticket.findMany({
    where: {
      clientId: { not: null },
      OR: [
        { clientName: "" },
        { clientName: null }
      ]
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

  console.log("CANDIDATES:", rows.length);

  for (const r of rows) {
    console.log(
      JSON.stringify({
        id: r.id,
        ticketId: r.ticketId,
        project: r.projectAbbr,
        projectId: r.projectId,
        unitId: r.unitId,
        villaNumber: r.villaNumber,
        clientId: r.clientId,
        currentClientName: r.clientName,
        sourceClientName: r.client?.name || null
      })
    );
  }

  await prisma.$disconnect();
})().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
