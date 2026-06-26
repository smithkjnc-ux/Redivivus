// [SCOPE] Role assignment failover — tracks model failures, promotes next, notifies user.
// When Supervisor fails 2+ times: demote, promote next-ranked model, notify via Guardian voice.
// Recovery: after 10 min, restore model to active and re-evaluate assignment.
// [WARN] Module-level state is reset on extension host restart. Failures do not persist across sessions.

import type { ModelRegistration, RoleAssignment } from './roleAssignmentService.js';
import { buildRegistrations, assignRoles } from './roleAssignmentService.js';

const RECOVERY_MS = 10 * 60 * 1000; // 10 minutes
const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude', gemini: 'Gemini', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', deepseek: 'DeepSeek',
};

export type FailoverNotify = (msg: string) => void;

let _registrations: ModelRegistration[] = [];
let _activeProvidersKey = '';  // content-based snapshot — avoids object-reference comparison
let _notify: FailoverNotify | null = null;

/** Set the callback that receives plain-English role-change notifications. */
export function setFailoverNotify(cb: FailoverNotify): void { _notify = cb; }

/** Rebuild registrations from current key availability. Call on key add/remove. */
export function refreshRegistrations(keyMap: Record<string, () => string | null>): RoleAssignment {
  _registrations = buildRegistrations(keyMap);
  return assignRoles(_registrations);
}

/** Get current live assignment. Only rebuilds when the set of active providers changes.
 * [FIX] Was: _keyMapRef !== keyMap — getKeyMap() creates a new object each call, so this was
 * always true, wiping all failover state and rebuilding registrations on every roster read. */
export function getLiveAssignment(keyMap: Record<string, () => string | null>): RoleAssignment {
  const activeKey = Object.keys(keyMap).filter(p => keyMap[p]?.()).sort().join(',');
  if (_registrations.length === 0 || activeKey !== _activeProvidersKey) {
    _activeProvidersKey = activeKey;
    refreshRegistrations(keyMap);
  }
  return assignRoles(_registrations);
}

/** Record a provider failure. Returns updated assignment and whether supervisor changed. */
export function recordProviderFailure(
  providerId: string,
  _reason: string,
): { changed: boolean; assignment: RoleAssignment } {
  const reg = _registrations.find(r => r.providerId === providerId);
  if (!reg) { return { changed: false, assignment: assignRoles(_registrations) }; }

  const wasSupervisor = assignRoles(_registrations).supervisor.providerId === providerId;
  reg.failureCount++;
  if (reg.failureCount >= 3) { reg.status = 'failed'; }
  else if (reg.failureCount >= 2) { reg.status = 'degraded'; }

  const newAssignment = assignRoles(_registrations);
  const changed = wasSupervisor && newAssignment.supervisor.providerId !== providerId;

  if (changed) {
    const oldLabel = PROVIDER_LABELS[providerId] || providerId;
    const newLabel = PROVIDER_LABELS[newAssignment.supervisor.providerId] || newAssignment.supervisor.providerId;
    const msg = newAssignment.isSingleModelMode
      ? `${oldLabel} isn\'t responding. Continuing in single-model mode -- your work continues uninterrupted.`
      : `Switched from ${oldLabel} to ${newLabel} -- ${oldLabel} isn\'t responding. Your work continues uninterrupted.`;
    _notify?.(msg);
    scheduleRecovery(providerId);
  }
  return { changed, assignment: newAssignment };
}

function scheduleRecovery(providerId: string): void {
  setTimeout(() => {
    const reg = _registrations.find(r => r.providerId === providerId);
    if (!reg || reg.status === 'active') { return; }
    reg.status = 'active';
    reg.failureCount = 0;
    const label = PROVIDER_LABELS[providerId] || providerId;
    const assignment = assignRoles(_registrations);
    if (assignment.supervisor.providerId === providerId) {
      _notify?.(`${label} is back -- restored to Supervisor/Guardian.`);
    }
  }, RECOVERY_MS);
}
