// [SCOPE] Helper functions for chatPanelBuildRunner.ts (Rule 9 split).
// Contains: paradox guard, project file tree setup, build task assembly, success result card.

import * as vscode from 'vscode';
import * as path from 'path';
import { TOK_OPEN_WORKSPACE, TOK_OPEN_WORKSPACE_END, TOK_PREVIEW_BROWSER, TOK_PREVIEW_BROWSER_END, TOK_RUN_PROJECT, TOK_RUN_PROJECT_END, DELIM } from '../../ui/panels/chat/chatPanelTokens';
import type { BuildRequestDeps } from '../ai/chatPanelIntent';
import type { CloudBuildResult } from '../../services/build/cloudBuildTypes.js';
import { getCommunityGotchas } from '../../services/api/apiClientKnowledge.js';
import { buildBreakdownToken, cleanBuildNarration } from './chatPanelBuildBreakdown.js';

/** Refuse to build on a protected project (Redivivus's own source). Returns true if blocked. */
export async function checkParadoxGuard(root: string, deps: BuildRequestDeps): Promise<boolean> {
  const { isProtectedProject } = await import('../project/activeProjectWatcher.js');
  if (isProtectedProject(root)) {
    deps.postToWebview({ type: 'set-status', status: 'ready' });
    deps.conversation.push({ role: 'assistant', content: `🛡️ **\`${path.basename(root)}\` is protected** — it's Redivivus's own source. Building/fixing here is disabled so Redivivus never modifies itself. Work on it in a separate editor.`, timestamp: Date.now() });
    deps.refresh();
    return true;
  }
  return false;
}

/**
 * Show the project in the Redivivus "Project Files" tree, or focus native Explorer if already in workspace.
 * Avoids adding the project as a workspace folder (which reloads the extension host mid-build).
 */
export function setupProjectFilesTree(root: string): void {
  const _wsfNow = vscode.workspace.workspaceFolders ?? [];
  const _rootInWs = _wsfNow.some(f => path.resolve(f.uri.fsPath) === path.resolve(root));
  if (!_rootInWs) {
    try {
      const PFP = require('../../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider;
      PFP.instance?.setRoot(root);
      PFP.instance?.startLiveRefresh();
      vscode.commands.executeCommand('redivivusProjectFiles.focus').then(undefined, () => {});
    } catch (e) { console.warn('[Redivivus] Could not populate Project Files tree:', e); }
  } else {
    vscode.commands.executeCommand('workbench.view.explorer').then(undefined, () => {});
  }
}

const SUPERVISOR_CONTRACT_GUIDANCE = `

SUPERVISOR TO WORKER CONTRACT REQUIREMENT:
Your analysis is the Worker's only instruction set. The Worker executes what you specify — nothing more, nothing less. Structure your output as a complete implementation contract:
- For every function that must exist: name it, state what it calls, state what it returns
- For every rendering concern: explicitly list every entity the draw loop must render
- For every state transition: specify the exact sequence of operations
- Build Systems: If using a frontend framework (e.g. React), you MUST prescribe a complete build system (e.g. package.json, vite.config.js) and place index.html at the project root.
- Do not describe problems — prescribe solutions with enough precision that a junior developer could implement them without asking a follow-up question
The Worker has no context beyond your instructions. Ambiguity becomes missing code.`;

/** Assemble the full build prompt with learned memory (never-do rules) and community gotchas. */
export async function assembleBuildTask(task: string, root: string): Promise<string> {
  return import('../../services/learnedMemoryService.js')
    .then(({ LearnedMemoryService }) => {
      const nd = new LearnedMemoryService(root).getNeverDoForPrompt();
      const cg = getCommunityGotchas();
      const extra = [nd, cg].filter(Boolean).join('\n\n');
      return extra ? `${task}\n\n${extra}${SUPERVISOR_CONTRACT_GUIDANCE}` : `${task}${SUPERVISOR_CONTRACT_GUIDANCE}`;
    })
    .catch(() => task);
}

/** Handle a successful cloud build: replace the working indicator with a result card + trigger side effects. */
export async function handleBuildSuccess(result: CloudBuildResult, root: string, task: string, workingTs: number, deps: BuildRequestDeps, isFixRequest: boolean): Promise<void> {
  const idx = deps.conversation.findIndex(m => m.timestamp === workingTs && m.role === 'assistant');
  if (idx >= 0) { deps.conversation.splice(idx, 1); }

  const files = result.files ?? [];
  const fileList = files.map((f: any) => `- \`${f.path}\``).join('\n');
  const _rootInOpenWs = !!root && !!vscode.workspace.workspaceFolders?.some(wf =>
    root === wf.uri.fsPath || root.startsWith(wf.uri.fsPath + path.sep));
  const openWorkspaceToken = files.length > 0 && root && !_rootInOpenWs
    ? `\n${TOK_OPEN_WORKSPACE}${root}${DELIM}${TOK_OPEN_WORKSPACE_END}` : '';

  const htmlFiles = files.filter((f: any) => f.path.endsWith('.html'));
  const htmlFile = htmlFiles.length > 1
    ? htmlFiles.reduce((best: any, f: any) => {
        try { const sz = require('fs').statSync(path.join(root, f.path)).size; const bsz = require('fs').statSync(path.join(root, best.path)).size; return sz > bsz ? f : best; } catch { return best; }
      })
    : htmlFiles[0];
  const previewToken = htmlFile ? `\n${TOK_PREVIEW_BROWSER}${path.join(root, htmlFile.path)}${DELIM}${TOK_PREVIEW_BROWSER_END}` : '';
  const { detectRunCommand } = await import('../../services/build/runtimeRunner.js');
  const runCmd = !htmlFile && root ? detectRunCommand(root) : null;
  const runToken = runCmd ? `\n${TOK_RUN_PROJECT}${root}${DELIM}${TOK_RUN_PROJECT_END}` : '';
  let readinessToken = '';
  try { readinessToken = (await import('../../services/build/productionReadiness.js')).readinessButtonToken(root!); } catch { /* optional */ }

  const modelLabel = result.model ?? 'AI';
  const tokens = (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
  const breakdownToken = buildBreakdownToken(result, modelLabel, tokens);
  const narration = cleanBuildNarration(result.narration);
  const modelLine = result.modelRationale ? `\n\n🧠 ${result.modelRationale}` : '';
  const elapsedMs = Date.now() - workingTs;
  const elapsedStr = elapsedMs < 60000 ? `${Math.round(elapsedMs / 1000)}s` : `${Math.floor(elapsedMs / 60000)}m ${Math.round((elapsedMs % 60000) / 1000)}s`;

  deps.conversation.push({ role: 'assistant', content: `__RESULT_CARD__\n✅ Done! Built ${files.length} file${files.length !== 1 ? 's' : ''} in ${elapsedStr}\n\n${fileList}${narration}${modelLine}${result.captureCount ? `\nSaved to vault: ${result.captureCount} new piece${result.captureCount !== 1 ? 's' : ''}` : ''}\n__END_RESULT_CARD__${openWorkspaceToken}${previewToken}${runToken}${readinessToken}${breakdownToken}`, timestamp: Date.now() });
  deps.refresh();

  if (root) {
    import('../../services/build/securityScanner.js').then(({ scanProject, formatSecurityReport }) => {
      const findings = scanProject(root!);
      const report = formatSecurityReport(findings, root!);
      if (report) { deps.conversation.push({ role: 'assistant', content: report, timestamp: Date.now() }); deps.refresh(); }
    }).catch(() => {});
  }
  if (isFixRequest) {
    vscode.commands.executeCommand('redivivus.resolveFix', task, files.map((f: any) => path.join(root!, f.path)));
  }
}
