// [SCOPE] AI chat router — classifies the task then scores all available models to pick the best provider.
// Replaced static 'Gemini-first' hardcode with dynamic scoring via routingEngine.
// [DONE 2026-06-22] Removed hardcoded provider preference list and binary simple/complex classification.
//   Old: aiClassifyComplexity() → simple|complex → ['gemini','claude','openai',...].find(has)
//   Why removed: ignored all capability/context/domain data; DeepSeek was missing from keyMap entirely.
//   New: analyzeTask() → TaskProfile → scoreModels() → ranked fallback chain ordered by fit.

import type { AIResponse } from './routingTypes.js';
import { estimateTokens, estimateCost } from './routingClassifier.js';
import { callProvider } from '../../core/ai/providers/providerFactory.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey, getDeepseekKey } from './routingKeys.js';
import type { RoutingService } from './routingService.js';
import { analyzeTask, scoreModels } from './routingEngine.js';

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

  let chosenProvider = chain[0].provider;
  let routingReason = `${chain[0].label} (score ${chain[0].score}: ${chain[0].reason})`;
  let res = await callProvider(chosenProvider, promptText, fetchFn);

  // Fallback through remaining providers in scored order (best-fit first, not hardcoded list)
  for (let i = 1; i < chain.length && !res.success; i++) {
    routingReason += ` → ${chain[i].provider} failed, trying ${chain[i].provider}`;
    const prev = chosenProvider;
    res = await callProvider(chain[i].provider, promptText, fetchFn);
    if (res.success) {
      routingReason = routingReason.replace(`→ ${chain[i].provider} failed, trying ${chain[i].provider}`, `→ ${prev} failed, using ${chain[i].label}`);
      chosenProvider = chain[i].provider;
    }
  }

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
