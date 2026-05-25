// [SCOPE] Redivivus Chunked Build File Generation -- AI call, retry, 429 fallback, supervisor review
// Extracted from chatPanelChunkedLoop.ts (Rule 9 split -- was over 200 lines). Single-file generation only.
import * as path from 'path';
import type { BuildContext } from './chatPanelBuild';
import type { ProviderCaller } from '../../services/ai/supervisorReview';
import { reviewPhase } from '../../services/ai/supervisorReview';

export interface GenerateFileCodeParams {
  filePrompt: string;
  entry: { filename: string; purpose: string };
  fileNum: number;
  fileIndex: number;
  task: string;
  routing: any;
  supervisor: string;
  worker: string | null;
  supervisorLabel: string;
  workerLabel: string | null;
  filePlan: Array<{ filename: string; purpose: string }>;
  ledger: any;
  ctx: BuildContext;
  onMsg: (content: string) => void;
}

export interface GenerateFileCodeResult {
  code: string;
  fileTokens: number;
  fileCost: number;
}

export async function generateFileCode(p: GenerateFileCodeParams): Promise<GenerateFileCodeResult> {
  const { filePrompt, entry, fileNum, fileIndex, task, routing, supervisor, worker,
    supervisorLabel, workerLabel, filePlan, ledger, ctx, onMsg } = p;
  const filePromptLen = Math.ceil(filePrompt.length / 4);
  let code = '';
  let res: any;
  let is429 = false;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const f = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 60_000);
      const { callProvider } = await import('../ai/providers/providerFactory.js');
      // Use the designated worker AI directly; fall back to supervisor on 429/failure
      const primaryAI = worker || supervisor;
      res = await callProvider(primaryAI, filePrompt, f);
      (res as any).routedTo = primaryAI;
      is429 = !res.success && (res.error?.includes('429') || res.error?.includes('quota') || res.error?.includes('insufficient'));
      if ((is429 || !res.success) && primaryAI !== supervisor) {
        ctx.logError(task, filePrompt, `[SUPERVISOR FALLBACK] Worker ${primaryAI} failed on ${entry.filename} — Supervisor (${supervisor}) taking over`, filePromptLen);
        if (attempt === 1) { onMsg('⚠️ Switching AI — continuing...'); }
        res = await callProvider(supervisor, filePrompt, f) as typeof res;
        (res as any).routedTo = supervisor;
        is429 = !res.success && (res.error?.includes('429') || res.error?.includes('quota') || res.error?.includes('insufficient'));
        const fbTok = Math.ceil((res.text || '').length / 4);
        if (attempt === 1) {
          ledger.record(supervisor, 'supervisor', 'fallback', fbTok);
          ctx.usageTracker?.recordUsage(fbTok, (fbTok / 1_000_000) * 0.30, supervisor, res.inputTokens, res.outputTokens);
        }
      }
      if (!res.success) { throw new Error(res.error || 'AI generation failed'); }
      // [WARN] Worker AI often outputs BOTH files -- extractCodeFromResponse finds the largest block automatically
      const { extractCodeFromResponse } = await import('./chatPanelBuildInference.js');
      const blocks: { fenceLabel: string; content: string }[] = [];
      const fenceRe = /```(?:[a-zA-Z0-9]*)[ \t]*(.*)\n([\s\S]*?)```/g;
      let m: RegExpExecArray | null;
      while ((m = fenceRe.exec(res.text)) !== null) { blocks.push({ fenceLabel: m[1].trim(), content: m[2] }); }
      if (blocks.length > 1) {
        const bn = path.basename(entry.filename);
        const target = blocks.find(b => b.fenceLabel.includes(bn) || b.content.includes(bn) || b.content.includes(entry.filename));
        code = target ? target.content.trim() : extractCodeFromResponse(res.text);
      } else { code = extractCodeFromResponse(res.text); }
      if (!code) { throw new Error('AI returned an empty response'); }
      break;
    } catch (err) {
      if (attempt >= maxAttempts) { throw err; }
      ctx.logError(task, filePrompt, `Retry ${attempt}/${maxAttempts} failed for ${entry.filename}: ${err}`, filePromptLen);
      onMsg(`⚠️ Retrying part ${fileNum}...`);
    }
  }

  const fileTokens = Math.ceil(res.text.length / 4);
  const fileCost = (fileTokens / 1_000_000) * 0.30;
  if (!is429) {
    // [FIX] Use res.routedTo (actual AI that made the call) not the role-assigned 'worker'.
    const actualAI = (res as any).routedTo || worker || supervisor;
    ledger.record(actualAI, worker ? 'worker' : 'solo', 'built', fileTokens);
    ctx.usageTracker?.recordUsage(fileTokens, fileCost, actualAI, res.inputTokens, res.outputTokens);
  }
  if (fileIndex === 0) {
    const pairLabel = worker ? `🧠 ${supervisorLabel} → ${workerLabel}` : `🧠 ${supervisorLabel}`;
    onMsg(`${pairLabel} — building ${filePlan.length} file${filePlan.length !== 1 ? 's' : ''}`);
  }

  if (worker && worker !== supervisor) {
    const planSummary = filePlan.map(f => `${f.filename}: ${f.purpose}`).join(', ');
    const logFallback = (msg: string) => ctx.logError(task, filePrompt, msg, filePromptLen);
    const caller: ProviderCaller = async (ai, prompt) => {
      try {
        const f = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 20_000);
        const { callProvider } = await import('../ai/providers/providerFactory.js');
        return await callProvider(ai, prompt, f);
      } catch { return { text: '', success: false }; }
    };
    const review = await reviewPhase({ code, originalPrompt: task, filePrompt, planSummary, supervisorAI: supervisor, workerAI: worker, caller, logFallback });
    const revTok = Math.ceil(filePrompt.length / 4 * 0.15);
    ledger.record(supervisor, 'supervisor', 'reviewed', revTok);
    ctx.usageTracker?.recordUsage(revTok, (revTok / 1_000_000) * 0.30, supervisor);
    if (!review.passed && review.correctedCode) {
      const corrTok = Math.ceil(review.correctedCode.length / 4);
      ledger.record(supervisor, 'supervisor', 'corrected', corrTok);
      ctx.usageTracker?.recordUsage(corrTok, (corrTok / 1_000_000) * 0.30, supervisor);
      const { extractCodeFromResponse } = await import('./chatPanelBuildInference.js');
      code = extractCodeFromResponse(review.correctedCode);
      onMsg(`🔍 Making corrections to part ${fileNum}...`);
    }
  }

  return { code, fileTokens, fileCost };
}
