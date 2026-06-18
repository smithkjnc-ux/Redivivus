// [SCOPE] Chat Panel Build Runner — thin client entry point. Collects context and delegates to cloud.
// All build logic lives at /api/v1/build. No account token = no build.

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { TOK_OPEN_WORKSPACE, TOK_OPEN_WORKSPACE_END, TOK_PREVIEW_BROWSER, TOK_PREVIEW_BROWSER_END, TOK_RUN_PROJECT, TOK_RUN_PROJECT_END, DELIM } from '../../ui/panels/chat/chatPanelTokens';
import type { BuildRequestDeps } from '../ai/chatPanelIntent';
import type { VaultSearchResult } from '../../services/vault/buildFromVaultSearch';
import { isValidBuildRoot } from './chatPanelBuildUtils';
import { autoCreateProject } from './chatPanelBuildAutoCreate';
import { callCloudBuild } from '../../services/build/cloudBuildClient.js';
import { getAccountToken } from '../../services/api/apiClient.js';
import { getCommunityGotchas, fetchCommunityGotchas } from '../../services/api/apiClientKnowledge.js';
import { appendBuildLog } from '../../services/build/buildLogger.js';
import { buildBreakdownToken, cleanBuildNarration } from './chatPanelBuildBreakdown.js';
import { BuildActivityPanel } from '../../ui/panels/buildActivity/buildActivityPanel.js';

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

  // [PARADOX GUARD] Refuse to build on a protected folder (Redivivus's own source). Even if the active
  // project is somehow Redivivus itself, the tool must never modify its own running source.
  if (root) {
    const { isProtectedProject } = await import('../project/activeProjectWatcher.js');
    if (isProtectedProject(root)) {
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      deps.conversation.push({ role: 'assistant', content: `🛡️ **\`${path.basename(root)}\` is protected** — it's Redivivus's own source. Building/fixing here is disabled so Redivivus never modifies itself. Work on it in a separate editor.`, timestamp: Date.now() });
      deps.refresh();
      return;
    }
  }

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
      const { RedivivusService } = await import('../../services/redivivusService.js');
      deps.redivivus = new RedivivusService(root);
      
      autoCreated = true;
    } catch (e) {
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      deps.conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
      deps.refresh();
      return;
    }
  }
  // [FIX] Show the project in the Redivivus "Project Files" tree (read from disk) instead of adding it
  // to the VS Code workspace. The native Explorer requires a workspace folder, and adding the first
  // folder to an empty window ALWAYS reloads the extension host (killing the in-flight build and racing
  // duplicate panels). The custom tree needs no workspace folder, so there is NO reload — it populates
  // live as the build writes files. The build continues in-process below. The result card still offers
  // an "Open Project in Explorer" button for users who want the native Explorer (accepts one reload).
  const _wsfNow = vscode.workspace.workspaceFolders ?? [];
  const _rootInWs = !!root && _wsfNow.some(f => path.resolve(f.uri.fsPath) === path.resolve(root!));
  if (root && !_rootInWs) {
    try {
      const PFP = require('../../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider;
      PFP.instance?.setRoot(root);
      PFP.instance?.startLiveRefresh();
      // Reveal the Project Files tree so the user watches the skeleton + files appear.
      vscode.commands.executeCommand('redivivusProjectFiles.focus').then(undefined, () => {});
    } catch (e) {
      console.warn('[Redivivus] Could not populate Project Files tree:', e);
    }
  } else if (root && _rootInWs) {
    // Folder is already an open workspace folder — the native Explorer shows it live. Just focus it.
    vscode.commands.executeCommand('workbench.view.explorer').then(undefined, () => {});
  }

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

  // [FIX] Tell the Supervisor to produce a complete implementation contract for the Worker,
  // not just a problem diagnosis. The Worker executes Supervisor instructions literally —
  // vague instructions produce incomplete code regardless of the Worker's capability.
  // This is general guidance, not task-specific: every Supervisor plan should be explicit enough
  // that any capable model can execute it without guessing.
  const SUPERVISOR_CONTRACT_GUIDANCE = `

SUPERVISOR TO WORKER CONTRACT REQUIREMENT:
Your analysis is the Worker's only instruction set. The Worker executes what you specify — nothing more, nothing less. Structure your output as a complete implementation contract:
- For every function that must exist: name it, state what it calls, state what it returns
- For every rendering concern: explicitly list every entity the draw loop must render
- For every state transition: specify the exact sequence of operations
- Do not describe problems — prescribe solutions with enough precision that a junior developer could implement them without asking a follow-up question
The Worker has no context beyond your instructions. Ambiguity becomes missing code.`;

  const buildTask = await import('../../services/learnedMemoryService.js')
    .then(({ LearnedMemoryService }) => { const nd = new LearnedMemoryService(root).getNeverDoForPrompt(); const cg = getCommunityGotchas(); const extra = [nd, cg].filter(Boolean).join('\n\n'); return extra ? `${task}\n\n${extra}${SUPERVISOR_CONTRACT_GUIDANCE}` : `${task}${SUPERVISOR_CONTRACT_GUIDANCE}`; })
    .catch(() => task);

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
  const onStep = (step: any) => { try { activity?.step(step); } catch {} };
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

    // Build succeeded — replace working indicator with result
    removeWorkingMessage();
    const files = result.files ?? [];
    const fileList = files.map(f => `- \`${f.path}\``).join('\n');
    // [Model A] Don't offer "Open Project in Explorer" when the project is ALREADY inside the open
    // workspace (a subfolder of ~/projects) — it's already visible in the Explorer. Adding it as its own
    // root converted the single ~/projects workspace into a confusing multi-root "Untitled (Workspace)"
    // with the project shown twice. Only offer it when the project is genuinely outside the workspace.
    const _rootInOpenWs = !!root && !!vscode.workspace.workspaceFolders?.some(wf =>
      root === wf.uri.fsPath || root.startsWith(wf.uri.fsPath + path.sep));
    const openWorkspaceToken = files.length > 0 && root && !_rootInOpenWs
      ? `\n${TOK_OPEN_WORKSPACE}${root}${DELIM}${TOK_OPEN_WORKSPACE_END}`
      : '';
    // [FIX] Skip scaffold placeholder index.html (content is just the filename text).
    // Prefer the largest HTML file — scaffold stubs are tiny, built files are substantial.
    const htmlFiles = files.filter(f => f.path.endsWith('.html'));
    const htmlFile = htmlFiles.length > 1
      ? htmlFiles.reduce((best, f) => {
          try { const sz = require('fs').statSync(path.join(root, f.path)).size; const bsz = require('fs').statSync(path.join(root, best.path)).size; return sz > bsz ? f : best; } catch { return best; }
        })
      : htmlFiles[0];
    const previewToken = htmlFile
      ? `\n${TOK_PREVIEW_BROWSER}${path.join(root, htmlFile.path)}${DELIM}${TOK_PREVIEW_BROWSER_END}`
      : '';
    // Show Run button for non-HTML projects (HTML already has Preview in Browser)
    const { detectRunCommand } = await import('../../services/build/runtimeRunner.js');
    const runCmd = !htmlFile && root ? detectRunCommand(root) : null;
    const runToken = runCmd ? `\n${TOK_RUN_PROJECT}${root}${DELIM}${TOK_RUN_PROJECT_END}` : '';

    // [FIX] Build an honest two-phase byline (Supervisor + Worker) from the real attribution instead
    // of a hardcoded "solo / primary builder" row — that hardcoding is why Claude never appeared.
    const modelLabel = result.model ?? 'AI';
    const tokens = (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
    const breakdownToken = buildBreakdownToken(result, modelLabel, tokens);
    const narration = cleanBuildNarration(result.narration);
    const modelLine = result.modelRationale ? `\n\n🧠 ${result.modelRationale}` : '';
    const elapsedMs = Date.now() - workingTs;
    const elapsedStr = elapsedMs < 60000
      ? `${Math.round(elapsedMs / 1000)}s`
      : `${Math.floor(elapsedMs / 60000)}m ${Math.round((elapsedMs % 60000) / 1000)}s`;

    deps.conversation.push({
      role: 'assistant',
      content: `__RESULT_CARD__\n✅ Done! Built ${files.length} file${files.length !== 1 ? 's' : ''} in ${elapsedStr}\n\n${fileList}${narration}${modelLine}${result.captureCount ? `\nSaved to vault: ${result.captureCount} new piece${result.captureCount !== 1 ? 's' : ''}` : ''}\n__END_RESULT_CARD__${openWorkspaceToken}${previewToken}${runToken}${breakdownToken}`,
      timestamp: Date.now(),
    });
    deps.refresh();

    // Security scan on built files — fire-and-forget, never blocks
    if (root) {
      import('../../services/build/securityScanner.js').then(({ scanProject, formatSecurityReport }) => {
        const findings = scanProject(root!);
        const report = formatSecurityReport(findings, root!);
        if (report) { deps.conversation.push({ role: 'assistant', content: report, timestamp: Date.now() }); deps.refresh(); }
      }).catch(() => {});
    }

    if (isFixRequest) {
      vscode.commands.executeCommand('redivivus.resolveFix', task, files.map(f => path.join(root!, f.path)));
    }
  } finally {
    // Mark the activity panel finished exactly once, with the real outcome (false if the build threw).
    try { activity?.finish(buildOk ?? false); } catch {}
    deps.setActiveBuildCtx(undefined);
    deps.postToWebview({ type: 'set-status', status: 'ready' });
    // Stop the live poll and do a final render so the Project Files tree shows the completed file set.
    try { require('../../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider.instance?.stopLiveRefresh(); } catch {}
  }
}

/** Handles edit-request messages — edits an existing file in-place for TODO/scope fixes. */
export { handleEditRequest } from '../../ui/panels/chat/chatPanelEditHandler';
