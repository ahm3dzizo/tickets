import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Analyzing Tickets ---');
  
  const unlinkedTickets = await prisma.ticket.findMany({
    where: { clientId: null },
    include: { project: true }
  });

  const unclassifiedTickets = await prisma.ticket.findMany({
    where: { OR: [{ type: null }, { type: 'unclassified' }] },
  });

  console.log(`Unlinked Tickets: ${unlinkedTickets.length}`);
  console.log(`Unclassified Tickets: ${unclassifiedTickets.length}`);

  // Find missing clients
  const missingClientsMap = new Map<string, { count: number, projectId: string, projectName: string }>();

  for (const t of unlinkedTickets) {
    if (!t.villaNumber) continue;
    const key = `${t.villaNumber}::${t.projectId}`;
    if (!missingClientsMap.has(key)) {
      missingClientsMap.set(key, { count: 0, projectId: t.projectId, projectName: t.project?.name || t.projectId });
    }
    missingClientsMap.get(key)!.count++;
  }

  console.log('\n--- Missing Clients (Villas with tickets but no client profile) ---');
  let missingCount = 0;
  for (const [key, data] of missingClientsMap.entries()) {
    const [villaNumber, projectId] = key.split('::');
    
    // Check if client actually exists (maybe just unlinked)
    const client = await prisma.client.findFirst({
      where: { villaNumber, projectId }
    });

    if (!client) {
      console.log(`Project: ${data.projectName} | Villa: ${villaNumber} | Tickets: ${data.count}`);
      missingCount++;
    }
  }

  if (missingCount === 0) {
    console.log('No missing clients found. All unlinked tickets belong to existing villas (they just need auto-linking).');
  }

  // To delete:
  if (process.argv.includes('--delete')) {
    console.log('\n--- Deleting Unlinked/Unclassified Tickets ---');
    const deleteRes = await prisma.ticket.deleteMany({
      where: {
        OR: [
          { clientId: null },
          { type: null },
          { type: 'unclassified' }
        ]
      }
    });
    console.log(`Deleted ${deleteRes.count} tickets.`);
  }

}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
