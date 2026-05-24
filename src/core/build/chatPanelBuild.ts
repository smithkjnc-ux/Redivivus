// [SCOPE] CHASSIS Chat Panel Build Pipeline — single-file build entry point
// Helpers (BuildContext, vault resolvers, msg utils) extracted to chatPanelBuildHelpers.ts.

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { findRelevantByTask } from '../../services/vault/buildFromVaultSearch';
import { extractNarrator } from '../../ui/panels/chat/chatPanelStory';
import { BuildLedger } from '../../services/build/buildLedgerService';
import * as Inf from './chatPanelBuildInference';
import * as Worker from './chatPanelBuildWorker';
import * as Review from './chatPanelBuildReview';
import * as Writer from './chatPanelBuildWriter';
import { tracer } from '../../services/pipelineTracer';
import { formatVaultContext, isVaultEnabled } from '../../services/vault/vaultContextService';
import { readProjectDeadEnds, readProjectRules, writeProjectRoadmapEntry, getRecentBuildsContext } from '../routing/chatPanelMsgFixUtils';
import { autoCommitIfEnabled } from '../../services/gitAutoCommitService';
import { buildSingleFileResult } from './chatPanelBuildResult';
import { refreshSetupProgressIfOpen } from '../../services/project/setupProgressPanel';
import type { BuildContext} from './chatPanelBuildHelpers';
import { updateLastMsg, appendMsg } from './chatPanelBuildHelpers';
import { runCompileAutoFix } from '../../services/build/compileAutoFix';
import { runTestAutoFix } from '../../services/build/testAutoFix';
import { buildGitContextBlock } from '../../services/workspace/gitContext';
import { chassisLog, logFileChange } from '../../services/logging/chassisLogger';

export type { BuildContext } from './chatPanelBuildHelpers';
export { registerVaultHitResolver, resolveVaultHit, isChunkedBuildRequest } from './chatPanelBuildHelpers';

export async function runSingleFileBuild(ctx: BuildContext): Promise<void> {
  const { task, root, routing } = ctx;
  chassisLog({ operation: 'build', phase: 'start', message: 'Build started', data: { task, root } });
  
  const deadEnds = readProjectDeadEnds(root);
  const projectRules = readProjectRules(root);
  const gitCtx = buildGitContextBlock(root);
  const blueprintContext = [
    ctx.blueprintContext,
    ctx.clarifyAnswers || '',
    deadEnds ? `PREVIOUSLY FAILED APPROACHES (do not repeat):\n${deadEnds}` : '',
    projectRules ? `PROJECT RULES (must not violate):\n${projectRules}` : '',
    gitCtx,
    getRecentBuildsContext(root),
  ].filter(Boolean).join('\n\n');
  const buildStart = Date.now();
  const ledger = new BuildLedger();
  const { supervisor: supervisorAI } = routing.selectSupervisorAndWorker();

  const vaultOn = isVaultEnabled();
  appendMsg(ctx, vaultOn ? '🔍 Checking your saved code library...' : '⚙️ Building...');
  const vaultItems = (ctx.vault && vaultOn) ? ctx.vault.listItems() : [];
  const searchResult = findRelevantByTask(task, vaultItems);
  chassisLog({ operation: 'build', phase: 'vault_search', message: `Found ${searchResult.items.length} vault matches`, data: { vaultMatches: searchResult.items.length } });
  if (vaultOn) { updateLastMsg(ctx, `🔍 Found ${searchResult.items.length} useful match${searchResult.items.length !== 1 ? 'es' : ''} in your code library`); }

  // [FIX] Extract explicit file path if user names one (e.g. "called src/test.ts", "named foo/bar.py")
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
    relPath = (existingTarget && !isCrossLang) ? path.relative(root, existingTarget) : (ext === '.html' ? 'index.html' : `src/${fileBase}${ext}`);
  }
  const absPath = path.join(root, relPath);

  appendMsg(ctx, `📋 Planning \`${relPath}\`...`);
  const _supT0 = Date.now(); const _supSid = tracer.step('SUPERVISOR', supervisorAI, task.slice(0, 80));
  const spec = await routing.supervisorPlan(task, relPath, blueprintContext).catch(() => null);
  const _supTok = spec ? Math.ceil((task.length + blueprintContext.length + spec.length) / 4) : 0;
  tracer.done(_supSid, spec ? 'success' : 'fail', Date.now() - _supT0, spec ? `${spec.split('\n').length} steps` : 'no supervisor plan', Math.ceil((task.length + blueprintContext.length) / 4), _supTok);
  if (spec) {
    ledger.record(supervisorAI, 'supervisor', 'planned', _supTok);
    updateLastMsg(ctx, `📋 Plan ready — writing your code...`);
  }

  // [FIX] Inject vault context into worker prompt — was always passing empty string
  const vaultSummary = searchResult.items.length > 0 ? formatVaultContext(searchResult.items) : '';
  const prompt = Worker.buildWorkerPrompt(ctx, relPath, !!existingTarget && !isCrossLang, (existingTarget && !isCrossLang && fs.existsSync(absPath)) ? fs.readFileSync(absPath, 'utf8') : '', spec, vaultSummary, (existingTarget && isCrossLang && fs.existsSync(existingTarget)) ? fs.readFileSync(existingTarget, 'utf8').slice(0, 6000) : '');
  const _workT0 = Date.now(); const _workSid = tracer.step('WORKER', undefined, `Building ${relPath}`);

  // Real streaming: chunks arrive from the AI and update the message in real time
  let streamAccum = '';
  appendMsg(ctx, `⚙️ Writing \`${relPath}\`...\n\`\`\`\n\`\`\``);
  // [CHASSIS] Open editor pane early (existing files only) so user sees side panel appear before AI generates.
  if (fs.existsSync(absPath)) { try { const _doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath)); await vscode.window.showTextDocument(_doc, { preview: true, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }); } catch {} }
  const onChunk = (chunk: string) => {
    streamAccum += chunk;
    updateLastMsg(ctx, `⚙️ Writing \`${relPath}\`...\n\`\`\`\n${streamAccum}\n\`\`\``);
  };

  const res = await Worker.executeWorkerBuild(ctx, prompt, onChunk);
  if (!res.success) {
    tracer.done(_workSid, 'fail', Date.now() - _workT0, res.error || 'AI returned no response');
    tracer.end([], 0, 0);
    ctx.logError(task, prompt, res.error || 'Failed', 0);
    updateLastMsg(ctx, `❌ Something went wrong — try again or describe what you want differently.`);
    return;
  }

  const workerAI = (res as any).routedTo || supervisorAI;
  const workerTokens = Math.ceil((prompt.length + res.text.length) / 4);
  tracer.done(_workSid, 'success', Date.now() - _workT0, relPath, Math.ceil(prompt.length / 4), Math.ceil(res.text.length / 4));
  ledger.record(workerAI, spec ? 'worker' : 'solo', 'built', workerTokens);
  // Streaming already showed the code live — clear the preview bubble before Guardian runs
  updateLastMsg(ctx, `⚙️ \`${relPath}\` written — reviewing...`);

  let code = Inf.extractCodeFromResponse(res.text);
  const _grdT0 = Date.now(); const _grdSid = tracer.step('GUARDIAN', undefined, relPath);
  const reviewResult = await Review.runGuardianReview(ctx, code, relPath, spec);
  code = reviewResult.code;
  const qualityScore = reviewResult.qualityScore;
  code = await Review.runStaticValidation(code, relPath);
  if (['.ts', '.tsx', '.js'].some(e => relPath.endsWith(e))) {code = await Review.runImportValidation(ctx, code, absPath, root);}
  tracer.done(_grdSid, 'success', Date.now() - _grdT0, 'review complete');
  updateLastMsg(ctx, `✅ Review complete — writing \`${relPath}\`...`);

  const snapshotId = Writer.createSnapshot(root, task, relPath);
  const _oldContent = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : '';

  // [FIX] Surgical edit support: if modifying and AI returned SEARCH/REPLACE blocks, apply them
  const { detectResponseFormat, parseSurgicalEdits, applySurgicalEdits } = await import('../../services/build/surgicalEditService.js');
  const rawResponse = res.text;
  let usedSurgical = false;
  let cleanCode = code;
  let narration = '';

  if (existingTarget && !isCrossLang && detectResponseFormat(rawResponse) === 'surgical') {
    const edits = parseSurgicalEdits(rawResponse);
    if (edits.length > 0) {
      // Rewrite paths to match target
      const normalizedEdits = edits.map(e => ({ ...e, filePath: relPath }));
      const results = applySurgicalEdits(normalizedEdits, root);
      if (results.every(r => r.success)) {
        usedSurgical = true;
        cleanCode = fs.readFileSync(absPath, 'utf-8');
      } else {
        // [FIX] If surgical edit failed to apply (e.g., mismatch in existing code), DO NOT write the raw SEARCH/REPLACE blocks to the file.
        const failedResult = results.find(r => !r.success);
        throw new Error(`Surgical edit failed: ${failedResult?.error || 'Could not apply changes to existing file'}. Please ask the AI to rewrite the full file instead.`);
      }
    } else {
      // [FIX] If we detected surgical format but parsed 0 edits, throw an error to prevent writing raw tags.
      throw new Error(`Surgical edit failed: Could not parse SEARCH/REPLACE blocks from AI response.`);
    }
  }

  if (!usedSurgical) {
    ({ narration, cleanCode } = extractNarrator(code));
    Writer.writeBuiltFile(absPath, cleanCode, { root, task });
    logFileChange(isMod ? 'modify' : 'create', relPath, 'builder', { method: 'full_file', task });
  } else {
    logFileChange('modify', relPath, 'builder', { method: 'surgical_edit', task });
  }

  const { resultMessage, scaffoldedFiles, totalTokens, totalCost } = buildSingleFileResult({
    ctx, relPath, absPath, root, task, existingTarget, isCrossLang, _oldContent, cleanCode, narration,
    usedSurgical, ledger, _supTok, supervisorAI, workerAI: workerAI, spec,
    res: { inputTokens: res.inputTokens, outputTokens: res.outputTokens },
    snapshotId, buildStart, searchResult, ext,
  });
  tracer.fileOp([relPath, ...scaffoldedFiles]);
  appendMsg(ctx, resultMessage);
  ctx.postToWebview?.({ type: 'set-status', status: 'ready' });

  tracer.vault('save', `${relPath} -> vault`);
  tracer.end([relPath, ...scaffoldedFiles], totalTokens, totalCost);
  Writer.captureToVault(ctx, absPath, relPath);
  Writer.openBuiltFile(absPath);
  await (require('./chatPanelBuildPipeline.js') as any).maybeAutoCompile(ctx, task, relPath, absPath).catch(() => {});
  if (!ctx.assistMode) { writeProjectRoadmapEntry(root, `AI build: ${task.slice(0, 60)}`, [relPath,...scaffoldedFiles].map(f=>`Built \`${f}\``).concat([`AI: ${workerAI} Tokens: ~${totalTokens} Cost: $${totalCost.toFixed(4)}`])); }
  ctx.onBuildFinished?.(task, [relPath]);
  if (!ctx.assistMode) { await autoCommitIfEnabled(root, `CHASSIS added: ${task.slice(0, 80)}`, [relPath,...scaffoldedFiles]); }
  // Auto-open project in Explorer — no button required
  const _sfWsf = vscode.workspace.workspaceFolders ?? [];
  if (!_sfWsf.some(f => f.uri.fsPath === root)) {
    if (_sfWsf.length > 0) { vscode.workspace.updateWorkspaceFolders(_sfWsf.length, null, { uri: vscode.Uri.file(root) }); vscode.commands.executeCommand('workbench.view.explorer').then(() => { vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer'); }, () => {}); }
    else { try { const CP = require('../../ui/panels/chat/chatPanel.js').ChatPanel; if (CP?.extensionContext) { CP.extensionContext.globalState.update('chassis.pendingRescueConversation', ctx.conversation); } } catch {} vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root)); }
  }
  refreshSetupProgressIfOpen().catch(() => {});
  await runCompileAutoFix(ctx, [relPath, ...scaffoldedFiles]).catch(() => {});
  await runTestAutoFix(ctx, [relPath, ...scaffoldedFiles]).catch(() => {});
}
export { runChunkedBuild } from './chatPanelChunked';
export { runVaultAssemblyBuild } from './chatPanelBuildVault';
