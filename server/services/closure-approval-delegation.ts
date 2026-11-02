export type DelegationSettingRow = {key: string; value: unknown};

export function delegatedSupervisorsForProject(
  candidateUids: string[],
  settings: DelegationSettingRow[],
  projectId: string,
): Set<string> {
  const candidates = new Set(candidateUids);
  const prefix = 'supervisor_closure_delegation:';
  const delegated = new Set<string>();
  for (const setting of settings) {
    if (!setting.key.startsWith(prefix)) continue;
    const uid = setting.key.slice(prefix.length);
    if (!candidates.has(uid)) continue;
    const value = setting.value as {projects?: Record<string, unknown>} | null;
    if (value?.projects?.[projectId] === true) delegated.add(uid);
  }
  return delegated;
}
