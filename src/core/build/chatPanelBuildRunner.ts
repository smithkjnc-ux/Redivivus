// [SCOPE] Chat Panel Build Runner — executes build after all gates pass (vault/placement/cost)
// Extracted from chatPanelIntent.ts. Called by handleBuildRequest.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BuildRequestDeps} from '../ai/chatPanelIntent';
import { _pendingPlacements } from '../ai/chatPanelIntent';
import type { BuildContext} from './chatPanelBuild';
import { runSingleFileBuild, runChunkedBuild, isChunkedBuildRequest } from './chatPanelBuild';
import type { OrchestratorDeps } from './chatPanelOrchestrator';
import { handleComplexityRoutedBuild } from './chatPanelOrchestrator';
import type { VaultSearchResult } from '../../services/vault/buildFromVaultSearch';
import { isValidBuildRoot } from './chatPanelBuildUtils';
import { autoCreateProject } from './chatPanelBuildAutoCreate';
import { emptyContract } from '../../services/blueprint/blueprintContract';
import { runBuildClarifyStep } from './chatPanelBuildClarify';

// [WARN] Always use LIVE workspace folder — redivivus service root can be stale from activation
// [WARN] ~/projects itself may be open as workspace — must reject it as a build root or files land in the container
function isProjectsContainer(root: string): boolean {
  const cfg = vscode.workspace.getConfiguration('redivivus').get<string>('projectsDirectory', '~/projects').replace('~', os.homedir());
  return path.resolve(root) === path.resolve(cfg);
}

function getLiveRoot(deps: BuildRequestDeps): string | undefined {
  const liveRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (isValidBuildRoot(liveRoot) && !isProjectsContainer(liveRoot)) { return liveRoot; }
  // [FIX] Only fall back to redivivusRoot when there IS a workspace open (e.g. multi-root edge case).
  // If no workspace folders exist, user explicitly closed the project — do NOT use stale cached root.
  if (!liveRoot) { return undefined; }
  const redivivusRoot = deps.redivivus?.getWorkspaceRoot?.();
  if (isValidBuildRoot(redivivusRoot) && redivivusRoot !== liveRoot && !isProjectsContainer(redivivusRoot)) { return redivivusRoot; }
  return undefined;
}


export async function runBuildAfterGates(
  task: string,
  deps: BuildRequestDeps,
  skipComplex: boolean,
  isFixRequest: boolean,
  precomputedVaultSearch: VaultSearchResult | undefined,
): Promise<void> {
  deps.postToWebview({ type: 'set-status', status: 'working' });
  let root = getLiveRoot(deps);
  let autoCreatedProject = false;

  // [RULE 18] AI classifier for simple-unit detection — regex cannot reliably distinguish
  // "write a function" (snippet) from "build a password generator" (full project).
  let isSimpleUnit = false;
  try {
    const prompt = `Task: "${task.slice(0, 200)}"\nIs this a request for a simple code snippet/utility/function, or a full standalone project/app?\nReply with one word: snippet or project`;
    const unitRes = await deps.routing.prompt(prompt, 12_000);
    if (unitRes.success && unitRes.text) { isSimpleUnit = unitRes.text.trim().toLowerCase().startsWith('snippet'); }
  } catch { isSimpleUnit = /\b(function|script|snippet|utility|helper|class|method|component|hook|module)\b/i.test(task); }

  if (!root) {
    // No folder open → auto-create project folder and continue to build immediately.
    // [DEAD] Was: complex branching with wizards, placement checks, and mode gates.
    // Users expect: type a request → get a result. No extra dialogs.
    try {
      const created = await autoCreateProject(task, deps);
      root = created.dir;
      autoCreatedProject = true;
      deps.blueprintContext = created.blueprintContext;
    } catch (e) {
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      deps.conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
      deps.refresh();
      return;
    }
  }

  // ── Complexity-based routing (nano/standard/deep) ──
  // Direct mode: skip complexity routing — execute immediately for speed
  if (!skipComplex && deps.buildMode !== 'direct') {
    const orchDeps: OrchestratorDeps = {
      redivivus: deps.redivivus,
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
    if (handled) {
      // [FIX] set-status:ready is posted in the try/finally below only when orchestrator returns false.
      // When it returns true (handles the build itself) that finally is never entered -- spinner hangs.
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      return;
    }
  }

  const ctx: BuildContext = {
    task,
    root,
    blueprintContext: deps.blueprintContext,
    vault: deps.vault,
    redivivus: deps.redivivus,
    routing: deps.routing,
    conversation: deps.conversation,
    refresh: deps.refresh,
    logError: deps.logError,
    postToWebview: deps.postToWebview,
    usageTracker: deps.usageTracker,
    onClarifySubmit: undefined,
    precomputedVaultSearch,
    isFix: isFixRequest,
    buildMode: deps.buildMode,
    onBuildFinished: (t: string, builtFiles?: string[]) => {
      // [Redivivus] Only call resolveFix for actual fix requests, not fresh builds
      if (isFixRequest) {
        vscode.commands.executeCommand('redivivus.resolveFix', t, builtFiles);
      }
      const { ChatPanel } = require('../../ui/panels/chat/chatPanel.js');
      ChatPanel.onBuildFinished?.(t, builtFiles || [], root);
    },
    onBuildFailed: (t: string, reason: string) => {
      vscode.commands.executeCommand('redivivus.buildFailed', t, reason);
    },
    contract: emptyContract(),
  };
  deps.setActiveBuildCtx(ctx);
  // Clarify step: before single/multi routing so both paths get user preferences
  const clarify = await runBuildClarifyStep(task, ctx, isFixRequest, skipComplex);
  if (clarify.cancelled) { return; }
  try {
    if (await isChunkedBuildRequest(task, ctx.routing)) {
      await runChunkedBuild(task, ctx);
    } else {
      await runSingleFileBuild(ctx);
    }
  } catch (err) {
    // [WARN] Without this catch, any throw inside runSingleFileBuild (e.g. surgical-edit parse failure)
    // leaves the user with a frozen "Review complete — writing..." bubble and no error feedback.
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Redivivus] Build failed:', err);
    ctx.conversation.push({ role: 'assistant', content: `❌ **Build failed:** ${msg}\n\n_Try rephrasing your request, or ask the AI to rewrite the full file instead of using surgical edits._`, timestamp: Date.now() });
    ctx.refresh();
  } finally {
    deps.setActiveBuildCtx(undefined);
    deps.postToWebview({ type: 'set-status', status: 'ready' });
  }
  if (root) { 
    import('../../services/blueprint/blueprintRevisionService.js').then(m => m.tryBlueprintRevision(root!, deps.redivivus, deps.routing)).catch(() => {}); 
    
    // [Redivivus] Auto-update the project map in the background after complex chunked builds
    // Only runs for chunked builds to keep fast direct edits snappy
    if (await isChunkedBuildRequest(task, ctx.routing)) {
      import('../../ui/panels/analyzer/analyzerService.js').then(m => {
        const analyzer = new m.AnalyzerService(deps.redivivus);
        analyzer.updateProjectMapOnly(root!);
      }).catch(e => console.error('Failed to auto-update project map', e));
    }
  }
  // [DEAD] Was: auto-open here — moved to extensionInlineCommands.ts onBuildFinished callback
  // which now receives buildRoot directly and handles both first-folder and add-to-workspace cases.
}

/** Handles edit-request messages — edits an existing file in-place for TODO/scope fixes. */
export { handleEditRequest } from '../../ui/panels/chat/chatPanelEditHandler';
