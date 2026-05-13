// [SCOPE] CHASSIS Cost Estimator — estimates token count and USD cost before a build starts.
// Called by chatPanelBuild.ts BEFORE any AI call. Never makes AI calls itself.

/** Cost per token by model family (USD) */
const COST_PER_TOKEN: Record<string, number> = {
  'gemini-2.5-flash':              0.000000075,
  'gemini-2.5-pro':                0.00000035,
  'gemini-flash':                  0.000000075,
  'gemini-pro':                    0.00000035,
  'gemini':                        0.000000075,  // default gemini → flash
  'claude-3-5-haiku-20241022':     0.000003,
  'claude-3-5-sonnet-20241022':    0.000003,
  'claude':                        0.000003,
  'gpt-4o':                        0.000005,
  'gpt-4o-mini':                   0.0000015,
  'openai':                        0.000005,
  'deepseek':                      0.000000010,
  'kimi':                          0.000000010,
  'mistral':                       0.000000010,
  'llama':                         0.000000010,
  'groq':                          0.000000010,
  'xai':                           0.000000010,
  'grok':                          0.000000010,
  'local':                         0,
  'none':                          0,
};

/** Human-readable labels for model keys */
const MODEL_LABELS: Record<string, string> = {
  'gemini-2.5-flash':  'Gemini Flash',
  'gemini-2.5-pro':    'Gemini Pro',
  'gemini-flash':      'Gemini Flash',
  'gemini-pro':        'Gemini Pro',
  'gemini':            'Gemini',
  'claude-3-5-haiku-20241022':  'Claude Haiku',
  'claude-3-5-sonnet-20241022': 'Claude Sonnet',
  'claude':            'Claude',
  'gpt-4o':            'GPT-4o',
  'gpt-4o-mini':       'GPT-4o Mini',
  'openai':            'GPT-4o',
  'deepseek':          'DeepSeek',
  'kimi':              'Kimi',
  'mistral':           'Mistral',
  'llama':             'Llama',
  'groq':              'Groq',
  'xai':               'Grok',
  'grok':              'Grok',
};

/** Returns cost-per-token for a given AI identifier (matches longest prefix). */
export function tokenCostForAI(ai: string): number {
  const aiLower = ai.toLowerCase();
  const key = Object.keys(COST_PER_TOKEN).find(k => aiLower.includes(k)) || 'gemini';
  return COST_PER_TOKEN[key] ?? 0.000000075;
}

export interface CostEstimate {
  phases: number;
  tokens: number;
  costUSD: number;
  /** Display string: "~$0.003" or "Free" if zero-cost model */
  costFormatted: string;
  /** Human-readable model label */
  modelLabel: string;
  /** True if model has no cost (local / free tier) */
  isFree: boolean;
}

/**
 * Estimates the build cost before any AI call is made.
 * @param prompt  The full build prompt text
 * @param model   Model identifier (e.g. "gemini-2.5-flash", "claude", "gpt-4o")
 */
export function estimateBuild(prompt: string, model: string): CostEstimate {
  const words = prompt.trim().split(/\s+/).length;

  // Phase count heuristic
  const phases = words < 30 ? 1
    : words < 80 ? Math.floor(Math.random() * 2) + 2   // 2-3
    : Math.floor(Math.random() * 3) + 4;                // 4-6

  // Token estimate: chars/4 * phases * 3.5 (input+output multiplier)
  const tokens = Math.ceil((prompt.length / 4) * phases * 3.5);

  // Find cost rate — match longest prefix first
  const modelLower = model.toLowerCase();
  let rateKey = Object.keys(COST_PER_TOKEN).find(k => modelLower.includes(k)) || 'gemini';
  const costPerToken = COST_PER_TOKEN[rateKey] ?? 0.000000075;
  const costUSD = tokens * costPerToken;

  const isFree = costUSD === 0 || costPerToken === 0;

  let costFormatted: string;
  if (isFree) {
    costFormatted = 'Free';
  } else if (costUSD < 0.0001) {
    // Round up to never show $0.000
    costFormatted = `~$0.0001`;
  } else {
    // Round up to 4 decimal places
    const rounded = Math.ceil(costUSD * 10000) / 10000;
    costFormatted = `~$${rounded.toFixed(4)}`;
  }

  const modelLabel = Object.entries(MODEL_LABELS).find(([k]) => modelLower.includes(k))?.[1]
    || model || 'AI';

  return { phases, tokens, costUSD, costFormatted, modelLabel, isFree };
}
