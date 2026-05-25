// [SCOPE] AI Routing Service — complexity-based routing (Auto AI Routing)
// Extracted from routingService.ts

import type { AIResponse } from './routingTypes.js';
import { classifyTask, estimateTokens, estimateCost } from './routingClassifier.js';
import { callProvider } from '../../core/ai/providers/providerFactory.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from './routingKeys.js';
import type { RoutingService } from './routingService.js';

// [Rule 18] AI classifier: 50-token call instead of regex. Falls back to classifyTask() on failure.
// Only fires for mid-range prompts (500–50k tokens) where classification changes routing decisions.
// Short prompts are trivially simple; very long ones are already forced to Kimi regardless.
async function aiClassifyComplexity(task: string, promptTokens: number, has: (ai: string) => boolean, fetch: (url: string, opts: RequestInit) => Promise<Response>): Promise<'simple' | 'complex'> {
  if (promptTokens < 500 || promptTokens > 50_000) { return classifyTask(task); }
  const classifier = has('groq') ? 'groq' : has('gemini') ? 'gemini' : null;
  if (!classifier) { return classifyTask(task); }
  try {
    const prompt = `Is this coding task simple (explain/list/describe) or complex (build/create/fix/implement/refactor)?\nTask: "${task.slice(0, 150)}"\nReply: simple OR complex`;
    const res = await callProvider(classifier, prompt, fetch);
    if (res.success && res.text) {
      const ans = res.text.trim().toLowerCase();
      if (ans.startsWith('simple')) { return 'simple'; }
      if (ans.startsWith('complex')) { return 'complex'; }
    }
  } catch { /* fall through */ }
  return classifyTask(task);
}

export async function routeByComplexityImpl(
  svc: RoutingService,
  task: string,
  promptText: string,
  timeoutMs = 30_000
): Promise<AIResponse & { estimate?: string; tier?: 'free' | 'paid'; routedTo?: string; routingReason?: string }> {
  const fetch = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, timeoutMs);
  const keyMap: Record<string, () => string | null> = {
    gemini: getGeminiKey, claude: getClaudeKey, openai: getOpenAIKey,
    groq: getGroqKey, xai: getXAIKey, kimi: getKimiKey,
  };
  const has = (ai: string) => !!keyMap[ai]?.();
  const tokens = estimateTokens(promptText);
  const complexity = await aiClassifyComplexity(task, tokens.total, has, fetch);
  const estCost = estimateCost(tokens.total, complexity === 'simple' ? 'free' : 'paid');

  // [FIX] 4000-token threshold was too low — any prompt with vault context exceeded it, forcing Kimi.
  // 50k is genuinely large (beyond most model context windows except Kimi/Claude/Gemini).
  const isLargeContext = tokens.total > 50_000;
  const isSpeedTask = complexity === 'simple' && tokens.total < 1500;

  // Worker AI — Gemini first for reliability, then Claude/OpenAI/xAI as fallback.
  // [DEAD] Tried Claude-first capability rank (4796949) — builds became inconsistent. Reverted to Gemini-first.
  let chosenAI: string | null = null;
  let routingReason = '';
  if (isLargeContext && has('kimi')) {
    chosenAI = 'kimi';   routingReason = 'Very large prompt (>' + tokens.total.toLocaleString() + ' tokens) — Kimi chosen for maximum context';
  } else if (isSpeedTask && has('groq')) {
    chosenAI = 'groq';   routingReason = 'Simple short task — Groq/Llama is fastest for quick builds';
  } else {
    // Gemini-first: reliable all-rounder; Claude/OpenAI/xAI as capability fallbacks
    const reasonMap: Record<string, string> = {
      gemini: 'Gemini Flash chosen — reliable all-rounder for builds',
      claude: 'Claude chosen — fallback with strongest reasoning',
      openai: 'GPT-4o chosen — strong full-stack fallback',
      xai: 'Grok chosen — reasoning fallback',
      kimi: 'Kimi chosen as available worker',
      groq: 'Groq chosen — fastest available',
    };
    chosenAI = ['gemini', 'claude', 'openai', 'xai', 'kimi', 'groq'].find(has) || null;
    if (chosenAI) {routingReason = reasonMap[chosenAI] || chosenAI;}
  }

  if (!chosenAI) {
    return { text: '', model: 'none', success: false, error: 'No AI key configured. Add an API key in Redivivus Settings (Files & AI tab).' };
  }

  const capableTier = ['gemini', 'claude', 'openai', 'xai', 'kimi'].filter(ai => ai !== chosenAI && has(ai));
  const speedTier = ['groq'].filter(ai => ai !== chosenAI && has(ai));
  const isComplexTask = !isSpeedTask;
  const fallbackChain = isComplexTask ? capableTier : [...capableTier, ...speedTier];

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
