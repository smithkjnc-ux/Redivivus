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
  guardianAI: string;            // which AI acted as guardian
  workerAI: string;
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

/**
 * Returns the guardian AI id (highest-ranked available that is NOT the worker).
 * [CHASSIS] Consistent with selectSupervisorAndWorker() in routingService —
 * both use AI_RANK. Guardian === Supervisor: same AI always in charge, no split brain.
 * (Cannot call selectSupervisorAndWorker directly here — would create circular import.)
 */
export function selectGuardianAI(workerAI: string, keyMap: Record<string, () => string | null>): string | null {
  // Prefer a different AI as Guardian (different model = better review)
  const available = Object.keys(AI_RANK)
    .filter(ai => ai !== workerAI && keyMap[ai]?.())
    .sort((a, b) => (AI_RANK[b] ?? 0) - (AI_RANK[a] ?? 0));
  if (available[0]) { return available[0]; }
  // Solo mode: same AI reviews its own output with a skeptical reviewer persona
  // Models catch errors better when prompted as a reviewer than as a generator
  return keyMap[workerAI]?.() ? workerAI : null;
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

INSTRUCTIONS:
- If the code is correct and ready to use, reply with EXACTLY: GUARDIAN_PASS
- If you find real problems, reply with EXACTLY this format:

GUARDIAN_ISSUES:
[each issue on its own line — plain English, what is wrong and why it matters, max 2 sentences]

GUARDIAN_CORRECTION:
[the complete corrected code — not a summary, not a diff, the full working output]`;
}

/** Run guardian review. Returns corrected text or null if passed. */
export async function runGuardianReview(
  originalTask: string,
  workerResponse: string,
  workerAI: string,
  guardianAI: string,
  blueprintContext: string,
  callProvider: (ai: string, prompt: string) => Promise<{ text: string; success: boolean }>
): Promise<GuardianReviewResult> {
  const isSoloMode = guardianAI === workerAI;
  const prompt = buildGuardianPrompt(originalTask, workerResponse, blueprintContext, workerAI, isSoloMode);

  let reviewText = '';
  try {
    const res = await callProvider(guardianAI, prompt);
    if (!res.success) {
      // Guardian failed to respond — pass through unchanged, log silently
      return { passed: true, correctedText: null, issues: [], guardianAI, workerAI };
    }
    reviewText = res.text.trim();
  } catch {
    return { passed: true, correctedText: null, issues: [], guardianAI, workerAI };
  }

  // GUARDIAN_PASS — no issues
  if (reviewText.startsWith('GUARDIAN_PASS')) {
    return { passed: true, correctedText: null, issues: [], guardianAI, workerAI };
  }

  // Parse issues + correction
  const issues: string[] = [];
  let correctedText: string | null = null;

  const issueMatch = reviewText.match(/GUARDIAN_ISSUES:\n([\s\S]*?)(?=GUARDIAN_CORRECTION:|$)/);
  if (issueMatch) {
    issues.push(...issueMatch[1].trim().split('\n').map(l => l.replace(/^[-*\d.]+\s*/, '').trim()).filter(Boolean));
  }

  const correctionMatch = reviewText.match(/GUARDIAN_CORRECTION:\n([\s\S]*)/);
  if (correctionMatch) {
    correctedText = correctionMatch[1].trim();
  }

  // If correction is empty or identical to original, treat as pass
  if (!correctedText || correctedText === workerResponse) {
    return { passed: true, correctedText: null, issues: [], guardianAI, workerAI };
  }

  return { passed: false, correctedText, issues, guardianAI, workerAI };
}
