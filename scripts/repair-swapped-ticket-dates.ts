import prisma from "../server/db.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SAUDI_TIME_ZONE = "Asia/Riyadh";

type Candidate = {
  id: string;
  ticketId: string;
  projectId: string;
  projectName: string;
  createdAt: Date;
  oldIssuedAt: string;
  newIssuedAt: string;
  oldDistanceDays: number;
  newDistanceDays: number;
};

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg?.slice(prefix.length).trim();
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function positiveNumberArg(name: string, fallback: number): number {
  const raw = getArg(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return parsed;
}

function saudiTodayUtcNoon(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAUDI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), 12, 0, 0);
}

function parseIsoDate(value: string | null): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
}

function validUtcDate(year: number, month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const value = Date.UTC(year, month - 1, day, 12, 0, 0);
  const date = new Date(value);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dayDistance(a: number, b: number): number {
  return Math.round(Math.abs(a - b) / MS_PER_DAY);
}

async function resolveProject() {
  const projectId = getArg("project-id");
  const projectName = getArg("project-name");

  if (!projectId && !projectName) {
    throw new Error("Provide exactly one project scope using --project-id=... or --project-name=...");
  }
  if (projectId && projectName) {
    throw new Error("Use only one of --project-id or --project-name, not both");
  }

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, abbreviation: true },
    });
    if (!project) throw new Error(`Project not found: ${projectId}`);
    return project;
  }

  const matches = await prisma.project.findMany({
    where: { name: { contains: projectName!, mode: "insensitive" } },
    select: { id: true, name: true, abbreviation: true },
    take: 10,
  });

  if (matches.length === 0) throw new Error(`No project matched name: ${projectName}`);
  if (matches.length > 1) {
    console.error("Project name is ambiguous. Matches:");
    for (const project of matches) console.error(`- ${project.id} | ${project.name} | ${project.abbreviation}`);
    throw new Error("Use --project-id with the exact project id");
  }
  return matches[0];
}

async function main() {
  const apply = hasFlag("apply");
  const createdWithinDays = positiveNumberArg("created-within-days", 21);
  const candidateNearDays = positiveNumberArg("candidate-near-days", 45);
  const minimumImprovementDays = positiveNumberArg("minimum-improvement-days", 14);
  const project = await resolveProject();

  const createdAfter = new Date(Date.now() - createdWithinDays * MS_PER_DAY);
  const referenceToday = saudiTodayUtcNoon();

  const tickets = await prisma.ticket.findMany({
    where: {
      projectId: project.id,
      createdAt: { gte: createdAfter },
      issuedAt: { not: null },
    },
    select: {
      id: true,
      ticketId: true,
      projectId: true,
      issuedAt: true,
      createdAt: true,
    },
  });

  const candidates: Candidate[] = [];

  for (const ticket of tickets) {
    const parsed = parseIsoDate(ticket.issuedAt);
    if (!parsed) continue;

    // Only ambiguous month/day values can have been silently reversed.
    if (parsed.month > 12 || parsed.day > 12 || parsed.month === parsed.day) continue;

    const original = validUtcDate(parsed.year, parsed.month, parsed.day);
    const swapped = validUtcDate(parsed.year, parsed.day, parsed.month);
    if (original === null || swapped === null) continue;

    const oldDistanceDays = dayDistance(original, referenceToday);
    const newDistanceDays = dayDistance(swapped, referenceToday);
    const improvementDays = oldDistanceDays - newDistanceDays;

    if (newDistanceDays > candidateNearDays) continue;
    if (improvementDays < minimumImprovementDays) continue;

    candidates.push({
      id: ticket.id,
      ticketId: ticket.ticketId,
      projectId: ticket.projectId,
      projectName: project.name,
      createdAt: ticket.createdAt,
      oldIssuedAt: ticket.issuedAt!,
      newIssuedAt: formatIsoDate(parsed.year, parsed.day, parsed.month),
      oldDistanceDays,
      newDistanceDays,
    });
  }

  candidates.sort((a, b) => {
    const an = Number(a.ticketId);
    const bn = Number(b.ticketId);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.ticketId.localeCompare(b.ticketId);
  });

  console.log(`\nProject: ${project.name} (${project.id})`);
  console.log(`Recent-created window: ${createdWithinDays} days`);
  console.log(`Candidates: ${candidates.length}\n`);

  if (candidates.length === 0) {
    console.log("No suspicious swapped month/day ticket dates found in the selected project/window.");
    return;
  }

  console.table(
    candidates.map((ticket) => ({
      ticketId: ticket.ticketId,
      oldIssuedAt: ticket.oldIssuedAt,
      proposedIssuedAt: ticket.newIssuedAt,
      oldDistanceDays: ticket.oldDistanceDays,
      proposedDistanceDays: ticket.newDistanceDays,
      createdAt: ticket.createdAt.toISOString(),
    }))
  );

  if (!apply) {
    console.log("\nDRY RUN ONLY — no database changes were made.");
    console.log(
      `To apply exactly this rule to this project, rerun with --project-id=${project.id} --apply`
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const ticket of candidates) {
      const current = await tx.ticket.findFirst({
        where: { id: ticket.id, projectId: project.id },
        select: { issuedAt: true },
      });

      // Zero-trust recheck: never overwrite a value that changed after the scan.
      if (!current || current.issuedAt !== ticket.oldIssuedAt) {
        throw new Error(`Ticket ${ticket.ticketId} changed during repair scan; transaction aborted`);
      }

      await tx.ticket.update({
        where: { id: ticket.id },
        data: { issuedAt: ticket.newIssuedAt },
      });

      await tx.ticketAudit.create({
        data: {
          ticketId: ticket.id,
          field: "issuedAt",
          oldValue: ticket.oldIssuedAt,
          newValue: ticket.newIssuedAt,
          changedBy: "repair-swapped-ticket-dates",
        },
      });
    }
  });

  console.log(`\nApplied ${candidates.length} issuedAt repairs successfully.`);
  console.log("Every changed ticket has a TicketAudit record with old/new values.");
}

main()
  .catch((error) => {
    console.error("\nRepair failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
