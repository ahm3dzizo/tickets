import prisma from "../server/db.js";
import {
  buildTypeToSpecialtyMap,
  selectSupervisorCoverage,
  uniqueStringList,
} from "../server/classifier/db-helpers.js";

const apply = process.argv.includes("--apply");
const includeClosed = process.argv.includes("--all");

function sameValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function main() {
  const typeToSpecialty = await buildTypeToSpecialtyMap();
  const [tickets, supervisors] = await Promise.all([
    prisma.ticket.findMany({
      where: includeClosed ? {} : { status: { notIn: ["closed", "out_of_scope"] } },
      select: {
        id: true,
        ticketId: true,
        projectId: true,
        type: true,
        detectedTypes: true,
        detectedSubTypeIds: true,
        assignedSupervisorIds: true,
        assigneeName: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "supervisor", disabled: false, onLeave: false },
      select: {
        uid: true,
        displayName: true,
        disabled: true,
        onLeave: true,
        projects: { select: { id: true } },
        specialtiesRef: { select: { key: true } },
        substituteFor: { select: { specialtiesRef: { select: { key: true } } } },
      },
    }),
  ]);

  const supervisorsByProject = new Map<string, typeof supervisors>();
  for (const supervisor of supervisors) {
    for (const project of supervisor.projects) {
      const list = supervisorsByProject.get(project.id) ?? [];
      list.push(supervisor);
      supervisorsByProject.set(project.id, list);
    }
  }

  let changed = 0;
  let normalized = 0;
  const missingCounts = new Map<string, number>();

  for (const ticket of tickets) {
    const detectedTypes = uniqueStringList(
      ticket.detectedTypes.length > 0 ? ticket.detectedTypes : [ticket.type]
    ).filter(type => type !== "unclassified");
    const detectedSubTypeIds = uniqueStringList(ticket.detectedSubTypeIds);
    const requiredSpecialties = uniqueStringList(
      detectedTypes.map(type => typeToSpecialty[type] || "general")
    );
    const coverage = selectSupervisorCoverage(
      supervisorsByProject.get(ticket.projectId) ?? [],
      requiredSpecialties
    );
    const supervisorIds = coverage.supervisors.map(supervisor => supervisor.id);
    const assigneeName = coverage.supervisors[0]?.name || null;

    for (const specialty of coverage.missingSpecialties) {
      missingCounts.set(specialty, (missingCounts.get(specialty) ?? 0) + 1);
    }

    const classificationChanged =
      !sameValues(detectedTypes, ticket.detectedTypes) ||
      !sameValues(detectedSubTypeIds, ticket.detectedSubTypeIds);
    const supervisorsChanged =
      !sameValues(supervisorIds, uniqueStringList(ticket.assignedSupervisorIds)) ||
      assigneeName !== ticket.assigneeName;

    if (!classificationChanged && !supervisorsChanged) continue;
    changed++;
    if (classificationChanged) normalized++;

    if (apply) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          detectedTypes,
          detectedSubTypeIds,
          assignedSupervisorIds: supervisorIds,
          assigneeName,
        },
      });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    scanned: tickets.length,
    changed,
    normalized,
    missingSpecialties: Object.fromEntries(
      [...missingCounts.entries()].sort((a, b) => b[1] - a[1])
    ),
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
