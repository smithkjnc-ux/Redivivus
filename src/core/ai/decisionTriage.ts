// [SCOPE] Decision Triage -- splits clarify questions into three buckets before asking anything.
// ai-owns: correct answer exists in code/codebase -- AI answers internally, never asks user.
// user-owns-ask: preference, structural, hard-to-reverse -- ask user (capped by JobTier).
// user-owns-guess: cheap/easy-to-change preference -- AI picks default, surfaces post-build.
// [RULE 18] AI classifier determines bucket; fast-path regex handles obvious cases first.

import type { RoutingService } from '../../services/ai/routingService';
import type { ClarifyQuestion } from '../../ui/panels/chat/chatPanelClarify';
import type { JobTier } from './jobSizer';

export type DecisionBucket = 'ai-owns' | 'user-owns-ask' | 'user-owns-guess';

export interface TriagedQuestion {
  question: string;
  bucket: DecisionBucket;
  reasoning: string;        // internal log only -- never shown to user
  guessValue?: string;      // if user-owns-guess: what the AI will use
  impactLevel: 'high' | 'low';
  reversible: boolean;
}

export interface TriageResult {
  questionsToAsk: TriagedQuestion[];     // user-owns-ask only, capped by JobTier
  questionsAIAnswers: TriagedQuestion[]; // ai-owns -- resolved internally
  questionsAIGuesses: TriagedQuestion[]; // user-owns-guess -- AI picks, surfaces after build
}

// Module-level pending guesses -- read by runChatClarifyStep to enrich routedText
let _pendingGuesses: TriagedQuestion[] = [];
export function getPendingGuesses(): TriagedQuestion[] { return [..._pendingGuesses]; }
export function addPendingGuess(g: TriagedQuestion): void { _pendingGuesses.push(g); }
export function clearPendingGuesses(): void { _pendingGuesses = []; }

// Fast-path: questions that are always ai-owns (technical/codebase decisions)
const AI_OWNS_PATTERNS = /\b(which file|what file|where is|does .+ exist|which .+ to use|should I use|imports?|exports?|function already|component already|already (have|exists?)|current (color|style|palette|theme)|existing (color|style|palette|theme))\b/i;

// Fast-path: questions that are always user-owns-guess (cheap, easy to change later)
const GUESS_PATTERNS = /\b(exact (color|shade|hue|margin|padding|size|spacing|radius|value)|px|rem|border.?radius|line.?height|font.?size|placeholder (text|copy)|animation (duration|speed|timing|delay)|transition (duration|speed)|exact (number|count|amount))\b/i;

// Meta-questions: always treated as user-owns-ask regardless of content
const META_IDS = new Set(['build_approach', 'anything_else', 'blueprint_verify']);

function fastTriageSingle(q: ClarifyQuestion): TriagedQuestion | null {
  if (AI_OWNS_PATTERNS.test(q.question)) {
    return { question: q.question, bucket: 'ai-owns', reasoning: 'Technical -- AI can determine from codebase', impactLevel: 'low', reversible: true };
  }
  if (GUESS_PATTERNS.test(q.question)) {
    const firstOption = q.options[0]?.label || 'sensible default';
    return { question: q.question, bucket: 'user-owns-guess', reasoning: 'Cheap preference -- AI picks default', guessValue: firstOption, impactLevel: 'low', reversible: true };
  }
  return null;
}

function buildTriagePrompt(task: string, questions: ClarifyQuestion[]): string {
  const qList = questions.map((q, i) => {
    const opts = q.options.length > 0 ? ` [options: ${q.options.map(o => o.label).join(' / ')}]` : '';
    return `${i + 1}. ${q.question}${opts}`;
  }).join('\n');

  return `Classify each design question about this build request into a bucket.

BUILD REQUEST: "${task.slice(0, 200)}"

QUESTIONS:
${qList}

BUCKETS:
- ai-owns: Has a correct answer AI can find in the codebase. Never ask user.
  Examples: "Which file is the form in?", "Does this component already exist?"
- user-owns-ask: Preference or structural choice. Wrong choice = significant rework.
  Examples: "Modal or new page?", "What color scheme?", "Single page or multi-step?"
- user-owns-guess: Cheap, easy-to-change preference. AI picks a sensible default.
  Examples: exact padding/margin values, exact color shade, placeholder text, animation timing.

For user-owns-guess, include a short guessValue (plain English default, e.g. "16px standard padding").
Return ONLY valid JSON array, no markdown:
[
  { "question": "exact question text", "bucket": "user-owns-ask", "reasoning": "structural", "impactLevel": "high", "reversible": false },
  { "question": "exact question text", "bucket": "user-owns-guess", "guessValue": "16px", "reasoning": "cheap pref", "impactLevel": "low", "reversible": true }
]`;
}

export async function triageDecisions(
  questions: ClarifyQuestion[],
  routing: RoutingService,
  task = '',
  _tier?: JobTier,
): Promise<TriageResult> {
  if (questions.length === 0) {
    return { questionsToAsk: [], questionsAIAnswers: [], questionsAIGuesses: [] };
  }

  const result: TriageResult = { questionsToAsk: [], questionsAIAnswers: [], questionsAIGuesses: [] };
  const remaining: ClarifyQuestion[] = [];

  for (const q of questions) {
    // Meta-questions always go to ask-bucket regardless of content
    if (META_IDS.has(q.id)) {
      result.questionsToAsk.push({ question: q.question, bucket: 'user-owns-ask', reasoning: 'Meta question', impactLevel: 'high', reversible: true });
      continue;
    }
    const fast = fastTriageSingle(q);
    if (fast) {
      if (fast.bucket === 'ai-owns') { result.questionsAIAnswers.push(fast); }
      else { result.questionsAIGuesses.push(fast); }
    } else {
      remaining.push(q);
    }
  }

  if (remaining.length === 0) { return result; }

  // AI classifier for remaining questions
  try {
    const res = await routing.promptCheap(buildTriagePrompt(task, remaining), 12_000);
    const raw = res.text.trim().replace(/^```[a-zA-Z]*\n?/gi, '').replace(/\n?```$/gi, '').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    const parsed: any[] = match ? JSON.parse(match[0]) : [];
    const validBuckets = new Set(['ai-owns', 'user-owns-ask', 'user-owns-guess']);
    for (const item of parsed) {
      const bucket = (validBuckets.has(item.bucket) ? item.bucket : 'user-owns-ask') as DecisionBucket;
      const tq: TriagedQuestion = {
        question: String(item.question || ''),
        bucket,
        reasoning: String(item.reasoning || ''),
        guessValue: item.guessValue ? String(item.guessValue) : undefined,
        impactLevel: item.impactLevel === 'low' ? 'low' : 'high',
        reversible: item.reversible !== false,
      };
      if (bucket === 'ai-owns') { result.questionsAIAnswers.push(tq); }
      else if (bucket === 'user-owns-guess') { result.questionsAIGuesses.push(tq); }
      else { result.questionsToAsk.push(tq); }
    }
  } catch {
    // Fallback: classify all remaining as user-owns-ask (safest -- user sees all)
    for (const q of remaining) {
      result.questionsToAsk.push({ question: q.question, bucket: 'user-owns-ask', reasoning: 'Fallback', impactLevel: 'high', reversible: false });
    }
  }

  return result;
}
