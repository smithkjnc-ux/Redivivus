// [SCOPE] Template Scope Service — detects vague project requests and asks 2 clarifying questions
// in the chat BEFORE showing the template wizard. Wizard becomes a confirmation/gap-filler only.
// [WARN] Never block builds — if user ignores or times out, continue with original task.
// [DONE] isVagueProjectRequest and parseScopeAnswer replaced with AI classifiers per Rule 18.

// [WARN] One pending scope resolver at a time — cleared on reply or timeout
let _pendingScopeResolve: ((answer: string | null) => void) | null = null;
// [Redivivus] Timestamp when the scope question was posted — used to age out stale questions
let _scopeQuestionTimestamp = 0;

/**
 * Called by the message handler when the user replies to a scope question.
 * The reply is the raw message text — we detect it came from scope context via a flag.
 */
export function resolveScopeQuestion(answer: string): boolean {
  if (!_pendingScopeResolve) { return false; }
  const resolver = _pendingScopeResolve;
  _pendingScopeResolve = null;
  resolver(answer);
  return true;
}

export function hasPendingScopeQuestion(): boolean {
  return _pendingScopeResolve !== null;
}

/** Returns the timestamp (ms) when the scope question was asked. 0 if none pending. */
export function getScopeQuestionTimestamp(): number {
  return _pendingScopeResolve ? _scopeQuestionTimestamp : 0;
}

/** Clears any pending scope question without resolving it. Called when builds complete or stale. */
export function clearPendingScopeQuestion(): void {
  if (_pendingScopeResolve) {
    const resolver = _pendingScopeResolve;
    _pendingScopeResolve = null;
    _scopeQuestionTimestamp = 0;
    resolver(null);
  }
}

import type { RoutingService } from '../../../shared/ai/infrastructure/routingService.js';

/**
 * Returns true if the task is a vague new-project request needing scope clarification.
 * [RULE 18] AI classifier — "build me a website" vs "build me a portfolio with dark theme for Jane"
 * Fast path: skip AI if task is clearly not a new-project request (file/modification language).
 */
export async function isVagueProjectRequest(task: string, routing: RoutingService): Promise<boolean> {
  // Fast-path: explicit file extension or modification verb → not a new-project request
  if (/\b[\w/-]+\.(ts|js|py|html|css|json)\b/i.test(task)) { return false; }
  if (/\b(fix|update|modify|change|edit|add to|remove from)\b/i.test(task)) { return false; }
  try {
    const prompt = `Task: "${task.slice(0, 250)}"\nIs this a vague new-project request that lacks specific details (purpose, audience, key features)? Reply with one word: vague or clear`;
    const res = await routing.prompt(prompt, 12_000);
    return res.success && !!res.text && res.text.trim().toLowerCase().startsWith('vague');
  } catch {
    return false; // never block builds on AI failure
  }
}

/**
 * Shows a centered modal in the webview with 2 scope questions.
 * Returns the user's combined answer string, or null if skipped / timed out.
 * postToWebview: sends a message to the webview panel.
 */
export async function askScopeQuestions(
  task: string,
  postToWebview: (msg: any) => void,
): Promise<string | null> {
  postToWebview({ type: 'show-scope-modal', task });

  // Wait for modal submit — 5 minute timeout then bail
  return new Promise<string | null>((resolve) => {
    _pendingScopeResolve = resolve;
    _scopeQuestionTimestamp = Date.now();
    setTimeout(() => {
      if (_pendingScopeResolve === resolve) {
        _pendingScopeResolve = null;
        resolve(null);
      }
    }, 300_000);
  });
}

/**
 * Parse a scope answer and return hints for the wizard pre-selection.
 * [RULE 18] AI classifier — keyword matching cannot reliably detect complexity or purpose from free-form answers.
 */
export async function parseScopeAnswer(answer: string, routing: RoutingService): Promise<{
  complexity: 'simple' | 'medium' | 'full';
  purposeHint: string;
  enrichedTask: string;
}> {
  let complexity: 'simple' | 'medium' | 'full' = 'simple';
  let purposeHint = 'general';
  try {
    const prompt = `Scope answer: "${answer.slice(0, 300)}"\nClassify this in JSON with two fields:\n- complexity: "simple", "medium", or "full"\n- purpose: "portfolio", "business", "blog", "dashboard", "game", "tool", "api", or "general"\nReturn ONLY JSON like: {"complexity":"simple","purpose":"portfolio"}`;
    const res = await routing.prompt(prompt, 12_000);
    if (res.success && res.text) {
      const m = res.text.match(/\{[^}]+\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.complexity === 'medium' || parsed.complexity === 'full') { complexity = parsed.complexity; }
        if (parsed.purpose) { purposeHint = parsed.purpose; }
      }
    }
  } catch { /* use defaults */ }

  const typeWord = purposeHint === 'game' ? 'game' : purposeHint === 'api' ? 'api' : purposeHint === 'tool' ? 'tool' : 'website';
  const enrichedTask = `Build me a ${purposeHint} ${typeWord} (${complexity}). Details: ${answer}`;
  return { complexity, purposeHint, enrichedTask };
}

function extractProjectType(task: string): string {
  const m = task.match(/\b(website|web site|game|app|dashboard|portfolio|landing page|api|backend|blog|tool|cli)\b/i);
  return m ? m[1] : 'project';
}
