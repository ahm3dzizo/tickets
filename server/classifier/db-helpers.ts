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
  const ticketType = await prisma.ticketType.findUnique({
    where: { key: typeKey },
    include: { specialty: { select: { id: true, key: true } } },
  });
  if (!ticketType) return false;

  const currentSpecialtyKey = ticketType.specialty?.key || 'general';

  const tickets = await prisma.ticket.findMany({
    where: { type: typeKey, assignedSupervisors: { not: null } },
    select: { assignedSupervisors: true },
    orderBy: { updatedAt: 'desc' },
    take: sampleSize,
  });

  // Count unique specialty per ticket (one vote per ticket)
  const specialtyCounts: Record<string, number> = {};
  for (const ticket of tickets) {
    const sups = ticket.assignedSupervisors as any[];
    if (!Array.isArray(sups) || sups.length === 0) continue;
    const seen = new Set<string>();
    for (const sup of sups) {
      const spec: string = sup.specialty || 'general';
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
export async function findSupervisorsDB(projectId: string, requiredSpecialties: string[]) {
  const allUsers = await prisma.user.findMany({
    where: { role: "supervisor" },
    include: { 
      projects: { select: { id: true } }, 
      specialtiesRef: { select: { key: true } },
      substituteFor: { select: { specialty: true, specialtiesRef: { select: { key: true } } } }
    },
  });

  const activeUsers = allUsers.filter((u: any) => u.uid && !u.uid.startsWith("pending_") && !u.disabled && !u.onLeave);

  let projectSups = activeUsers.filter(
    (u: any) => u.projects && u.projects.some((p: any) => p.id === projectId)
  );
  if (projectSups.length === 0) projectSups = activeUsers;

  const getSpecs = (u: any): string[] => {
    const specs: string[] = [];
    if (u.specialtiesRef && u.specialtiesRef.length > 0) specs.push(...u.specialtiesRef.map((s: any) => s.key));
    else if (u.specialty) specs.push(u.specialty);
    else specs.push("general");

    if (u.substituteFor && u.substituteFor.length > 0) {
      for (const sub of u.substituteFor) {
        if (sub.specialtiesRef && sub.specialtiesRef.length > 0) specs.push(...sub.specialtiesRef.map((s: any) => s.key));
        else if (sub.specialty) specs.push(sub.specialty);
      }
    }
    return [...new Set(specs)];
  };

  let matched = projectSups.filter((s: any) =>
    getSpecs(s).some((sp: string) => requiredSpecialties.includes(sp))
  );

  if (matched.length === 0) {
    matched = projectSups.filter((s: any) => getSpecs(s).includes("general"));
  }

  if (matched.length === 0) {
    matched = projectSups.slice(0, 3);
  }

  return matched.map((u: any) => ({
    id: u.uid,
    name: u.displayName,
    specialties: getSpecs(u),
  }));
}
