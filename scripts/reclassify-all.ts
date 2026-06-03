/**
 * scripts/reclassify-all.ts
 * ──────────────────────────
 * One-shot: reclassify ALL tickets using the current keyword database.
 * Open tickets first, then closed.
 *
 * Run:  npx tsx scripts/reclassify-all.ts
 *       npx tsx scripts/reclassify-all.ts --dry-run   (preview only)
 */

import prisma from "../server/db.js";
import { classifyTicket } from "../server/classifier/classify.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB } from "../server/classifier/db-helpers.js";

const DRY_RUN    = process.argv.includes("--dry-run");
const BATCH_SIZE = 100;

async function main() {
  console.log(`\n🔄 Reclassify-All via ML ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log("━".repeat(50));

  const typeToSpecialty = await buildTypeToSpecialtyMap();

  const total = await prisma.ticket.count({ where: { description: { not: "" } } });
  console.log(`🎫 Total tickets: ${total}\n`);

  let offset      = 0;
  let changed     = 0;
  let unchanged   = 0;
  let unclassified = 0;

  while (offset < total) {
    const tickets = await prisma.ticket.findMany({
      where: { description: { not: "" } },
      orderBy: [
        { closedAt: { sort: "asc", nulls: "first" } }, // open first
        { createdAt: "desc" },
      ],
      skip:  offset,
      take:  BATCH_SIZE,
      select: {
        id: true, description: true, type: true,
        typeId: true, subTypeId: true, projectId: true, closedAt: true,
      },
    });

    if (tickets.length === 0) break;

    for (const ticket of tickets) {
      if (!ticket.description || ticket.description.length < 5) { unchanged++; continue; }

      const result = await classifyTicket(ticket.description, ticket.projectId ?? undefined, { skipGemini: true });

      if (!result || result.primaryType === "unclassified") { unclassified++; continue; }

      // تحديث لو تغير النوع أو الـ subType
      const typeChanged    = result.primaryType !== ticket.type;
      const subTypeChanged = result.subTypeId !== ticket.subTypeId;
      if (!typeChanged && !subTypeChanged) { unchanged++; continue; }

      changed++;
      const label = ticket.closedAt ? "مغلقة" : "مفتوحة";
      if (typeChanged)
        console.log(`  ✅ [${label}] ${ticket.id.slice(0,8)}  "${ticket.type}" → "${result.primaryType}"`);
      else
        console.log(`  📌 [${label}] ${ticket.id.slice(0,8)}  sub: "${result.subType}" (${result.primaryType})`);

      if (DRY_RUN) continue;

      const updateData: Record<string, any> = {
        type:          result.primaryType,
        detectedTypes: result.allTypes,
        typeId:        result.typeId ?? null,
        subTypeId:     result.subTypeId ?? null,
      };

      if (ticket.projectId) {
        try {
          const specialties = [...new Set(result.allTypes.map(t => typeToSpecialty[t] || "general"))] as string[];
          const supervisors = await findSupervisorsDB(ticket.projectId, specialties);
          if (supervisors.length > 0) {
            updateData.assignedSupervisorId  = supervisors[0].id;
            updateData.assignedSupervisorIds = supervisors.map(s => s.id);
            updateData.assignedSupervisors   = supervisors.map(s => ({
              id: s.id, name: s.name, specialty: s.specialties[0] || "general",
            }));
          }
        } catch { /* non-fatal */ }
      }

      await prisma.ticket.update({ where: { id: ticket.id }, data: updateData });
    }

    offset += BATCH_SIZE;
    process.stdout.write(`\r  Progress: ${Math.min(offset, total)}/${total} tickets...`);
  }

  console.log(`\n\n${"━".repeat(50)}`);
  console.log(`✅ Changed:      ${changed}`);
  console.log(`⏭  Unchanged:    ${unchanged}`);
  console.log(`❓ Unclassified: ${unclassified}`);
  console.log(`📊 Total:        ${total}`);
  if (DRY_RUN) console.log("\n⚠️  Dry run — no changes written to DB");

  await prisma.$disconnect();
}

main().catch(err => { console.error("❌", err); process.exit(1); });
