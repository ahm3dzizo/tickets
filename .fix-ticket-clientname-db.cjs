
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ticketIds = ['171672', '204763', '204896'];

(async () => {
  try {

    const result = await prisma.$transaction(async (tx) => {

      const tickets = await tx.ticket.findMany({
        where: {
          ticketId: { in: ticketIds }
        },
        select: {
          id: true,
          ticketId: true,
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

      if (tickets.length !== ticketIds.length) {
        throw new Error(
          `Expected ${ticketIds.length} tickets, found ${tickets.length}`
        );
      }

      const changes = [];

      for (const t of tickets) {

        if (!t.clientId) {
          throw new Error(
            `Ticket ${t.ticketId} has no clientId`
          );
        }

        if (!t.client) {
          throw new Error(
            `Ticket ${t.ticketId} client ${t.clientId} not found`
          );
        }

        const oldName = t.clientName;
        const newName = t.client.name;

        if (oldName !== newName) {

          await tx.ticket.update({
            where: { id: t.id },
            data: {
              clientName: newName
            }
          });

          changes.push({
            ticketId: t.ticketId,
            clientId: t.clientId,
            oldName,
            newName
          });
        }
      }

      return {
        count: changes.length,
        changes
      };
    });

    console.log(JSON.stringify(result, null, 2));

  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
