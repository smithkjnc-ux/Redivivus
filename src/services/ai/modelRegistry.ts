// [SCOPE] Central model registry — all AI providers, all models, ranked by capability.
// Routing uses this to select the best model for each role without hardcoding in providers.
// Add new models here; providers read modelId from registry at call time.

export type ModelRole = 'ultra' | 'pro' | 'flash';

export interface ModelDef {
  provider: string;     // matches key in routingKeys + AI_RANK
  modelId: string;      // exact API model ID
  label: string;        // display name
  capability: number;   // 1-10 (10 = most capable/reasoning)
  costTier: number;     // 1-10 (1 = cheapest)
  contextK: number;     // context window in thousands of tokens
  outputK: number;      // max output tokens in thousands
  thinking?: boolean;   // supports extended chain-of-thought reasoning
  roles: ModelRole[];   // which roles this model is appropriate for
  strengths: string[];  // short descriptors for routing decisions
}

export const MODEL_REGISTRY: ModelDef[] = [
  // ── Claude (Anthropic) ──────────────────────────────────────────────────
  { provider: 'claude', modelId: 'claude-opus-4-8',         label: 'Claude Opus 4.8',    capability: 10, costTier: 9, contextK: 200,  outputK: 32,  thinking: true,  roles: ['ultra'],          strengths: ['deep reasoning', 'architecture', 'security review', 'complex refactor'] },
  { provider: 'claude', modelId: 'claude-sonnet-4-6',       label: 'Claude Sonnet 4.6',  capability: 8,  costTier: 5, contextK: 200,  outputK: 64,  roles: ['ultra', 'pro'],    strengths: ['code generation', 'multi-file', 'planning', 'review'] },
  { provider: 'claude', modelId: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', capability: 5,  costTier: 2, contextK: 200,  outputK: 8,   roles: ['flash'],           strengths: ['fast edits', 'simple tasks', 'structured output'] },

  // ── Gemini (Google) ─────────────────────────────────────────────────────
  { provider: 'gemini', modelId: 'gemini-2.5-flash',        label: 'Gemini 2.5 Pro',     capability: 9,  costTier: 7, contextK: 1000, outputK: 64,  thinking: true,  roles: ['ultra', 'pro'],    strengths: ['huge context', 'reasoning', 'code', 'multimodal'] },
  { provider: 'gemini', modelId: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash',   capability: 7,  costTier: 2, contextK: 1000, outputK: 64,  roles: ['pro', 'flash'],    strengths: ['fast code gen', 'games', 'UI', 'large output'] },


  // ── OpenAI ──────────────────────────────────────────────────────────────
  { provider: 'openai', modelId: 'o3',                      label: 'OpenAI o3',          capability: 10, costTier: 10, contextK: 200, outputK: 32,  thinking: true,  roles: ['ultra'],           strengths: ['logical reasoning', 'math', 'architecture', 'complex debugging'] },
  { provider: 'openai', modelId: 'o4-mini',                 label: 'OpenAI o4-mini',     capability: 7,  costTier: 4,  contextK: 200, outputK: 32,  thinking: true,  roles: ['pro'],             strengths: ['reasoning', 'structured planning', 'cost-effective thinking'] },
  { provider: 'openai', modelId: 'gpt-4o',                  label: 'GPT-4o',             capability: 8,  costTier: 7,  contextK: 128, outputK: 16,  roles: ['ultra', 'pro'],    strengths: ['APIs', 'full-stack', 'documentation', 'data processing'] },
  { provider: 'openai', modelId: 'gpt-4o-mini',             label: 'GPT-4o-mini',        capability: 5,  costTier: 1,  contextK: 128, outputK: 16,  roles: ['flash'],           strengths: ['fast completions', 'simple code', 'cheap'] },

  // ── xAI (Grok) ──────────────────────────────────────────────────────────
  { provider: 'xai',    modelId: 'grok-3',                  label: 'Grok-3',             capability: 8,  costTier: 6, contextK: 131,  outputK: 32,  roles: ['ultra', 'pro'],    strengths: ['reasoning', 'web-aware', 'creative solutions'] },
  { provider: 'xai',    modelId: 'grok-3-mini',             label: 'Grok-3-mini',        capability: 5,  costTier: 2, contextK: 131,  outputK: 32,  roles: ['flash'],           strengths: ['fast', 'cost-effective'] },

  // ── Groq (hosted inference) ─────────────────────────────────────────────
  { provider: 'groq',   modelId: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',      capability: 6,  costTier: 1, contextK: 32,   outputK: 8,   roles: ['pro', 'flash'],    strengths: ['fastest inference', 'simple code', 'quick answers'] },
  { provider: 'groq',   modelId: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B',       capability: 4,  costTier: 1, contextK: 128,  outputK: 8,   roles: ['flash'],           strengths: ['ultra-fast', 'structured output', 'simple completions'] },

  // ── Kimi (Moonshot) ─────────────────────────────────────────────────────
  { provider: 'kimi',   modelId: 'moonshot-v1-128k',        label: 'Kimi 128k',          capability: 6,  costTier: 5, contextK: 128,  outputK: 16,  roles: ['pro', 'flash'],    strengths: ['large context', 'document analysis', 'bulk annotation'] },
  { provider: 'kimi',   modelId: 'moonshot-v1-32k',         label: 'Kimi 32k',           capability: 5,  costTier: 3, contextK: 32,   outputK: 8,   roles: ['flash'],           strengths: ['standard tasks', 'cost-effective'] },

  // ── DeepSeek ────────────────────────────────────────────────────────────
  { provider: 'deepseek', modelId: 'deepseek-reasoner',     label: 'DeepSeek R1',        capability: 8,  costTier: 2, contextK: 64,   outputK: 8,   thinking: true, roles: ['ultra', 'pro'], strengths: ['deep reasoning', 'math', 'algorithms', 'step-by-step logic'] },
  { provider: 'deepseek', modelId: 'deepseek-chat',         label: 'DeepSeek V3',        capability: 7,  costTier: 1, contextK: 64,   outputK: 8,   roles: ['pro', 'flash'],    strengths: ['fast code gen', 'cost-effective', 'general coding'] },
];

/** All models for a given provider, sorted best-first. */
export function modelsForProvider(provider: string): ModelDef[] {
  return MODEL_REGISTRY
    .filter(m => m.provider === provider)
    .sort((a, b) => b.capability - a.capability);
}

/** Best model for a provider at a given role. Falls back to best available if none match. */
export function bestModelForRole(provider: string, role: ModelRole): ModelDef | undefined {
  const all = modelsForProvider(provider);
  const match = all.filter(m => m.roles.includes(role));
  if (match.length > 0) {
    // For ultra: highest capability. For flash: lowest cost that qualifies. For pro: balance.
    if (role === 'flash') return match.sort((a, b) => a.costTier - b.costTier)[0];
    if (role === 'ultra') return match.sort((a, b) => b.capability - a.capability)[0];
    return match.sort((a, b) => (b.capability - b.costTier / 2) - (a.capability - a.costTier / 2))[0];
  }
  return all[0]; // best available if no exact role match
}

/** Resolve a legacy tier string to a ModelRole. */
export function tierToRole(tier?: 'flash' | 'pro' | 'ultra'): ModelRole {
  if (tier === 'ultra') return 'ultra';
  if (tier === 'pro') return 'pro';
  return 'flash';
}

// [CAPABILITY-AWARE SUPERVISOR] Describe the REAL crew the Supervisor can assign work to — the actual models each
// WORKER_TIER resolves to, with their true capability + strengths, grouped so the Supervisor sees (e.g.) that
// flash and pro may be the SAME model and only ultra reaches the strongest. Marks the Supervisor's own model so it
// knows whether a more capable worker than itself exists. See memory: capability-aware-supervisor.
export function buildCrewRoster(provider: string, supervisorModelId?: string): string {
  const tiers: Array<'flash' | 'pro' | 'ultra'> = ['flash', 'pro', 'ultra'];
  const byModel = new Map<string, { def: ModelDef; tiers: string[] }>();
  for (const tier of tiers) {
    const m = bestModelForRole(provider, tier);
    if (!m) { continue; }
    const e = byModel.get(m.modelId) || { def: m, tiers: [] };
    e.tiers.push(tier);
    byModel.set(m.modelId, e);
  }
  if (byModel.size === 0) { return ''; }
  const lines = [...byModel.values()]
    .sort((a, b) => a.def.capability - b.def.capability)
    .map(({ def, tiers: ts }) => {
      const self = supervisorModelId && def.modelId === supervisorModelId ? ' [THIS IS YOU, the Supervisor]' : '';
      return `- ${def.label} (capability ${def.capability}/10; strengths: ${(def.strengths || []).join(', ')}) -> assign with WORKER_TIER ${ts.join(' or ')}${self}`;
    });
  return `YOUR CREW -- the REAL models that will implement your plan, and their true capabilities/limits. Size the job to ACTUAL capability, not an abstract label. Pick the LOWEST tier that can do the job WELL; reserve the strongest for hard generation (full rewrites, rendering/sprite/visual systems, complex creative logic). If the job needs a worker MORE capable than you, assign that tier:\n${lines.join('\n')}`;
}
