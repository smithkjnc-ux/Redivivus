// [SCOPE] AI Routing Service — complexity-based routing (Auto AI Routing)
// Extracted from routingService.ts

import { AIResponse } from './routingTypes.js';
import { classifyTask, estimateTokens, estimateCost } from './routingClassifier.js';
import { callProvider } from './routingProviders.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from './routingKeys.js';
import { RoutingService } from './routingService.js';

export async function routeByComplexityImpl(
  svc: RoutingService,
  task: string,
  promptText: string,
  timeoutMs = 30_000
): Promise<AIResponse & { estimate?: string; tier?: 'free' | 'paid'; routedTo?: string; routingReason?: string }> {
  const complexity = classifyTask(task);
  const tokens = estimateTokens(promptText);
  const estCost = estimateCost(tokens.total, complexity === 'simple' ? 'free' : 'paid');

  const keyMap: Record<string, () => string | null> = {
    gemini: getGeminiKey, claude: getClaudeKey, openai: getOpenAIKey,
    groq: getGroqKey, xai: getXAIKey, kimi: getKimiKey,
  };
  const has = (ai: string) => !!keyMap[ai]?.();

  const isLargeContext = tokens.total > 4000;
  const isSpeedTask = complexity === 'simple' && tokens.total < 1500;

  let chosenAI: string | null = null;
  let routingReason = '';
  if (isLargeContext && has('kimi'))       { chosenAI = 'kimi';   routingReason = 'Large prompt (' + tokens.total.toLocaleString() + ' tokens) — Kimi 32k handles big context best'; }
  else if (isSpeedTask && has('groq'))     { chosenAI = 'groq';   routingReason = 'Simple short task — Groq/Llama is fastest for quick builds'; }
  else if (has('gemini'))                  { chosenAI = 'gemini'; routingReason = 'Medium complexity — Gemini Flash is the reliable all-rounder'; }
  else if (has('claude'))                  { chosenAI = 'claude'; routingReason = 'Complex task — Claude chosen for strongest reasoning'; }
  else if (has('openai'))                  { chosenAI = 'openai'; routingReason = 'Complex task — GPT-4o chosen as strong fallback'; }
  else if (has('xai'))                     { chosenAI = 'xai';    routingReason = 'Grok chosen — strong reasoning fallback'; }
  else if (has('kimi'))                    { chosenAI = 'kimi';   routingReason = 'Kimi chosen as fallback worker'; }
  else if (has('groq'))                    { chosenAI = 'groq';   routingReason = 'Groq chosen as fallback worker'; }

  if (!chosenAI) {
    return { text: '', model: 'none', success: false, error: 'No AI key configured. Add an API key in CHASSIS Settings (Files & AI tab).' };
  }

  const capableTier = ['gemini', 'claude', 'openai', 'xai', 'kimi'].filter(ai => ai !== chosenAI && has(ai));
  const speedTier = ['groq'].filter(ai => ai !== chosenAI && has(ai));
  const isComplexTask = !isSpeedTask;
  const fallbackChain = isComplexTask ? capableTier : [...capableTier, ...speedTier];

  const fetch = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, timeoutMs);
  let res = await callProvider(chosenAI, promptText, fetch);

  if (!res.success && fallbackChain.length > 0) {
    for (const fallbackAI of fallbackChain) {
      const prevAI = chosenAI;
      res = await callProvider(fallbackAI, promptText, fetch);
      if (res.success) {
        routingReason += ` [${prevAI} failed — fell back to ${fallbackAI}]`;
        chosenAI = fallbackAI;
        break;
      }
    }
  }

  return { ...res, estimate: `${tokens.total.toLocaleString()} tokens · ~${estCost}`, tier: chosenAI === 'gemini' || chosenAI === 'groq' ? 'free' : 'paid', routedTo: chosenAI, routingReason };
}
