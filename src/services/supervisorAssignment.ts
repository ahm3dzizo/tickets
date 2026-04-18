import { collection, query, where, getDocs } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
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
    const db = getFirestoreDb();

    // ── 1. Query supervisors assigned to this specific project ──
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'supervisor'),
      where('projectIds', 'array-contains', projectId)
    );
    const snap = await getDocs(q);
    let all = snap.docs.map(d => ({ uid: d.id, ...d.data() } as User));

    // ── 2. If no project-specific supervisors found, fall back to ALL supervisors ──
    if (all.length === 0) {
      const globalSnap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'supervisor'))
      );
      all = globalSnap.docs.map(d => ({ uid: d.id, ...d.data() } as User));
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
