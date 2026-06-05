// [SCOPE] Built-in model tier list — maps specific model IDs to capability ranks.
// Higher number = higher rank = preferred for Supervisor/Guardian.
// User override: redivivus.modelRankOverrides (Record<modelId, number>) in VS Code settings.

import * as vscode from 'vscode';

// Tier 1 -- Supervisor/Guardian preferred (78-100)
// Tier 2 -- Strong workers (50-77)
// Tier 3 -- Light workers / fallback (30-49)
export const MODEL_TIER_LIST: Record<string, number> = {
  'claude-opus-4-8':           100,
  'claude-opus-4-7':            95,
  'o3':                         93,
  'claude-opus-4-6':            90,
  'claude-sonnet-4-6':          85,
  'gemini-2.5-pro':             83,
  'gpt-4o':                     80,
  'gpt-4.1':                    78,
  // Tier 2
  'gemini-2.5-flash':           70,
  'o4-mini':                    68,
  'claude-haiku-4-5':           65,
  'claude-haiku-4-5-20251001':  65,
  'deepseek-v3':                62,
  'grok-3':                     62,
  'llama-4-maverick':           60,
  'moonshot-v1-128k':           58,
  'mistral-large':              58,
  'llama-3.3-70b-versatile':    55,
  // Tier 3
  'gpt-4o-mini':                50,
  'grok-3-mini':                48,
  'gemini-2.0-flash':           45,
  'deepseek-r1':                43,
  'llama-4-scout':              40,
  'moonshot-v1-32k':            40,
  'llama-3.1-8b-instant':       35,
};

export const DEFAULT_MODEL_RANK = 30;

/** Get effective rank: user override > tier list > default. */
export function getModelRank(modelId: string): number {
  const overrides = vscode.workspace.getConfiguration('redivivus')
    .get<Record<string, number>>('modelRankOverrides') ?? {};
  return overrides[modelId] ?? MODEL_TIER_LIST[modelId] ?? DEFAULT_MODEL_RANK;
}

/** Get the best (highest-ranked) model ID for a provider, respecting user overrides. */
export function getBestModelForProvider(provider: string): { modelId: string; rank: number } {
  const isMatch = (id: string): boolean => {
    if (provider === 'claude') { return id.startsWith('claude-'); }
    if (provider === 'gemini') { return id.startsWith('gemini-'); }
    if (provider === 'openai') { return id.startsWith('gpt-') || id === 'o3' || id === 'o4-mini'; }
    if (provider === 'groq')   { return id.startsWith('llama-'); }
    if (provider === 'xai')    { return id.startsWith('grok-'); }
    if (provider === 'kimi')   { return id.startsWith('moonshot-'); }
    return false;
  };
  // Use getModelRank() so user overrides (redivivus.modelRankOverrides) are respected
  const best = Object.keys(MODEL_TIER_LIST)
    .filter(id => isMatch(id))
    .map(id => ({ modelId: id, rank: getModelRank(id) }))
    .sort((a, b) => b.rank - a.rank)[0];
  return best ?? { modelId: provider, rank: DEFAULT_MODEL_RANK };
}
