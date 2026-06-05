// [SCOPE] Redivivus Chat Panel Build Pipeline — single-file build entry point
// Step functions (path inference, review, write, post-build) extracted to chatPanelBuildSteps.ts.

import * as fs from 'fs';
import * as vscode from 'vscode';
import { findRelevantByTask } from '../../services/vault/buildFromVaultSearch';
import { BuildLedger } from '../../services/build/buildLedgerService';
import * as Worker from './chatPanelBuildWorker';
import * as Inf from './chatPanelBuildInference';
import * as Writer from './chatPanelBuildWriter';
import { tracer } from '../../services/pipelineTracer';
import { formatVaultContext, isVaultEnabled } from '../../services/vault/vaultContextService';
import { readProjectDeadEnds } from '../routing/chatPanelMsgFixDeadEnds';
import { readProjectRules, getRecentBuildsContext } from '../routing/chatPanelMsgFixUtils';
import { buildSingleFileResult } from './chatPanelBuildResult';
import type { BuildContext } from './chatPanelBuildHelpers';
import { updateLastMsg, appendMsg, supervisorPlanWithTicker } from './chatPanelBuildHelpers';
import { buildGitContextBlock } from '../../services/workspace/gitContext';
import { redivivusLog } from '../../services/logging/redivivusLogger';
import { inferBuildTarget, runCodeReviewPipeline, applyCodeToFile, runPostBuildActions, resolveWorkerPrompt } from './chatPanelBuildSteps';
import { generatePlanId, formatPlanForApproval, awaitPlanApproval } from './chatPanelBuildPlanGate';
import { appendWalkthroughToConversation } from './chatPanelBuildWalkthrough';
import { LearnedMemoryService } from '../../services/learnedMemoryService';
import { getCommunityGotchas, fetchCommunityGotchas } from '../../services/api/apiClientKnowledge.js';
import { selectRelevantTurns } from '../ai/contextSelector';
import { findSimilarCode } from '../../services/code/similarCodeFinder';

export type { BuildContext } from './chatPanelBuildHelpers';
export { registerVaultHitResolver, resolveVaultHit, isChunkedBuildRequest } from './chatPanelBuildHelpers';

export async function runSingleFileBuild(ctx: BuildContext): Promise<void> {
  const { task, root, routing } = ctx;
  redivivusLog({ operation: 'build', phase: 'start', message: 'Build started', data: { task, root } });

  const deadEnds = readProjectDeadEnds(root);
  const projectRules = readProjectRules(root);
  const gitCtx = buildGitContextBlock(root);
  // [DONE] Rule 18 — AI selects which conversation turns are relevant to this build task
  const convTurns = ctx.conversation
    ? ctx.conversation.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }))
    : [];
  const convCtx = convTurns.length > 0 ? await selectRelevantTurns(convTurns, task, routing) : '';
  const blueprintContext = [
    ctx.blueprintContext,
    ctx.clarifyAnswers || '',
    deadEnds ? `PREVIOUSLY FAILED APPROACHES (do not repeat):\n${deadEnds}` : '',
    projectRules ? `PROJECT RULES (must not violate):\n${projectRules}` : '',
    gitCtx,
    getRecentBuildsContext(root),
    convCtx ? `RECENT CONVERSATION:\n${convCtx}` : '',
  ].filter(Boolean).join('\n\n');
  // [GATE] Zero-key gate — must fire before any AI call, not at startup
  if (!routing.hasAnyKey()) {
    appendMsg(ctx, 'To build with Redivivus, you\'ll need at least one AI API key. I can walk you through adding one -- which AI service do you have access to?\n\n- **Anthropic (Claude)** -- console.anthropic.com\n- **Google (Gemini)** -- aistudio.google.com (free tier available)\n- **OpenAI (GPT)** -- platform.openai.com\n- **Other** -- Groq, xAI, Kimi also supported\n\nOpen **Redivivus Settings** (Ctrl+Shift+P -> "Redivivus: Open Settings") to add your key.');
    ctx.postToWebview?.({ type: 'set-status', status: 'ready' });
    return;
  }

  const buildStart = Date.now();
  const ledger = new BuildLedger();
  const { supervisor: supervisorAI } = routing.selectSupervisorAndWorker();

  // Single-model mode notice
  const roster = routing.buildRoster?.() as any;
  if (roster?.singleModelMode) {
    appendMsg(ctx, 'Running in single-model mode -- all roles handled by one AI. Add more API keys for better parallelism.');
  }

  const vaultOn = isVaultEnabled();
  appendMsg(ctx, vaultOn ? '🔍 Checking your saved code library...' : '⚙️ Building...');
  const vaultItems = (ctx.vault && vaultOn) ? ctx.vault.listItems() : [];
  const searchResult = findRelevantByTask(task, vaultItems);
  redivivusLog({ operation: 'build', phase: 'vault_search', message: `Found ${searchResult.items.length} vault matches`, data: { vaultMatches: searchResult.items.length } });
  if (vaultOn) { updateLastMsg(ctx, `🔍 Found ${searchResult.items.length} useful match${searchResult.items.length !== 1 ? 'es' : ''} in your code library`); }

  const { relPath, absPath, existingTarget, isCrossLang, isMod, ext } = await inferBuildTarget(task, root, blueprintContext, routing, { usageTracker: ctx.usageTracker });

  // Show the user which file is being reviewed and its current state
  if (existingTarget && fs.existsSync(absPath)) {
    const lineCount = fs.readFileSync(absPath, 'utf-8').split('\n').length;
    appendMsg(ctx, `📂 Reading \`${relPath}\` — ${lineCount} lines — analyzing for issues...`);
  } else {
    appendMsg(ctx, `📋 Planning \`${relPath}\`...`);
  }
  const neverDoContext = await new LearnedMemoryService(root).getNeverDoForTask(task, routing);
  fetchCommunityGotchas().catch(() => {}); // warm cache for next build; use sync result this build
  const fullNeverDo = [neverDoContext, getCommunityGotchas()].filter(Boolean).join('\n\n');
  const _supT0 = Date.now(); const _supSid = tracer.step('SUPERVISOR', supervisorAI, task.slice(0, 80));
  // Well-known pattern bypass -- deterministic prescription replaces Supervisor AI planning.
  // For known patterns (games, todo apps, landing pages, etc.) the AI already knows exactly what
  // to build. The Supervisor prescription step adds lossy indirection that degrades output quality.
  let spec: string | null = null;
  let _supTok = 0;
  spec = await supervisorPlanWithTicker(ctx, routing, task, relPath, blueprintContext, fullNeverDo || undefined);
  _supTok = spec ? Math.ceil((task.length + blueprintContext.length + spec.length) / 4) : 0;
  tracer.done(_supSid, spec ? 'success' : 'fail', Date.now() - _supT0, spec ? `${spec.split('\n').length} steps` : 'no supervisor plan', Math.ceil((task.length + blueprintContext.length) / 4), _supTok);
  if (spec) {
    ledger.record(supervisorAI, 'supervisor', 'planned', _supTok);
    const specLines = spec.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('{') && !l.startsWith('['));
    const preview = specLines.slice(0, 2).join(' · ').slice(0, 180);
    updateLastMsg(ctx, preview ? `📋 Found: ${preview}` : `📋 Plan ready`);
  }

  // Plan Approval Gate
  if (spec && ctx.conversation) {
    const planId = generatePlanId();
    const planCard = formatPlanForApproval(spec, relPath, 'standard', planId);
    appendMsg(ctx, planCard);
    const decision = await awaitPlanApproval(planId, ctx.conversation, ctx.refresh);
    if (decision === 'cancel') {
      appendMsg(ctx, '❌ Build cancelled.');
      ctx.postToWebview?.({ type: 'set-status', status: 'ready' });
      return;
    }
    if (decision === 'revise') {
      appendMsg(ctx, '✏️ Revision requested — please describe what you want changed and resend.');
      ctx.postToWebview?.({ type: 'set-status', status: 'ready' });
      return;
    }
    updateLastMsg(ctx, '✅ Plan approved — writing your code...');
  }

  const vaultSummary = searchResult.items.length > 0 ? formatVaultContext(searchResult.items) : '';
  // [DONE] Rule 18 — AI identifies which existing functions are relevant so Worker doesn't reimplement them
  const similarCode = await findSimilarCode(root, task, relPath, routing);
  const prompt = resolveWorkerPrompt(ctx, relPath, existingTarget, isCrossLang, absPath, spec, vaultSummary, similarCode);
  const _workT0 = Date.now(); const _workSid = tracer.step('WORKER', undefined, `Building ${relPath}`);

  let streamAccum = '';
  appendMsg(ctx, `⚙️ Writing \`${relPath}\`...\n\`\`\`\n\`\`\``);
  if (fs.existsSync(absPath)) { try { const _doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath)); await vscode.window.showTextDocument(_doc, { preview: true, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }); } catch {} }
  const onChunk = (chunk: string) => { streamAccum += chunk; updateLastMsg(ctx, `⚙️ Writing \`${relPath}\`...\n\`\`\`\n${streamAccum}\n\`\`\``); };

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
  updateLastMsg(ctx, `⚙️ \`${relPath}\` written — reviewing...`);

  const code = Inf.extractCodeFromResponse(res.text);
  const _grdT0 = Date.now(); const _grdSid = tracer.step('GUARDIAN', undefined, relPath);
  const reviewResult = await runCodeReviewPipeline(ctx, code, relPath, absPath, root, spec);
  const reviewedCode = reviewResult.code;
  tracer.done(_grdSid, 'success', Date.now() - _grdT0, 'review complete');
  // [FIX] Transparent Guardian — show review result to user instead of swallowing it
  const guardianVerdict = reviewResult.qualityScore >= 4
    ? `🛡️ **Guardian:** Approved (quality ${reviewResult.qualityScore}/5)`
    : reviewResult.qualityScore >= 2
      ? `🛡️ **Guardian:** Passed with notes (quality ${reviewResult.qualityScore}/5)`
      : `🛡️ **Guardian:** Issues detected — auto-corrected (quality ${reviewResult.qualityScore}/5)`;
  updateLastMsg(ctx, `${guardianVerdict} — writing \`${relPath}\`...`);

  const snapshotId = Writer.createSnapshot(root, task, relPath);
  const _oldContent = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : '';
  const { usedSurgical, cleanCode, narration } = await applyCodeToFile({
    code: reviewedCode, rawResponse: res.text, relPath, absPath, root, existingTarget, isCrossLang, isMod, task,
  });

  const { resultMessage, scaffoldedFiles, totalTokens, totalCost } = buildSingleFileResult({
    ctx, relPath, absPath, root, task, existingTarget, isCrossLang, _oldContent, cleanCode, narration,
    usedSurgical, ledger, _supTok, supervisorAI, workerAI, spec,
    res: { inputTokens: res.inputTokens, outputTokens: res.outputTokens },
    snapshotId, buildStart, searchResult, ext,
  });
  tracer.fileOp([relPath, ...scaffoldedFiles]);
  appendMsg(ctx, resultMessage);
  ctx.postToWebview?.({ type: 'set-status', status: 'ready' });
  tracer.vault('save', `${relPath} -> vault`);
  tracer.end([relPath, ...scaffoldedFiles], totalTokens, totalCost);

  await runPostBuildActions({ ctx, task, relPath, absPath, root, scaffoldedFiles, workerAI, totalTokens, totalCost });

  // [FIX] Walkthrough Handoff — generate a structured summary of the build for the user
  try {
    await appendWalkthroughToConversation(task, [relPath, ...scaffoldedFiles], root, routing, ctx.conversation, ctx.refresh);
  } catch { /* non-blocking — walkthrough failure should never break the build */ }
}
export { runChunkedBuild } from './chatPanelChunked';
export { runVaultAssemblyBuild } from './chatPanelBuildVault';
