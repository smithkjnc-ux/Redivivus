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

  // [FIX] 4000-token threshold was too low — any prompt with vault context exceeded it, forcing Kimi.
  // 50k is genuinely large (beyond most model context windows except Kimi/Claude/Gemini).
  const isLargeContext = tokens.total > 50_000;
  const isSpeedTask = complexity === 'simple' && tokens.total < 1500;

  // [FIX] Respect user's explicitly selected AI (the header chip / chassis.defaultAI setting).
  // Previously hardcoded Gemini as the "medium complexity" pick — Claude was never chosen if Gemini was configured.
  const preferredAI = svc.getPreferredAI?.() || '';

  let chosenAI: string | null = null;
  let routingReason = '';
  if (preferredAI && has(preferredAI) && !isSpeedTask) {
    chosenAI = preferredAI;
    routingReason = `Using your selected AI: ${preferredAI}`;
  } else if (isLargeContext && has('kimi')) {
    chosenAI = 'kimi';   routingReason = 'Very large prompt (>' + tokens.total.toLocaleString() + ' tokens) — Kimi chosen for maximum context';
  } else if (isSpeedTask && has('groq')) {
    chosenAI = 'groq';   routingReason = 'Simple short task — Groq/Llama is fastest for quick builds';
  } else {
    // Use highest capability rank: claude > openai > xai > gemini > kimi > groq
    const reasonMap: Record<string, string> = {
      claude: 'Claude chosen — strongest reasoning and code quality',
      openai: 'GPT-4o chosen — strong full-stack reasoning',
      xai: 'Grok chosen — strong reasoning',
      gemini: 'Gemini Flash chosen — reliable all-rounder',
      kimi: 'Kimi chosen as available worker',
      groq: 'Groq chosen — fastest available',
    };
    chosenAI = ['claude', 'openai', 'xai', 'gemini', 'kimi', 'groq'].find(has) || null;
    if (chosenAI) routingReason = reasonMap[chosenAI] || chosenAI;
  }

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
