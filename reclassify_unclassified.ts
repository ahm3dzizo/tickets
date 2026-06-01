import { PrismaClient } from '@prisma/client';
import { loadKeywordsFromDB, classifyFromKeywordsDB } from './server/classifier/keywords.js';
import { buildTypeToSpecialtyMap, findSupervisorsDB } from './server/classifier/db-helpers.js';

const prisma = new PrismaClient();

async function run() {
  const unclassified = await prisma.ticket.findMany({ where: { type: 'unclassified' } });
  console.log('Found ' + unclassified.length + ' unclassified tickets');
  
  const keywords = await loadKeywordsFromDB();
  const typeToSpecialty = await buildTypeToSpecialtyMap();
  
  let successCount = 0;
  for (const ticket of unclassified) {
    if (!ticket.description) continue;
    const classification = classifyFromKeywordsDB(ticket.description, keywords);
    
    if (classification && classification.primaryType !== 'unclassified') {
      const requiredSpecialties = [...new Set(classification.allTypes.map((t: string) => typeToSpecialty[t] || "general"))];
      const supervisors = await findSupervisorsDB(ticket.projectId || '', requiredSpecialties);
      
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          type: classification.primaryType,
          detectedTypes: classification.allTypes.filter((t: string) => t !== "unclassified"),
          typeId: classification.typeId || undefined,
          subTypeId: classification.subTypeId || undefined,
          ...(supervisors && supervisors.length > 0 && {
            assignedSupervisorId: supervisors[0].id,
            assignedSupervisorIds: supervisors.map(s => s.id),
            assignedSupervisors: supervisors.map(s => ({
              id: s.id,
              name: s.name,
              specialty: s.specialties[0] ?? 'general'
            })) as any,
          }),
        }
      });
      successCount++;
    }
  }
  
  console.log('Successfully reclassified: ' + successCount);
  process.exit(0);
}
run().catch(console.error);
