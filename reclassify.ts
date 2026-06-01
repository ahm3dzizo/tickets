import prisma from "./server/db.js";
import { classifyTicket } from "./server/classifier/classify.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB } from "./server/classifier/db-helpers.js";

async function run() {
    const failedTickets = await prisma.ticket.findMany({
      where: {
        status: { not: "closed" },
        OR: [
          { detectedTypes: { isEmpty: true } },
          { type: "unclassified" },
          { type: null },
          { type: "plumbing" } // we suspect many plumbing ones are wrong
        ],
      },
    });

    console.log(`Found ${failedTickets.length} tickets to check for reclassification`);
    const typeToSpecialty = await buildTypeToSpecialtyMap();

    let reclassified = 0;
    for (const ticket of failedTickets) {
      if (!ticket.description || ticket.description.length < 5) continue;
      
      const classification = await classifyTicket(ticket.description, ticket.projectId || undefined, { forceReclassify: true });
      
      // If we got a real classification, update it
      if (classification.primaryType !== "unclassified" && classification.primaryType !== ticket.type) {
        const requiredSpecialties = [...new Set(classification.allTypes.map((t: string) => typeToSpecialty[t] || "general"))];
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            type: classification.primaryType,
            detectedTypes: classification.allTypes.filter((t: string) => t !== "unclassified"),
          },
        });
        
        if (ticket.projectId) {
          const supervisors = await findSupervisorsDB(ticket.projectId, requiredSpecialties);
          if (supervisors.length > 0) {
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: {
                assignedSupervisorId: supervisors[0].id,
                assignedSupervisorIds: supervisors.map(s => s.id),
                assignedSupervisors: supervisors.map(s => ({ id: s.id, name: s.name, specialty: s.specialties[0] || "general" })),
                assigneeName: supervisors[0].name
              },
            });
          }
        }
        reclassified++;
      }
    }
    console.log(`Reclassified ${reclassified} tickets.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
