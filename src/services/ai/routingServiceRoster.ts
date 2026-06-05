// [SCOPE] AI Routing Roster — determines active AIs, roles, and UI display.
// Uses roleAssignmentService (model-tier-based) when available, falls back to AI_RANK (provider-based).
// [WARN] invalidateRosterCache() must be called after any model failure or key change.

import * as vscode from 'vscode';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from './routingKeys.js';
import { AI_RANK } from './guardianAI.js';

export interface SwPair { supervisor: string; worker: string | null; }

let _swCache: { pair: SwPair; settingsKey: string } | null = null;

// [FIX] Use key getter functions (which read from SecretStorage via getKeyCached) instead of
// config.get() (which reads settings.json). Keys live in SecretStorage after migration, so
// config.get() always returns empty — the cache key was always ",,,,,,|gemini" and never invalidated.
function _settingsKey(): string {
  const pairs: Array<[string, () => string | null]> = [
    ['gemini', getGeminiKey], ['claude', getClaudeKey], ['openai', getOpenAIKey],
    ['groq', getGroqKey], ['xai', getXAIKey], ['kimi', getKimiKey],
  ];
  return pairs.map(([p, fn]) => fn() ? p : '').join(',')
    + '|' + (vscode.workspace.getConfiguration('redivivus').get<string>('defaultAI') || 'gemini');
}

/** Clear the cached roster — call after model failure or key change. */
export function invalidateRosterCache(): void { _swCache = null; }

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
  } catch { /* fall through to legacy */ }

  // Legacy fallback: provider-level AI_RANK
  const key = _settingsKey();
  if (_swCache && _swCache.settingsKey === key) { return _swCache.pair; }
  const ranked = Object.entries(AI_RANK)
    .filter(([ai]) => keyMap[ai]?.())
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([ai]) => ai);
  const pair: SwPair = { supervisor: ranked[0] || 'gemini', worker: ranked.length >= 2 ? ranked[1] : null };
  _swCache = { pair, settingsKey: key };
  return pair;
}

export function buildRoster(keyMap: Record<string, () => string | null>): {
  supervisor: string; workers: string[]; guardian: string | null; singleModelMode?: boolean;
} {
  const ranked = Object.entries(AI_RANK)
    .filter(([ai]) => keyMap[ai]?.())
    .sort(([, a], [, b]) => b - a)
    .map(([ai]) => ai);
  if (ranked.length === 0) { return { supervisor: 'gemini', workers: [], guardian: null }; }
  const singleModelMode = ranked.length === 1;
  return {
    supervisor: ranked[0],
    workers: ranked.slice(1),
    guardian: ranked[0],
    singleModelMode,
  };
}

export function getRosterDisplay(keyMap: Record<string, () => string | null>): Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }> {
  const roster = buildRoster(keyMap);
  const labelMap: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };
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
  const defaultAI = config.get<string>('defaultAI') || 'gemini';
  const checks = [
    { id: 'gemini', label: 'Gemini', key: getGeminiKey },
    { id: 'claude', label: 'Claude', key: getClaudeKey },
    { id: 'openai', label: 'GPT-4o', key: getOpenAIKey },
    { id: 'groq', label: 'Groq', key: getGroqKey },
    { id: 'xai', label: 'Grok', key: getXAIKey },
    { id: 'kimi', label: 'Kimi', key: getKimiKey },
  ];
  const preferred = checks.find(c => c.id === defaultAI);
  if (preferred && preferred.key()) { return { ai: preferred.id, source: 'redivivus-settings', label: preferred.label }; }
  for (const c of checks) { if (c.key()) {return { ai: c.id, source: 'redivivus-settings', label: c.label + ' (fallback)' };} }
  return { ai: 'none', source: 'none', label: 'No AI' };
}

export function getModelName(): string {
  const ai = getAvailableAI().ai;
  const modelMap: Record<string, string> = {
    gemini: 'gemini-2.5-flash', claude: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o-mini', groq: 'llama-3.3-70b-versatile',
    xai: 'grok-2-1212', kimi: 'moonshot-v1-8k',
  };
  return modelMap[ai] || ai;
}
