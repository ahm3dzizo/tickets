const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function run() {
  const data = JSON.parse(fs.readFileSync('/opt/retal-api/payload.json', 'utf8'));
  
  let project = await prisma.project.findFirst({ where: { name: { contains: 'NTF' } } });
  if (!project) project = await prisma.project.findFirst();

  data.forEach(t => t.projectId = project.id);

  let success = 0;
  let skipped = 0;

  const batchSize = 50;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    try {
      const res = await prisma.ticket.createMany({
        data: batch,
        skipDuplicates: true
      });
      success += res.count;
      skipped += (batch.length - res.count);
    } catch (e) {
      console.error(`Error in batch ${i}:`, e.message);
    }
  }

  console.log(`Success: ${success}, Skipped (Duplicates): ${skipped}`);
  
  const total = await prisma.ticket.count();
  console.log(`Total tickets in SERVER DB now: ${total}`);
  process.exit(0);
}

run();
