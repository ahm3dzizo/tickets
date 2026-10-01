export type Closure = { supervisorUid: string; completedAt: string; completedByUid: string; notes: string; items: {description: string; status: string}[] };
export function closures(value: unknown): Closure[] { return Array.isArray(value) ? value as Closure[] : []; }

export function planClosure(
  active: string[],
  history: Closure[],
  actor: {uid: string; role: string},
  scope: string,
  target: string | string[] | undefined,
  notes: string,
  items: Closure['items'],
) {
  const privileged = actor.role === 'admin' || actor.role === 'engineer';
  if (!privileged && actor.role !== 'supervisor') throw new Error('FORBIDDEN');
  if (!['self', 'supervisor', 'selected', 'all'].includes(scope)) throw new Error('INVALID_SCOPE');
  if (
    !privileged &&
    (scope !== 'self' || Array.isArray(target) || (typeof target === 'string' && target !== actor.uid))
  ) throw new Error('FORBIDDEN');
  const requestedTargets =
    scope === 'all' ? active :
    scope === 'self' ? [actor.uid] :
    scope === 'selected' ? (Array.isArray(target) ? target : target ? [target] : []) :
    [typeof target === 'string' ? target : undefined];

  const targets = [...new Set(requestedTargets.filter((uid): uid is string => Boolean(uid)))];
  if (!targets.length && scope !== 'all') throw new Error('SUPERVISOR_REQUIRED');

  if (targets.some(uid => !active.includes(uid))) {
    // Repeated single-person completion stays idempotent while other people work.
    if (
      (scope === 'self' || scope === 'supervisor') &&
      targets.length === 1 &&
      history.some(h => h.supervisorUid === targets[0])
    ) {
      return { active, history, final: false, changed: false };
    }
    throw new Error('SUPERVISOR_NOT_ACTIVE');
  }

  const remaining = active.filter(uid => !targets.includes(uid));

  // Management only needs to explain an on-behalf *partial* completion.
  // A final closure (all active supervisor roles completed) is a normal
  // terminal action and does not require an extra reason.
  if (privileged && scope !== 'self' && remaining.length > 0 && !notes.trim()) {
    throw new Error('REASON_REQUIRED');
  }

  const next = [
    ...history.filter(h => !targets.includes(h.supervisorUid)),
    ...targets.map(supervisorUid => ({
      supervisorUid,
      completedByUid: actor.uid,
      completedAt: new Date().toISOString(),
      notes,
      items,
    })),
  ];

  return {active: remaining, history: next, final: remaining.length === 0, changed: true};
}
