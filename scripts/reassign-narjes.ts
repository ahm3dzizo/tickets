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

  // Load keywords manually
  const { loadKeywordsFromDB, classifyFromKeywordsDB } = await import("../server/classifier/keywords.js");
  const keywords = await loadKeywordsFromDB();

  for (const t of tickets) {
    try {
      if (!t.description) continue;
      
      const classification = await classifyFromKeywordsDB(t.description, keywords);
      const allTypes = classification.allTypes;
      const requiredSpecialties = [...new Set(allTypes.map((type: string) => typeToSpecialty[type] || "general"))];
      
      const supervisors = await findSupervisorsDB(project.id, requiredSpecialties);
      
      if (supervisors.length > 0) {
        await prisma.ticket.update({
          where: { id: t.id },
          data: {
            assignedSupervisorId: supervisors[0].id,
            assignedSupervisorIds: supervisors.map(s => s.id),
            detectedTypes: allTypes,
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
