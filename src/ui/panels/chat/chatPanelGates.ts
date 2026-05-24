// [SCOPE] Chat Panel Gates — placement confirmation and cost estimate modal helpers
// Extracted from chatPanelIntent.ts

import type { BuildRequestDeps} from '../../../core/ai/chatPanelIntent';
import { _pendingPlacements, _pendingBuildConfirms } from '../../../core/ai/chatPanelIntent';
import { estimateBuild } from '../../../core/ai/costEstimatorService';

export async function awaitPlacementConfirmation(
  task: string,
  projectName: string,
  noProject: boolean,
  deps: BuildRequestDeps,
): Promise<'here' | 'new-project' | 'cancel'> {
  const placementId = `placement-${Date.now()}`;
  const choice = await new Promise<'here' | 'new-project' | 'cancel'>((resolve) => {
    _pendingPlacements.set(placementId, resolve);
    deps.postToWebview({ type: 'show-placement-check', placementId, projectName, noProject });
    // Safety timeout — treat as cancel after 5 min
    setTimeout(() => {
      if (_pendingPlacements.has(placementId)) {
        _pendingPlacements.delete(placementId);
        resolve('cancel');
      }
    }, 5 * 60 * 1000);
  });
  return choice;
}

/** Shows cost estimate modal and waits (async) for user to confirm or cancel. Returns true = proceed. */
export async function awaitCostConfirmation(task: string, deps: BuildRequestDeps): Promise<boolean> {
  const model = deps.routing.getModelName?.() || deps.routing.getAvailableAI().ai || 'gemini';
  const roster = deps.routing.buildRoster?.();
  const supervisorModel = roster?.supervisor !== (deps.routing.getAvailableAI().ai || 'gemini') ? roster?.supervisor : undefined;
  const guardianModel = roster?.guardian || undefined;
  const estimate = estimateBuild(task, model, supervisorModel, guardianModel);
  // [CHASSIS] Fast-path: single-phase micro tasks (1-step snippets) auto-approve — no need to gate.
  // Everything else shows the estimate slip so the user sees what will be built before we start.
  if (estimate.phases <= 1) { return true; }
  const buildId = `build-${Date.now()}`;
  const confirmed = await new Promise<boolean>((resolve) => {
    _pendingBuildConfirms.set(buildId, resolve);
    deps.postToWebview({ type: 'show-cost-estimate', buildId, estimate });
    // Safety timeout — auto-confirm after 5 min so builds never hang forever
    setTimeout(() => {
      if (_pendingBuildConfirms.has(buildId)) {
        _pendingBuildConfirms.delete(buildId);
        resolve(true);
      }
    }, 5 * 60 * 1000);
  });
  return confirmed;
}
