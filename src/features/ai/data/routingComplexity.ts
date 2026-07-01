// [SCOPE] AI chat router — classifies the task then scores all available models to pick the best provider.
// Replaced static 'Gemini-first' hardcode with dynamic scoring via routingEngine.
// [DONE 2026-06-22] Removed hardcoded provider preference list and binary simple/complex classification.
//   Old: aiClassifyComplexity() → simple|complex → ['gemini','claude','openai',...].find(has)
//   Why removed: ignored all capability/context/domain data; DeepSeek was missing from keyMap entirely.
//   New: analyzeTask() → TaskProfile → scoreModels() → ranked fallback chain ordered by fit.

import type { AIResponse } from './routingTypes.js';
import { estimateTokens, estimateCost } from './routingClassifier.js';
import { callProvider } from '../logic/providers/providerFactory.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey, getDeepseekKey } from './routingKeys.js';
import type { RoutingService } from './routingService.js';
import { analyzeTask, scoreModels } from './routingEngine.js';
// [FIX] AI-audit: mirror the reliability guards promptImpl (routingServicePrompt.ts) already has —
// skip quota-blocked providers, hard deadline, quota/outage recording, success logging. Kept as a
// local duplication rather than a shared helper: promptImpl builds its chain from AI_RANK with
// session-scoped skip notifications + failover callbacks that this scored-chain path does not use,
// so extraction would have been invasive and risked changing promptImpl's behavior.
import { getSkipInfo, recordUnavailable } from './providerQuotaTracker.js';
import { recordQuotaError, looksLikeQuotaError } from './providerTierState.js';
import { isSustainedFailure, describeProviderError } from './agentFailoverReason.js';
import { logAICall } from './aiCallLogger.js';

export async function routeByComplexityImpl(
  svc: RoutingService,
  task: string,
  promptText: string,
  timeoutMs = 30_000,
): Promise<AIResponse & { estimate?: string; tier?: 'free' | 'paid'; routedTo?: string; routingReason?: string }> {
  const fetchFn = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, timeoutMs);

  const keyMap: Record<string, () => string | null> = {
    gemini: getGeminiKey, claude: getClaudeKey, openai: getOpenAIKey,
    groq: getGroqKey, xai: getXAIKey, kimi: getKimiKey, deepseek: getDeepseekKey,
  };
  const available: Record<string, boolean> = Object.fromEntries(
    Object.entries(keyMap).map(([k, fn]) => [k, !!fn()])
  );

  const tokens = estimateTokens(promptText);

  // Analyze the task — AI call (Groq or Gemini Flash, ~100 tokens) with regex fallback
  const profile = await analyzeTask(task, available, fetchFn);
  // Override contextSize for very large prompts regardless of classification
  if (tokens.total > 50_000) { profile.contextSize = 'huge'; }
  // Chat path does not use function calling — agent sets toolsRequired separately
  profile.toolsRequired = false;

  const ranked = scoreModels(profile, available);
  if (ranked.length === 0) {
    return { text: '', model: 'none', success: false, error: 'No AI key configured. Add an API key in Redivivus Settings (Files & AI tab).' };
  }

  // Deduplicate to one entry per provider (callProvider takes a provider name, not a modelId)
  const seen = new Set<string>();
  const chain: Array<{ provider: string; label: string; score: number; reason: string }> = [];
  for (const m of ranked) {
    if (!seen.has(m.provider)) { seen.add(m.provider); chain.push(m); }
  }

  // [FIX] AI-audit: walk the scored chain with the same per-provider guards as promptImpl —
  // skip quota-blocked providers, bound each call with a hard deadline, record quota/outage signals
  // on failure so future routing avoids the dead provider, and log the successful call.
  const startTime = Date.now();
  const deadlineMs = timeoutMs + 3000; // AbortController alone can't cut Electron's body read (see promptImpl)

  let res: AIResponse = { text: '', model: 'none', success: false, error: 'No provider available' };
  let chosenProvider = '';
  let routingReason = '';

  for (let i = 0; i < chain.length; i++) {
    const { provider, label, score, reason } = chain[i];

    // Skip providers in a rate-limit cooldown or sustained outage (persisted across reloads).
    const skip = getSkipInfo(provider);
    if (skip) {
      routingReason += (routingReason ? ' → ' : '') + `${provider} skipped (${skip.reason})`;
      continue;
    }

    routingReason += routingReason ? ` → trying ${label}` : `${label} (score ${score}: ${reason})`;

    res = await Promise.race([
      callProvider(provider, promptText, fetchFn),
      new Promise<AIResponse>(resolve => setTimeout(
        () => resolve({ text: '', model: provider, success: false, error: `${provider} timed out after ${deadlineMs}ms (no response)` }),
        deadlineMs,
      )),
    ]);

    if (res.success) {
      chosenProvider = provider;
      logAICall({ role: 'chat', model: res.model || provider, prompt: promptText, response: res.text || '', inputTokens: res.inputTokens, outputTokens: res.outputTokens, durationMs: Date.now() - startTime });
      break;
    }

    // Feed the free-tier downshift detector and persist sustained failures (out of credits / bad key).
    if (looksLikeQuotaError(res.error || '')) { recordQuotaError(provider); }
    if (isSustainedFailure(res.error)) { recordUnavailable(provider, describeProviderError(res.error)); }
    routingReason += ` — failed (${describeProviderError(res.error)})`;
  }

  // All providers skipped or failed — keep chain[0] for tier/cost display; res carries the error.
  if (!chosenProvider) { chosenProvider = chain[0].provider; }

  const isFree = ['groq', 'gemini'].includes(chosenProvider);
  const estCost = estimateCost(tokens.total, isFree ? 'free' : 'paid');
  return {
    ...res,
    estimate: `${tokens.total.toLocaleString()} tokens · ~${estCost}`,
    tier: isFree ? 'free' : 'paid',
    routedTo: chosenProvider,
    routingReason,
  };
}
