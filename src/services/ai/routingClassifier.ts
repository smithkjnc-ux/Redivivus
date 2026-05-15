// [SCOPE] CHASSIS AI Task Complexity Classifier — routes tasks to free vs paid AI based on complexity

/** Classify a user task as 'simple' (free AI) or 'complex' (suggest paid AI).
 *  Simple: explain, describe, summarize, list, count, search, short Q&A
 *  Complex: build, create, implement, design, review, refactor, architecture */
export function classifyTask(task: string): 'simple' | 'complex' {
  const t = task.toLowerCase().trim();
  const simpleVerbs = /\b(explain|describe|summarize|list|what is|how do|what does|define|compare|short|brief|quick)\b/;
  const complexVerbs = /\b(build|create|make|write|implement|design|architect|refactor|review|debug|fix|improve|generate|produce|develop|scaffold)\b/;
  const simpleNouns = /\b(meaning|definition|example|summary|overview|list of|compare)\b/;
  const hasCodeBlock = t.includes('```') || t.includes('function') || t.includes('class ') || t.includes('import ');
  const isShort = t.split(/\s+/).length < 15;

  // If task is short and uses simple verbs → simple
  if (simpleVerbs.test(t) && isShort && !hasCodeBlock) { return 'simple'; }
  // If task uses complex verbs → complex
  if (complexVerbs.test(t)) { return 'complex'; }
  // If task contains code → complex
  if (hasCodeBlock) { return 'complex'; }
  // If task asks for code generation words → complex
  if (/\b(code|script|app|program|module|component|page|api|endpoint)\b/.test(t) && /\b(a|an|the|create|make|build)\b/.test(t)) { return 'complex'; }
  // Default: simple for short Q&A, complex for everything else
  return isShort && simpleNouns.test(t) ? 'simple' : 'complex';
}

/** Estimate token count from prompt text (~4 chars per token).
 *  Returns estimated input tokens and a rough output guess. */
export function estimateTokens(prompt: string, outputMultiplier = 0.5): { input: number; output: number; total: number } {
  const input = Math.ceil(prompt.length / 4);
  const output = Math.ceil(input * outputMultiplier);
  return { input, output, total: input + output };
}

/** Rough cost in USD for a given token count by AI tier.
 *  Free models: ~$0.30/million tokens (Gemini Flash)
 *  Paid models: ~$3.00/million tokens (Claude Haiku) */
export function estimateCost(tokens: number, tier: 'free' | 'paid'): string {
  const rate = tier === 'free' ? 0.30 : 3.00;
  const cost = (tokens / 1_000_000) * rate;
  if (cost < 0.0001) { return '<$0.0001'; }
  return `$${cost.toFixed(4)}`;
}
