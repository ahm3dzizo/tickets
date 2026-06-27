import { PrismaClient } from '@prisma/client';
import { loadKeywordsFromDB, classifyFromKeywordsDB, invalidateKeywordCache } from '../server/classifier/keywords.js';
const prisma = new PrismaClient();

async function main() {
  console.log('Loading fresh keywords...');
  invalidateKeywordCache();
  const keywords = await loadKeywordsFromDB(true);
  
  const allTypes = await prisma.ticketType.findMany({ select: { id: true, key: true } });
  const typeIdMap = new Map<string, string>();
  for (const t of allTypes) typeIdMap.set(t.key, t.id);

  const recent = new Date();
  recent.setDate(recent.getDate() - 3);

  console.log('Fetching recent open tickets...');
  const tickets = await prisma.ticket.findMany({
    where: { 
      status: { notIn: ['closed', 'completed', 'out_of_scope'] },
      createdAt: { gte: recent }
    },
    select: { id: true, ticketId: true, description: true }
  });

  let count = 0;
  for (const t of tickets) {
    if (t.description && t.description.length >= 4) {
      const kwResult = classifyFromKeywordsDB(t.description, keywords);
      
      // We only update if the classifier matched something (or if it used to be misclassified, it might become unclassified)
      let finalType = kwResult.primaryType !== "unclassified" ? kwResult.primaryType : "unclassified";
      let finalTypes = kwResult.allTypes;
      let finalSubTypeId = kwResult.subTypeId || null;
      let finalTypeId = typeIdMap.get(finalType) || null;

      await prisma.ticket.update({
        where: { id: t.id },
        data: {
          type: finalType,
          typeId: finalTypeId,
          detectedTypes: finalTypes,
          subTypeId: finalSubTypeId
        }
      });
      count++;
    }
  }
  console.log(`Successfully reclassified ${count} recent tickets using cleaned keywords.`);
}
main().finally(() => prisma.$disconnect());
