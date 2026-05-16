// [SCOPE] Chat Panel Build Runner — executes build after all gates pass (vault/placement/cost)
// Extracted from chatPanelIntent.ts. Called by handleBuildRequest.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BuildRequestDeps, _pendingPlacements } from './chatPanelIntent.js';
import { BuildContext, runSingleFileBuild, runChunkedBuild, isChunkedBuildRequest } from './chatPanelBuild.js';
import { handleComplexityRoutedBuild, OrchestratorDeps } from './chatPanelOrchestrator.js';
import { extractBlueprintFromPrompt } from '../../services/blueprint/blueprintExtractor.js';
import { VaultSearchResult } from '../../services/vault/buildFromVaultSearch.js';
import { isValidBuildRoot } from './chatPanelBuildUtils.js';
import { deriveFileBase } from './chatPanelBuildInference.js';

// [WARN] Always use LIVE workspace folder — chassis service root can be stale from activation
// [WARN] ~/projects itself may be open as workspace — must reject it as a build root or files land in the container
function isProjectsContainer(root: string): boolean {
  const cfg = vscode.workspace.getConfiguration('chassis').get<string>('projectsDirectory', '~/projects').replace('~', os.homedir());
  return path.resolve(root) === path.resolve(cfg);
}

function getLiveRoot(deps: BuildRequestDeps): string | undefined {
  const liveRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (isValidBuildRoot(liveRoot) && !isProjectsContainer(liveRoot)) { return liveRoot; }
  // Fall back to chassis root ONLY if it differs from a generic projects container
  const chassisRoot = deps.chassis?.getWorkspaceRoot?.();
  if (isValidBuildRoot(chassisRoot) && chassisRoot !== liveRoot && !isProjectsContainer(chassisRoot)) { return chassisRoot; }
  return undefined;
}

// Auto-creates a named project folder with minimal CHASSIS structure for "Just Build" with no folder open
async function autoCreateProject(task: string, deps: BuildRequestDeps): Promise<string> {
  const slug = await deriveFileBase(task, deps.routing);
  const projectsDir = vscode.workspace.getConfiguration('chassis').get<string>('projectsDirectory', '~/projects').replace('~', os.homedir());
  const projectDir = path.join(projectsDir, slug);
  fs.mkdirSync(path.join(projectDir, '.chassis'), { recursive: true });
  const config = { projectName: slug, initialized: true, blueprint: { what: task.slice(0, 200) } };
  fs.writeFileSync(path.join(projectDir, '.chassis', 'config.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(projectDir, '.chassis', 'blueprint.md'), `# ${slug}\n\n**What:** ${task}\n`);
  return projectDir;
}

export async function runBuildAfterGates(
  task: string,
  deps: BuildRequestDeps,
  skipComplex: boolean,
  isFixRequest: boolean,
  precomputedVaultSearch: VaultSearchResult | undefined,
): Promise<void> {
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
    // Just Build + no folder → auto-create named project folder, continue to build
    if (deps.buildMode === 'direct' && !skipComplex) {
      try {
        root = await autoCreateProject(task, deps);
        autoCreatedProject = true;
        // root is now set — fall through to build below
      } catch (e) {
        deps.postToWebview({ type: 'set-status', status: 'ready' });
        deps.conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
        deps.refresh();
        return;
      }
    // No folder + simple unit → vault wizard
    } else if (isSimpleUnit && !skipComplex) {
      deps.setPendingTask(task);
      const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
      deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: os.homedir() + '/projects', prefillTask: task, compact: true, vaultOnly: true, prefillAnswers });
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      return;
    // No folder + confirmed from wizard → show full wizard to pick folder
    } else if (skipComplex) {
      deps.setPendingTask(task);
      const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
      deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: os.homedir() + '/projects', prefillTask: task, compact: false, prefillAnswers });
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      return;
    // No folder + plan mode → placement check
    } else {
      const placementId = `placement-${Date.now()}`;
      const noFolderChoice = await new Promise<'here' | 'new-project' | 'cancel'>((resolve) => {
        _pendingPlacements.set(placementId, resolve);
        deps.postToWebview({ type: 'show-placement-check', placementId, noProject: true });
        setTimeout(() => { if (_pendingPlacements.has(placementId)) { _pendingPlacements.delete(placementId); resolve('cancel'); } }, 5 * 60 * 1000);
      });
      if (noFolderChoice === 'new-project') {
        deps.setPendingTask(task);
        const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
        deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: os.homedir() + '/projects', prefillTask: task, compact: false, prefillAnswers });
      }
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      return;
    }
  }

  // ── Complexity-based routing (nano/standard/deep) ──
  // Direct mode: skip complexity routing — execute immediately for speed
  if (!skipComplex && deps.buildMode !== 'direct') {
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
    buildMode: deps.buildMode,
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
    if (await isChunkedBuildRequest(task, ctx.routing)) {
      await runChunkedBuild(task, ctx);
    } else {
      await runSingleFileBuild(ctx);
    }
  } finally {
    deps.setActiveBuildCtx(undefined);
    deps.postToWebview({ type: 'set-status', status: 'ready' });
  }

  // [CHASSIS] After auto-create build: prompt user to open the new project folder in the Explorer
  if (autoCreatedProject && root) {
    const projectName = path.basename(root);
    const choice = await vscode.window.showInformationMessage(
      `Project "${projectName}" built with CHASSIS structure. Open it in the Explorer?`,
      'Open Folder'
    );
    if (choice === 'Open Folder') {
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root));
    }
  }
}

/** Handles edit-request messages — edits an existing file in-place for TODO/scope fixes. */
export { handleEditRequest } from './chatPanelEditHandler.js';
