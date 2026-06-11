// [SCOPE] Guardian AI — AI-to-AI review layer. When 2+ AI providers are configured,
// the Guardian AI reviews the worker AI's response before it reaches the user.
// Catches: hallucinations, blueprint drift, off-track answers, bad code patterns.
// [WARN] Guardian adds a second API call — only activates when guardianEnabled=true and 2+ keys set.
// Guardian should always be the "better" (more capable) AI, not the same as the worker.

import * as vscode from 'vscode';

export interface GuardianReviewResult {
  passed: boolean;
  correctedText: string | null;  // null = no correction needed
  issues: string[];              // plain-English issues found
  scopeAlerts: string[];         // out-of-scope changes the worker made — for user approval
  guardianAI: string;            // which AI acted as guardian
  workerAI: string;
  inputTokens?: number;          // actual prompt tokens from API response
  outputTokens?: number;         // actual completion tokens from API response
}

// [SCOPE] AI capability ranking — higher = more capable = better guardian/supervisor candidate
// Guardian/Supervisor (pro tier): claude=Sonnet 4.6, openai=GPT-4o, xai=Grok-3, gemini=2.5-Pro
// Worker (flash tier):            claude=Haiku 4.5,  openai=GPT-4o-mini, xai=Grok-3-mini, gemini=2.5-Flash
// Single-AI: same AI for both roles — pro tier for Guardian, flash tier for Worker
export const AI_RANK: Record<string, number> = {
  claude:   10,   // Sonnet 4.6 (guardian) / Haiku 4.5 (worker)
  gemini:   9,    // Gemini 2.5-Pro (guardian) / 2.5-Flash (worker)
  openai:   8,    // GPT-4o (guardian) / GPT-4o-mini (worker)
  deepseek: 7,    // DeepSeek-Reasoner R1 (guardian) / DeepSeek-Chat V3 (worker) — strong reasoner, low cost
  groq:     6,    // Llama 4 Maverick / Llama 3.3 70B
  xai:      5,    // Grok-3 (guardian) / Grok-3-mini (worker)
  kimi:     4,    // Moonshot 128k (guardian) / 32k (worker)
};

// [SCOPE] AI capability descriptors — used by the Supervisor to assign work
// Each AI has strengths the Supervisor can match to task steps
export interface AICapability {
  rank: number;
  label: string;
  strengths: string[];
  bestFor: string;      // one-line summary for the Supervisor prompt
  contextLimit: number; // approximate token limit
}

export const AI_CAPABILITIES: Record<string, AICapability> = {
  claude: { rank: 10, label: 'Claude', strengths: ['architecture', 'complex logic', 'error handling', 'code review', 'refactoring'], bestFor: 'Complex architecture, multi-file coordination, code review', contextLimit: 200_000 },
  gemini: { rank: 9, label: 'Gemini', strengths: ['rapid generation', 'HTML/CSS', 'browser games', 'prototyping', 'UI'], bestFor: 'Fast prototyping, HTML/CSS/JS, browser games, UI work', contextLimit: 1_000_000 },
  openai:   { rank: 8, label: 'GPT-4o', strengths: ['APIs', 'data processing', 'full-stack', 'documentation'], bestFor: 'API integration, data pipelines, full-stack apps', contextLimit: 128_000 },
  deepseek: { rank: 7, label: 'DeepSeek', strengths: ['reasoning', 'math', 'algorithms', 'cost-efficient'], bestFor: 'Deep reasoning and algorithmic problems at low cost', contextLimit: 64_000 },
  groq:     { rank: 6, label: 'Groq', strengths: ['speed', 'simple completions', 'quick iterations'], bestFor: 'Fast simple completions, rapid iteration', contextLimit: 32_000 },
  xai:      { rank: 5, label: 'Grok', strengths: ['reasoning', 'web-aware', 'creative'], bestFor: 'Creative solutions, web-aware tasks', contextLimit: 128_000 },
  kimi:     { rank: 4, label: 'Kimi', strengths: ['large files', 'bulk annotation', 'long context'], bestFor: 'Large file processing, bulk operations', contextLimit: 200_000 },
};

// [RULE] Guardian === Supervisor — always the highest-ranked available AI, no exceptions.
// Reasoning: the Supervisor writes the plan; the Guardian verifies it was executed correctly.
// Both roles require the same depth of reasoning. A weaker Guardian misses what a stronger
// Supervisor intended. Cost-first was tried and failed (see [DEAD] below).
// [DEAD] Cost-first guardian selection — Groq ($0.09/1M) reviewing Claude's work caused vague
// style critiques ("could be simplified"), wasting 4-6 retry calls. Net cost was HIGHER than
// one capable guardian call. Reverted to capability-first. Never do cost-first again.

/** Returns the Guardian AI — always the highest-ranked available AI (same as Supervisor).
 *  workerAI param retained for call-site compatibility but is no longer used to exclude. */
export function selectGuardianAI(_workerAI: string, keyMap: Record<string, () => string | null>): string | null {
  const ranked = Object.entries(AI_RANK)
    .filter(([ai]) => keyMap[ai]?.())
    .sort(([, a], [, b]) => b - a)
    .map(([ai]) => ai);
  return ranked[0] ?? null;
}

/** Returns true if Guardian AI review is enabled and possible */
export function guardianEnabled(keyMap: Record<string, () => string | null>): boolean {
  const cfg = vscode.workspace.getConfiguration('redivivus');
  if (cfg.get<boolean>('guardianEnabled') === false) { return false; }
  // Any configured AI can act as Guardian — solo mode uses same model as reviewer
  const keysSet = Object.values(keyMap).filter(fn => fn()).length;
  return keysSet >= 1;
}


