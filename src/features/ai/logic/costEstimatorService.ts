// [SCOPE] Redivivus Cost Estimator — estimates token count and USD cost before a build starts.
// Called by chatPanelBuild.ts BEFORE any AI call. Never makes AI calls itself.

import { estimateTokens } from '../data/tokenBudget.js';

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
  /** Short description of what will be built: "3 HTML/CSS/JS files", "React app" */
  description: string;
  /** Estimated number of files to create */
  fileCount: number;
  /** Supervisor AI label and estimated cost (planning pass, ~20% of worker tokens) */
  supervisorLabel?: string;
  supervisorCostUSD?: number;
  supervisorTokens?: number;
  /** Guardian AI label and estimated cost (review pass, ~35% of worker tokens) */
  guardianLabel?: string;
  guardianCostUSD?: number;
  guardianTokens?: number;
  /** Total cost across all AI passes */
  totalCostUSD: number;
  totalCostFormatted: string;
}

/** Detects the tech stack from task text and returns a human label + file count estimate. */
function detectStack(task: string): { description: string; fileCount: number } {
  const t = task.toLowerCase();
  if (/\breact\b|jsx|tsx|\bcomponent/i.test(t)) { return { description: 'React app with components', fileCount: 5 }; }
  if (/\bvue\b|vuex|nuxt/i.test(t))              { return { description: 'Vue.js app', fileCount: 4 }; }
  if (/python|flask|django|fastapi|\.py\b/i.test(t)) { return { description: 'Python script(s)', fileCount: 2 }; }
  if (/\bnode\b|express|fastify|\bapi\b|backend|endpoint/i.test(t)) { return { description: 'Node.js server + routes', fileCount: 4 }; }
  if (/game|snake|tetris|pong|platformer|puzzle|shooter/i.test(t)) { return { description: 'game with loop + assets', fileCount: 3 }; }
  if (/react native|flutter|mobile|android|ios/i.test(t)) { return { description: 'mobile app screens', fileCount: 4 }; }
  if (/html|website|web\s*(page|app)|landing|portfolio|dashboard/i.test(t)) { return { description: 'HTML + CSS + JS files', fileCount: 3 }; }
  if (/calculator|converter|timer|clock|quiz|form/i.test(t)) { return { description: 'HTML + JS + CSS', fileCount: 3 }; }
  return { description: 'project files', fileCount: 3 };
}

/** Deterministic phase count based on task complexity signals — never random. */
function estimatePhases(task: string): number {
  if (/\b(full|complete|production|entire|all features?|backend|database|auth|login|register)\b/i.test(task)) { return 5; }
  if (/\b(app|application|system|platform|dashboard|multi)\b/i.test(task)) { return 4; }
  if (/\b(game|website|tool|converter|calculator|player)\b/i.test(task)) { return 3; }
  const words = task.trim().split(/\s+/).length;
  return words < 20 ? 1 : words < 50 ? 2 : 3;
}

function getRateKey(model: string): string {
  const m = model.toLowerCase();
  return Object.keys(COST_PER_TOKEN).find(k => m.includes(k)) || 'gemini';
}
function getModelLabel(model: string): string {
  const m = model.toLowerCase();
  return Object.entries(MODEL_LABELS).find(([k]) => m.includes(k))?.[1] || model || 'AI';
}
function formatCost(usd: number, isFree: boolean): string {
  if (isFree || usd === 0) { return 'Free'; }
  if (usd < 0.0001) { return '~$0.0001'; }
  return `~$${(Math.ceil(usd * 10000) / 10000).toFixed(4)}`;
}

/**
 * Estimates the full build cost across worker, supervisor, and guardian passes.
 * @param prompt          The full build prompt text
 * @param model           Worker model identifier
 * @param supervisorModel Supervisor model (optional — planning pass, ~20% of worker tokens)
 * @param guardianModel   Guardian model (optional — review pass, ~35% of worker tokens)
 */
export function estimateBuild(prompt: string, model: string, supervisorModel?: string, guardianModel?: string): CostEstimate {
  const phases = estimatePhases(prompt);
  const { description, fileCount } = detectStack(prompt);
  // Shared token heuristic (tokenBudget.estimateTokens) so estimate and budget never disagree.
  const tokens = Math.ceil(estimateTokens(prompt) * phases * 3.5);

  const rateKey = getRateKey(model);
  const costPerToken = COST_PER_TOKEN[rateKey] ?? 0.000000075;
  const costUSD = tokens * costPerToken;
  const isFree = costPerToken === 0;
  const costFormatted = formatCost(costUSD, isFree);
  const modelLabel = getModelLabel(model);

  // Supervisor: planning pass before worker runs (~20% of worker tokens)
  let supervisorLabel: string | undefined;
  let supervisorCostUSD: number | undefined;
  let supervisorTokens: number | undefined;
  if (supervisorModel && supervisorModel.toLowerCase() !== model.toLowerCase()) {
    supervisorTokens = Math.ceil(tokens * 0.2);
    const svRate = COST_PER_TOKEN[getRateKey(supervisorModel)] ?? 0.000000075;
    supervisorCostUSD = supervisorTokens * svRate;
    supervisorLabel = getModelLabel(supervisorModel);
  }

  // Guardian: code review pass after worker (~35% of worker tokens)
  let guardianLabel: string | undefined;
  let guardianCostUSD: number | undefined;
  let guardianTokens: number | undefined;
  if (guardianModel) {
    guardianTokens = Math.ceil(tokens * 0.35);
    const gRate = COST_PER_TOKEN[getRateKey(guardianModel)] ?? 0.000000075;
    guardianCostUSD = guardianTokens * gRate;
    guardianLabel = getModelLabel(guardianModel);
  }

  const totalCostUSD = costUSD + (supervisorCostUSD || 0) + (guardianCostUSD || 0);
  const totalCostFormatted = formatCost(totalCostUSD, isFree && !supervisorCostUSD && !guardianCostUSD);

  return { phases, tokens, costUSD, costFormatted, modelLabel, isFree, description, fileCount, supervisorLabel, supervisorCostUSD, supervisorTokens, guardianLabel, guardianCostUSD, guardianTokens, totalCostUSD, totalCostFormatted };
}
