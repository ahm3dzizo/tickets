import prisma from "../db.js";

// ── Reference Data Cache ────────────────────────────────────────────────────
let _refCache: {
  types: any[];
  specialties: any[];
  recentTickets: any[];
  keywords: any[];
} = { types: [], specialties: [], recentTickets: [], keywords: [] };
let _refCacheTime = 0;
const REF_CACHE_TTL = 10 * 60 * 1000;

export function invalidateReferenceCache() {
  _refCache = { types: [], specialties: [], recentTickets: [], keywords: [] };
  _refCacheTime = 0;
}

// ── Build Context Payload ───────────────────────────────────────────────────
export async function buildContextPayload(force = false) {
  if (!force && _refCache.types.length > 0 && Date.now() - _refCacheTime < REF_CACHE_TTL) {
    return _refCache;
  }

  const [types, specialties, recentTickets, keywords] = await Promise.all([
    prisma.ticketType.findMany({
      where: { isActive: true },
      include: {
        specialty: { select: { key: true, nameAr: true } },
        subTypes: {
          where: { isActive: true },
          select: { id: true, nameAr: true, description: true },
          orderBy: { sortOrder: "asc" },
        },
        _count: { select: { keywords: true, tickets: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.ticket.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      select: { description: true, type: true, status: true },
      where: { type: { not: "" } },
    }),
    prisma.ticketTypeKeyword.findMany({
      where: { typeId: { not: null } },
      select: { keyword: true, weight: true, ticketType: { select: { key: true, nameAr: true } }, subTypeId: true },
      orderBy: { weight: "desc" },
      take: 200,
    }),
  ]);

  _refCache = { types, specialties, recentTickets, keywords };
  _refCacheTime = Date.now();
  return _refCache;
}

// ── Get Valid Types from DB ─────────────────────────────────────────────────
export async function getValidTypesFromDB(): Promise<string[]> {
  const ctx = await buildContextPayload();
  return ctx.types.map((t: any) => t.key);
}

// ── Build Type-to-Specialty Map ─────────────────────────────────────────────
export async function buildTypeToSpecialtyMap() {
  const types = await prisma.ticketType.findMany({
    where: { isActive: true },
    include: { specialty: { select: { key: true } } },
  });
  const map: Record<string, string> = {};
  for (const t of types) {
    map[t.key] = t.specialty?.key || "general";
  }
  return map;
}

// ── Learn Specialty from Supervisor Corrections ─────────────────────────────
/**
 * Called after a manual supervisor change on a ticket.
 * Looks at the last `sampleSize` tickets of this type, tallies which specialty
 * their supervisors have, and updates TicketType.specialtyId if an alternative
 * specialty appears in at least `threshold` tickets.
 */
export async function learnSpecialtyFromCorrections(
  typeKey: string,
  threshold = 3,
  sampleSize = 50
): Promise<boolean> {
  // Supervisor choices are ticket-level operational decisions, not taxonomy
  // corrections.  Learning from them made a type oscillate between specialties
  // (and consequently routed later tickets to the wrong people).  Keep the old
  // implementation available only as an explicit, controlled migration tool.
  if (process.env.ENABLE_SPECIALTY_AUTO_LEARN !== "true") return false;

  const ticketType = await prisma.ticketType.findUnique({
    where: { key: typeKey },
    include: { specialty: { select: { id: true, key: true } } },
  });
  if (!ticketType) return false;

  const currentSpecialtyKey = ticketType.specialty?.key || 'general';

  const tickets = await prisma.ticket.findMany({
    where: { type: typeKey, assignedSupervisorIds: { isEmpty: false } },
    select: { assignedSupervisorIds: true },
    orderBy: { createdAt: 'desc' },
    take: sampleSize,
  });

  // Count unique specialty per ticket by looking up supervisor specialties
  const allSupIds = [...new Set(tickets.flatMap((t: any) => t.assignedSupervisorIds as string[]))];
  const supUsers = allSupIds.length > 0
    ? await prisma.user.findMany({ where: { uid: { in: allSupIds } }, select: { uid: true, specialtiesRef: { select: { key: true } } } })
    : [];
  const supSpecMap = Object.fromEntries(supUsers.map((u: any) => [u.uid, u.specialtiesRef?.[0]?.key || 'general']));

  const specialtyCounts: Record<string, number> = {};
  for (const ticket of tickets) {
    const ids = (ticket as any).assignedSupervisorIds as string[];
    if (!ids || ids.length === 0) continue;
    const seen = new Set<string>();
    for (const id of ids) {
      const spec: string = supSpecMap[id] || 'general';
      if (!seen.has(spec)) {
        seen.add(spec);
        specialtyCounts[spec] = (specialtyCounts[spec] || 0) + 1;
      }
    }
  }

  // Find the dominant non-current specialty
  const [newSpecialtyKey, count] = Object.entries(specialtyCounts)
    .filter(([key]) => key !== currentSpecialtyKey)
    .sort(([, a], [, b]) => b - a)[0] ?? [null, 0];

  if (!newSpecialtyKey || count < threshold) return false;

  const newSpecialty = await prisma.specialty.findUnique({ where: { key: newSpecialtyKey } });
  if (!newSpecialty) return false;

  await prisma.ticketType.update({
    where: { key: typeKey },
    data: { specialtyId: newSpecialty.id },
  });

  invalidateReferenceCache();
  console.log(`[SpecialtyLearn] "${typeKey}" specialty updated: ${currentSpecialtyKey} → ${newSpecialtyKey} (${count}/${sampleSize} tickets)`);
  return true;
}

// ── Find Supervisors ────────────────────────────────────────────────────────
type SupervisorCandidate = {
  uid: string;
  displayName: string;
  disabled?: boolean;
  onLeave?: boolean;
  specialtiesRef?: { key: string }[];
  substituteFor?: { specialtiesRef?: { key: string }[] }[];
};

export type MatchedSupervisor = {
  id: string;
  name: string;
  specialties: string[];
};

export function uniqueStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .filter((value): value is string => typeof value === "string")
    .map(value => value.trim())
    .filter(Boolean))];
}

function getSupervisorSpecialties(user: SupervisorCandidate): string[] {
  const direct = user.specialtiesRef?.map(s => s.key) ?? [];
  const substituted = user.substituteFor?.flatMap(
    relation => relation.specialtiesRef?.map(s => s.key) ?? []
  ) ?? [];
  const specialties = uniqueStringList([...direct, ...substituted]);
  return specialties.length > 0 ? specialties : ["general"];
}

/**
 * Select the smallest deterministic set of project supervisors that covers
 * every required specialty. A multi-specialty supervisor may cover more than
 * one requirement. Missing specialties are returned explicitly; a supervisor
 * from another project (or a generic supervisor) is never presented as a match.
 */
export function selectSupervisorCoverage(
  candidates: SupervisorCandidate[],
  requiredSpecialties: string[]
): { supervisors: MatchedSupervisor[]; missingSpecialties: string[] } {
  const required = uniqueStringList(requiredSpecialties);
  const available = candidates
    .filter(user => user.uid && !user.disabled && !user.onLeave)
    .map(user => ({
      id: user.uid,
      name: user.displayName,
      specialties: getSupervisorSpecialties(user),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar") || a.id.localeCompare(b.id));

  const uncovered = new Set(required);
  const selected: MatchedSupervisor[] = [];

  while (uncovered.size > 0) {
    const alreadySelected = new Set(selected.map(supervisor => supervisor.id));
    const ranked = available
      .filter(supervisor => !alreadySelected.has(supervisor.id))
      .map(supervisor => ({
        supervisor,
        score: supervisor.specialties.filter(specialty => uncovered.has(specialty)).length,
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.supervisor.name.localeCompare(b.supervisor.name, "ar"));

    const best = ranked[0]?.supervisor;
    if (!best) break;
    selected.push(best);
    for (const specialty of best.specialties) uncovered.delete(specialty);
  }

  return { supervisors: selected, missingSpecialties: [...uncovered] };
}

export async function findSupervisorCoverageDB(projectId: string, requiredSpecialties: string[]) {
  const allUsers = await prisma.user.findMany({
    where: {
      role: "supervisor",
      disabled: false,
      onLeave: false,
      projects: { some: { id: projectId } },
    },
    include: {
      specialtiesRef: { select: { key: true } },
      substituteFor: { select: { specialtiesRef: { select: { key: true } } } }
    },
  });

  const coverage = selectSupervisorCoverage(allUsers, requiredSpecialties);
  if (coverage.missingSpecialties.length > 0) {
    console.warn(
      `[SupervisorCoverage] project=${projectId} missing=${coverage.missingSpecialties.join(",")}`
    );
  }
  return coverage;
}

export async function findSupervisorsDB(projectId: string, requiredSpecialties: string[]) {
  return (await findSupervisorCoverageDB(projectId, requiredSpecialties)).supervisors;
}
