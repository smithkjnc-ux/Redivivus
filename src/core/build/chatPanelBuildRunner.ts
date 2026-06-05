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

  // No project open — auto-create a folder
  if (!root) {
    try {
      const created = await autoCreateProject(task, deps);
      root = created.dir;
      deps.blueprintContext = created.blueprintContext;
      autoCreated = true;
    } catch (e) {
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      deps.conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
      deps.refresh();
      return;
    }
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
  const fileMsg = existingFileList.length > 0
    ? `📂 Reading ${existingFileList.join(', ')} — reviewing current state...`
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

  try {
    const result = await callCloudBuild(buildTask, root, deps, { isFix: isFixRequest, onProgress: updateProgress, onChunk });

    if (!result.success) {
      if (result.error === 'NOT_AUTHENTICATED') {
        removeWorkingMessage();
        deps.conversation.push({
          role: 'assistant',
          content: '🔒 **Session expired — please sign in again.**\n\nRun **Redivivus: Sign In** from the command palette.',
          timestamp: Date.now(),
        });
        deps.refresh();
        vscode.commands.executeCommand('redivivus.signIn');
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
    const openWorkspaceToken = files.length > 0 && root && !vscode.workspace.workspaceFolders?.some(wf => wf.uri.fsPath === root)
      ? `\n${TOK_OPEN_WORKSPACE}${root}${DELIM}${TOK_OPEN_WORKSPACE_END}`
      : '';
    const htmlFile = files.find(f => f.path.endsWith('.html'));
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

    deps.conversation.push({
      role: 'assistant',
      content: `__RESULT_CARD__\n✅ Done! Built ${files.length} file${files.length !== 1 ? 's' : ''}\n\n${fileList}${narration}${result.captureCount ? `\nSaved to vault: ${result.captureCount} new piece${result.captureCount !== 1 ? 's' : ''}` : ''}\n__END_RESULT_CARD__${openWorkspaceToken}${previewToken}${runToken}${breakdownToken}`,
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

    // Auto-open the project in Explorer after the result card renders.
    const _wsf = vscode.workspace.workspaceFolders ?? [];
    const _inWs = _wsf.some(wf => path.resolve(wf.uri.fsPath) === path.resolve(root!));
    if (!_inWs) {
      if (_wsf.length > 0) {
        // Workspace already open — add folder without restarting the extension host
        vscode.workspace.updateWorkspaceFolders(_wsf.length, null, { uri: vscode.Uri.file(root!) });
        vscode.commands.executeCommand('workbench.view.explorer').then(undefined, () => {});
      } else {
        // No workspace — openFolder restarts the extension host. Save conversation first so it survives.
        setTimeout(() => {
          try {
            const CP = require('../../ui/panels/chat/chatPanel.js').ChatPanel;
            if (CP?.extensionContext) {
              CP.extensionContext.globalState.update('redivivus.pendingRescueConversation', deps.conversation);
              CP.extensionContext.globalState.update('redivivus.pendingBuildComplete', true);
            }
          } catch {}
          vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root!), { forceNewWindow: false });
        }, 500);
      }
    }

    if (isFixRequest) {
      vscode.commands.executeCommand('redivivus.resolveFix', task, files.map(f => path.join(root!, f.path)));
    }
  } finally {
    deps.setActiveBuildCtx(undefined);
    deps.postToWebview({ type: 'set-status', status: 'ready' });
  }
}

/** Handles edit-request messages — edits an existing file in-place for TODO/scope fixes. */
export { handleEditRequest } from '../../ui/panels/chat/chatPanelEditHandler';
