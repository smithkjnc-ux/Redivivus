// [SCOPE] Redivivus Chat Panel Chunked Finalize — handles post-loop teardown, UI rendering, and vault capture
import * as vscode from 'vscode';
import * as path from 'path';
import type { BuildContext } from './chatPanelBuild';
import { encodeStoryToken, buildResultCard } from './buildOutput.js';
import { buildPostBuildGuidance } from './chatPanelPostBuild';
import { generateDocs } from '../../ui/panels/chat/chatPanelDocs';
import { autoCaptureFiles } from '../../services/vault/vaultAutoCapture';
import { BuildHistoryService, makeBuildHistoryEntry } from '../../services/build/buildHistoryService';
import { tracer } from '../../services/pipelineTracer';
import { writeProjectRoadmapEntry } from '../routing/chatPanelMsgFixUtils';
import { autoCommitIfEnabled } from '../../services/gitAutoCommitService';
import { refreshSetupProgressIfOpen } from '../../services/project/setupProgressPanel';
import { runCompileAutoFix } from '../../services/build/compileAutoFix';
import { runTestAutoFix } from '../../services/build/testAutoFix';
import { runAutoFix } from '../../services/build/runAutoFix';
import { scanProject, formatSecurityReport } from '../../services/build/securityScanner';
import type { VaultService } from '../../services/vault/vaultService';
import type { BuildLedger } from '../../services/build/buildLedgerService';

export async function runChunkedBuildFinalize(
  ctx: BuildContext, task: string, builtFiles: string[], totalTokens: number, totalCost: number, elapsed: number, snapshotId: string | undefined, ledger: BuildLedger, storyLines: string[], storyMsgIndex: number, supervisorLabel: string, worker: string | null, filePlan: any[], blueprintContext: string
): Promise<void> {
  const { root, routing, vault, conversation } = ctx;
  const projectName = ctx.redivivus?.loadConfig?.()?.projectName || 'Unknown';
  const absPaths = builtFiles.map(f => path.join(root, f));
  const _callAI = (p: string) => routing.prompt(p, 12_000);
  const capture = vault ? await autoCaptureFiles(absPaths, projectName, vault as VaultService, task, _callAI) : { newItems: 0, skippedDupes: 0, totalExtracted: 0, failed: false, savedNames: [] };
  // Fire-and-forget cloud sync after every successful capture — keeps cloud vault current
  if (vault && capture.newItems > 0) {
    import('../../services/vault/vaultCloudSync.js').then(({ syncVaultToCloud }) => {
      syncVaultToCloud(vault as VaultService).catch(() => {});
    }).catch(() => {});
  }

  ctx.conversation[storyMsgIndex].content = '__STORY_DONE__' + encodeStoryToken(storyLines).slice('__STORY__'.length);
  ctx.refresh();

  const ledgerSummary = ledger.hasData() ? ledger.getSummary() : undefined;
  const resultCard = buildResultCard(builtFiles, 0, totalTokens, totalCost, elapsed, snapshotId, capture, false, ledgerSummary);
  const htmlFile = builtFiles.find(f => f.endsWith('.html'));
  const previewToken = htmlFile ? `\n__PREVIEW_BROWSER__${path.join(root, htmlFile)}|||END_PREVIEW_BROWSER__` : '';
  // Open Workspace button — show if this project isn't already open in the explorer
  const currentRoots = (vscode.workspace.workspaceFolders ?? []).map(f => path.resolve(f.uri.fsPath));
  const openWorkspaceToken = root && !currentRoots.includes(path.resolve(root)) ? `\n__OPEN_WORKSPACE__${root}|||END_OPEN__` : '';
  // Run Project button — show for non-HTML projects
  let runToken = '';
  if (!htmlFile && root) {
    try { const { detectRunCommand } = await import('../../services/build/runtimeRunner.js'); if (detectRunCommand(root)) { runToken = `\n__RUN_PROJECT__${root}|||END_RUN__`; } } catch { /* non-blocking */ }
  }
  // Edit Visually button — show if HTML or CSS files were built
  const hasVisual = builtFiles.some(f => /\.(html|css)$/i.test(f));
  const editVisuallyToken = (hasVisual && root) ? `\n__EDIT_VISUALLY__${root}|||END_EDIT_VISUALLY__` : '';
  const nextSteps = buildPostBuildGuidance(root, builtFiles);

  ctx.conversation.push({ role: 'assistant', content: `${resultCard}${openWorkspaceToken}${previewToken}${runToken}${editVisuallyToken}${nextSteps}`, timestamp: Date.now(), tokens: totalTokens, cost: totalCost });
  ctx.refresh();

  tracer.vault('save', `${builtFiles.length} files saved to vault`);
  tracer.end(builtFiles, totalTokens, totalCost);
  if (!ctx.assistMode) { writeProjectRoadmapEntry(root, `AI build: ${task.slice(0, 60)}`, builtFiles.map(f=>`Built \`${f}\``).concat([`Supervisor: ${supervisorLabel} Tokens: ~${totalTokens} Cost: $${totalCost.toFixed(4)}`])); }
  if (ctx.onBuildFinished) { ctx.onBuildFinished(task, builtFiles); }
  if (!ctx.assistMode) { await autoCommitIfEnabled(root, `Redivivus added ${builtFiles.length} files: ${task.slice(0, 60)}`, builtFiles); }
  // Auto-open project in Explorer — no button required
  const _wsf = vscode.workspace.workspaceFolders ?? [];
  const _normRoot = path.resolve(root).toLowerCase();
  if (!_wsf.some(f => path.resolve(f.uri.fsPath).toLowerCase() === _normRoot)) {
    if (_wsf.length > 0) {
      vscode.workspace.updateWorkspaceFolders(_wsf.length, null, { uri: vscode.Uri.file(root) });
      // Update the custom Project Files tree to the newly built project
      try { const PFP = require('../../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider; PFP.instance?.setRoot(root); PFP.instance?.startLiveRefresh(); vscode.commands.executeCommand('redivivusProjectFiles.focus').then(undefined, () => {}); } catch {}
      vscode.commands.executeCommand('workbench.view.explorer').then(() => { vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer'); }, () => {});
    } else {
      try { const CP = require('../../ui/panels/chat/chatPanel.js').ChatPanel; if (CP?.extensionContext) { CP.extensionContext.globalState.update('redivivus.pendingRescueConversation', ctx.conversation); } } catch {}
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: false });
    }
  }
  refreshSetupProgressIfOpen().catch(() => {});

  try { new BuildHistoryService(root).record(makeBuildHistoryEntry({ snapshotId: snapshotId || Date.now().toString(), task, files: builtFiles, tokensUsed: totalTokens, costUSD: totalCost, source: 'ai', supervisor: 'gemini', worker: worker || null, resultCardToken: resultCard })); } catch { /* never block */ }

  await runCompileAutoFix(ctx, builtFiles).catch(() => {});
  await runTestAutoFix(ctx, builtFiles).catch(() => {});
  await runAutoFix(ctx, builtFiles).catch(() => {});

  // Security scan — runs after every build, reports findings without blocking
  try {
    const findings = scanProject(root);
    const report = formatSecurityReport(findings, root);
    if (report) { ctx.conversation.push({ role: 'assistant', content: report, timestamp: Date.now() }); ctx.refresh(); }
  } catch { /* never block the build pipeline */ }
  generateDocs(root, task, blueprintContext, filePlan, routing)
    .then(docPath => { if (docPath.endsWith('.md')) { conversation.push({ role: 'assistant', content: `📖 Documentation written to \`${docPath}\``, timestamp: Date.now() }); ctx.refresh(); } }).catch(() => {});
}
