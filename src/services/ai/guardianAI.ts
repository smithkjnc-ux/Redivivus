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

/** Build the guardian review prompt */
function buildGuardianPrompt(
  originalTask: string,
  workerResponse: string,
  blueprintContext: string,
  workerAI: string,
  isSoloMode = false
): string {
  const blueprintSection = blueprintContext
    ? `\n\nPROJECT BLUEPRINT CONTEXT:\n${blueprintContext}`
    : '';
  const soloWarning = isSoloMode
    ? '\nIMPORTANT: You are reviewing code YOU just generated. You must switch into a completely different mindset — you are now a skeptical senior engineer, not the author. Do NOT give yourself a pass out of familiarity. Read it as if you are seeing it for the first time and your job is to find what is wrong.\n'
    : '';
  return `You are a senior software engineer doing a real code review. Another AI (${workerAI}) generated this code and you need to decide: is it actually good, or does it have problems?${soloWarning}

ORIGINAL USER TASK:
"${originalTask}"${blueprintSection}

CODE TO REVIEW:
---
${workerResponse}
---

Review this the way a senior engineer would in a real code review. Do not check boxes — reason about the code holistically:

- Will this code actually work correctly when run? Walk through the logic mentally.
- Does it do what the user asked, and nothing more or less?
- If a TECHNICAL SPEC was provided above, did the Worker follow it exactly — or did they add their own architecture, patterns, or features not in the spec?
- Are there performance problems? Expensive work inside loops that should run once? Unnecessary re-renders or allocations per frame?
- Are there security issues? Hardcoded secrets, unsafe eval, injection risks?
- Are there correctness bugs? Wrong variable scope (const reassigned), inverted logic, off-by-one errors, operations in the wrong order?
- Does it use real APIs that exist, or did the AI hallucinate function names or libraries?
- Would a real user be able to run this immediately, or would it fail on first use?
- Are ALL input arguments (argv, constructor params, function parameters) that are parsed or declared actually used in the core computation? If a variable is parsed from args[] but never appears in the formula, the output is mathematically wrong — this is a critical logic bug, not a style issue.

DOMAIN GOTCHAS — things junior AIs consistently get wrong (use your judgment, do not treat as a checklist):
- Canvas animations: trail alpha math '1 - index/max' is almost always inverted — oldest should be most transparent, newest most opaque
- Canvas animations: calling requestAnimationFrame inside draw() AND inside the main loop creates two simultaneous loops
- Canvas animations: using setInterval instead of requestAnimationFrame for animation
- Canvas size: setting only via CSS instead of canvas.width = value in JS
- Velocity variables: declaring dx/dy/vx/vy as const when they need to change
- Speed variable computed but never applied: e.g. const speed = Math.hypot(w,h)/180 then dx = (Math.random()-0.5)*2 ignoring speed entirely — check that speed actually multiplies the direction vector
- Single hardcoded color when task asks for visual interest — if user asked for glowing/colorful trail, a fixed hsl(180,...) for every point is a spec failure; hue should increment each frame
- Canvas clear alpha too high (e.g. rgba(0,0,0,0.3)) producing teal/colored background instead of dark — trail fading should use rgba(0,0,0,0.1) to rgba(0,0,0,0.15) range
- ctx.shadowBlur left non-zero after the trail loop — glow bleeds into the fillRect clear making the background appear colored instead of dark; must reset ctx.shadowBlur = 0 after drawing trail points
- Missing background-color on body/canvas in CSS — without it the page background can appear as browser default white or grey instead of #0a0a0f
- ageFactor = i / maxTrailLength instead of i / trail.length — when trail is still filling up all early points appear dim/tiny; must divide by trail.length (actual current length)
- resizeCanvas() called before x/y are initialized, then clamps x/y producing NaN — causes black screen; guard the clamp: only clamp if x and y are already numbers (typeof x === 'number')
- speed hardcoded as a fixed number instead of Math.hypot(canvas.width, canvas.height) / 180 — ball moves too slow/fast on different screen sizes
- CLI input shadowing: args parsed into named variables (distance, pay, fuelCost) but formula only uses some — e.g. netProfit = pay - fuelCost while distance was parsed and is never referenced — all parsed argv inputs MUST appear in the output computation
- File type mismatch: if the file is .js or .ts, the content must be valid JavaScript/TypeScript code. If it is JSON, markdown, or plain text disguised as code, that is a CRITICAL correctness bug.

SCOPE RULE — THIS OVERRIDES EVERYTHING ELSE:
If the worker changed, renamed, refactored, or "improved" ANYTHING not directly required to fulfill the task above — that is a scope violation. Reverting scope violations is MORE IMPORTANT than fixing other bugs. The user did not ask for improvements, only for the specific thing they requested.

If code is correct and no scope violations: GUARDIAN_PASS

If bugs or scope violations exist:
GUARDIAN_ISSUES:
[one bug per line — correctness problems in the requested fix only]
GUARDIAN_SCOPE_ALERTS:
[one line per scope violation — "Changed X in function Y — not part of the request"]
GUARDIAN_CORRECTION:
[complete corrected code — bugs fixed AND all scope violations reverted to original]`;
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

  // Parse issues, scope alerts, and correction
  const issues: string[] = [];
  const scopeAlerts: string[] = [];
  let correctedText: string | null = null;

  const issueMatch = reviewText.match(/GUARDIAN_ISSUES:\n([\s\S]*?)(?=GUARDIAN_SCOPE_ALERTS:|GUARDIAN_CORRECTION:|$)/);
  if (issueMatch) { issues.push(...issueMatch[1].trim().split('\n').map(l => l.replace(/^[-*\d.]+\s*/, '').trim()).filter(Boolean)); }

  const scopeMatch = reviewText.match(/GUARDIAN_SCOPE_ALERTS:\n([\s\S]*?)(?=GUARDIAN_CORRECTION:|$)/);
  if (scopeMatch) { scopeAlerts.push(...scopeMatch[1].trim().split('\n').map(l => l.replace(/^[-*\d.]+\s*/, '').trim()).filter(Boolean)); }

  const correctionMatch = reviewText.match(/GUARDIAN_CORRECTION:\n([\s\S]*)/);
  if (correctionMatch) { correctedText = correctionMatch[1].trim(); }

  // Scope alerts alone (no real bugs) — pass the fix through but surface alerts to user
  if (scopeAlerts.length > 0 && issues.length === 0 && (!correctedText || correctedText === workerResponse)) {
    return { passed: true, correctedText: null, issues: [], scopeAlerts, guardianAI, workerAI, inputTokens, outputTokens };
  }

  // No real correction — treat as pass
  if (!correctedText || correctedText === workerResponse) {
    return { passed: true, correctedText: null, issues: [], scopeAlerts, guardianAI, workerAI, inputTokens, outputTokens };
  }

  return { passed: false, correctedText, issues, scopeAlerts, guardianAI, workerAI, inputTokens, outputTokens };
}
