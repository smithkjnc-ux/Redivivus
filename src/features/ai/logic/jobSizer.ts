// [SCOPE] JobSizer -- classifies every build request into a job tier at intake.
// Determines how many questions (if any) fire before the build starts.
// Fast-path regex first, AI fallback second. No AI call for trivial tasks.
// [RULE 18] AI classifier has final say for offer-choices vs explore-with-them.

import type { RoutingService } from '../data/routingService.js';

export type JobTier =
  | 'tell-them'           // trivial -- 0 questions, just do it
  | 'look-it-up'          // one factual gap -- 1 question, right answer exists
  | 'offer-choices'       // clear feature, 2-3 high-impact decisions only
  | 'explore-with-them';  // vague or large -- full 5 W's intake

export interface JobSizeResult {
  tier: JobTier;
  confidence: number;         // 0-1
  reasoning: string;          // one sentence, internal log only
  suggestedQuestions: number; // max questions to ask at intake
}

// Fast-path: trivial maintenance tasks -- no AI call needed
const TELL_THEM_VERBS = /\b(fix\s+(?:the\s+)?typo|rename|delete|remove\s+(?:the\s+)?console\.log|add\s+(?:a\s+)?comment|update\s+(?:the\s+)?import|format|indent|move)\b/i;
const SINGLE_LOCATION_REF = /\b(?:(?:on\s+)?line\s+\d+|the\s+\w+\s+variable|the\s+\w+\s+function|variable\s+\w+|function\s+\w+)\b/i;
const EDIT_VERB = /\b(fix|change|rename|update|remove|delete|move)\b/i;

// Fast-path: factual lookup -- one right answer exists
const LOOKUP_PATTERNS = /^(what|which)\s+(color|port|version|value|size|name|path|key|url|setting|config)\b/i;
const WHAT_IS = /^what\s+(is|are)\s+the\s+\w+/i;

function fastPath(text: string): JobSizeResult | null {
  const words = text.trim().split(/\s+/).length;

  // tell-them: short + maintenance verb
  if (words <= 8 && TELL_THEM_VERBS.test(text)) {
    return { tier: 'tell-them', confidence: 0.95, reasoning: 'Short maintenance task', suggestedQuestions: 0 };
  }
  // tell-them: edit to a single named location
  if (words <= 10 && SINGLE_LOCATION_REF.test(text) && EDIT_VERB.test(text)) {
    return { tier: 'tell-them', confidence: 0.9, reasoning: 'Single-location edit', suggestedQuestions: 0 };
  }
  // look-it-up: factual query about a specific setting or value
  if (LOOKUP_PATTERNS.test(text.trim()) || WHAT_IS.test(text.trim())) {
    return { tier: 'look-it-up', confidence: 0.85, reasoning: 'Factual lookup', suggestedQuestions: 1 };
  }

  return null;
}

const AI_PROMPT = `Classify this build request into exactly ONE tier:

tell-them        -- trivial edit, rename, or fix. Under 8 words, single location. 0 questions.
look-it-up       -- one factual unknown (a color, port, path). 1 question. Right answer exists.
offer-choices    -- clear feature with 2-3 real design decisions. Ask only hard-to-reverse choices.
explore-with-them -- vague, large, or multi-system. Full intake needed.

Reply with ONE word only: tell-them, look-it-up, offer-choices, or explore-with-them`;

export async function sizeJob(text: string, routing: RoutingService): Promise<JobSizeResult> {
  const fast = fastPath(text);
  if (fast) { return fast; }

  try {
    const res = await routing.promptCheap(`${AI_PROMPT}\n\nRequest: "${text.slice(0, 300)}"`, 8_000);
    const raw = res.text.trim().toLowerCase().replace(/[^a-z-]/g, '');
    if (raw === 'tell-them')         { return { tier: 'tell-them',         confidence: 0.85, reasoning: 'AI: trivial edit',         suggestedQuestions: 0 }; }
    if (raw === 'look-it-up')        { return { tier: 'look-it-up',        confidence: 0.85, reasoning: 'AI: factual lookup',        suggestedQuestions: 1 }; }
    if (raw === 'offer-choices')     { return { tier: 'offer-choices',     confidence: 0.85, reasoning: 'AI: feature with decisions', suggestedQuestions: 3 }; }
    if (raw === 'explore-with-them') { return { tier: 'explore-with-them', confidence: 0.85, reasoning: 'AI: open-ended build',       suggestedQuestions: 5 }; }
  } catch { /* fall through to default */ }

  // Default: offer-choices (safest middle ground -- asks some questions, not all)
  return { tier: 'offer-choices', confidence: 0.5, reasoning: 'Fallback default', suggestedQuestions: 3 };
}

export function tierToMaxQuestions(tier: JobTier): number {
  switch (tier) {
    case 'tell-them':         return 0;
    case 'look-it-up':        return 1;
    case 'offer-choices':     return 3;
    case 'explore-with-them': return 5;
  }
}
