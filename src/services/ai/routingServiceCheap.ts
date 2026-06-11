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
    // [FIX] Hard full-call deadline — the AbortController in fetchWithTimeout aborts the connection but
    // not the body read (Electron fetch), so a provider that connects then hangs would freeze forever and
    // never fail over. Promise.race guarantees we move on to the next (cheap) AI.
    const deadlineMs = timeoutMs + 3000;
    const result = await Promise.race([
      callProvider(ai, text, fetchFn, undefined, imageBase64, imageType, systemMessage),
      new Promise<AIResponse>(resolve => setTimeout(() => resolve({ text: '', model: ai, success: false, error: `${ai} timed out after ${deadlineMs}ms (no response)` }), deadlineMs)),
    ]);
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
    // [FIX] Fail over on ANY error (timeout, hang, quota, auth, bad/empty response, 4xx/5xx). User's rule:
    // when an AI stops for any reason, drop to the next-ranked AI and continue — never give up on attempt 1.
    lastError = result.error || 'Unknown error';
    if (i < ranked.length - 1 && (svc as any).promptFailoverCallback) {
      (svc as any).promptFailoverCallback(ai, ranked[i + 1]);
    }
  }
  return { text: '', model: 'none', success: false, error: `All AI providers failed. Last error: ${lastError}` };
}
