// [SCOPE] RoutingService.prompt() implementation — extracted from routingService.ts (Rule 9 split).
// Ranked failover loop: tries each AI in capability order, skips quota-blocked providers,
// persists sustained failures, and notifies callers of failover events via callbacks.

import { callProvider } from '../logic/providers/providerFactory.js';
import { AI_RANK } from './guardianAI.js';
import { redivivusLog } from '../../../features/logging/data/redivivusLogger.js';
import { logTelemetry } from '../../../features/api/data/apiClientTelemetry.js';
import { logAICall } from './aiCallLogger.js';
import { recordQuotaError } from './providerTierState.js';
import { getSkipInfo, recordUnavailable } from './providerQuotaTracker.js';
import { fmtMs } from './parseRateLimitInfo.js';
import { isSustainedFailure, describeProviderError } from './agentFailoverReason.js';
import type { RoutingService } from './routingService.js';
import type { AIResponse } from './routingTypes.js';

export async function promptImpl(
  svc: RoutingService,
  text: string,
  timeoutMs = 60_000,
  imageBase64?: string,
  imageType?: string,
  systemMessage?: string,
  role = 'worker',
  maxOutputTokens?: number,
): Promise<AIResponse & { usingFallback?: string }> {

  const keyMap = svc.getKeyMap();
  const ranked = Object.entries(AI_RANK)
    .filter(([ai]) => keyMap[ai]?.())
    .sort(([, a], [, b]) => b - a)
    .map(([ai]) => ai);

  if (ranked.length === 0) {
    redivivusLog({ operation: 'system', message: 'No AI keys configured', success: false });
    return {
      text: 'To build with Redivivus, you\'ll need at least one AI API key. I can walk you through adding one -- which AI service do you have access to?\n\n- **Anthropic (Claude)** -- console.anthropic.com\n- **Google (Gemini)** -- aistudio.google.com (free tier available)\n- **OpenAI (GPT)** -- platform.openai.com\n- **Other** -- Groq, xAI, Kimi also supported\n\nOpen **Redivivus Settings** (Ctrl+Shift+P -> "Redivivus: Open Settings") to add your key.',
      model: 'none', success: false, error: 'NO_API_KEY',
    };
  }

  const startTime = Date.now();
  redivivusLog({ operation: 'chat', message: 'AI prompt sent', data: { ai: ranked[0], promptLength: text.length, hasImage: !!imageBase64 } });

  // [WARN] Try each AI in rank order — failover on any error.
  let lastError = '';
  for (let i = 0; i < ranked.length; i++) {
    const ai = ranked[i];

    // Skip providers that are rate-limited or out of credits (persisted across reloads)
    const _skipInfo = getSkipInfo(ai);
    if (_skipInfo) {
      lastError = `${ai} skipped — ${_skipInfo.reason} (resumes in ${fmtMs(_skipInfo.resumesAt - Date.now())})`;
      if (i < ranked.length - 1 && svc.promptFailoverCallback) { svc.promptFailoverCallback(ai, ranked[i + 1]); }
      continue;
    }

    const fetchFn = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, timeoutMs);
    // [FIX] Hard full-call deadline — AbortController aborts the connection but NOT the body read in
    // Electron's fetch. Promise.race guarantees we always move on. +3s buffer avoids cutting off a
    // slow-but-working provider.
    const deadlineMs = timeoutMs + 3000;
    const result = await Promise.race([
      callProvider(ai, text, fetchFn, undefined, imageBase64, imageType, systemMessage, undefined, maxOutputTokens),
      new Promise<AIResponse>(resolve => setTimeout(() => resolve({ text: '', model: ai, success: false, error: `${ai} timed out after ${deadlineMs}ms (no response)` }), deadlineMs)),
    ]);

    if (result.success) {
      logTelemetry('ai_prompt', { model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens, success: true });
      logAICall({ role, model: result.model || ai, prompt: text, response: result.text || '', inputTokens: result.inputTokens, outputTokens: result.outputTokens, durationMs: Date.now() - startTime });
      return { ...result, usingFallback: i > 0 ? ai : undefined };
    }

    lastError = result.error || 'Unknown error';
    const err = lastError.toLowerCase();

    // Feed free-tier downshift detector
    const isCapacityError = err.includes('credit') || err.includes('balance') || err.includes('quota')
      || err.includes('rate limit') || err.includes('rate_limit') || err.includes('429')
      || err.includes('402') || err.includes('insufficient') || err.includes('overloaded')
      || err.includes('capacity') || err.includes('billing');
    if (isCapacityError) { recordQuotaError(ai); }

    // Persist sustained failures (out of credits / bad key) so they survive extension reloads
    if (isSustainedFailure(result.error)) { recordUnavailable(ai, describeProviderError(result.error)); }

    if (i < ranked.length - 1 && svc.promptFailoverCallback) { svc.promptFailoverCallback(ai, ranked[i + 1]); }
  }

  return { text: '', model: 'none', success: false, error: `All AI providers failed. Last error: ${lastError}` };
}
