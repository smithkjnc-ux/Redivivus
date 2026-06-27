// [SCOPE] Routing Service -- promptCheap implementation, extracted from routingService.ts (203-line split)
// Calls cheapest/free AI models first (Groq -> Gemini -> Kimi) for Q&A, classification, and simple tasks.
// [FIX] Now passes tier='flash' to callProvider so providers use their cheapest model, not their best.
// [FIX] Caps at pro-tier: never escalates to ultra-tier models (Opus, o3, Gemini Pro) for Q&A.
//       Those are reserved for complex builds. A Q&A that exhausts flash should use pro, not ultra.

import { callProvider } from '../logic/providers/providerFactory.js';
import { AI_RANK } from './guardianAI.js';
import { redivivusLog } from '../../../features/logging/data/redivivusLogger.js';
import { logTelemetry } from '../../../features/api/data/apiClientTelemetry.js';
import { logAICall } from './aiCallLogger.js';
import { shouldSkipProvider, getSkipInfo } from './providerQuotaTracker.js';
import type { RoutingService } from './routingService.js';
import type { AIResponse } from './routingTypes.js';

// [WARN] Providers whose cheapest model is still ultra-tier priced — excluded from Q&A fallback.
// These are only appropriate for complex builds routed via routingComplexity.ts.
// [DEAD] Tried including all providers — resulted in Claude Opus answering "what time is it". Never again.
const ULTRA_ONLY_PROVIDERS = new Set<string>([]); // currently none — all providers have flash models

// Maximum providers to attempt for a Q&A before giving up.
// [WARN] Keeps Q&A snappy — don't raise above 4. If 4 providers all fail, user has a real key problem.
const MAX_QA_ATTEMPTS = 4;

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

  // Sort cheapest-first (ascending AI_RANK), cap at MAX_QA_ATTEMPTS, exclude ultra-only providers.
  // [FIX] Pass tier='flash' so each provider uses its cheapest model (Haiku not Opus, Llama 8B not 70B).
  const ranked = Object.entries(AI_RANK)
    .filter(([ai]) => keyMap[ai]?.() && !ULTRA_ONLY_PROVIDERS.has(ai))
    .sort(([, a], [, b]) => a - b) // ascending = cheapest first
    .map(([ai]) => ai)
    .slice(0, MAX_QA_ATTEMPTS);

  if (ranked.length === 0) {
    return { text: '', model: 'none', success: false, error: 'No AI key configured.' };
  }

  redivivusLog({ operation: 'chat', message: 'AI prompt sent (cheap-first, flash tier)', data: { ai: ranked[0], promptLength: text.length } });

  let lastError = '';
  for (let i = 0; i < ranked.length; i++) {
    const ai = ranked[i];
    if (shouldSkipProvider(ai)) {
      const info = getSkipInfo(ai);
      const eta = info ? Math.ceil((info.resumesAt - Date.now()) / 60_000) + 'm' : 'later';
      lastError = `${ai} skipped — ${info?.reason ?? 'unavailable'} (resumes in ~${eta})`;
      if (i < ranked.length - 1 && (svc as any).promptFailoverCallback) { (svc as any).promptFailoverCallback(ai, ranked[i + 1]); }
      continue;
    }
    const startTime = Date.now();
    const fetchFn = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, timeoutMs);

    // [FIX] Hard full-call deadline — AbortController aborts connection but not body read in Electron.
    const deadlineMs = timeoutMs + 3000;
    const result = await Promise.race([
      // [FIX] Pass tier='flash' — ensures Haiku (not Sonnet/Opus) for Claude, Llama 8B (not 70B) for Groq, etc.
      callProvider(ai, text, fetchFn, 'flash', imageBase64, imageType, systemMessage),
      new Promise<AIResponse>(resolve => setTimeout(() => resolve({
        text: '', model: ai, success: false, error: `${ai} timed out after ${deadlineMs}ms`,
      }), deadlineMs)),
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

    // [FIX] Fail over on ANY error — next provider can only help.
    lastError = result.error || 'Unknown error';
    if (i < ranked.length - 1 && (svc as any).promptFailoverCallback) {
      (svc as any).promptFailoverCallback(ai, ranked[i + 1]);
    }
  }

  return { text: '', model: 'none', success: false, error: `All AI providers failed. Last error: ${lastError}` };
}
