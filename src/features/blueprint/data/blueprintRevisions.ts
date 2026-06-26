// [SCOPE] Blueprint Revision Service — manages versioned blueprint history.
// The current blueprint is always open (editable). When updated, the previous state
// is snapshotted into `revisions[]` and locked. Revision 1 = original, always preserved.

import type { Blueprint, BlueprintRevision } from '../../../types/index.js';

/** Snapshot the current blueprint state into its revisions array before overwriting.
 *  Call this BEFORE modifying the blueprint fields. Returns the updated blueprint
 *  object with the previous state pushed to revisions. */
export function snapshotBeforeUpdate(current: Blueprint, changeNote?: string): Blueprint {
  const snapshot: BlueprintRevision = {
    revision: current.revision || 1,
    who: current.who,
    what: current.what,
    where: current.where,
    when: current.when,
    why: current.why,
    mechanics: current.mechanics,
    health: { ...current.health },
    lockedAt: new Date().toISOString(),
    changeNote,
  };

  const revisions = [...(current.revisions || []), snapshot];
  return { ...current, revisions, revision: (current.revision || 1) + 1 };
}

/** Get the original blueprint (revision 1). Returns null if no revisions exist. */
export function getOriginalBlueprint(blueprint: Blueprint): BlueprintRevision | null {
  if (blueprint.revisions && blueprint.revisions.length > 0) {
    return blueprint.revisions.find(r => r.revision === 1) || blueprint.revisions[0];
  }
  // No revisions yet — the current blueprint IS the original
  return null;
}

/** Get a specific revision by number. Returns null if not found. */
export function getRevision(blueprint: Blueprint, revisionNumber: number): BlueprintRevision | null {
  return blueprint.revisions?.find(r => r.revision === revisionNumber) || null;
}

/** Ensure a blueprint has the revision field set (migration for existing projects). */
export function ensureRevisionField(blueprint: Blueprint): Blueprint {
  if (!blueprint.revision) {
    blueprint.revision = 1;
  }
  return blueprint;
}
