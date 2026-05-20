// [SCOPE] CHASSIS Chat Panel Chunked Build — multi-file build pipeline orchestration
// Per-file loop extracted to chatPanelChunkedLoop.ts

import * as path from 'path';
import { findRelevantByTask, VaultSearchResult } from '../../services/vault/buildFromVaultSearch.js';
import { getPhaseUndoService } from '../../services/phaseUndoService.js';
import { BuildContext } from './chatPanelBuild.js';
import { generateClarifyQuestions, encodeClarifyToken, formatAnswersForPrompt } from './chatPanelClarify.js';
import { encodeStoryToken, buildResultCard } from './chatPanelStory.js';
import { buildPostBuildGuidance } from './chatPanelPostBuild.js';
import { generateDocs } from './chatPanelDocs.js';
import { SnapshotService } from '../../services/snapshotService.js';
import { autoCaptureFiles } from '../../services/vault/vaultAutoCapture.js';
import { BuildLedger } from '../../services/build/buildLedgerService.js';
import { BuildHistoryService, makeBuildHistoryEntry } from '../../services/build/buildHistoryService.js';
import { runFileBuildLoop, FileBuildLoopResult } from './chatPanelChunkedLoop.js';
import { tracer } from '../../services/pipelineTracer.js';
import { formatVaultContext } from '../../services/vault/vaultContextService.js';
import { readProjectDeadEnds, readProjectRules, writeProjectRoadmapEntry, getRecentBuildsContext } from './chatPanelMsgFixUtils.js';
import { autoCommitIfEnabled } from '../../services/gitAutoCommitService.js';
import { refreshSetupProgressIfOpen } from '../../services/project/setupProgressPanel.js';
import { runCompileAutoFix } from '../../services/build/compileAutoFix.js';
import { runTestAutoFix } from '../../services/build/testAutoFix.js';
import { getWorkspaceContextService } from '../../services/workspace/workspaceContext.js';

export function appendMsg(ctx: BuildContext, content: string, tokens = 0, cost = 0): void {
  ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now(), tokens: tokens || undefined, cost: cost || undefined }); ctx.refresh();
}

export function updateLastMsg(ctx: BuildContext, content: string): void {
  const last = ctx.conversation[ctx.conversation.length - 1];
  if (last && last.role === 'assistant') { last.content = content; } else { ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() }); }
  ctx.refresh();
}

/** Multi-file chunked build — clarify → vault search → plan → per-file builds with visible progress */
export async function runChunkedBuild(task: string, ctx: BuildContext): Promise<void> {
  const { root, vault, blueprintContext, routing, conversation } = ctx;
  const buildStart = Date.now();

  const { supervisor, worker } = routing.selectSupervisorAndWorker();
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };
  const supervisorLabel = aiLabels[supervisor] || supervisor;
  const workerLabel = worker ? (aiLabels[worker] || worker) : null;

  // [DEAD] orchestratedBuild bypass was here — removed because it skipped file saving,
  // project creation wizard, vault capture, and explorer opening. Multi-AI coordination
  // happens through the existing supervisor/worker planning step + Guardian review instead.

  const ledger = new BuildLedger();
  const phaseUndo = getPhaseUndoService(root);
  const buildId = phaseUndo.startPhasedBuild(task);

  // Clarification step
  let answersBlock = '';
  const isDirectSplit = /split/i.test(task) && /lines/i.test(task);
  if (ctx.postToWebview && !isDirectSplit) {
    appendMsg(ctx, 'Thinking... Preparing a few quick questions...');
    const questions = await generateClarifyQuestions(task, blueprintContext, routing);
    if (questions.length > 0) {
      const last = conversation[conversation.length - 1];
      if (last && last.role === 'assistant') { last.content = encodeClarifyToken(questions); }
      ctx.refresh();
      const answers = await Promise.race<Record<string, string>>([
        new Promise<Record<string, string>>((resolve) => { ctx.onClarifySubmit = resolve; }),
        new Promise<Record<string, string>>(resolve => setTimeout(() => resolve({}), 120_000)),
      ]);
      if (answers._cancelled === 'true') {
        const last2 = conversation[conversation.length - 1];
        if (last2 && last2.role === 'assistant') { last2.content = '❌ Build canceled.'; }
        ctx.refresh(); ctx.postToWebview?.({ type: 'set-status', status: 'ready' }); return;
      }
      answersBlock = formatAnswersForPrompt(answers);
      const summary = Object.entries(answers).map(([q, a]) => `  • ${q}: **${a}**`).join('\n');
      const last2 = conversation[conversation.length - 1];
      if (last2 && last2.role === 'assistant') { last2.content = `✅ Got it — building with your choices:\n${summary}`; }
      ctx.refresh();
    } else { conversation.pop(); ctx.refresh(); }
  }

  // Vault search
  appendMsg(ctx, '🔍 Checking your saved code library...');
  const vaultItems = vault ? vault.listItems() : [];
  const searchResult: VaultSearchResult = vaultItems.length > 0 ? findRelevantByTask(task, vaultItems) : { items: [], totalScanned: 0, matchedCount: 0, highConfidenceCount: 0 };
  const relevant = searchResult.items;
  const vaultMsg = relevant.length > 0
    ? `🔍 Found ${relevant.length} useful match${relevant.length !== 1 ? 'es' : ''} in your code library`
    : `🔍 No matches found in your code library`;
  updateLastMsg(ctx, vaultMsg);

  // Planning
  appendMsg(ctx, `📋 Planning your build...`);

  // [FIX] Inject workspace files & vault context into planner so supervisor knows what exists
  const wsCtx = await getWorkspaceContextService().getContext();
  const wsBlock = wsCtx?.files?.length ? `EXISTING WORKSPACE FILES:\n${wsCtx.files.map(f => `- ${f.relativePath}`).join('\n')}\n` : '';
  const vaultCtxBlock = relevant.length > 0 ? formatVaultContext(relevant) + '\n' : '';
  const deadEndsBlock = readProjectDeadEnds(root) ? `PREVIOUSLY FAILED APPROACHES:\n${readProjectDeadEnds(root)}\n` : '';
  const rulesBlock = readProjectRules(root) ? `PROJECT RULES:\n${readProjectRules(root)}\n` : '';
  const recentBlock = getRecentBuildsContext(root) ? `${getRecentBuildsContext(root)}\n` : '';
  const planPrompt = `I need to build: "${task}"
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}${wsBlock}${vaultCtxBlock}${recentBlock}${deadEndsBlock}${rulesBlock}${answersBlock ? `${answersBlock}\n` : ''}Identify every single source file that needs to be CREATED or MODIFIED to accomplish this task.
You MUST list both:
1. Brand new files that need to be created.
2. Existing files that need to be edited, modified, or updated to import/call the new files.

Return ONLY a JSON array — no markdown, no explanation, no code:
[
  {"file": "src/new-file.py", "purpose": "Create new module"},
  {"file": "src/existing.py", "purpose": "Modify to import and use src/new-file.py"}
]`;

  const promptLen = Math.ceil(planPrompt.length / 4);
  interface PlanEntry { filename: string; purpose: string; }
  let filePlan: PlanEntry[] = [];

  const _planT0 = Date.now(); const _planSid = tracer.step('SUPERVISOR', supervisorLabel, `Planning ${task.slice(0, 60)}`);
  try {
    const res = await (workerLabel
      ? (async () => { const f = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 30_000); const { callProvider } = await import('../../services/ai/routingProviders.js'); return callProvider(supervisor, planPrompt, f); })()
      : routing.prompt(planPrompt, 30_000));
    if (!res.success) { tracer.done(_planSid, 'fail', Date.now() - _planT0, res.error || 'failed'); throw new Error(res.error || 'Planning step failed'); }
    const planTokens = Math.ceil(res.text.length / 4);
    ledger.record(supervisor, worker ? 'supervisor' : 'solo', 'planned', planTokens);
    const planCost = (planTokens / 1_000_000) * 0.30;
    ctx.usageTracker?.recordUsage(planTokens, planCost, supervisor, res.inputTokens, res.outputTokens, 'supervisor', path.basename(root));
    let raw = res.text.trim().replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    // [FIX] Walk balanced brackets instead of greedy regex — prevents over-capture when AI adds extra text after the array
    const _s = raw.indexOf('['); if (_s !== -1) { let _d = 0; for (let _i = _s; _i < raw.length; _i++) { if (raw[_i]==='[') _d++; else if (raw[_i]===']' && --_d===0) { raw = raw.slice(_s, _i+1); break; } } }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) { throw new Error('AI returned empty plan'); }
    filePlan = parsed.map((e: any) => ({ filename: e.filename || e.file || 'src/output.py', purpose: e.purpose || '' }));
    tracer.done(_planSid, 'success', Date.now() - _planT0, `${filePlan.length} files planned`, Math.ceil(planPrompt.length / 4), planTokens);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, planPrompt, `Build plan failed: ${errMsg}`, promptLen);
    conversation.pop(); conversation.pop();
    appendMsg(ctx, `❌ Couldn't plan your build\n\n**Reason:** ${errMsg}\n\nTry again or describe what you want differently.`);
    return;
  }

  updateLastMsg(ctx, `📋 Plan ready — ${filePlan.length} file${filePlan.length !== 1 ? 's' : ''} to build`);

  // Snapshot before building
  let snapshotId: string | undefined;
  try { const snap = new SnapshotService(root); snapshotId = snap.prepare(task, filePlan.map(f => f.filename)); } catch { /* never block */ }

  appendMsg(ctx, encodeStoryToken(['Starting build...']));
  const storyMsgIndex = ctx.conversation.length - 1;

  const loopResult = await runFileBuildLoop({
    task, ctx, filePlan, relevant, blueprintContext, answersBlock,
    routing, supervisor, worker, supervisorLabel, workerLabel,
    buildId, phaseUndo, ledger, storyMsgIndex,
  });

  // On failure, error message already shown by loop; just return
  if (!loopResult.success) { return; }

  const { builtFiles, totalTokens, totalCost, storyLines } = loopResult;
  const elapsed = (Date.now() - buildStart) / 1000;

  // Auto-capture built files to vault
  const projectName = ctx.chassis?.loadConfig?.()?.projectName || 'Unknown';
  const absPaths = builtFiles.map(f => path.join(root, f));
  // [FIX] Pass callAI so quality gate runs on vault capture (was always using heuristic fallback)
  const _callAI = (p: string) => routing.prompt(p, 12_000);
  const capture = vault ? await autoCaptureFiles(absPaths, projectName, vault, task, _callAI) : { newItems: 0, skippedDupes: 0, totalExtracted: 0, failed: false, savedNames: [] };

  // Mark story complete
  ctx.conversation[storyMsgIndex].content = '__STORY_DONE__' + encodeStoryToken(storyLines).slice('__STORY__'.length);
  ctx.refresh();

  // Final result card
  const ledgerSummary = ledger.hasData() ? ledger.getSummary() : undefined;
  const resultCard = buildResultCard(builtFiles, relevant.length, totalTokens, totalCost, elapsed, snapshotId, capture, false, ledgerSummary);
  const htmlFile = builtFiles.find(f => f.endsWith('.html'));
  const previewToken = htmlFile ? `\n__PREVIEW_BROWSER__${path.join(root, htmlFile)}|||END_PREVIEW_BROWSER__` : '';
  const nextSteps = buildPostBuildGuidance(root, builtFiles);
  appendMsg(ctx, `${resultCard}${previewToken}${nextSteps}`, totalTokens, totalCost);

  tracer.vault('save', `${builtFiles.length} files saved to vault`);
  tracer.end(builtFiles, totalTokens, totalCost);
  if (!ctx.assistMode) { writeProjectRoadmapEntry(root, `AI build: ${task.slice(0, 60)}`, builtFiles.map(f=>`Built \`${f}\``).concat([`Supervisor: ${supervisorLabel} Tokens: ~${totalTokens} Cost: $${totalCost.toFixed(4)}`])); }
  if (ctx.onBuildFinished) { ctx.onBuildFinished(task, builtFiles); }
  if (!ctx.assistMode) { await autoCommitIfEnabled(root, `CHASSIS added ${builtFiles.length} files: ${task.slice(0, 60)}`, builtFiles); }
  refreshSetupProgressIfOpen().catch(() => {});

  // Build history — use supervisor/worker captured at start of build, not a re-poll
  try {
    new BuildHistoryService(root).record(makeBuildHistoryEntry({ snapshotId: snapshotId || Date.now().toString(), task, files: builtFiles, tokensUsed: totalTokens, costUSD: totalCost, source: 'ai', supervisor: supervisor || 'gemini', worker: worker || null, resultCardToken: resultCard }));
  } catch { /* never block */ }

  await runCompileAutoFix(ctx, builtFiles).catch(() => {}); await runTestAutoFix(ctx, builtFiles).catch(() => {});
  generateDocs(root, task, blueprintContext, filePlan, routing)
    .then(docPath => { if (docPath.endsWith('.md')) { conversation.push({ role: 'assistant', content: `📖 Documentation written to \`${docPath}\``, timestamp: Date.now() }); ctx.refresh(); } }).catch(() => {});
}
