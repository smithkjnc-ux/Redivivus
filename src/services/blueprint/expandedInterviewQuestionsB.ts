// [SCOPE] Expanded Interview Questions B — WHEN and WHY categories
// Combined with expandedInterviewQuestionsA.ts by expandedInterviewQuestions.ts

import type { InterviewQuestion } from './expandedInterview.js';

export const EXPANDED_QUESTIONS_B: InterviewQuestion[] = [
  // === WHEN ===
  { id: 'when-timeline', category: 'when', question: 'Overall timeline?', subtext: 'This affects how much we can polish vs. how lean we build.', placeholder: 'Select timeline', type: 'choice', choices: ['Today (single session)', 'This week', 'This month', 'This quarter', '6+ months'], required: true, complexityTrigger: 'standard' },
  { id: 'when-mvp', category: 'when', question: 'When do you need the MVP (minimum viable product)?', subtext: 'What is the absolute soonest this must be demo-able?', placeholder: 'e.g., End of this week', type: 'text', required: true, complexityTrigger: 'deep' },
  { id: 'when-realtime', category: 'when', question: 'Any real-time or performance requirements?', subtext: 'Real-time multiplayer, live updates, high-frequency data.', placeholder: 'Select all that apply', type: 'multichoice', choices: ['Real-time multiplayer/collaboration', 'Live data updates (< 1 second)', 'High-frequency processing', 'Background/async processing OK', 'No special timing needs'], required: false, complexityTrigger: 'deep' },

  // === WHY ===
  { id: 'why-problem', category: 'why', question: 'What specific problem does this solve?', subtext: 'The "why" -- if the answer is weak, reconsider building this.', placeholder: 'e.g., Current tools are too expensive, too slow, or missing X feature', type: 'text', required: true, complexityTrigger: 'standard' },
  { id: 'why-current', category: 'why', question: 'What do you use now to solve this?', subtext: 'Understanding current workflow reveals integration points.', placeholder: 'e.g., Excel spreadsheets, multiple apps, manual process', type: 'text', required: false, complexityTrigger: 'deep' },
  { id: 'why-different', category: 'why', question: 'Why is this better than existing solutions?', subtext: 'Your differentiator -- the reason this should exist.', placeholder: 'e.g., 10x faster, 10x cheaper, privacy-focused, simpler UX', type: 'text', required: true, complexityTrigger: 'deep' },
  { id: 'why-metrics', category: 'why', question: 'How will you measure success?', subtext: 'Quantifiable metrics prevent "feels done" ambiguity.', placeholder: 'e.g., 100 daily active users, < 2s load time, zero critical bugs', type: 'text', required: false, complexityTrigger: 'deep' },
];
