const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function run() {
  const data = JSON.parse(fs.readFileSync('keywords_dump_with_type.json', 'utf8'));
  
  // Get all types from server
  const serverTypes = await prisma.ticketType.findMany();
  const typeMap = new Map();
  serverTypes.forEach(t => typeMap.set(t.nameAr, t.id));

  let count = 0;
  for (const item of data) {
    if (!item.ticketType || !item.ticketType.nameAr) continue;
    const serverTypeId = typeMap.get(item.ticketType.nameAr);
    if (!serverTypeId) continue; // skip if type doesn't exist on server

    await prisma.ticketTypeKeyword.upsert({
      where: { keyword_typeId: { keyword: item.keyword, typeId: serverTypeId } },
      update: { weight: item.weight, source: item.source },
      create: { keyword: item.keyword, typeId: serverTypeId, weight: item.weight, source: item.source }
    });
    count++;
  }
  console.log('✅ Successfully imported ' + count + ' keywords on server!');
}

run().catch(console.error).finally(() => prisma.$disconnect());