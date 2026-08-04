import prisma from "../server/db.js";
import { classifyTicket } from "../server/classifier/classify.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB } from "../server/classifier/db-helpers.js";

async function main() {
  console.log("▶ البحث عن مشروع النرجس...");
  const project = await prisma.project.findFirst({
    where: { name: { contains: "نرجس" } }
  });

  if (!project) {
    console.error("❌ لم يتم العثور على المشروع!");
    return;
  }

  console.log(`✔ تم العثور على المشروع: ${project.name} (${project.id})`);

  const tickets = await prisma.ticket.findMany({
    where: { projectId: project.id, status: { not: "closed" } },
  });

  console.log(`▶ جاري إعادة تصنيف وتوزيع المشرفين لـ ${tickets.length} تذكرة مفتوحة...`);

  const typeToSpecialty = await buildTypeToSpecialtyMap();
  let updated = 0;

  for (const t of tickets) {
    try {
      if (!t.description) continue;
      
      const classification = await classifyTicket(t.description, project.id);
      const requiredSpecialties = [...new Set(classification.allTypes.map((type: string) => typeToSpecialty[type] || "general"))];
      
      const supervisors = await findSupervisorsDB(project.id, requiredSpecialties);
      
      if (supervisors.length > 0) {
        await prisma.ticket.update({
          where: { id: t.id },
          data: {
            assignedSupervisorId: supervisors[0].id,
            assignedSupervisorIds: supervisors.map(s => s.id),
            detectedTypes: classification.allTypes,
          }
        });
        updated++;
      }
    } catch (err: any) {
      console.error(`خطأ في تذكرة ${t.id}:`, err.message);
    }
  }

  console.log(`✔ تمت العملية بنجاح. تم تحديث ${updated} تذكرة.`);
}

main().catch(console.error);
