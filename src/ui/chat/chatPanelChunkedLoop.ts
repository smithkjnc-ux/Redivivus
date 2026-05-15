// [SCOPE] CHASSIS Chat Panel Chunked Build — per-file build loop
// Extracted from chatPanelChunked.ts per [NEXT] marker

import * as path from 'path';
import * as fs from 'fs';
import { BuildContext } from './chatPanelBuild.js';
import { appendMsg, updateLastMsg } from './chatPanelChunked.js';
import { extractAllNarrators, encodeStoryToken } from './chatPanelStory.js';
import { reviewPhase, ProviderCaller } from '../../services/ai/supervisorReview.js';

export interface FileBuildLoopContext {
  task: string;
  ctx: BuildContext;
  filePlan: Array<{ filename: string; purpose: string }>;
  relevant: Array<any>;
  blueprintContext: string;
  answersBlock: string;
  routing: any;
  supervisor: string;
  worker: string | null;
  supervisorLabel: string;
  workerLabel: string | null;
  buildId: string;
  phaseUndo: any;
  ledger: any;
  storyMsgIndex: number;
}

export interface FileBuildLoopResult {
  success: boolean;
  builtFiles: string[];
  totalTokens: number;
  totalCost: number;
  storyLines: string[];
}

export async function runFileBuildLoop(lctx: FileBuildLoopContext): Promise<FileBuildLoopResult> {
  const { task, ctx, filePlan, relevant, blueprintContext, answersBlock, routing, supervisor, worker, supervisorLabel, workerLabel, buildId, phaseUndo, ledger, storyMsgIndex } = lctx;
  const { conversation } = ctx;
  const builtFiles: string[] = [];
  let totalTokens = 0;
  let totalCost = 0;
  const storyLines: string[] = [];

  function updateStory(lines: string[]): void {
    ctx.conversation[storyMsgIndex].content = encodeStoryToken(lines);
    ctx.refresh();
  }

  for (let i = 0; i < filePlan.length; i++) {
    const entry = filePlan[i];
    const fileNum = i + 1;
    const total = filePlan.length;
    const phaseName = `File ${fileNum}: ${entry.filename}`;

    phaseUndo.snapshotBeforePhase(buildId, phaseName, [entry.filename], `Build ${entry.filename}: ${entry.purpose}`);
    appendMsg(ctx, `⚙️ Building file ${fileNum} of ${total}: \`${entry.filename}\`...`);

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
      let res = await routing.routeByComplexity(task, filePrompt, 60_000);
      const is429 = !res.success && (res.error?.includes('429') || res.error?.includes('quota') || res.error?.includes('insufficient'));
      if (is429 && worker && worker !== supervisor) {
        ctx.logError(task, filePrompt, `[SUPERVISOR FALLBACK] Worker 429 on file ${entry.filename} — Supervisor (${supervisor}) taking over`, filePromptLen);
        appendMsg(ctx, `⚠️ ${workerLabel} quota exceeded — ${supervisorLabel} (Supervisor) taking over for this file`);
        const f = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 60_000);
        const { callProvider } = await import('../../services/ai/routingProviders.js');
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
      if (!is429) {
        ledger.record(worker || supervisor, worker ? 'worker' : 'solo', 'built', fileTokens);
        ctx.usageTracker?.recordUsage(fileTokens, fileCost, worker || supervisor);
      }
      if (i === 0) {
        const pairLabel = worker ? `🧠 ${supervisorLabel} → ${workerLabel}` : `🧠 ${supervisorLabel}`;
        appendMsg(ctx, `${pairLabel} — building ${filePlan.length} file${filePlan.length !== 1 ? 's' : ''}`);
      }

      if (worker && worker !== supervisor) {
        const planSummary = filePlan.map(f => `${f.filename}: ${f.purpose}`).join(', ');
        const logFallback = (msg: string) => ctx.logError(task, filePrompt, msg, filePromptLen);
        const caller: ProviderCaller = async (ai, prompt) => {
          try {
            const f = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 20_000);
            const { callProvider } = await import('../../services/ai/routingProviders.js');
            return await callProvider(ai, prompt, f);
          } catch { return { text: '', success: false }; }
        };
        const review = await reviewPhase({
          code, originalPrompt: task, filePrompt, planSummary,
          supervisorAI: supervisor, workerAI: worker,
          caller, logFallback,
        });
        const reviewTokens = Math.ceil(filePrompt.length / 4 * 0.15);
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
      appendMsg(ctx, `❌ Failed on file ${fileNum} of ${total}: \`${entry.filename}\`\n\n**Reason:** ${errMsg}\n\n_Built ${builtFiles.length > 0 ? builtFiles.length + ' file(s) before this. ' : ''}Full details in \`.chassis/build_errors.log\`_`);
      return { success: false, builtFiles, totalTokens, totalCost, storyLines };
    }

    const fileNarrations = extractAllNarrators(code);
    code = code.replace(/^\s*(?:\/\/|#|--)?\s*NARRATOR:\s*.+\n?/gm, '').trim();

    try {
      const absPath = path.join(ctx.root, entry.filename);
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(absPath, code, 'utf8');
      builtFiles.push(entry.filename);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.logError(task, filePrompt, `Write failed for ${entry.filename}: ${errMsg}`, filePromptLen);
      conversation.pop();
      appendMsg(ctx, `❌ Could not write \`${entry.filename}\`\n\n**Reason:** ${errMsg}\n\n_Full details in \`.chassis/build_errors.log\`_`);
      return { success: false, builtFiles, totalTokens, totalCost, storyLines };
    }

    conversation.pop();
    if (fileNarrations.length > 0) { storyLines.push(...fileNarrations); }
    else { storyLines.push(`Built \`${entry.filename}\` — ${entry.purpose}`); }
    updateStory(storyLines);
    appendMsg(ctx, `✅ Built ${fileNum} of ${total}: \`${entry.filename}\`\n__BUILD_RESULT__${entry.filename}|||${path.join(ctx.root, entry.filename)}|||END__`, fileTokens, fileCost);
  }

  return { success: true, builtFiles, totalTokens, totalCost, storyLines };
}
