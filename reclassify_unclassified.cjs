const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { classifyFromKeywordsDB } = require('./dist/classifier/keywords.js');

async function run() {
  const unclassified = await prisma.ticket.findMany({ where: { type: 'unclassified' } });
  console.log('Found ' + unclassified.length + ' unclassified tickets');
  
  let successCount = 0;
  for (const ticket of unclassified) {
    if (!ticket.description) continue;
    const result = await classifyFromKeywordsDB(ticket.description, ticket.projectId);
    if (result && result.primaryType !== 'unclassified') {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          type: result.primaryType,
          detectedTypes: result.allTypes,
          typeId: result.typeId,
          subTypeId: result.subTypeId,
          ...(result.supervisors && result.supervisors.length > 0 && {
            assignedSupervisorId: result.supervisors[0].id,
            assignedSupervisorIds: result.supervisors.map(s => s.id),
            assignedSupervisors: result.supervisors.map(s => ({
              id: s.id,
              name: s.name,
              specialty: s.specialties[0] ?? 'general'
            })),
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
