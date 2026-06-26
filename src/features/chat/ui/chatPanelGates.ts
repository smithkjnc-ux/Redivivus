// [SCOPE] Chat Panel Gates — placement confirmation and cost estimate modal helpers
// Extracted from chatPanelIntent.ts

import * as vscode from 'vscode';
import type { BuildRequestDeps} from '../../../shared/ai/domain/chatPanelIntent.js';
import { _pendingPlacements, _pendingBuildConfirms } from '../../../shared/ai/domain/chatPanelResolvers.js';
import { estimateBuild } from '../../../shared/ai/domain/costEstimatorService.js';
import { checkBuildPlacement } from '../build/services/buildPlacementCheck.js';
import { autoCreateProject } from '../build/chatPanelBuildAutoCreate.js';
import { tracer } from '../../project/application/pipelineTracer.js';

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

/**
 * Placement gate — checks if the current task belongs in the open project.
 * Returns true if the caller should abort (new project opened or user cancelled).
 * Returns false to continue building in the current project.
 * Skipped when no workspace is open, project is not initialized, or task references a specific file path.
 */
export async function runPlacementGate(task: string, deps: BuildRequestDeps): Promise<boolean> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length || !deps.redivivus?.isInitialized?.()) { return false; }

  const projectName = folders[0].name;
  const placement = await checkBuildPlacement(task, deps.blueprintContext, true, projectName, deps.routing);
  if (placement.decision !== 'ambiguous') { return false; }

  tracer.gate('Placement', `ambiguous — showing modal for project "${projectName}"`);
  const choice = await awaitPlacementConfirmation(task, projectName, false, deps);

  if (choice === 'cancel') {
    deps.postToWebview({ type: 'set-status', status: 'ready' });
    return true;
  }

  if (choice === 'new-project') {
    try {
      const created = await autoCreateProject(task, deps);
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(created.dir));
    } catch (e) {
      deps.conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
      deps.refresh();
      deps.postToWebview({ type: 'set-status', status: 'ready' });
    }
    return true;
  }

  return false; // 'here' — continue building in current project
}

/** Shows cost estimate modal and waits (async) for user to confirm or cancel. Returns true = proceed. */
export async function awaitCostConfirmation(task: string, deps: BuildRequestDeps): Promise<boolean> {
  const model = deps.routing.getModelName?.() || deps.routing.getAvailableAI().ai || '';
  const roster = deps.routing.buildRoster?.();
  const supervisorModel = roster?.supervisor !== (deps.routing.getAvailableAI().ai || '') ? roster?.supervisor : undefined;
  const guardianModel = roster?.guardian || undefined;
  const estimate = estimateBuild(task, model, supervisorModel, guardianModel);
  // [Redivivus] Fast-path: single-phase micro tasks (1-step snippets) auto-approve — no need to gate.
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
