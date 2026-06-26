// [SCOPE] AI Routing Roster — determines active AIs, roles, and UI display.
// Uses roleAssignmentService (model-tier-based) when available, falls back to engine scoring (provider-based).
// [DONE 2026-06-22] Replaced static AI_RANK fallback with dynamic scoreModels(DEFAULT_PROFILE) so the
//   roster order reflects real capability/cost tradeoffs rather than a hardcoded provider ranking.
// [WARN] invalidateRosterCache() retained as a no-op for callers — cache removed (scoring is fast, O(n) models).

import * as vscode from 'vscode';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey, getDeepseekKey } from './routingKeys.js';
import { scoreModels, DEFAULT_PROFILE } from './routingEngine.js';
import { bestModelForRole } from './modelRegistry.js';

export interface SwPair { supervisor: string; worker: string | null; }

/** No-op — retained for callers. Scoring is fast enough that caching is not needed. */
export function invalidateRosterCache(): void { /* intentionally empty */ }

function _rankedProviders(keyMap: Record<string, () => string | null>): string[] {
  const available: Record<string, boolean> = Object.fromEntries(
    Object.entries(keyMap).map(([k, fn]) => [k, !!fn()])
  );
  const scored = scoreModels(DEFAULT_PROFILE, available);
  const seen = new Set<string>();
  const providers: string[] = [];
  for (const m of scored) {
    if (!seen.has(m.provider)) { seen.add(m.provider); providers.push(m.provider); }
  }
  return providers;
}

export function selectSupervisorAndWorker(keyMap: Record<string, () => string | null>): SwPair {
  // Use roleAssignmentService (model-tier-aware) when registrations are live
  try {
    const { getLiveAssignment } = require('../../core/ai/roleAssignmentFailover.js');
    const assignment = getLiveAssignment(keyMap);
    if (assignment.supervisor.providerId !== 'none') {
      return {
        supervisor: assignment.supervisor.providerId,
        worker: assignment.workers[0]?.providerId ?? null,
      };
    }
  } catch { /* fall through to engine scoring */ }

  // [ENGINE] Score all available providers — replaces static AI_RANK ordering
  const providers = _rankedProviders(keyMap);
  return { supervisor: providers[0] || 'gemini', worker: providers.length >= 2 ? providers[1] : null };
}

export function buildRoster(keyMap: Record<string, () => string | null>): {
  supervisor: string; workers: string[]; guardian: string | null; singleModelMode?: boolean;
} {
  const providers = _rankedProviders(keyMap);
  if (providers.length === 0) { return { supervisor: 'gemini', workers: [], guardian: null }; }
  return {
    supervisor: providers[0],
    workers: providers.slice(1),
    guardian: providers[0],  // guardian = highest-scored provider (reviews lower-scored workers)
    singleModelMode: providers.length === 1,
  };
}

export function getRosterDisplay(keyMap: Record<string, () => string | null>): Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }> {
  // [FIX] No keys configured -> empty roster. buildRoster() defaults supervisor to 'gemini' even
  // with zero keys, which made the input pill falsely claim "Gemini (Supervisor)". Returning []
  // lets the header render fall through to the "No AI key" pill. See chatPanelHeaderRender.ts.
  if (!Object.values(keyMap).some(fn => fn())) { return []; }
  const roster = buildRoster(keyMap);
  const labelMap: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', deepseek: 'DeepSeek' };
  const result: Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }> = [];
  result.push({ ai: roster.supervisor, label: labelMap[roster.supervisor] || roster.supervisor, role: 'Supervisor', emoji: '🎯' });
  for (const w of roster.workers) { result.push({ ai: w, label: labelMap[w] || w, role: 'Worker', emoji: '⚙️' }); }
  if (roster.guardian && roster.guardian !== roster.supervisor) {
    result.push({ ai: roster.guardian, label: labelMap[roster.guardian] || roster.guardian, role: 'Guardian', emoji: '🛡️' });
  }
  return result;
}

export function getPreferredAI(): string {
  return vscode.workspace.getConfiguration('redivivus').get<string>('defaultAI') || '';
}

export function getAvailableAI(): { ai: string; source: 'redivivus-settings' | 'env' | 'none'; label: string } {
  const config = vscode.workspace.getConfiguration('redivivus');
  const defaultAI = config.get<string>('defaultAI') || '';
  const checks = [
    { id: 'gemini', label: 'Gemini', key: getGeminiKey },
    { id: 'claude', label: 'Claude', key: getClaudeKey },
    { id: 'openai', label: 'GPT-4o', key: getOpenAIKey },
    { id: 'groq', label: 'Groq', key: getGroqKey },
    { id: 'xai', label: 'Grok', key: getXAIKey },
    { id: 'kimi', label: 'Kimi', key: getKimiKey },
    { id: 'deepseek', label: 'DeepSeek', key: getDeepseekKey },
  ];
  const preferred = checks.find(c => c.id === defaultAI);
  if (preferred && preferred.key()) { return { ai: preferred.id, source: 'redivivus-settings', label: preferred.label }; }
  for (const c of checks) { if (c.key()) {return { ai: c.id, source: 'redivivus-settings', label: c.label + ' (fallback)' };} }
  return { ai: 'none', source: 'none', label: 'No AI' };
}

export function getModelName(): string {
  const ai = getAvailableAI().ai;
  return bestModelForRole(ai, 'flash')?.modelId ?? ai;
}
