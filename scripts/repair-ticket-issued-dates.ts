import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../server/db.js';

type Args = {
  project: string;
  apply: boolean;
  createdAfterDays: number;
  recentWindowDays: number;
  minImprovementDays: number;
};

type Candidate = {
  id: string;
  ticketId: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  currentIssuedAt: string;
  proposedIssuedAt: string;
  currentDistanceDays: number;
  proposedDistanceDays: number;
  improvementDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function fail(message: string): never {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function readArgs(): Args {
  const raw = process.argv.slice(2);
  const getValue = (name: string) => {
    const prefix = `--${name}=`;
    const item = raw.find((arg) => arg.startsWith(prefix));
    return item ? item.slice(prefix.length).trim() : '';
  };

  const project = getValue('project');
  if (!project) {
    fail('Missing --project. Example: npx tsx scripts/repair-ticket-issued-dates.ts --project="النرجس"');
  }

  const numberArg = (name: string, fallback: number) => {
    const value = getValue(name);
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) fail(`Invalid --${name} value`);
    return parsed;
  };

  return {
    project,
    apply: raw.includes('--apply'),
    createdAfterDays: numberArg('created-after-days', 90),
    recentWindowDays: numberArg('recent-window-days', 45),
    minImprovementDays: numberArg('min-improvement-days', 60),
  };
}

function toSaudiReferenceDate(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), 12, 0, 0));
}

function parseIsoDateOnly(value: string | null): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
}

function buildValidDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function distanceDays(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / DAY_MS);
}

async function resolveProject(projectRef: string) {
  const exact = await prisma.project.findMany({
    where: {
      OR: [
        { id: projectRef },
        { name: { equals: projectRef, mode: 'insensitive' } },
        { abbreviation: { equals: projectRef, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, abbreviation: true },
  });

  if (exact.length === 1) return exact[0];
  if (exact.length > 1) fail(`Project reference matched more than one project: ${projectRef}`);

  const partial = await prisma.project.findMany({
    where: { name: { contains: projectRef, mode: 'insensitive' } },
    select: { id: true, name: true, abbreviation: true },
  });

  if (partial.length === 1) return partial[0];
  if (partial.length === 0) fail(`Project not found: ${projectRef}`);
  fail(`Project name is ambiguous. Matches: ${partial.map((p) => `${p.name} (${p.abbreviation})`).join(', ')}`);
}

async function main() {
  const args = readArgs();
  const project = await resolveProject(args.project);
  const reference = toSaudiReferenceDate();
  const createdAfter = new Date(reference.getTime() - args.createdAfterDays * DAY_MS);

  console.log('\n============================================================');
  console.log('Ticket issuedAt repair audit');
  console.log('============================================================');
  console.log(`Project: ${project.name} (${project.abbreviation})`);
  console.log(`Mode: ${args.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Saudi reference date: ${formatDateOnly(reference)}`);
  console.log(`Only tickets created since: ${createdAfter.toISOString()}`);
  console.log(`Proposed date must be within: ${args.recentWindowDays} days of reference`);
  console.log(`Minimum improvement required: ${args.minImprovementDays} days`);

  const tickets = await prisma.ticket.findMany({
    where: {
      projectId: project.id,
      createdAt: { gte: createdAfter },
      issuedAt: { not: null },
    },
    select: {
      id: true,
      ticketId: true,
      issuedAt: true,
      createdAt: true,
      projectId: true,
    },
    orderBy: [{ createdAt: 'desc' }, { ticketId: 'desc' }],
  });

  const candidates: Candidate[] = [];

  for (const ticket of tickets) {
    const parsed = parseIsoDateOnly(ticket.issuedAt);
    if (!parsed) continue;

    // A day/month swap is only meaningful when both components can be months.
    if (parsed.month > 12 || parsed.day > 12 || parsed.month === parsed.day) continue;

    const current = buildValidDate(parsed.year, parsed.month, parsed.day);
    const swapped = buildValidDate(parsed.year, parsed.day, parsed.month);
    if (!current || !swapped) continue;

    const currentDistance = distanceDays(current, reference);
    const proposedDistance = distanceDays(swapped, reference);
    const improvement = currentDistance - proposedDistance;

    if (proposedDistance > args.recentWindowDays) continue;
    if (improvement < args.minImprovementDays) continue;

    candidates.push({
      id: ticket.id,
      ticketId: ticket.ticketId,
      projectId: ticket.projectId,
      projectName: project.name,
      createdAt: ticket.createdAt.toISOString(),
      currentIssuedAt: formatDateOnly(current),
      proposedIssuedAt: formatDateOnly(swapped),
      currentDistanceDays: currentDistance,
      proposedDistanceDays: proposedDistance,
      improvementDays: improvement,
    });
  }

  console.log(`\nScanned: ${tickets.length}`);
  console.log(`Suspicious candidates: ${candidates.length}\n`);

  if (candidates.length === 0) {
    console.log('No safe date-swap candidates found. Nothing changed.');
    return;
  }

  console.table(
    candidates.map((c) => ({
      ticketId: c.ticketId,
      old: c.currentIssuedAt,
      proposed: c.proposedIssuedAt,
      oldDistanceDays: c.currentDistanceDays,
      newDistanceDays: c.proposedDistanceDays,
      createdAt: c.createdAt,
    }))
  );

  if (!args.apply) {
    console.log('\nDRY RUN ONLY — no database rows were changed.');
    console.log('Review the list, then run the same command with --apply if it is correct.');
    return;
  }

  const backupDir = path.resolve(process.cwd(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `ticket-issuedAt-repair-${project.abbreviation || project.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        project,
        referenceDate: formatDateOnly(reference),
        candidates,
      },
      null,
      2
    ),
    { encoding: 'utf8', flag: 'wx' }
  );

  await prisma.$transaction(async (tx) => {
    for (const candidate of candidates) {
      // Zero-trust recheck: update only if the row still has the exact value
      // observed during the audit. If it changed concurrently, abort everything.
      const current = await tx.ticket.findUnique({
        where: { id: candidate.id },
        select: { issuedAt: true, projectId: true },
      });

      if (!current || current.projectId !== project.id || current.issuedAt?.slice(0, 10) !== candidate.currentIssuedAt) {
        throw new Error(`Concurrent change detected for ticket ${candidate.ticketId}; transaction aborted`);
      }

      await tx.ticket.update({
        where: { id: candidate.id },
        data: { issuedAt: candidate.proposedIssuedAt },
      });

      await tx.ticketAudit.create({
        data: {
          ticketId: candidate.id,
          field: 'issuedAt',
          oldValue: candidate.currentIssuedAt,
          newValue: candidate.proposedIssuedAt,
          changedBy: 'system repair script: swapped day/month after guarded date audit',
        },
      });
    }
  });

  console.log(`\nApplied ${candidates.length} corrections successfully.`);
  console.log(`Backup: ${backupPath}`);
  console.log('An audit row was created for every modified ticket.');
}

main()
  .catch((error) => {
    console.error('\nRepair failed. No partial transaction should have been committed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
