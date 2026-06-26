// [SCOPE] Build pipeline step functions — path inference, code review, write, and post-build actions
// Extracted from runSingleFileBuild (was complexity 58) to named, testable units.

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { BuildContext } from './chatPanelBuildHelpers.js';
import type { RoutingService } from '../../../shared/ai/infrastructure/routingService.js';
import * as Inf from './chatPanelBuildInference.js';
import * as Review from './chatPanelBuildReview.js';
import * as Worker from './chatPanelBuildWorker.js';
import * as Writer from './chatPanelBuildWriter.js';
import { extractNarrator } from './buildOutput.js';
import { logFileChange } from '../../../shared/logging/infrastructure/redivivusLogger.js';
import { refreshSetupProgressIfOpen } from '../../project/application/setupProgressPanel.js';
import { autoCommitIfEnabled } from '../../workspace/infrastructure/gitAutoCommitService.js';
import { writeProjectRoadmapEntry } from '../routing/chatPanelMsgFixUtils.js';
import { runCompileAutoFix } from './services/compileAutoFix.js';
import { runTestAutoFix } from './services/testAutoFix.js';
import { LearnedMemoryService } from '../../../services/learnedMemoryService.js';
import { recordBuild } from '../../../services/userMemoryService.js';

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
  deps: { usageTracker: any },
): Promise<BuildTarget> {
  const explicitPathMatch = task.match(/(?:called|named|file|path)\s+[`"']?([\w./-]+\.\w{1,5})[`"']?/i)
    || task.match(/\b(src\/[\w./-]+\.\w{1,5})\b/);

  const isMod = explicitPathMatch ? false : await Inf.isModificationRequest(task.toLowerCase(), routing, deps.usageTracker);
  const existingTarget = isMod ? await Inf.findExistingTarget(root, task) : null;
  const ext = Inf.inferExtension(task.toLowerCase(), blueprintContext);
  const fileBase = explicitPathMatch ? '' : await Inf.deriveFileBase(task, routing, deps.usageTracker);
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
  isMod: boolean,
): Promise<{ code: string; qualityScore: number }> {
  const compileError = await Review.runStaticCompilationGate(code, absPath, root, isMod);
  if (compileError) {
    throw new Error(`[COMPILATION ERROR] Static validation failed: ${compileError}`);
  }

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
  const { detectResponseFormat, parseSurgicalEdits, applySurgicalEdits } = await import('./services/surgicalEditService.js');

  // [FIX] HTML files always bypass surgical edit — Worker may output surgical format regardless of prompt instruction
  if (existingTarget && !isCrossLang && !relPath.endsWith('.html') && detectResponseFormat(rawResponse) === 'surgical') {
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
  similarCode?: string,
): string {
  const isModify = !!existingTarget && !isCrossLang;
  const existingContent = (isModify && fs.existsSync(absPath)) ? fs.readFileSync(absPath, 'utf8') : '';
  const crossContent = (existingTarget && isCrossLang && fs.existsSync(existingTarget))
    ? fs.readFileSync(existingTarget, 'utf8').slice(0, 6000)
    : '';
  return Worker.buildWorkerPrompt(ctx, relPath, isModify, existingContent, spec, vaultSummary, crossContent, similarCode);
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
  const _normRoot = path.resolve(root).toLowerCase();
  if (!wsf.some(f => path.resolve(f.uri.fsPath).toLowerCase() === _normRoot)) {
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
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: false });
    }
  }
  refreshSetupProgressIfOpen().catch(() => {});
  await runCompileAutoFix(ctx, allFiles).catch(() => {});
  await runTestAutoFix(ctx, allFiles).catch(() => {});
  // [DONE] Extract decisions from this build's conversation and persist to learned.md.
  // Non-blocking — runs after build is complete so it never delays the response.
  try { recordBuild(); } catch {}
  LearnedMemoryService.extractBuildDecisions(
    ctx.conversation.map(m => ({ role: m.role, content: m.content })),
    task,
    ctx.routing,
  ).then(({ permanent, recent }) => {
    const learned = new LearnedMemoryService(root);
    permanent.forEach(f => learned.addPermanent(f));
    recent.forEach(f => learned.addRecent(f));
  }).catch(() => { /* never surface memory errors */ });
}
