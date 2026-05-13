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

// ── Find Supervisors ────────────────────────────────────────────────────────
export async function findSupervisorsDB(projectId: string, requiredSpecialties: string[]) {
  const allUsers = await prisma.user.findMany({
    where: { role: "supervisor" },
    select: { uid: true, displayName: true, specialties: true, specialty: true, projectIds: true },
  });

  const activeUsers = allUsers.filter((u: any) => !u.uid.startsWith("pending_"));

  let projectSups = activeUsers.filter(
    (u: any) => Array.isArray(u.projectIds) && u.projectIds.includes(projectId)
  );
  if (projectSups.length === 0) projectSups = activeUsers;

  const getSpecs = (u: any): string[] => {
    if (Array.isArray(u.specialties) && u.specialties.length > 0) return u.specialties;
    if (u.specialty) return [u.specialty];
    return ["general"];
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
