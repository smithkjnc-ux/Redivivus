// [SCOPE] Model-aware token budgeting — single source of truth for token estimation, model context
// windows, and fitting assembled context to a target model's input budget. Pure functions, no IO,
// no AI calls. Replaces the model-blind byte caps scattered across the build context assembly.

/** Rough token estimate: ~4 chars/token for English+code, +3% for tokenizer drift. Never under-counts badly. */
export function estimateTokens(text: string): number {
  if (!text) { return 0; }
  return Math.ceil((text.length / 4) * 1.03);
}

// [WARN] Conservative input windows by model family. Keep below the provider's true max — the safety
// margin in getInputBudget is on top of this. Matched by longest-prefix against the model id.
export const MODEL_WINDOWS: Record<string, number> = {
  'gemini-2.5-pro':   1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-pro':       1_000_000,
  'gemini-flash':     1_000_000,
  'gemini':           1_000_000,
  'claude':             200_000,
  'gpt-4o-mini':        128_000,
  'gpt-4o':             128_000,
  'openai':             128_000,
  'kimi':               128_000,
  'xai':                128_000,
  'grok':               128_000,
  'deepseek':            64_000,
  'groq':                32_000,
  'llama':               32_000,
  'mistral':             32_000,
};

const DEFAULT_WINDOW = 32_000;

/** Input window (tokens) for a model id. Longest-prefix match, then substring, else conservative default. */
export function getModelWindow(model: string): number {
  const m = (model || '').toLowerCase();
  let best = '';
  for (const key of Object.keys(MODEL_WINDOWS)) {
    if (m.startsWith(key) && key.length > best.length) { best = key; }
  }
  if (!best) {
    for (const key of Object.keys(MODEL_WINDOWS)) {
      if (m.includes(key) && key.length > best.length) { best = key; }
    }
  }
  return best ? MODEL_WINDOWS[best] : DEFAULT_WINDOW;
}

export interface BudgetOpts {
  reservedOutput?: number;  // tokens reserved for the model's response (default 8k)
  safetyMargin?: number;    // fraction of window held back for tokenizer drift (default 0.15)
  serverOverhead?: number;  // tokens added downstream (system prompt + cloud "secret sauce")
}

/** Tokens available for input context after reserving output and a minimal safety margin.
 *  [FIX] Margin reduced 0.15->0.05 — pre-empting 15% was discarding 150K tokens on Gemini,
 *  30K on Claude before the AI saw a single byte of context. Models already have internal headroom. */
export function getInputBudget(model: string, opts: BudgetOpts = {}): number {
  const window = getModelWindow(model);
  const reservedOutput = opts.reservedOutput ?? 8_000;
  const serverOverhead = opts.serverOverhead ?? 0;
  const margin = Math.ceil(window * (opts.safetyMargin ?? 0.05));
  return Math.max(1_000, window - reservedOutput - serverOverhead - margin);
}

export interface ContextSection {
  name: string;        // label for trim/drop reporting (need not be unique)
  priority: number;    // higher = kept first when budget is tight
  content: string;
  minTokens?: number;  // if it can't keep at least this many, drop it whole rather than leave a stub
}

export interface FitResult {
  fitted: string;      // sections joined by \n\n in ORIGINAL order, within budget
  usedTokens: number;
  dropped: string[];   // names of sections fully omitted
  trimmed: string[];   // names of sections partially truncated
}

const TRIM_MARKER = '\n[...trimmed to fit context window]';

/** Fit sections to a token budget: keep highest-priority whole, trim/drop the rest to fit. */
export function fitToBudget(sections: ContextSection[], budget: number): FitResult {
  const dropped: string[] = [];
  const trimmed: string[] = [];
  const kept = new Array<string | null>(sections.length).fill(null);

  // Decide what to keep in priority order (highest first); ties keep original order (stable).
  const order = sections.map((s, i) => ({ s, i })).sort((a, b) => b.s.priority - a.s.priority);
  let remaining = budget;

  for (const { s, i } of order) {
    const tokens = estimateTokens(s.content);
    if (tokens <= remaining) {
      kept[i] = s.content;
      remaining -= tokens;
    } else if (remaining > 0 && remaining >= (s.minTokens ?? 0)) {
      // Trim to what's left (leave headroom for the marker).
      const chars = Math.max(0, Math.floor((remaining / 1.03) * 4) - TRIM_MARKER.length - 8);
      const slice = s.content.slice(0, chars).trimEnd() + TRIM_MARKER;
      kept[i] = slice;
      trimmed.push(s.name);
      remaining -= estimateTokens(slice);
    } else {
      dropped.push(s.name);
    }
  }

  // Reassemble in original order for a coherent prompt.
  const fitted = sections.map((_, i) => kept[i]).filter((c): c is string => c !== null).join('\n\n');
  return { fitted, usedTokens: estimateTokens(fitted), dropped, trimmed };
}
