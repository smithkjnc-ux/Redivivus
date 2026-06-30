// [SCOPE] AI cost calculation and provider name normalization helpers.
// Extracted from usageTracker.ts (Rule 9 split — was 232 lines).

/** Normalize an AI model string to a canonical provider name (claude/gemini/openai/groq/xai/kimi). */
export function normalizeAI(ai: string): string {
  const m = (ai || '').toLowerCase();
  if (m.includes('claude'))                         { return 'claude'; }
  if (m.includes('gemini'))                         { return 'gemini'; }
  if (m.includes('gpt') || m.includes('openai'))    { return 'openai'; }
  if (m.includes('groq') || m.includes('llama'))    { return 'groq'; }
  if (m.includes('grok') || m.includes('xai'))      { return 'xai'; }
  if (m.includes('kimi') || m.includes('moonshot')) { return 'kimi'; }
  if (!m || m === 'none') { return 'unknown'; }
  return ai;
}

// Per-model pricing table. Rates: [$/1M input, $/1M output].
// [WARN] Update when Anthropic/Google/OpenAI change pricing.
// role: 'worker' = flash/haiku tier; 'supervisor'|'guardian' = pro tier.
// Used as a tiebreaker when model is a bare provider key ("claude", "gemini")
// rather than a full model ID — recordUsage() receives the normalized key from
// the backend, so we can't distinguish Haiku from Sonnet without the role.
export function calcCost(model: string, inTok: number, outTok: number, role?: string): number {
  const m = (model || '').toLowerCase();
  const isWorker = role === 'worker';
  let inRate = 0.30, outRate = 0.30; // fallback flat rate
  if (m.includes('claude-haiku-4'))       { inRate = 0.80;  outRate = 4.00; }
  else if (m.includes('claude-haiku'))    { inRate = 0.25;  outRate = 1.25; }
  else if (m.includes('claude-sonnet'))   { inRate = 3.00;  outRate = 15.00; }
  else if (m.includes('claude-opus'))     { inRate = 15.00; outRate = 75.00; }
  // Bare "claude" key — worker tier = Haiku 4.5, pro tier = Sonnet 4.6
  else if (m === 'claude')                { inRate = isWorker ? 0.80 : 3.00; outRate = isWorker ? 4.00 : 15.00; }
  else if (m.includes('claude'))          { inRate = 3.00;  outRate = 15.00; }
  else if (m.includes('gemini-1.5-pro'))  { inRate = 1.25;  outRate = 5.00; }
  else if (m.includes('gemini-2.5'))      { inRate = 1.25;  outRate = 10.00; }
  // Bare "gemini" key — worker tier = Flash, pro tier = 2.5-Pro
  else if (m === 'gemini')                { inRate = isWorker ? 0.075 : 1.25; outRate = isWorker ? 0.30 : 10.00; }
  else if (m.includes('gemini'))          { inRate = 0.075; outRate = 0.30; }
  else if (m.includes('gpt-4o-mini'))     { inRate = 0.15;  outRate = 0.60; }
  // Bare "openai" key — worker tier = GPT-4o-mini, pro tier = GPT-4o
  else if (m === 'openai')                { inRate = isWorker ? 0.15 : 5.00; outRate = isWorker ? 0.60 : 15.00; }
  else if (m.includes('gpt-4o'))          { inRate = 5.00;  outRate = 15.00; }
  else if (m.includes('groq') || m.includes('llama')) { inRate = 0.09; outRate = 0.09; }
  else if (m.includes('grok') || m.includes('xai'))   { inRate = 5.00; outRate = 15.00; }
  else if (m.includes('kimi') || m.includes('moonshot')) { inRate = 0.15; outRate = 0.60; }
  return (inTok * inRate + outTok * outRate) / 1_000_000;
}
