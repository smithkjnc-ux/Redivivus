// [SCOPE] Routing Service -- promptCheap implementation, extracted from routingService.ts (203-line split)
// Calls cheapest/free AI models first (Groq -> Gemini -> Kimi) for Q&A, classification, and simple tasks.
// Falls back to expensive models only if cheap ones fail.

import { callProvider } from '../../core/ai/providers/providerFactory.js';
import { AI_RANK } from './guardianAI.js';
import { redivivusLog } from '../logging/redivivusLogger.js';
import { logTelemetry } from '../api/apiClient.js';
import { logAICall } from './aiCallLogger.js';
import type { RoutingService } from './routingService.js';
import type { AIResponse } from './routingTypes.js';

export async function promptCheapImpl(
  svc: RoutingService,
  text: string,
  timeoutMs = 30_000,
  imageBase64?: string,
  imageType?: string,
  systemMessage?: string,
  role = 'cheap'
): Promise<AIResponse & { usingFallback?: string }> {
  const keyMap = svc.getKeyMap();
  const ranked = Object.entries(AI_RANK)
    .filter(([ai]) => keyMap[ai]?.())
    .sort(([, a], [, b]) => a - b)
    .map(([ai]) => ai);

  if (ranked.length === 0) {
    return { text: '', model: 'none', success: false, error: 'No AI key configured.' };
  }

  redivivusLog({ operation: 'chat', message: 'AI prompt sent (cheap-first)', data: { ai: ranked[0], promptLength: text.length } });

  let lastError = '';
  for (let i = 0; i < ranked.length; i++) {
    const ai = ranked[i];
    const startTime = Date.now();
    const fetchFn = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, timeoutMs);
    const result = await callProvider(ai, text, fetchFn, undefined, imageBase64, imageType, systemMessage);
    if (result.success) {
      logTelemetry('ai_prompt', { model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens, success: true });
      logAICall({
        role,
        model: result.model || ai,
        prompt: text,
        response: result.text || '',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: Date.now() - startTime,
      });
      return { ...result, usingFallback: i > 0 ? ai : undefined };
    }
    const err = (result.error || '').toLowerCase();
    const isRetryable = err.includes('timed out') || err.includes('timeout') || err.includes('abort')
      || err.includes('network') || err.includes('enotfound') || err.includes('econnrefused')
      || err.includes('fetch') || err.includes('credit') || err.includes('balance')
      || err.includes('quota') || err.includes('rate limit') || err.includes('rate_limit')
      || err.includes('429') || err.includes('402') || err.includes('insufficient')
      || err.includes('overloaded') || err.includes('capacity') || err.includes('billing');
    lastError = result.error || 'Unknown error';
    if (!isRetryable) { return result; }
    if (i < ranked.length - 1 && (svc as any).promptFailoverCallback) {
      (svc as any).promptFailoverCallback(ai, ranked[i + 1]);
    }
  }
  return { text: '', model: 'none', success: false, error: `All AI providers failed. Last error: ${lastError}` };
}
