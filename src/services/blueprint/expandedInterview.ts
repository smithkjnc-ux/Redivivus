// [SCOPE] Expanded 5W Interview — types and helper functions
// Question bank moved to expandedInterviewQuestions.ts

export interface Expanded5W {
  who: {
    skillLevel: string;
    userCount: string;
    userType: string;
    accessibility: string[];
  };
  what: {
    coreFunction: string;
    keyFeatures: string[];
    outOfScope: string[];
    successCriteria: string;
  };
  where: {
    platform: string;
    deployment: string;
    integrations: string[];
    offlineSupport: boolean;
  };
  when: {
    timeline: string;
    mvpDeadline: string;
    launchDeadline: string;
    realTimeRequirements: string[];
  };
  why: {
    problemStatement: string;
    currentSolutions: string[];
    differentiator: string;
    successMetrics: string[];
  };
}

export interface InterviewQuestion {
  id: string;
  category: 'who' | 'what' | 'where' | 'when' | 'why';
  question: string;
  subtext: string;
  placeholder: string;
  type: 'text' | 'choice' | 'multichoice' | 'number';
  choices?: string[];
  required: boolean;
  complexityTrigger: 'standard' | 'deep';
}

import { EXPANDED_QUESTIONS } from './expandedInterviewQuestions.js';
import type { RoutingService } from '../ai/routingService.js';

export function getQuestionsForTier(tier: 'standard' | 'deep'): InterviewQuestion[] {
  return EXPANDED_QUESTIONS.filter(q => {
    if (tier === 'deep') return true;
    return q.complexityTrigger === 'standard';
  });
}

export function organizeByCategory(questions: InterviewQuestion[]): Record<string, InterviewQuestion[]> {
  const byCategory: Record<string, InterviewQuestion[]> = { who: [], what: [], where: [], when: [], why: [] };
  for (const q of questions) { byCategory[q.category].push(q); }
  return byCategory;
}

// [RULE 18] AI classifier determines vagueness — regex cannot reliably judge whether a request
// has enough context to build from. Fast path for single-word builds only.
export async function generateVagueWarning(task: string, routing: RoutingService): Promise<string | null> {
  // Fast path: bare minimum ("build me a game" — no type, no features, no users)
  if (/^\s*(build|make|create)\s+(me\s+)?(a\s+)?(game|app|platform|system)\s*$/i.test(task.trim())) {
    const noun = /game/i.test(task) ? 'game' : 'app';
    return `Too Vague -- Cannot Proceed\n\n"${task}" is like saying "build me a vehicle." Specify:\n1. What TYPE of ${noun} (puzzle, action, tool...)\n2. For WHO (kids, developers, general public...)\n3. Core FEATURES (3 things it must do)\n\nOr type "help me refine this" to run the full interview.`;
  }
  // AI classifier for everything else — regex cannot reliably detect vagueness in natural language
  try {
    const prompt = `Is this software build request specific enough to build without clarification?\nTask: "${task.slice(0, 300)}"\nSpecific enough = has at least a type/domain AND core feature/purpose.\nReply with one word: clear or vague`;
    const res = await routing.prompt(prompt, 12_000);
    if (res.success && res.text && res.text.trim().toLowerCase().startsWith('vague')) {
      return `Request Needs More Detail\n\nTo build this well, please clarify:\n- What specific type of ${task.slice(0, 40).toLowerCase().replace(/build|make|create|a |an /g, '').trim()} do you want?\n- Who will use it?\n- What are the 3 core features?\n\nOr type "help me refine this" to run the full interview.`;
    }
  } catch { /* on AI failure, allow the request through — never block on classifier error */ }
  return null;
}

export function compileInterviewAnswers(answers: Record<string, string | string[]>): {
  who: string; what: string; where: string; when: string; why: string; expanded: Record<string, string[]>;
} {
  const expanded: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(answers)) {
    const category = key.split('-')[0];
    if (!expanded[category]) expanded[category] = [];
    if (Array.isArray(value)) { expanded[category].push(...value); }
    else { expanded[category].push(value); }
  }
  return {
    who: answers['who-skill']?.toString() || answers['who-type']?.toString() || 'Unknown users',
    what: answers['what-core']?.toString() || 'Unspecified functionality',
    where: answers['where-platform']?.toString() || 'Unspecified platform',
    when: answers['when-timeline']?.toString() || 'Unspecified timeline',
    why: answers['why-problem']?.toString() || 'Unspecified purpose',
    expanded,
  };
}
