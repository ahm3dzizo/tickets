const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function run() {
  const data = JSON.parse(fs.readFileSync('keywords_dump.json', 'utf8'));
  for (const item of data) {
    if (!item.typeId) continue;
    await prisma.ticketTypeKeyword.upsert({
      where: { keyword_typeId: { keyword: item.keyword, typeId: item.typeId } },
      update: { weight: item.weight, source: item.source },
      create: { keyword: item.keyword, typeId: item.typeId, weight: item.weight, source: item.source }
    });
  }
  console.log('Imported ' + data.length + ' keywords on server');
}

run().catch(console.error).finally(() => prisma.$disconnect());