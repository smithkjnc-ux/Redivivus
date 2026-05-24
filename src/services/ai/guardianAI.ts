// [SCOPE] Guardian AI — AI-to-AI review layer. When 2+ AI providers are configured,
// the Guardian AI reviews the worker AI's response before it reaches the user.
// Catches: hallucinations, blueprint drift, off-track answers, bad code patterns.
// [WARN] Guardian adds a second API call — only activates when guardianEnabled=true and 2+ keys set.
// Guardian should always be the "better" (more capable) AI, not the same as the worker.

import * as vscode from 'vscode';
import { buildGuardianPrompt } from './guardianAIPrompt.js';

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

// [SCOPE] AI capability ranking — higher = more capable = better guardian candidate
// Based on known model quality benchmarks as of 2025.
export const AI_RANK: Record<string, number> = {
  claude: 10,   // Claude 3.5+ — best reasoning
  openai: 9,    // GPT-4o — strong all-rounder
  xai:    8,    // Grok — strong reasoning
  gemini: 7,    // Gemini 2.5 — very capable, free
  kimi:   6,    // Kimi — large context
  groq:   5,    // Groq — fastest, weaker reasoning
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
  openai: { rank: 9, label: 'GPT-4o', strengths: ['APIs', 'data processing', 'full-stack', 'documentation'], bestFor: 'API integration, data pipelines, full-stack apps', contextLimit: 128_000 },
  xai:    { rank: 8, label: 'Grok', strengths: ['reasoning', 'web-aware', 'creative'], bestFor: 'Creative solutions, web-aware tasks', contextLimit: 128_000 },
  gemini: { rank: 7, label: 'Gemini', strengths: ['rapid generation', 'HTML/CSS', 'browser games', 'prototyping', 'UI'], bestFor: 'Fast prototyping, HTML/CSS/JS, browser games, UI work', contextLimit: 1_000_000 },
  kimi:   { rank: 6, label: 'Kimi', strengths: ['large files', 'bulk annotation', 'long context'], bestFor: 'Large file processing, bulk operations', contextLimit: 200_000 },
  groq:   { rank: 5, label: 'Groq', strengths: ['speed', 'simple completions', 'quick iterations'], bestFor: 'Fast simple completions, rapid iteration', contextLimit: 32_000 },
};

// [FIX] Guardian picks cheapest first — scope review needs accuracy, not reasoning power.
// [DEAD] Old: sorted by AI_RANK DESC (most capable) → used expensive Sonnet for every guardian pass.
// Cost order: groq ($0.09/1M) → kimi ($0.15) → gemini ($0.30) → openai ($5) → xai ($5) → claude ($0.80–$3)
const GUARDIAN_COST_ORDER = ['groq', 'kimi', 'gemini', 'openai', 'xai', 'claude'];

/** Returns the cheapest available guardian AI that is not the worker. */
export function selectGuardianAI(workerAI: string, keyMap: Record<string, () => string | null>): string | null {
  const cheap = GUARDIAN_COST_ORDER.filter(ai => ai !== workerAI && keyMap[ai]?.());
  if (cheap[0]) { return cheap[0]; }
  return keyMap[workerAI]?.() ? workerAI : null; // solo mode — same AI as skeptical reviewer
}

/** Returns true if Guardian AI review is enabled and possible */
export function guardianEnabled(keyMap: Record<string, () => string | null>): boolean {
  const cfg = vscode.workspace.getConfiguration('chassis');
  if (cfg.get<boolean>('guardianEnabled') === false) { return false; }
  // Any configured AI can act as Guardian — solo mode uses same model as reviewer
  const keysSet = Object.values(keyMap).filter(fn => fn()).length;
  return keysSet >= 1;
}

/** Run guardian review. Returns corrected text or null if passed. */
export async function runGuardianReview(
  originalTask: string,
  workerResponse: string,
  workerAI: string,
  guardianAI: string,
  blueprintContext: string,
  callProvider: (ai: string, prompt: string) => Promise<{ text: string; success: boolean; inputTokens?: number; outputTokens?: number }>
): Promise<GuardianReviewResult> {
  const isSoloMode = guardianAI === workerAI;
  const prompt = buildGuardianPrompt(originalTask, workerResponse, blueprintContext, workerAI, isSoloMode);

  let reviewText = '';
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  try {
    const res = await callProvider(guardianAI, prompt);
    if (!res.success) {
      return { passed: true, correctedText: null, issues: [], scopeAlerts: [], guardianAI, workerAI };
    }
    reviewText = res.text.trim();
    inputTokens = res.inputTokens;
    outputTokens = res.outputTokens;
  } catch {
    return { passed: true, correctedText: null, issues: [], scopeAlerts: [], guardianAI, workerAI };
  }

  // GUARDIAN_PASS — no issues, no scope violations
  if (reviewText.startsWith('GUARDIAN_PASS')) {
    return { passed: true, correctedText: null, issues: [], scopeAlerts: [], guardianAI, workerAI, inputTokens, outputTokens };
  }

  // Parse issues and scope alerts — Guardian never returns corrected code, only review feedback
  const issues: string[] = [];
  const scopeAlerts: string[] = [];

  const issueMatch = reviewText.match(/GUARDIAN_ISSUES:\n([\s\S]*?)(?=GUARDIAN_SCOPE_ALERTS:|$)/);
  if (issueMatch) { issues.push(...issueMatch[1].trim().split('\n').map(l => l.replace(/^[-*\d.]+\s*/, '').trim()).filter(Boolean)); }

  const scopeMatch = reviewText.match(/GUARDIAN_SCOPE_ALERTS:\n([\s\S]*?)(?=$)/);
  if (scopeMatch) { scopeAlerts.push(...scopeMatch[1].trim().split('\n').map(l => l.replace(/^[-*\d.]+\s*/, '').trim()).filter(Boolean)); }

  // Scope alerts only (no real bugs) — pass through and surface alerts to user
  if (issues.length === 0) {
    return { passed: true, correctedText: null, issues: [], scopeAlerts, guardianAI, workerAI, inputTokens, outputTokens };
  }

  return { passed: false, correctedText: null, issues, scopeAlerts, guardianAI, workerAI, inputTokens, outputTokens };
}
