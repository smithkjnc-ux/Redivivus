// [SCOPE] CHASSIS Chat Panel Build Pipeline — single-file build entry point
// Helpers (BuildContext, vault resolvers, msg utils) extracted to chatPanelBuildHelpers.ts.

import * as path from 'path';
import * as fs from 'fs';
import { findRelevantByTask } from '../../services/vault/buildFromVaultSearch.js';
import { extractNarrator, buildResultCard } from './chatPanelStory.js';
import { buildPostBuildGuidance } from './chatPanelPostBuild.js';
import { BuildLedger } from '../../services/build/buildLedgerService.js';
import * as Inf from './chatPanelBuildInference.js';
import * as Worker from './chatPanelBuildWorker.js';
import * as Review from './chatPanelBuildReview.js';
import * as Writer from './chatPanelBuildWriter.js';
import { checkImports, formatMissingImports } from './chatPanelImportCheck.js';
import { tracer } from '../../services/pipelineTracer.js';
import { formatVaultContext } from '../../services/vault/vaultContextService.js';
import { readProjectDeadEnds, readProjectRules, writeProjectRoadmapEntry, getRecentBuildsContext } from './chatPanelMsgFixUtils.js';
import { autoCommitIfEnabled } from '../../services/gitAutoCommitService.js';
import { refreshSetupProgressIfOpen } from '../../services/project/setupProgressPanel.js';
import { BuildHistoryService, makeBuildHistoryEntry } from '../../services/build/buildHistoryService.js';
import { BuildContext, updateLastMsg, appendMsg, diffSummary } from './chatPanelBuildHelpers.js';
import { runCompileAutoFix } from '../../services/build/compileAutoFix.js';
import { runTestAutoFix } from '../../services/build/testAutoFix.js';
import { buildGitContextBlock } from '../../services/workspace/gitContext.js';

export type { BuildContext } from './chatPanelBuildHelpers.js';
export { registerVaultHitResolver, resolveVaultHit, isChunkedBuildRequest } from './chatPanelBuildHelpers.js';

export async function runSingleFileBuild(ctx: BuildContext): Promise<void> {
  const { task, root, routing } = ctx;
  const deadEnds = readProjectDeadEnds(root);
  const projectRules = readProjectRules(root);
  const gitCtx = buildGitContextBlock(root);
  const blueprintContext = [
    ctx.blueprintContext,
    deadEnds ? `PREVIOUSLY FAILED APPROACHES (do not repeat):\n${deadEnds}` : '',
    projectRules ? `PROJECT RULES (must not violate):\n${projectRules}` : '',
    gitCtx,
    getRecentBuildsContext(root),
  ].filter(Boolean).join('\n\n');
  const buildStart = Date.now();
  const ledger = new BuildLedger();
  const { supervisor: supervisorAI } = routing.selectSupervisorAndWorker();

  appendMsg(ctx, '🔍 Checking your saved code library...');
  const vaultItems = ctx.vault ? ctx.vault.listItems() : [];
  const searchResult = findRelevantByTask(task, vaultItems);
  updateLastMsg(ctx, `🔍 Found ${searchResult.items.length} useful match${searchResult.items.length !== 1 ? 'es' : ''} in your code library`);

  const isMod = await Inf.isModificationRequest(task.toLowerCase(), routing);
  const existingTarget = isMod ? await Inf.findExistingTarget(root, task) : null;
  const ext = Inf.inferExtension(task.toLowerCase(), blueprintContext);
  const fileBase = await Inf.deriveFileBase(task, routing);
  const isCrossLang = !!existingTarget && path.extname(existingTarget) !== ext;
  const relPath = (existingTarget && !isCrossLang) ? path.relative(root, existingTarget) : (ext === '.html' ? 'index.html' : `src/${fileBase}${ext}`);
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
  if (['.ts', '.tsx', '.js'].some(e => relPath.endsWith(e))) code = await Review.runImportValidation(ctx, code, absPath, root);
  tracer.done(_grdSid, 'success', Date.now() - _grdT0, 'review complete');
  updateLastMsg(ctx, `✅ Review complete — writing \`${relPath}\`...`);

  const snapshotId = Writer.createSnapshot(root, task, relPath);
  const { narration, cleanCode } = extractNarrator(code);
  const _oldContent = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : '';
  Writer.writeBuiltFile(absPath, cleanCode, { root, task });
  const _diff = existingTarget && !isCrossLang ? diffSummary(_oldContent, cleanCode) : '';

  // [FIX] Check imports in the newly written file and report missing dependencies
  const importCheck = checkImports(root, absPath, cleanCode);
  const importWarning = formatMissingImports(importCheck, relPath);

  // Auto-scaffold package.json + tsconfig.json for TypeScript Node.js projects
  const scaffoldedFiles: string[] = [];
  if (ext === '.ts' && !Inf.isWebPageTask(task.toLowerCase())) {
    Writer.scaffoldNodeProject(root, path.basename(absPath, ext), scaffoldedFiles);
  }
  tracer.fileOp([relPath, ...scaffoldedFiles]);

  const ledgerSummary = ledger.hasData() ? ledger.getSummary() : undefined;
  const totalTokens = ledgerSummary ? ledgerSummary.reduce((s, l) => s + l.tokens, 0) : 0;
  const totalCost = ledgerSummary ? ledgerSummary.reduce((s, l) => s + l.costUSD, 0) : 0;
  // [FIX] Record supervisor and worker tokens separately so usage shows correct per-AI breakdown.
  const _proj = path.basename(root);
  if (spec && workerAI !== supervisorAI) {
    const supCost = (_supTok / 1_000_000) * 0.30;
    ctx.usageTracker?.recordUsage(_supTok, supCost, supervisorAI, undefined, undefined, 'supervisor', _proj);
    const workerCost = (workerTokens / 1_000_000) * 0.30;
    ctx.usageTracker?.recordUsage(workerTokens, workerCost, workerAI, res.inputTokens, res.outputTokens, 'worker', _proj);
  } else {
    ctx.usageTracker?.recordUsage(totalTokens, totalCost, workerAI, res.inputTokens, res.outputTokens, 'solo', _proj);
  }

  const elapsed = (Date.now() - buildStart) / 1000;
  const resultCard = buildResultCard([relPath, ...scaffoldedFiles], searchResult.items.length, totalTokens, totalCost, elapsed, snapshotId, 0, !!existingTarget, ledgerSummary) + (_diff ? `\n_Changes: ${_diff}_` : '');

  // [FIX] Record to build history so single-file builds appear in the Build History panel
  new BuildHistoryService(root).record(makeBuildHistoryEntry({ snapshotId: snapshotId || Date.now().toString(), task, files: [relPath, ...scaffoldedFiles], tokensUsed: totalTokens, costUSD: totalCost, source: 'ai', supervisor: supervisorAI, worker: workerAI !== supervisorAI ? workerAI : null, resultCardToken: resultCard }));

  const previewToken = relPath.endsWith('.html') ? `\n__PREVIEW_BROWSER__${absPath}|||END_PREVIEW_BROWSER__` : '';
  const nextSteps = buildPostBuildGuidance(root, [relPath, ...scaffoldedFiles]);
  // [FIX] Include import validation warning in build result message
  appendMsg(ctx, `${narration ? '&#x1F4DD; ' + narration + '\n\n' : ''}${resultCard}${importWarning}\n__BUILD_RESULT__${relPath}|||${absPath}|||END__${previewToken}${nextSteps}${(require('./chatPanelBuildPipeline.js') as any).appendCompileAction(relPath)}`);

  tracer.vault('save', `${relPath} -> vault`);
  tracer.end([relPath, ...scaffoldedFiles], totalTokens, totalCost);
  Writer.captureToVault(ctx, absPath, relPath);
  Writer.openBuiltFile(absPath);
  await (require('./chatPanelBuildPipeline.js') as any).maybeAutoCompile(ctx, task, relPath, absPath).catch(() => {});
  if (!ctx.assistMode) { writeProjectRoadmapEntry(root, `AI build: ${task.slice(0, 60)}`, [relPath,...scaffoldedFiles].map(f=>`Built \`${f}\``).concat([`AI: ${workerAI} Tokens: ~${totalTokens} Cost: $${totalCost.toFixed(4)}`])); }
  ctx.onBuildFinished?.(task, [relPath]);
  if (!ctx.assistMode) { await autoCommitIfEnabled(root, `CHASSIS added: ${task.slice(0, 80)}`, [relPath,...scaffoldedFiles]); }
  refreshSetupProgressIfOpen().catch(() => {});
  await runCompileAutoFix(ctx, [relPath, ...scaffoldedFiles]).catch(() => {});
  await runTestAutoFix(ctx, [relPath, ...scaffoldedFiles]).catch(() => {});
}

export { runChunkedBuild } from './chatPanelChunked.js';
export { runVaultAssemblyBuild } from './chatPanelBuildVault.js';
