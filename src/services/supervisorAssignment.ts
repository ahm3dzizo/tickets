import { usersApi } from '@/lib/api';
import type { User, Specialty } from '@/types';

export interface AssignedSupervisor {
  id: string;
  name: string;
  specialties: Specialty[];
}

/**
 * Find supervisors in a project whose specialty matches the required specialties.
 * Falls back to any project supervisor if no specialty match is found.
 */
export async function findMatchingSupervisors(
  projectId: string,
  requiredSpecialties: Specialty[]
): Promise<AssignedSupervisor[]> {
  if (!projectId) return [];

  try {
    const allUsers = await usersApi.getAll();

    // ── 1. Supervisors assigned to this specific project ──
    let all = allUsers.filter(
      (u: User) => u.role === 'supervisor' && Array.isArray(u.projectIds) && u.projectIds.includes(projectId)
    );

    // ── 2. If none found, fall back to ALL supervisors ──
    if (all.length === 0) {
      all = allUsers.filter((u: User) => u.role === 'supervisor');
    }

    if (all.length === 0) return [];

    // Resolve effective specialties (new array takes priority over legacy single value)
    const getSpecialties = (u: User): Specialty[] => {
      if (u.specialties && u.specialties.length > 0) return u.specialties;
      if (u.specialty) return [u.specialty];
      return ['general'];
    };

    const toResult = (u: User): AssignedSupervisor => ({
      id: u.uid,
      name: u.displayName,
      specialties: getSpecialties(u),
    });

    // Match: supervisor covers ANY of the required specialties
    const matched = all.filter(s =>
      getSpecialties(s).some(sp => requiredSpecialties.includes(sp))
    );

    if (matched.length > 0) return matched.map(toResult);

    // Fallback: 'general' supervisors, or all
    const generalFallback = all.filter(s => getSpecialties(s).includes('general'));
    return (generalFallback.length > 0 ? generalFallback : all).map(toResult);
  } catch {
    return [];
  }
}
