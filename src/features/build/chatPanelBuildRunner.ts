// [SCOPE] Chat Panel Build Runner — thin client entry point. Collects context and delegates to cloud.
// All build logic lives at /api/v1/build. No account token = no build.

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { TOK_OPEN_WORKSPACE, TOK_OPEN_WORKSPACE_END, TOK_PREVIEW_BROWSER, TOK_PREVIEW_BROWSER_END, TOK_RUN_PROJECT, TOK_RUN_PROJECT_END, DELIM } from '../chat/ui/chatPanelTokens.js';
import type { BuildRequestDeps } from '../../features/ai/logic/chatPanelIntent.js';
import type { VaultSearchResult } from '../vault/data/buildFromVaultSearch.js';
import { isValidBuildRoot } from './chatPanelBuildUtils.js';
import { autoCreateProject } from './chatPanelBuildAutoCreate.js';
import { callCloudBuild } from './services/cloudBuildClient.js';
import { getAccountToken } from '../../features/api/data/apiClient.js';
import { fetchCommunityGotchas } from '../../features/api/data/apiClientKnowledge.js';
import { appendBuildLog } from './services/buildLogger.js';
import { BuildActivityPanel } from '../chat/ui/buildActivity/buildActivityPanel.js';
import { checkParadoxGuard, setupProjectFilesTree, assembleBuildTask, handleBuildSuccess } from './chatPanelBuildRunnerHelpers.js';

function isProjectsContainer(root: string): boolean {
  const cfg = vscode.workspace.getConfiguration('redivivus').get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());
  return path.resolve(root) === path.resolve(cfg);
}

function getLiveRoot(deps: BuildRequestDeps): string | undefined {
  const liveRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (isValidBuildRoot(liveRoot) && !isProjectsContainer(liveRoot)) { return liveRoot; }
  // [FIX] Fall back to redivivus service root even when no VS Code workspace folder is open.
  // resumeBuildTask sets panel.redivivus to the new project root before calling _handleBuildRequest,
  // so this catches the case where the folder exists but hasn't been added to the workspace yet.
  const redivivusRoot = deps.redivivus?.getWorkspaceRoot?.();
  if (isValidBuildRoot(redivivusRoot) && !isProjectsContainer(redivivusRoot)) { return redivivusRoot; }
  return undefined;
}

export async function runBuildAfterGates(
  task: string,
  deps: BuildRequestDeps,
  _skipComplex: boolean,
  isFixRequest: boolean,
  _precomputedVaultSearch: VaultSearchResult | undefined,
): Promise<void> {
  deps.postToWebview({ type: 'set-status', status: 'working' });

  let root = getLiveRoot(deps);
  let autoCreated = false;

  // [DONE] PARADOX GUARD moved to chatPanelBuildRunnerHelpers.ts (Rule 9 split)
  if (root && await checkParadoxGuard(root, deps)) { return; }

  // No project open — auto-create a folder
  if (!root) {
    // [FIX] autoCreateProject makes AI calls (blueprint extract + name derivation) BEFORE the build's
    // working bubble appears. Show feedback so the gap never looks like a freeze. (The AI calls now have
    // hard timeouts + failover, so a slow/stalled provider can't hang here either.)
    deps.conversation.push({ role: 'assistant', content: '📁 Setting up your project...', timestamp: Date.now() });
    deps.refresh();
    try {
      const created = await autoCreateProject(task, deps);
      root = created.dir;
      deps.blueprintContext = created.blueprintContext;
      
      // [FIX] Update the Redivivus service to point to the newly created project
      // so downstream systems (like the Living Blueprint distiller) save to the right config
      const { RedivivusService } = await import('../../features/vscode/logic/redivivusService.js');
      deps.redivivus = new RedivivusService(root);
      
      autoCreated = true;
    } catch (e) {
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      deps.conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
      deps.refresh();
      return;
    }
  }
  // [DONE] Project Files tree setup moved to chatPanelBuildRunnerHelpers.ts (Rule 9 split)
  if (root) { setupProjectFilesTree(root); }

  // Show which files are being read before building starts
  const existingFileList = (() => {
    try {
      const common = ['index.html','index.ts','src/index.ts','src/App.tsx','main.py','app.py'];
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');
      return common.filter(f => fs.existsSync(path.join(root, f)))
        .map(f => { const lines = fs.readFileSync(path.join(root, f), 'utf-8').split('\n').length; return `\`${f}\` (${lines} lines)`; });
    } catch { return []; }
  })();
  const hasBlueprint = !!deps.blueprintContext || !!deps.redivivus?.loadConfig?.()?.blueprint;
  const fileMsg = existingFileList.length > 0
    ? `📂 Reading ${hasBlueprint ? 'Blueprint and ' : ''}${existingFileList.join(', ')} — reviewing current state...`
    : `⚙️ Building...`;

  // Show working indicator — tag with __BUILD_WORKING__ so we can find it precisely on completion
  const workingTs = Date.now();
  deps.conversation.push({ role: 'assistant', content: `${fileMsg} __BUILD_WORKING__`, timestamp: workingTs });
  deps.refresh();

  const updateProgress = (msg: string) => {
    const idx = deps.conversation.findIndex(m => m.timestamp === workingTs && m.role === 'assistant');
    if (idx >= 0) { deps.conversation[idx] = { ...deps.conversation[idx], content: `⚙️ ${msg} __BUILD_WORKING__` }; deps.refresh(); }
  };

  const removeWorkingMessage = () => {
    const idx = deps.conversation.findIndex(m => m.timestamp === workingTs && m.role === 'assistant');
    if (idx >= 0) deps.conversation.splice(idx, 1);
  };

  fetchCommunityGotchas().catch(() => {}); // warm cache; sync result used this build

  // [DONE] Build task assembly moved to chatPanelBuildRunnerHelpers.ts (Rule 9 split)
  const buildTask = await assembleBuildTask(task, root!);

  let streamAccum = '';
  const onChunk = (chunk: string) => {
    streamAccum += chunk;
    const idx = deps.conversation.findIndex(m => m.timestamp === workingTs && m.role === 'assistant');
    if (idx >= 0) { deps.conversation[idx] = { ...deps.conversation[idx], content: `⚙️ Building... __BUILD_WORKING__\n\`\`\`\n${streamAccum}\n\`\`\`` }; deps.refresh(); }
  };

  // Live Build Activity panel — opens beside the chat so the user can WATCH the pipeline (supervisor ->
  // worker -> continuations -> failover -> guardian) instead of just the bubble. Failures are non-fatal.
  let activity: BuildActivityPanel | undefined;
  try { activity = BuildActivityPanel.start(task); } catch { /* panel optional — never block a build */ }
  const { describeProviderError } = require('../ai/data/agentFailoverReason.js');
  const onStep = (step: any) => {
    try {
      // [FIX] Backend failover steps carry raw JSON error blobs (e.g. "400 {\"type\":\"error\"...").
      // Replace the truncated/raw label with a clean human reason so the user sees "out of API credits"
      // instead of an unreadable JSON snippet.
      if (step && step.status === 'failover' && step.label) {
        const cleanReason = describeProviderError(step.label);
        step = { ...step, label: `${step.label.split(' ')[0] || 'Provider'} unavailable — ${cleanReason}` };
      }
      activity?.step(step);
    } catch {}
  };
  const onCode = (text: string) => { try { activity?.code(text); } catch {} };

  // [FIX] Removed injecting file code into the chat bubble since the user watches the Build Activity Panel.
  // Leaving the working message untouched prevents redundant code dumps in the chat UI.
  const onFileComplete = (filePath: string, content: string) => {
    // No-op: do not show code in the chat bubble during multi-file builds
  };


  let buildOk: boolean | undefined;

  try {
    const result = await callCloudBuild(buildTask, root, deps, { isFix: isFixRequest, onProgress: updateProgress, onChunk, onStep, onCode, onFileComplete });
    buildOk = !!result.success;

    if (!result.success) {
      if (result.error === 'NOT_AUTHENTICATED') {
        removeWorkingMessage();
        deps.conversation.push({
          role: 'assistant',
          content: '🔒 **Session expired — please sign in again.**\n\nRun **Redivivus: Sign In** from the command palette.',
          timestamp: Date.now(),
        });
        deps.refresh();
        return;
      }
      appendBuildLog(root, {
        timestamp: new Date().toISOString(),
        task,
        project: path.basename(root),
        source: result.failureSource ?? 'cloud',
        files: [],
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        error: result.error,
      });
      removeWorkingMessage();
      deps.conversation.push({
        role: 'assistant',
        content: `❌ **Build failed:** ${result.error}\n\n_Try rephrasing your request._`,
        timestamp: Date.now(),
      });
      deps.refresh();
      return;
    }

    // [DONE] Build success handling moved to chatPanelBuildRunnerHelpers.ts (Rule 9 split)
    await handleBuildSuccess(result, root!, task, workingTs, deps, isFixRequest);
  } finally {
    // Mark the activity panel finished exactly once, with the real outcome (false if the build threw).
    try { activity?.finish(buildOk ?? false); } catch {}
    deps.setActiveBuildCtx(undefined);
    deps.postToWebview({ type: 'set-status', status: 'ready' });
    // Stop the live poll and do a final render so the Project Files tree shows the completed file set.
    try { require('../../sidebar/projectFilesProvider.js').ProjectFilesProvider.instance?.stopLiveRefresh(); } catch {}
  }
}

/** Handles edit-request messages — edits an existing file in-place for TODO/scope fixes. */
export { handleEditRequest } from '../chat/ui/chatPanelEditHandler.js';
