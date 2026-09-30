export type Closure = { supervisorUid: string; completedAt: string; completedByUid: string; notes: string; items: {description: string; status: string}[] };
export function closures(value: unknown): Closure[] { return Array.isArray(value) ? value as Closure[] : []; }
export function planClosure(active: string[], history: Closure[], actor: {uid: string; role: string}, scope: string, target: string | undefined, notes: string, items: Closure['items']) {
  const privileged = actor.role === 'admin' || actor.role === 'engineer';
  if (!privileged && actor.role !== 'supervisor') throw new Error('FORBIDDEN');
  if (!['self', 'supervisor', 'all'].includes(scope)) throw new Error('INVALID_SCOPE');
  if (!privileged && (scope !== 'self' || (target && target !== actor.uid))) throw new Error('FORBIDDEN');
  if (privileged && scope !== 'self' && !notes.trim()) throw new Error('REASON_REQUIRED');
  const targets = scope === 'all' ? active : [scope === 'self' ? actor.uid : target];
  if (targets.some(uid => !uid || !active.includes(uid))) {
    // Repeated personal completion is idempotent, even while other people work.
    if (scope !== 'all' && targets[0] && history.some(h => h.supervisorUid === targets[0])) return { active, history, final: false, changed: false };
    throw new Error('SUPERVISOR_NOT_ACTIVE');
  }
  const remaining = active.filter(uid => !targets.includes(uid));
  const next = [...history.filter(h => !targets.includes(h.supervisorUid)), ...targets.map(uid => ({supervisorUid: uid!, completedByUid: actor.uid, completedAt: new Date().toISOString(), notes, items}))];
  return {active: remaining, history: next, final: remaining.length === 0, changed: true};
}

