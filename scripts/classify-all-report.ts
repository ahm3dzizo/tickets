/**
 * One-time script: classify ALL non-closed tickets and write a count report.
 * Run: npx tsx scripts/classify-all-report.ts
 */
import prisma from "../server/db.js";
import { classifyBatchWithGemini } from "../server/classifier/gemini.js";
import { classifyTicket } from "../server/classifier/classify.js";
import { buildTypeToSpecialtyMap, findSupervisorsDB } from "../server/classifier/db-helpers.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BATCH_SIZE   = 10;
const BATCH_PAUSE  = 7_000; // 7 s between batches → stays under 10 req/min

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  تصنيف كل التذاكر + تقرير الأنواع");
  console.log("══════════════════════════════════════════\n");

  // Load Arabic type names for the report
  const typeRecords = await prisma.ticketType.findMany({
    where: { isActive: true },
    select: { key: true, nameAr: true },
  });
  const typeNameMap: Record<string, string> = {};
  for (const t of typeRecords) typeNameMap[t.key] = t.nameAr;

  const typeToSpecialty = await buildTypeToSpecialtyMap();

  console.log("📋 جلب كل التذاكر غير المغلقة...");
  const tickets = await prisma.ticket.findMany({
    where: { status: { not: "closed" } },
    select: { id: true, description: true, projectId: true },
    orderBy: { createdAt: "desc" },
  });

  const valid = tickets.filter(t => t.description && t.description.length >= 5);
  console.log(`📊 ${valid.length} تذكرة ستتم معالجتها في ${Math.ceil(valid.length / BATCH_SIZE)} batches\n`);

  let reclassified = 0;
  let unchanged    = 0;
  const typeCounts: Record<string, number>     = {};
  const multiTypes: Record<string, number>     = {};  // tickets with >1 type
  const totalBatches = Math.ceil(valid.length / BATCH_SIZE);

  for (let bi = 0; bi < totalBatches; bi++) {
    const batch = valid.slice(bi * BATCH_SIZE, (bi + 1) * BATCH_SIZE);
    process.stdout.write(`  Batch ${bi + 1}/${totalBatches} (${batch.length} تذاكر) ... `);

    // ── One Bynara request for the whole batch ──────────────────────────────
    const bMap = new Map<string, { primaryType: string; allTypes: string[] }>();
    try {
      const results = await classifyBatchWithGemini(
        batch.map(t => ({ id: t.id, description: t.description! }))
      );
      for (const r of results) {
        if (r.primaryType !== "unclassified") bMap.set(r.id, r);
      }
    } catch (err: any) {
      process.stdout.write(`⚠ Bynara error — ML fallback | `);
    }

    for (const ticket of batch) {
      try {
        let primaryType: string;
        let allTypes: string[];

        const br = bMap.get(ticket.id);
        if (br) {
          primaryType = br.primaryType;
          allTypes    = br.allTypes;
        } else {
          const fb = await classifyTicket(
            ticket.description!,
            ticket.projectId || undefined,
            { forceReclassify: true, skipGemini: true }
          );
          primaryType = fb.primaryType;
          allTypes    = fb.allTypes;
        }

        if (primaryType !== "unclassified") {
          const filteredTypes = allTypes.filter(t => t !== "unclassified");

          await prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              type:          primaryType,
              detectedTypes: filteredTypes,
            },
          });

          // Update supervisors
          if (ticket.projectId) {
            const specs = [...new Set(filteredTypes.map(t => typeToSpecialty[t] || "general"))];
            const supervisors = await findSupervisorsDB(ticket.projectId, specs);
            if (supervisors.length > 0) {
              await prisma.ticket.update({
                where: { id: ticket.id },
                data: {
                  assignedSupervisorId:  supervisors[0].id,
                  assignedSupervisorIds: supervisors.map(s => s.id),
                  assignedSupervisors:   supervisors.map(s => ({ id: s.id, name: s.name, specialty: s.specialties[0] || "general" })),
                },
              });
            }
          }

          for (const t of filteredTypes) {
            typeCounts[t] = (typeCounts[t] || 0) + 1;
          }
          if (filteredTypes.length > 1) {
            multiTypes[filteredTypes.join("+")] = (multiTypes[filteredTypes.join("+")] || 0) + 1;
          }
          reclassified++;
        } else {
          typeCounts["unclassified"] = (typeCounts["unclassified"] || 0) + 1;
          unchanged++;
        }
      } catch (err: any) {
        process.stdout.write(`\n  ❌ ${ticket.id}: ${err.message}\n`);
        unchanged++;
      }
    }

    console.log(`✓`);

    if (bi < totalBatches - 1) {
      process.stdout.write(`  ⏳ انتظار ${BATCH_PAUSE / 1000}s ...\n`);
      await new Promise(r => setTimeout(r, BATCH_PAUSE));
    }
  }

  // ── Build report ────────────────────────────────────────────────────────
  const sorted = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1]);

  const topMulti = Object.entries(multiTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const now     = new Date().toLocaleString("ar-EG", { timeZone: "Asia/Riyadh" });
  const divider = "─".repeat(50);

  const lines: string[] = [
    "═".repeat(50),
    `  تقرير التصنيف — ${now}`,
    "═".repeat(50),
    `  إجمالي التذاكر المعالجة : ${valid.length}`,
    `  تم تصنيفها بنجاح        : ${reclassified}`,
    `  غير مصنّفة              : ${unchanged}`,
    divider,
    "  النوع                         الاسم                    العدد",
    divider,
    ...sorted.map(([key, count]) => {
      const ar   = (typeNameMap[key] || key).slice(0, 20).padEnd(22);
      const kpad = key.padEnd(28);
      return `  ${kpad} ${ar} ${String(count).padStart(5)}`;
    }),
    divider,
    "  تذاكر بأنواع متعددة (Top 10):",
    divider,
    ...topMulti.map(([combo, count]) => {
      const names = combo.split("+").map(k => typeNameMap[k] || k).join(" + ");
      return `  ${names.slice(0, 42).padEnd(42)} ${String(count).padStart(5)}`;
    }),
    "═".repeat(50),
  ];

  const report = lines.join("\n");
  console.log("\n" + report);

  const outPath = path.join(__dirname, "..", "classification-report.txt");
  fs.writeFileSync(outPath, report, "utf8");
  console.log(`\n✅ التقرير محفوظ في: ${outPath}\n`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("خطأ:", err.message);
  process.exit(1);
});
