const { PrismaClient } = require('/opt/retal-api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Check geminiClassifiedAt — this is what the worker uses to find unprocessed tickets
  const notClassified = await prisma.ticket.count({
    where: {
      geminiClassifiedAt: null,
      description: { not: '' },
      status: { notIn: ['closed', 'out_of_scope'] },
    },
  });

  const total = await prisma.ticket.count();
  const openTotal = await prisma.ticket.count({ where: { status: { notIn: ['closed', 'out_of_scope'] } } });
  const unclassified = await prisma.ticket.count({ where: { type: 'unclassified' } });
  const openUnclassified = await prisma.ticket.count({ where: { type: 'unclassified', status: { notIn: ['closed', 'out_of_scope'] } } });
  const noGeminiStamp = await prisma.ticket.count({ where: { geminiClassifiedAt: null } });
  const noClientOpen = await prisma.ticket.count({ where: { clientId: null, status: { notIn: ['closed', 'out_of_scope'] } } });

  console.log('=== WORKER STATUS ===');
  console.log('Total tickets:', total);
  console.log('Open/in-progress tickets:', openTotal);
  console.log('Unclassified total:', unclassified);
  console.log('Open unclassified (worker target):', openUnclassified);
  console.log('No geminiClassifiedAt stamp (worker queue):', notClassified, '→ these will be processed next');
  console.log('No geminiClassifiedAt total:', noGeminiStamp);
  console.log('Open tickets with no client:', noClientOpen);

  if (notClassified > 0) {
    const samples = await prisma.ticket.findMany({
      where: {
        geminiClassifiedAt: null,
        description: { not: '' },
        status: { notIn: ['closed', 'out_of_scope'] },
      },
      select: { id: true, ticketId: true, type: true, description: true },
      take: 5,
    });
    console.log('\nSample tickets in worker queue:');
    for (const t of samples) {
      console.log('  #' + t.ticketId + ' type:' + t.type + ' | "' + (t.description||'').substring(0, 60) + '"');
    }
  } else {
    console.log('\n✅ Worker queue is EMPTY — all open tickets already processed!');
    console.log('   The workers are running but have nothing to do.');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
