// [SCOPE] Redivivus Build Clarification — Supervisor-level design triage
// The AI decides IF questions are needed (lightbulb vs paint job), then generates
// targeted design questions for ambiguous requests. Simple edits pass through.

import type { RoutingService } from '../../../services/ai/routingService';

export interface ClarifyOption {
  label: string;
}

export interface ClarifyQuestion {
  id: string;
  question: string;
  options: ClarifyOption[];
  freeText?: boolean;
}

// [WARN] Fast-path skips: modification requests, fix requests, and explicit single-property
// changes never need clarification. Only new builds with design ambiguity trigger questions.
const SKIP_CLARIFY = /\b(fix|bug|broken|error|crash|change\s+the\s+(color|font|size|text|margin|padding)|rename|delete|remove|update\s+the)\b/i;
// Inspector element context prefix — always a targeted fix, no design ambiguity possible
const INSPECTOR_PREFIX = /^\[[\w#.,\s:-]+\s+\d+x\d+\]/;

/**
 * Supervisor design triage: decides if the task needs clarifying questions.
 * Returns empty array for lightbulb changes, 2-4 questions for paint jobs.
 * Pass previousAnswersBlock (from a prior round) to prevent re-asking covered topics.
 */
export async function generateClarifyQuestions(
  task: string,
  blueprintContext: string,
  routing: RoutingService,
  previousAnswersBlock?: string,
): Promise<ClarifyQuestion[]> {
  // Fast skip: obvious edits, fixes, single-property changes, or inspector element selections
  if (SKIP_CLARIFY.test(task) || INSPECTOR_PREFIX.test(task)) { return []; }
  // Fast skip: very short modification requests (under 8 words, no "build/create/make")
  const words = task.trim().split(/\s+/);
  if (words.length < 8 && !/\b(build|create|make|design|generate|write)\b/i.test(task)) { return []; }

  // [WARN] When previous answers exist, inject them into BOTH triage and question prompts.
  // Without this, round 2 ignores round 1 answers and re-asks the same topics reworded.
  const prevContext = previousAnswersBlock
    ? `\n\nPREVIOUSLY COLLECTED DESIGN ANSWERS (round 1 -- do NOT ask about any of these topics again):\n${previousAnswersBlock}`
    : '';

  // Step 1: Supervisor decides IF questions are needed (single-word answer)
  const triageSystem = `You are the Supervisor AI deciding whether a build request needs design clarification before work begins.

RULES:
- "Change the button to red" = NO (specific, nothing ambiguous)
- "Add a login page" = NO (standard pattern, no design ambiguity)
- "Build me a flappy bird game" = YES (even though the pattern is well-known, visual style, character design, color scheme, platform, and difficulty are all unspecified)
- "Build a snake game" = YES (same reason — any game needs visual style + platform clarification)
- "Create a landing page for my startup" = YES (layout, color scheme, tone, sections are unspecified)
- "Make a calculator" = NO (standard UI, no meaningful visual choice)
- "Build a todo app" = NO (standard pattern, well-understood)
- IMPORTANT: Game requests (any game type) are ALWAYS YES — games have visual style, character, color, and platform choices that meaningfully change the output even when the game type is familiar.
- If the user specified most design details already = NO
- When in doubt, lean toward NO -- don't slow down confident builders`;

  const triagePrompt = `Task: "${task.slice(0, 400)}"
${blueprintContext ? `Project context: ${blueprintContext.slice(0, 200)}` : ''}${prevContext}

Does this request have DESIGN AMBIGUITY that would meaningfully change the output${previousAnswersBlock ? ' and is NOT already covered by the previous answers above' : ''}?
Reply with ONLY: yes or no`;

  const metaQ: ClarifyQuestion = { id: 'build_approach', question: 'How do you want to proceed?', options: [{ label: 'Build it now — AI decides everything' }, { label: 'Guide it — I want to specify the details' }] };
  const freeQ: ClarifyQuestion = { id: 'anything_else', question: 'Anything else you want to add? (optional)', options: [], freeText: true };

  try {
    const triageRes = await routing.prompt(triagePrompt, 12_000, undefined, undefined, triageSystem);
    if (!triageRes.success) { return []; }
    const answer = triageRes.text.trim().toLowerCase();
    if (!answer.startsWith('yes')) { return []; }
  } catch { return []; }

  // Step 2: Generate targeted design questions (only runs if triage said YES)
  const questionSystem = `You are the Supervisor AI generating design questions for a build request. You must identify what is AMBIGUOUS and ask ONLY about those things.

RULES:
- Ask 2-4 questions MAX. Not 5, not 6. Only what matters.
- Each question gets 2-3 concrete options (not open-ended).
- Focus on what would VISUALLY, BEHAVIORALLY, or STRUCTURALLY change the output:
  * Project structure — "Single portable HTML file" vs "Modular project (HTML/CSS/JS separated)"
  * Platform/delivery — for games and tools: "Play in web browser" vs "Desktop app" vs "Mobile-friendly web"
  * Visual style, color scheme, layout approach
  * Character/element design (for games)
  * Interaction patterns, difficulty, pacing
  * Tone/personality (playful, professional, minimal)
- Project structure AND Platform/delivery ARE required questions for any game or interactive tool — always include them.
- Do NOT ask about technical implementation details like database choices unless explicitly brought up by the user.
- Do NOT ask about things the user already specified.
- Do NOT offer options that escalate scope (no power-ups, level progression, or multiplayer for a simple game). Questions clarify style, feel, and structure — not new features.
- Options should be concrete and distinct -- not "Option A" vs "Option B" but "Retro pixel art" vs "Modern cartoon" vs "Minimalist flat".
- Write questions as a user would understand them, not as a developer would.`;

  const conversationNote = blueprintContext && blueprintContext.length > 100
    ? `\n\nCONVERSATION CONTEXT (features already discussed with the user — reference these in your first question as a summary):\n${blueprintContext.slice(0, 800)}`
    : '';
  const questionPrompt = `The user wants to build: "${task}"
${blueprintContext ? `Project context: ${blueprintContext.slice(0, 300)}` : ''}${prevContext}${conversationNote}

${conversationNote ? 'The user already discussed features with the AI. Your FIRST question MUST be a summary of what was discussed, presented as a build plan the user can verify. Example first question:\n"Based on our conversation, here\'s what I\'ll build:\\n- Feature 1\\n- Feature 2\\n- Feature 3\\nDoes this look right?"\nOptions: ["Yes, build this", "I want to change some things"]\n\nThen ask 1-2 additional design questions about anything still AMBIGUOUS.' : 'Generate 2-4 design questions about what is AMBIGUOUS and NOT YET ANSWERED.'}${previousAnswersBlock ? '\nIf all design decisions are already covered by the previous answers above, return an empty array: []' : ''}
Return ONLY a valid JSON array -- no markdown, no explanation:
[
  {
    "id": "q1",
    "question": "Where will this run?",
    "options": [
      {"label": "Web browser (open as HTML file or host online)"},
      {"label": "Desktop app (packaged executable)"},
      {"label": "Mobile-friendly web (touch-optimized browser game)"}
    ]
  },
  {
    "id": "q2",
    "question": "What visual style do you want?",
    "options": [
      {"label": "Retro pixel art (8-bit feel)"},
      {"label": "Modern cartoon (smooth, colorful)"},
      {"label": "Minimalist flat (clean lines, simple shapes)"}
    ]
  }
]`;

  const metaQuestion: ClarifyQuestion = {
    id: 'build_approach',
    question: 'How do you want to proceed?',
    options: [
      { label: 'Build it now — AI decides everything' },
      { label: 'Guide it — I want to specify the details' },
    ],
  };
  const freeTextQuestion: ClarifyQuestion = {
    id: 'anything_else',
    question: 'Anything else you want to add? (optional)',
    options: [],
    freeText: true,
  };

  try {
    const res = await routing.prompt(questionPrompt, 20_000, undefined, undefined, questionSystem);
    if (!res.success) { return [metaQuestion, freeTextQuestion]; }
    let raw = res.text.trim().replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (arrMatch) { raw = arrMatch[0]; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) { return [metaQuestion, freeTextQuestion]; }
    if (parsed.length === 0) { return []; } // Fast-path: no ambiguity remains
    const detail = (parsed as ClarifyQuestion[]).slice(0, 4);
    return [metaQuestion, ...detail, freeTextQuestion];
  } catch {
    return [metaQuestion, freeTextQuestion];
  }
}

/** Encode questions as a __CLARIFY__ token for the conversation renderer */
export function encodeClarifyToken(questions: ClarifyQuestion[]): string {
  return `__CLARIFY__${JSON.stringify(questions)}__END_CLARIFY__`;
}

/** Format answers map as a block to inject into build prompts */
export function formatAnswersForPrompt(answers: Record<string, string>): string {
  if (Object.keys(answers).length === 0) { return ''; }
  const lines = Object.entries(answers).map(([q, a]) => `- ${q}: ${a}`);
  return `USER DESIGN PREFERENCES (chosen before building -- implement these exactly as specified):\n${lines.join('\n')}`;
}
