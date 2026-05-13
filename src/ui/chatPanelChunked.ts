// [SCOPE] CHASSIS Chat Panel Chunked Build — multi-file build pipeline with clarification, plan, per-file progress
// [WARN] This file is 216 lines — slightly over 200-line limit. See [NEXT] marker.
// [NEXT] Split: Extract per-file build loop (~lines 120-200) → chatPanelChunkedLoop.ts when next feature added

import * as path from 'path';
import * as fs from 'fs';
import { findRelevantByTask, VaultSearchResult } from '../services/buildFromVaultSearch.js';
import { getPhaseUndoService } from '../services/phaseUndoService.js';
import { BuildContext } from './chatPanelBuild.js';
import { generateClarifyQuestions, encodeClarifyToken, formatAnswersForPrompt } from './chatPanelClarify.js';
import { extractNarrator, extractAllNarrators, encodeStoryToken, buildResultCard } from './chatPanelStory.js';
import { generateDocs } from './chatPanelDocs.js';
import { SnapshotService } from '../services/snapshotService.js';
import { autoCaptureFiles } from '../services/vaultAutoCapture.js';
import { reviewPhase, ProviderCaller } from '../services/supervisorReview.js';
import { BuildLedger } from '../services/buildLedgerService.js';
import { BuildHistoryService, makeBuildHistoryEntry } from '../services/buildHistoryService.js';

function appendMsg(ctx: BuildContext, content: string, tokens = 0, cost = 0): void {
  ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now(), tokens: tokens || undefined, cost: cost || undefined });
  ctx.refresh();
}

function updateLastMsg(ctx: BuildContext, content: string): void {
  const last = ctx.conversation[ctx.conversation.length - 1];
  if (last && last.role === 'assistant') { last.content = content; }
  else { ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() }); }
  ctx.refresh();
}

/** Multi-file chunked build — clarify → vault search → plan → per-file builds with visible progress */
export async function runChunkedBuild(
  task: string,
  ctx: BuildContext,
): Promise<void> {
  const { root, vault, blueprintContext, routing, conversation } = ctx;
  const buildStart = Date.now();

  // ── Supervisor/Worker selection ──
  const { supervisor, worker } = routing.selectSupervisorAndWorker();
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };
  const supervisorLabel = aiLabels[supervisor] || supervisor;
  const workerLabel = worker ? (aiLabels[worker] || worker) : null;

  // ── Build ledger ──
  const ledger = new BuildLedger();

  // ── Initialize phase undo service for this build ──
  const phaseUndo = getPhaseUndoService(root);
  const buildId = phaseUndo.startPhasedBuild(task);

  // Clarification step: ask AI for questions, show form, wait for answers
  let answersBlock = '';
  const isDirectSplit = /split/i.test(task) && /lines/i.test(task);
  if (ctx.postToWebview && !isDirectSplit) {  // onClarifySubmit is set inside the Promise below — check only postToWebview
    appendMsg(ctx, '🤔 Preparing a few quick questions...');
    const questions = await generateClarifyQuestions(task, blueprintContext, routing);
    if (questions.length > 0) {
      // Replace thinking message with the clarify form token
      const last = conversation[conversation.length - 1];
      if (last && last.role === 'assistant') { last.content = encodeClarifyToken(questions); }
      ctx.refresh();
      // Suspend — wait for user to submit the form
      const answers = await new Promise<Record<string, string>>((resolve) => {
        ctx.onClarifySubmit = resolve;
      });
      answersBlock = formatAnswersForPrompt(answers);
      // Replace form with a compact summary of choices
      const summary = Object.entries(answers).map(([q, a]) => `  • ${q}: **${a}**`).join('\n');
      const last2 = conversation[conversation.length - 1];
      if (last2 && last2.role === 'assistant') { last2.content = `✅ Got it — building with your choices:\n${summary}`; }
      ctx.refresh();
    } else {
      // AI returned no questions — remove thinking message and proceed
      conversation.pop();
      ctx.refresh();
    }
  }

  // Fix 3: Show vault search step
  appendMsg(ctx, '🔍 Searching vault...');
  const vaultItems = vault ? vault.listItems() : [];
  const searchResult: VaultSearchResult = vaultItems.length > 0 
    ? findRelevantByTask(task, vaultItems)
    : { items: [], totalScanned: 0, matchedCount: 0, highConfidenceCount: 0 };
  const relevant = searchResult.items;
  const vaultMsg = relevant.length > 0 
    ? `🔍 Vault: ${relevant.length} relevant from ${searchResult.totalScanned} scanned (${searchResult.highConfidenceCount} high confidence)`
    : `🔍 Vault: No matches found in ${searchResult.totalScanned} items`;
  updateLastMsg(ctx, vaultMsg);

  // Fix 3: Show planning step
  const plannerLabel = workerLabel ? `${supervisorLabel} (Supervisor)` : supervisorLabel;
  appendMsg(ctx, `📋 Planning build — ${plannerLabel} generating file list...`);

  // Plan prompt: intentionally minimal — no vault snippets, no code request, just the file list
  // [WARN] Keeping this small prevents timeouts on the planning step
  const planPrompt = `I need to build: "${task}"
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}${answersBlock ? `${answersBlock}\n` : ''}Break this into individual source files, each under 200 lines.
Return ONLY a JSON array — no markdown, no explanation, no code:
[
  {"file": "src/models.py", "purpose": "Data models for expenses"},
  {"file": "src/storage.py", "purpose": "Save and load data from JSON file"},
  {"file": "src/main.py", "purpose": "CLI entry point"}
]`;

  const promptLen = Math.ceil(planPrompt.length / 4);
  // Normalise plan entries — AI may return {file} or {filename}, tolerate both
  interface PlanEntry { filename: string; purpose: string; }
  let filePlan: PlanEntry[] = [];

  try {
    const res = await (workerLabel
      ? (async () => { const f = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 30_000); const { callProvider } = await import('../services/routingProviders.js'); return callProvider(supervisor, planPrompt, f); })()
      : routing.prompt(planPrompt, 30_000)); // plan is tiny — 30s is fine
    if (!res.success) { throw new Error(res.error || 'Planning step failed'); }
    // Record plan tokens to ledger
    const planTokens = Math.ceil(res.text.length / 4);
    ledger.record(supervisor, worker ? 'supervisor' : 'solo', 'planned', planTokens);
    const planCost = (planTokens / 1_000_000) * 0.30;
    ctx.usageTracker?.recordUsage(planTokens, planCost, supervisor);
    let raw = res.text.trim().replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (arrMatch) { raw = arrMatch[0]; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) { throw new Error('AI returned empty plan'); }
    // normalise {file} → {filename}
    filePlan = parsed.map((e: any) => ({ filename: e.filename || e.file || 'src/output.py', purpose: e.purpose || '' }));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, planPrompt, `Build plan failed: ${errMsg}`, promptLen);
    conversation.pop();
    conversation.pop();
    appendMsg(ctx, `❌ Build plan failed\n\n**Reason:** ${errMsg}\n\n_Prompt was ~${promptLen} tokens. Full details in \`.chassis/build_errors.log\`_`);
    return;
  }

  updateLastMsg(ctx, `📋 Plan ready — ${filePlan.length} file${filePlan.length !== 1 ? 's' : ''} to build`);

  // Snapshot all planned files before writing anything — enables Undo Everything
  let snapshotId: string | undefined;
  try {
    const snap = new SnapshotService(root);
    snapshotId = snap.prepare(task, filePlan.map(f => f.filename));
  } catch { /* never block a build */ }

  const builtFiles: string[] = [];
  let totalTokens = 0;
  let totalCost = 0;
  const storyLines: string[] = [];
  // Story narrator message — inserted once, updated in place after each file
  appendMsg(ctx, encodeStoryToken(['Starting build...']));
  const storyMsgIndex = ctx.conversation.length - 1;

  /** Updates the live story message in place with the current narrator lines array. */
  function updateStory(lines: string[]): void {
    ctx.conversation[storyMsgIndex].content = encodeStoryToken(lines);
    ctx.refresh();
  }

  for (let i = 0; i < filePlan.length; i++) {
    const entry = filePlan[i];
    const fileNum = i + 1;
    const total = filePlan.length;
    const phaseName = `File ${fileNum}: ${entry.filename}`;
    
    // ── Snapshot phase before building ──
    phaseUndo.snapshotBeforePhase(
      buildId,
      phaseName,
      [entry.filename],
      `Build ${entry.filename}: ${entry.purpose}`
    );
    
    appendMsg(ctx, `⚙️ Building file ${fileNum} of ${total}: \`${entry.filename}\`...`);

    // Full file list gives the AI import context without including any code
    const allFiles = filePlan.map(f => `  - ${f.filename}: ${f.purpose}`).join('\n');
    const vaultSnippets = relevant.slice(0, 4).map(v => `# FROM VAULT: ${v.name}\n${v.code}`).join('\n\n');
    const filePrompt = `You are CHASSIS. Build one file as part of a larger project.

PROJECT TASK: "${task}"
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}${answersBlock ? `${answersBlock}\n` : ''}ALL FILES IN THIS PROJECT (for import awareness):
${allFiles}

FILE TO BUILD NOW: ${entry.filename}
PURPOSE: ${entry.purpose}
${relevant.length > 0 ? `VAULT ITEMS (reuse where relevant):\n${vaultSnippets}\n` : ''}RULES:
- Implement ONLY ${entry.filename} — do not output any other file
- Keep it under 200 lines
- Add a [SCOPE] comment at the top
- On the FIRST line, add a \`// NARRATOR:\` comment describing in plain English what this file does
- Write working, production-ready code with correct imports
- Return ONLY the code — no markdown fences, no explanation`;

    const filePromptLen = Math.ceil(filePrompt.length / 4);
    let code: string;
    let fileTokens = 0;
    let fileCost = 0;

    try {
      // [CHASSIS] Worker executes each file. Supervisor reviews after. Solo = supervisor does both.
      let res = await routing.routeByComplexity(task, filePrompt, 60_000); // 60s per file
      // [CHASSIS] 429 = quota/balance exceeded — auto-promote to supervisor, same as any worker failure
      const is429 = !res.success && (res.error?.includes('429') || res.error?.includes('quota') || res.error?.includes('insufficient'));
      if (is429 && worker && worker !== supervisor) {
        ctx.logError(task, filePrompt, `[SUPERVISOR FALLBACK] Worker 429 on file ${entry.filename} — Supervisor (${supervisor}) taking over`, filePromptLen);
        appendMsg(ctx, `⚠️ ${workerLabel} quota exceeded — ${supervisorLabel} (Supervisor) taking over for this file`);
        const f = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 60_000);
        const { callProvider } = await import('../services/routingProviders.js');
        res = await callProvider(supervisor, filePrompt, f) as typeof res;
        const fallbackTokens = Math.ceil((res.text || '').length / 4);
        ledger.record(supervisor, 'supervisor', 'fallback', fallbackTokens);
        const fallbackCost = (fallbackTokens / 1_000_000) * 0.30;
        ctx.usageTracker?.recordUsage(fallbackTokens, fallbackCost, supervisor);
      }
      if (!res.success) { throw new Error(res.error || 'AI generation failed'); }
      code = res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
      if (!code) { throw new Error('AI returned an empty response'); }
      fileTokens = Math.ceil(res.text.length / 4);
      fileCost = (fileTokens / 1_000_000) * 0.30;
      totalTokens += fileTokens;
      totalCost += fileCost;
      // Record build tokens to ledger
      if (!is429) {
        ledger.record(worker || supervisor, worker ? 'worker' : 'solo', 'built', fileTokens);
        ctx.usageTracker?.recordUsage(fileTokens, fileCost, worker || supervisor);
      }
      // Show routing info on first file only
      if (i === 0) {
        const pairLabel = worker ? `🧠 ${supervisorLabel} → ${workerLabel}` : `🧠 ${supervisorLabel}`;
        appendMsg(ctx, `${pairLabel} — building ${filePlan.length} file${filePlan.length !== 1 ? 's' : ''}`);
      }

      // [CHASSIS] Supervisor review — only when worker is different from supervisor
      if (worker && worker !== supervisor) {
        const planSummary = filePlan.map(f => `${f.filename}: ${f.purpose}`).join(', ');
        const logFallback = (msg: string) => ctx.logError(task, filePrompt, msg, filePromptLen);
        // Build a caller that goes through routingProviders directly
        const caller: ProviderCaller = async (ai, prompt) => {
          try {
            const f = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 20_000);
            const { callProvider } = await import('../services/routingProviders.js');
            return await callProvider(ai, prompt, f);
          } catch { return { text: '', success: false }; }
        };
        const review = await reviewPhase({
          code, originalPrompt: task, filePrompt, planSummary,
          supervisorAI: supervisor, workerAI: worker,
          caller, logFallback,
        });
        // Record review tokens (estimate from prompt length)
        const reviewTokens = Math.ceil(filePrompt.length / 4 * 0.15); // scope check is short
        ledger.record(supervisor, 'supervisor', 'reviewed', reviewTokens);
        const reviewCost = (reviewTokens / 1_000_000) * 0.30;
        ctx.usageTracker?.recordUsage(reviewTokens, reviewCost, supervisor);
        if (!review.passed && review.correctedCode) {
          const corrTokens = Math.ceil(review.correctedCode.length / 4);
          ledger.record(supervisor, 'supervisor', 'corrected', corrTokens);
          const corrCost = (corrTokens / 1_000_000) * 0.30;
          ctx.usageTracker?.recordUsage(corrTokens, corrCost, supervisor);
          code = review.correctedCode.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
          appendMsg(ctx, `🔍 Supervisor (${supervisorLabel}) corrected phase ${fileNum}: ${review.issues.join('; ')}`);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.logError(task, filePrompt, `File ${entry.filename}: ${errMsg}`, filePromptLen);
      conversation.pop();
      appendMsg(ctx,
        `❌ Failed on file ${fileNum} of ${total}: \`${entry.filename}\`\n\n**Reason:** ${errMsg}\n\n_Built ${builtFiles.length > 0 ? builtFiles.length + ' file(s) before this. ' : ''}Full details in \`.chassis/build_errors.log\`_`
      );
      return;
    }

    // Strip ALL NARRATOR lines BEFORE writing to disk — must not appear in built files
    const fileNarrations = extractAllNarrators(code);
    code = code.replace(/^\s*(?:\/\/|#|--)\s*NARRATOR:\s*.+\n?/gm, '').trim();

    try {
      const absPath = path.join(root, entry.filename);
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(absPath, code, 'utf8');
      builtFiles.push(entry.filename);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.logError(task, filePrompt, `Write failed for ${entry.filename}: ${errMsg}`, filePromptLen);
      conversation.pop();
      appendMsg(ctx, `❌ Could not write \`${entry.filename}\`\n\n**Reason:** ${errMsg}\n\n_Full details in \`.chassis/build_errors.log\`_`);
      return;
    }

    conversation.pop();
    const absPath = path.join(root, entry.filename);
    // fileNarrations already extracted before write above
    if (fileNarrations.length > 0) { storyLines.push(...fileNarrations); }
    else { storyLines.push(`Built \`${entry.filename}\` — ${entry.purpose}`); }
    updateStory(storyLines);
    appendMsg(ctx, `✅ Built ${fileNum} of ${total}: \`${entry.filename}\`\n__BUILD_RESULT__${entry.filename}|||${absPath}|||END__`, fileTokens, fileCost);
  }

  const elapsed = (Date.now() - buildStart) / 1000;
  // Auto-capture all built files to vault
  const projectName = ctx.chassis?.loadConfig?.()?.projectName || 'Unknown';
  const absPaths = builtFiles.map(f => path.join(root, f));
  const capture = vault ? autoCaptureFiles(absPaths, projectName, vault, task) : { newItems: 0, skippedDupes: 0, totalExtracted: 0, failed: false, savedNames: [] };
  // Mark story as complete
  ctx.conversation[storyMsgIndex].content = '__STORY_DONE__' + encodeStoryToken(storyLines).slice('__STORY__'.length);
  ctx.refresh();
  // Final result card with Undo Everything button + per-AI ledger breakdown
  const ledgerSummary = ledger.hasData() ? ledger.getSummary() : undefined;
  const resultCard = buildResultCard(builtFiles, relevant.length, totalTokens, totalCost, elapsed, snapshotId, capture, false, ledgerSummary);
  appendMsg(ctx, `${resultCard}`, totalTokens, totalCost);
  // ── Record completed phase with actual files for potential undo ──
  // (Phase already recorded in snapshotBeforePhase)
  if (ctx.onBuildFinished) { ctx.onBuildFinished(task, builtFiles); }
  // Record to build history
  try {
    const swPair2 = ctx.routing ? (ctx.routing as any).selectSupervisorAndWorker?.() : null;
    const hist2 = new BuildHistoryService(root);
    hist2.record(makeBuildHistoryEntry({ snapshotId: snapshotId || Date.now().toString(), task, files: builtFiles, tokensUsed: totalTokens, costUSD: totalCost, source: 'ai', supervisor: swPair2?.supervisor || 'gemini', worker: swPair2?.worker || null, resultCardToken: resultCard }));
  } catch { /* never block */ }
  // Generate docs in background
  generateDocs(root, task, blueprintContext, filePlan, routing)
    .then(docPath => {
      if (docPath.endsWith('.md')) { conversation.push({ role: 'assistant', content: `📖 Documentation written to \`${docPath}\``, timestamp: Date.now() }); ctx.refresh(); }
    })
    .catch(() => { /* best-effort */ });
}
