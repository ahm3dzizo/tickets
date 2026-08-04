import prisma from "../server/db.js";
import { classifyTicket } from "../server/classifier/classify.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB } from "../server/classifier/db-helpers.js";
import { delay } from "../server/classifier/gemini.js";

async function main() {
  console.log("▶ البحث عن مشروع النرجس...");
  const project = await prisma.project.findFirst({
    where: { name: { contains: "نرجس" } }
  });

  if (!project) {
    console.error("❌ لم يتم العثور على المشروع!");
    return;
  }

  const tickets = await prisma.ticket.findMany({
    where: { projectId: project.id, status: { not: "closed" } },
  });

  console.log(`▶ جاري إعادة تصنيف وتوزيع المشرفين لـ ${tickets.length} تذكرة مفتوحة...`);

  const typeToSpecialty = await buildTypeToSpecialtyMap();
  let updated = 0;

  for (const t of tickets) {
    try {
      if (!t.description) continue;
      
      console.log(`جاري تصنيف تذكرة ${t.id} ...`);
      const classification = await classifyTicket(t.description, undefined, { skipGemini: false, forceReclassify: true });
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
        console.log(`تم التصنيف: ${allTypes.join(",")} والمشرف: ${supervisors[0].name}`);
      }
      
      // Delay to avoid Gemini rate limits (NaraRouter allows 10 req/min)
      await new Promise(r => setTimeout(r, 6500));
    } catch (err: any) {
      console.error(`خطأ في تذكرة ${t.id}:`, err.message);
    }
  }

  console.log(`✔ تمت العملية بنجاح. تم تحديث ${updated} تذكرة.`);
}

main().catch(console.error);
