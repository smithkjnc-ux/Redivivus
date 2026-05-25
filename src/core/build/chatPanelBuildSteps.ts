// [SCOPE] Build pipeline step functions — path inference, code review, write, and post-build actions
// Extracted from runSingleFileBuild (was complexity 58) to named, testable units.

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { BuildContext } from './chatPanelBuildHelpers';
import type { RoutingService } from '../../services/ai/routingService';
import * as Inf from './chatPanelBuildInference';
import * as Review from './chatPanelBuildReview';
import * as Worker from './chatPanelBuildWorker';
import * as Writer from './chatPanelBuildWriter';
import { extractNarrator } from '../../ui/panels/chat/chatPanelStory';
import { logFileChange } from '../../services/logging/redivivusLogger';
import { refreshSetupProgressIfOpen } from '../../services/project/setupProgressPanel';
import { autoCommitIfEnabled } from '../../services/gitAutoCommitService';
import { writeProjectRoadmapEntry } from '../routing/chatPanelMsgFixUtils';
import { runCompileAutoFix } from '../../services/build/compileAutoFix';
import { runTestAutoFix } from '../../services/build/testAutoFix';

export interface BuildTarget {
  relPath: string;
  absPath: string;
  existingTarget: string | null;
  isCrossLang: boolean;
  isMod: boolean;
  ext: string;
}

export async function inferBuildTarget(
  task: string,
  root: string,
  blueprintContext: string,
  routing: RoutingService,
): Promise<BuildTarget> {
  const explicitPathMatch = task.match(/(?:called|named|file|path)\s+[`"']?([\w./-]+\.\w{1,5})[`"']?/i)
    || task.match(/\b(src\/[\w./-]+\.\w{1,5})\b/);

  const isMod = explicitPathMatch ? false : await Inf.isModificationRequest(task.toLowerCase(), routing);
  const existingTarget = isMod ? await Inf.findExistingTarget(root, task) : null;
  const ext = Inf.inferExtension(task.toLowerCase(), blueprintContext);
  const fileBase = explicitPathMatch ? '' : await Inf.deriveFileBase(task, routing);
  const isCrossLang = !!existingTarget && path.extname(existingTarget) !== ext;

  let relPath: string;
  if (explicitPathMatch) {
    relPath = explicitPathMatch[1];
  } else {
    relPath = (existingTarget && !isCrossLang)
      ? path.relative(root, existingTarget)
      : (ext === '.html' ? 'index.html' : `src/${fileBase}${ext}`);
  }
  return { relPath, absPath: path.join(root, relPath), existingTarget, isCrossLang, isMod, ext };
}

export async function runCodeReviewPipeline(
  ctx: BuildContext,
  code: string,
  relPath: string,
  absPath: string,
  root: string,
  spec: string | null,
): Promise<{ code: string; qualityScore: number }> {
  const reviewResult = await Review.runGuardianReview(ctx, code, relPath, spec);
  let reviewed = reviewResult.code;
  reviewed = await Review.runStaticValidation(reviewed, relPath);
  if (['.ts', '.tsx', '.js'].some(e => relPath.endsWith(e))) {
    reviewed = await Review.runImportValidation(ctx, reviewed, absPath, root);
  }
  return { code: reviewed, qualityScore: reviewResult.qualityScore };
}

export async function applyCodeToFile(opts: {
  code: string;
  rawResponse: string;
  relPath: string;
  absPath: string;
  root: string;
  existingTarget: string | null;
  isCrossLang: boolean;
  isMod: boolean;
  task: string;
}): Promise<{ usedSurgical: boolean; cleanCode: string; narration: string }> {
  const { code, rawResponse, relPath, absPath, root, existingTarget, isCrossLang, isMod, task } = opts;
  const { detectResponseFormat, parseSurgicalEdits, applySurgicalEdits } = await import('../../services/build/surgicalEditService.js');

  if (existingTarget && !isCrossLang && detectResponseFormat(rawResponse) === 'surgical') {
    const edits = parseSurgicalEdits(rawResponse);
    if (edits.length > 0) {
      const normalizedEdits = edits.map((e: any) => ({ ...e, filePath: relPath }));
      const results = applySurgicalEdits(normalizedEdits, root);
      if (results.every((r: any) => r.success)) {
        logFileChange('modify', relPath, 'builder', { method: 'surgical_edit', task });
        return { usedSurgical: true, cleanCode: fs.readFileSync(absPath, 'utf-8'), narration: '' };
      }
      const failedResult = results.find((r: any) => !r.success);
      throw new Error(`Surgical edit failed: ${failedResult?.error || 'Could not apply changes to existing file'}. Please ask the AI to rewrite the full file instead.`);
    }
    throw new Error('Surgical edit failed: Could not parse SEARCH/REPLACE blocks from AI response.');
  }

  const { narration, cleanCode } = extractNarrator(code);
  Writer.writeBuiltFile(absPath, cleanCode, { root, task });
  logFileChange(isMod ? 'modify' : 'create', relPath, 'builder', { method: 'full_file', task });
  return { usedSurgical: false, cleanCode, narration };
}

export function resolveWorkerPrompt(
  ctx: BuildContext,
  relPath: string,
  existingTarget: string | null,
  isCrossLang: boolean,
  absPath: string,
  spec: string | null,
  vaultSummary: string,
): string {
  const isModify = !!existingTarget && !isCrossLang;
  const existingContent = (isModify && fs.existsSync(absPath)) ? fs.readFileSync(absPath, 'utf8') : '';
  const crossContent = (existingTarget && isCrossLang && fs.existsSync(existingTarget))
    ? fs.readFileSync(existingTarget, 'utf8').slice(0, 6000)
    : '';
  return Worker.buildWorkerPrompt(ctx, relPath, isModify, existingContent, spec, vaultSummary, crossContent);
}

export async function runPostBuildActions(opts: {
  ctx: BuildContext;
  task: string;
  relPath: string;
  absPath: string;
  root: string;
  scaffoldedFiles: string[];
  workerAI: string;
  totalTokens: number;
  totalCost: number;
}): Promise<void> {
  const { ctx, task, relPath, absPath, root, scaffoldedFiles, workerAI, totalTokens, totalCost } = opts;
  const allFiles = [relPath, ...scaffoldedFiles];
  Writer.captureToVault(ctx, absPath, relPath);
  Writer.openBuiltFile(absPath);
  await (require('./chatPanelBuildPipeline.js') as any).maybeAutoCompile(ctx, task, relPath, absPath).catch(() => {});
  if (!ctx.assistMode) {
    writeProjectRoadmapEntry(root, `AI build: ${task.slice(0, 60)}`, [
      ...allFiles.map(f => `Built \`${f}\``),
      `AI: ${workerAI} Tokens: ~${totalTokens} Cost: $${totalCost.toFixed(4)}`,
    ]);
  }
  ctx.onBuildFinished?.(task, [relPath]);
  if (!ctx.assistMode) { await autoCommitIfEnabled(root, `Redivivus added: ${task.slice(0, 80)}`, allFiles); }
  const wsf = vscode.workspace.workspaceFolders ?? [];
  if (!wsf.some(f => f.uri.fsPath === root)) {
    if (wsf.length > 0) {
      vscode.workspace.updateWorkspaceFolders(wsf.length, null, { uri: vscode.Uri.file(root) });
      vscode.commands.executeCommand('workbench.view.explorer').then(
        () => { vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer'); },
        () => {}
      );
    } else {
      try {
        const CP = require('../../ui/panels/chat/chatPanel.js').ChatPanel;
        if (CP?.extensionContext) { CP.extensionContext.globalState.update('redivivus.pendingRescueConversation', ctx.conversation); }
      } catch {}
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root));
    }
  }
  refreshSetupProgressIfOpen().catch(() => {});
  await runCompileAutoFix(ctx, allFiles).catch(() => {});
  await runTestAutoFix(ctx, allFiles).catch(() => {});
}
