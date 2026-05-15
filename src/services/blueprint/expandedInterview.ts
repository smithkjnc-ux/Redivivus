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

export function generateVagueWarning(task: string): string | null {
  const lowerTask = task.toLowerCase();
  if (/^\s*(build|make|create)\s+(me\s+)?a\s+(game|app|platform|system)\s*$/i.test(task)) {
    return `Too Vague -- Cannot Proceed\n\n"${task}" is like saying "build me a vehicle." That could mean:\n- A bicycle (1 day, simple)\n- A family car (1 month, moderate)\n- A cargo ship (1 year, complex)\n\nYou must specify:\n1. What TYPE of ${lowerTask.includes('game') ? 'game' : 'app'} (puzzle, action, RPG, tool...)\n2. For WHO (kids, developers, general public...)\n3. Core FEATURES (3 things it MUST do)\n\nPlease reply with a more specific request, or type "help me refine this" to run the full interview.`;
  }
  const isModificationTask = /\b(fix|update|change|edit|modify|add|refactor|in|to|the|my)\b/i.test(lowerTask);
  const hasFileMentionInTask = /\b[\w/-]+\.(ts|tsx|js|jsx|py|html|css|scss|json)\b/i.test(task);
  if (/\bapp\b/i.test(task) && !/\b(web|mobile|desktop|for|that|with)\b/i.test(lowerTask) && !isModificationTask && !hasFileMentionInTask) {
    return `"App" Needs Specification\n\n"App" is extremely broad. Please clarify:\n- Platform: Web, mobile, desktop?\n- Core function: What is the ONE thing it does?\n- Users: Who will use this?\n\nOr type "run full interview" to go through the structured questions.`;
  }
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
