// [SCOPE] Expanded 5W Interview — deep questioning for complex builds
// Each W expands into 3-5 sub-questions based on complexity

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

// The expanded question bank
export const EXPANDED_QUESTIONS: InterviewQuestion[] = [
  // === WHO ===
  {
    id: 'who-skill',
    category: 'who',
    question: 'What is the technical skill level of your users?',
    subtext: 'This affects UI complexity, feature exposure, and documentation needs.',
    placeholder: 'e.g., Developers, Intermediate, Beginners, Mixed',
    type: 'choice',
    choices: ['Technical/Developers', 'Intermediate (some tech knowledge)', 'Beginners (minimal tech knowledge)', 'Mixed audience'],
    required: true,
    complexityTrigger: 'standard',
  },
  {
    id: 'who-count',
    category: 'who',
    question: 'How many concurrent users do you expect?',
    subtext: 'This determines architecture choices (single-user vs. multiplayer vs. mass-scale).',
    placeholder: 'e.g., Just me, 10, 1000, 100000+',
    type: 'choice',
    choices: ['Just me (personal use)', 'Small team (2-10)', 'Medium scale (10-1000)', 'Large scale (1000-100000)', 'Mass scale (100000+)'],
    required: true,
    complexityTrigger: 'deep',
  },
  {
    id: 'who-type',
    category: 'who',
    question: 'Are these internal users or public customers?',
    subtext: 'Internal tools can skip polish; customer-facing needs more UX.',
    placeholder: 'Select user type',
    type: 'choice',
    choices: ['Internal team only', 'External customers/clients', 'Both internal and external', 'Not sure yet'],
    required: true,
    complexityTrigger: 'standard',
  },
  {
    id: 'who-accessibility',
    category: 'who',
    question: 'Any accessibility requirements?',
    subtext: 'Legal compliance and inclusivity considerations.',
    placeholder: 'Select all that apply',
    type: 'multichoice',
    choices: ['Screen reader support', 'Keyboard-only navigation', 'Mobile/touch only', 'High contrast', 'None required'],
    required: false,
    complexityTrigger: 'deep',
  },

  // === WHAT ===
  {
    id: 'what-core',
    category: 'what',
    question: 'In ONE sentence, what is the core function?',
    subtext: 'The elevator pitch. If you cannot state this simply, the scope is unclear.',
    placeholder: 'e.g., A multiplayer guessing game where players draw and guess words',
    type: 'text',
    required: true,
    complexityTrigger: 'standard',
  },
  {
    id: 'what-features',
    category: 'what',
    question: 'List the 3-5 most important features',
    subtext: 'What MUST exist for this to be considered "working"?',
    placeholder: 'e.g., Real-time drawing, Chat, Score tracking, Room creation',
    type: 'text',
    required: true,
    complexityTrigger: 'standard',
  },
  {
    id: 'what-outofscope',
    category: 'what',
    question: 'What is explicitly NOT included?',
    subtext: 'Critical for preventing scope creep. Define boundaries.',
    placeholder: 'e.g., No user accounts, No payment processing, No mobile app',
    type: 'text',
    required: false,
    complexityTrigger: 'deep',
  },
  {
    id: 'what-success',
    category: 'what',
    question: 'How will you know this is "done"?',
    subtext: 'Specific, testable success criteria.',
    placeholder: 'e.g., Users can create rooms, draw, guess, and scores update in real-time',
    type: 'text',
    required: true,
    complexityTrigger: 'deep',
  },

  // === WHERE ===
  {
    id: 'where-platform',
    category: 'where',
    question: 'What platform(s)?',
    subtext: 'Web, mobile, desktop — each has different technical requirements.',
    placeholder: 'Select platform',
    type: 'choice',
    choices: ['Web browser', 'Mobile app (iOS/Android)', 'Desktop app (Windows/Mac)', 'Multiple platforms', 'Backend/API only'],
    required: true,
    complexityTrigger: 'standard',
  },
  {
    id: 'where-deployment',
    category: 'where',
    question: 'Where will this be deployed/hosted?',
    subtext: 'Infrastructure choices affect the build.',
    placeholder: 'e.g., Vercel, AWS, Self-hosted, Not sure',
    type: 'choice',
    choices: ['Vercel/Netlify (serverless)', 'AWS/GCP/Azure (cloud)', 'Self-hosted server', 'Static hosting only', 'Not sure yet'],
    required: true,
    complexityTrigger: 'deep',
  },
  {
    id: 'where-integrations',
    category: 'where',
    question: 'Required third-party integrations?',
    subtext: 'Auth, payments, APIs, databases — each adds complexity.',
    placeholder: 'e.g., Google Auth, Stripe, Firebase, OpenAI API',
    type: 'text',
    required: false,
    complexityTrigger: 'deep',
  },
  {
    id: 'where-offline',
    category: 'where',
    question: 'Does it need to work offline?',
    subtext: 'Offline-first requires local storage, sync logic, conflict resolution.',
    placeholder: 'Yes/No',
    type: 'choice',
    choices: ['Yes — full offline support', 'Partial — cache recent data', 'No — always online'],
    required: true,
    complexityTrigger: 'deep',
  },

  // === WHEN ===
  {
    id: 'when-timeline',
    category: 'when',
    question: 'Overall timeline?',
    subtext: 'This affects how much we can polish vs. how lean we build.',
    placeholder: 'Select timeline',
    type: 'choice',
    choices: ['Today (single session)', 'This week', 'This month', 'This quarter', '6+ months'],
    required: true,
    complexityTrigger: 'standard',
  },
  {
    id: 'when-mvp',
    category: 'when',
    question: 'When do you need the MVP (minimum viable product)?',
    subtext: 'What is the absolute soonest this must be demo-able?',
    placeholder: 'e.g., End of this week',
    type: 'text',
    required: true,
    complexityTrigger: 'deep',
  },
  {
    id: 'when-realtime',
    category: 'when',
    question: 'Any real-time or performance requirements?',
    subtext: 'Real-time multiplayer, live updates, high-frequency data.',
    placeholder: 'Select all that apply',
    type: 'multichoice',
    choices: ['Real-time multiplayer/collaboration', 'Live data updates (< 1 second)', 'High-frequency processing', 'Background/async processing OK', 'No special timing needs'],
    required: false,
    complexityTrigger: 'deep',
  },

  // === WHY ===
  {
    id: 'why-problem',
    category: 'why',
    question: 'What specific problem does this solve?',
    subtext: 'The "why" — if the answer is weak, reconsider building this.',
    placeholder: 'e.g., Current tools are too expensive, too slow, or missing X feature',
    type: 'text',
    required: true,
    complexityTrigger: 'standard',
  },
  {
    id: 'why-current',
    category: 'why',
    question: 'What do you use now to solve this?',
    subtext: 'Understanding current workflow reveals integration points.',
    placeholder: 'e.g., Excel spreadsheets, multiple apps, manual process',
    type: 'text',
    required: false,
    complexityTrigger: 'deep',
  },
  {
    id: 'why-different',
    category: 'why',
    question: 'Why is this better than existing solutions?',
    subtext: 'Your differentiator — the reason this should exist.',
    placeholder: 'e.g., 10x faster, 10x cheaper, privacy-focused, simpler UX',
    type: 'text',
    required: true,
    complexityTrigger: 'deep',
  },
  {
    id: 'why-metrics',
    category: 'why',
    question: 'How will you measure success?',
    subtext: 'Quantifiable metrics prevent "feels done" ambiguity.',
    placeholder: 'e.g., 100 daily active users, < 2s load time, zero critical bugs',
    type: 'text',
    required: false,
    complexityTrigger: 'deep',
  },
];

// Get questions for a specific tier
export function getQuestionsForTier(tier: 'standard' | 'deep'): InterviewQuestion[] {
  return EXPANDED_QUESTIONS.filter(q => {
    if (tier === 'deep') return true; // Deep gets all questions
    return q.complexityTrigger === 'standard'; // Standard gets only standard questions
  });
}

// Organize questions by category
export function organizeByCategory(questions: InterviewQuestion[]): Record<string, InterviewQuestion[]> {
  const byCategory: Record<string, InterviewQuestion[]> = {
    who: [],
    what: [],
    where: [],
    when: [],
    why: [],
  };

  for (const q of questions) {
    byCategory[q.category].push(q);
  }

  return byCategory;
}

// Generate a "guard rail" warning for vague requests
export function generateVagueWarning(task: string): string | null {
  const lowerTask = task.toLowerCase();

  // Check for classic vague patterns
  if (/^\s*(build|make|create)\s+(me\s+)?a\s+(game|app|platform|system)\s*$/i.test(task)) {
    return `⚠️ **Too Vague — Cannot Proceed**

"${task}" is like saying "build me a vehicle." That could mean:
- A bicycle (1 day, simple)
- A family car (1 month, moderate)
- A cargo ship (1 year, complex)

**You must specify:**
1. What TYPE of ${lowerTask.includes('game') ? 'game' : 'app'} (puzzle, action, RPG, tool...)
2. For WHO (kids, developers, general public...)
3. Core FEATURES (3 things it MUST do)

Please reply with a more specific request, or type **"help me refine this"** to run the full interview.`;
  }

  // Check for app without specification — skip if task is a modification or mentions a file
  // [FIX] "app.tsx", "fix my app", "update app.ts" must NOT trigger this — only brand-new project requests
  const isModificationTask = /\b(fix|update|change|edit|modify|add|refactor|in|to|the|my)\b/i.test(lowerTask);
  const hasFileMentionInTask = /\b[\w/-]+\.(ts|tsx|js|jsx|py|html|css|scss|json)\b/i.test(task);
  if (/\bapp\b/i.test(task) && !/\b(web|mobile|desktop|for|that|with)\b/i.test(lowerTask) && !isModificationTask && !hasFileMentionInTask) {
    return `⚠️ **"App" Needs Specification**

"App" is extremely broad. Please clarify:
- **Platform:** Web, mobile, desktop?
- **Core function:** What is the ONE thing it does?
- **Users:** Who will use this?

Or type **"run full interview"** to go through the structured questions.`;
  }

  return null;
}

// Compile answers into a BuildBlueprint-compatible format
export function compileInterviewAnswers(answers: Record<string, string | string[]>): {
  who: string;
  what: string;
  where: string;
  when: string;
  why: string;
  expanded: Record<string, string[]>;
} {
  const expanded: Record<string, string[]> = {};

  // Group by category
  for (const [key, value] of Object.entries(answers)) {
    const category = key.split('-')[0];
    if (!expanded[category]) expanded[category] = [];
    
    if (Array.isArray(value)) {
      expanded[category].push(...value);
    } else {
      expanded[category].push(value);
    }
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
