// [SCOPE] Chat Panel Build Runner — executes build after all gates pass (vault/placement/cost)
// Extracted from chatPanelIntent.ts. Called by handleBuildRequest.

import * as vscode from 'vscode';
import { BuildRequestDeps, _pendingPlacements } from './chatPanelIntent.js';
import { BuildContext, runSingleFileBuild, runChunkedBuild, isChunkedBuildRequest, runVaultAssemblyBuild } from './chatPanelBuild.js';
import { handleComplexityRoutedBuild, OrchestratorDeps } from './chatPanelOrchestrator.js';
import { extractBlueprintFromPrompt } from '../../services/blueprint/blueprintExtractor.js';
import { VaultSearchResult } from '../../services/vault/buildFromVaultSearch.js';

export async function runBuildAfterGates(
  task: string,
  deps: BuildRequestDeps,
  skipComplex: boolean,
  isFixRequest: boolean,
  precomputedVaultSearch: VaultSearchResult | undefined,
): Promise<void> {
  // Use chassis root — it may point to a just-created project before VS Code workspace catches up
  const root = deps.chassis?.getWorkspaceRoot?.() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const isSimpleUnit = /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(task);

  if (!root) {
    // No folder open + simple unit → build to vault directly, no folder needed
    if (isSimpleUnit && !skipComplex) {
      deps.setPendingTask(task);
      const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
      const _defaultParentV = require('os').homedir() + '/projects';
      deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: _defaultParentV, prefillTask: task, compact: true, vaultOnly: true, prefillAnswers });
      // [FIX] Bug 8: was missing — status ticker froze at "routing wiring..." forever
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      return;
    }
    // [FIX] skipComplex=true means user confirmed build from compact wizard — skip the 5-min
    // placement check and go straight to the new-project wizard to create a folder.
    // [WARN] Without this guard, clicking "Build it" with no workspace folder caused a 5-minute freeze.
    if (skipComplex) {
      deps.setPendingTask(task);
      const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
      const _defaultParentS = require('os').homedir() + '/projects';
      deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: _defaultParentS, prefillTask: task, compact: false, prefillAnswers });
      // [FIX] Bug 8: was missing — status ticker froze at "routing wiring..." forever
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      return;
    }
    // No folder open + complex project → show WebView placement modal (not native dialog)
    const placementId = `placement-${Date.now()}`;
    const noFolderChoice = await new Promise<'here' | 'new-project' | 'cancel'>((resolve) => {
      _pendingPlacements.set(placementId, resolve);
      deps.postToWebview({ type: 'show-placement-check', placementId, noProject: true });
      setTimeout(() => { if (_pendingPlacements.has(placementId)) { _pendingPlacements.delete(placementId); resolve('cancel'); } }, 5 * 60 * 1000);
    });
    if (noFolderChoice === 'new-project') {
      // [CHASSIS] AI-extract 5W answers first, then show wizard with pre-fills
      deps.setPendingTask(task);
      const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
      const _defaultParentN = require('os').homedir() + '/projects';
      deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: _defaultParentN, prefillTask: task, compact: false, prefillAnswers });
    }
    // [FIX] Bug 8: covers both 'new-project' and 'cancel'/'timeout' branches — was missing
    deps.postToWebview({ type: 'set-status', status: 'ready' });
    return;
  }

  // ── Complexity-based routing (nano/standard/deep) ──
  if (!skipComplex) {
    const orchDeps: OrchestratorDeps = {
      chassis: deps.chassis,
      routing: deps.routing,
      vault: deps.vault,
      conversation: deps.conversation,
      blueprintContext: deps.blueprintContext,
      refresh: deps.refresh,
      logError: deps.logError,
      postToWebview: deps.postToWebview,
      setPendingTask: deps.setPendingTask,
      precomputedVaultSearch,
    };

    const handled = await handleComplexityRoutedBuild(task, orchDeps);
    if (handled) { return; }
  }

  const ctx: BuildContext = {
    task,
    root,
    blueprintContext: deps.blueprintContext,
    vault: deps.vault,
    chassis: deps.chassis,
    routing: deps.routing,
    conversation: deps.conversation,
    refresh: deps.refresh,
    logError: deps.logError,
    postToWebview: deps.postToWebview,
    usageTracker: deps.usageTracker,
    onClarifySubmit: undefined,
    precomputedVaultSearch,
    isFix: isFixRequest,
    onBuildFinished: (t: string, builtFiles?: string[]) => {
      // [CHASSIS] Only call resolveFix for actual fix requests, not fresh builds
      if (isFixRequest) {
        vscode.commands.executeCommand('chassis.resolveFix', t, builtFiles);
      }
      const { ChatPanel } = require('./chatPanel.js');
      ChatPanel.onBuildFinished?.(t, builtFiles || []);
    },
    onBuildFailed: (t: string, reason: string) => {
      vscode.commands.executeCommand('chassis.buildFailed', t, reason);
    },
  };
  deps.setActiveBuildCtx(ctx);
  try {
    if (isChunkedBuildRequest(task)) {
      await runChunkedBuild(task, ctx);
    } else {
      await runSingleFileBuild(ctx);
    }
  } finally {
    deps.setActiveBuildCtx(undefined);
    deps.postToWebview({ type: 'set-status', status: 'ready' });
  }
}

/** Handles edit-request messages — edits an existing file in-place for TODO/scope fixes. */
export { handleEditRequest } from './chatPanelEditHandler.js';
