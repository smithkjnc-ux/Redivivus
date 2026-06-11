// [SCOPE] Orchestrated build implementation — extracted from routingService to stay under 200 lines
// Coordinates multi-AI builds: plan → execute → review pipeline

import { AI_RANK } from './guardianAI.js';
import { callProvider } from '../../core/ai/providers/providerFactory.js';
import type { OrchestratedResult, ProgressCallback } from './supervisorOrchestrator.js';
import { createPlan, executeStep, reviewOutput } from './supervisorOrchestrator.js';
import type { RoutingService } from './routingService.js';
import { recordQuotaError, looksLikeQuotaError } from './providerTierState.js';

/** Full orchestrated build pipeline — called by RoutingService.orchestratedBuild() */
export async function orchestratedBuildImpl(
  routing: RoutingService,
  task: string,
  context: string,
  onProgress?: ProgressCallback
): Promise<OrchestratedResult> {
  const keyMap = routing.getKeyMap();
  const ranked = Object.entries(AI_RANK)
    .filter(([ai]) => keyMap[ai]?.())
    .sort(([, a], [, b]) => b - a)
    .map(([ai]) => ai);

  // [WARN] Build a callAI function that uses the routing service's timeout mechanism
  const callAI = async (ai: string, prompt: string) => {
    const fetchFn = (url: string, opts: RequestInit) => fetchWithTimeout(url, opts, 60_000);
    const res = await callProvider(ai, prompt, fetchFn);
    // Feed the tier detector from worker-level quota failures too (orchestrated builds don't go
    // through RoutingService.prompt, so this is the only hook on this path).
    if (!res.success && looksLikeQuotaError(res.error || '')) { recordQuotaError(ai); }
    return res;
  };

  onProgress?.('planning', '🎯 Creating build plan...');
  const plan = await createPlan(task, ranked, context, callAI);

  let assembledCode = '';
  let totalTokens = 0;
  for (const step of plan) {
    onProgress?.('executing', `⚙️ ${step.assignedLabel} is working on: ${step.description}`);
    const result = await executeStep(step, task, assembledCode, callAI);
    assembledCode = result.code || assembledCode;
    totalTokens += result.tokens;
  }

  // Only review if 2+ AIs and supervisor is different from the worker
  let reviewPassed = true;
  let reviewNotes = '';
  if (ranked.length >= 2) {
    onProgress?.('reviewing', '🛡️ Supervisor is reviewing the output...');
    const review = await reviewOutput(task, assembledCode, ranked[0], callAI);
    reviewPassed = review.passed;
    reviewNotes = review.notes;
    assembledCode = review.corrected;
    totalTokens += Math.ceil(assembledCode.length / 4);
  }

  return { finalCode: assembledCode, plan, reviewPassed, reviewNotes, totalTokensEstimate: totalTokens };
}

/** Timeout-aware fetch helper */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 60_000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(id); }
}
