// [SCOPE] Expanded 5W Interview Question Bank — assembles WHO+WHAT+WHERE (A) and WHEN+WHY (B)
// WHO+WHAT+WHERE -> expandedInterviewQuestionsA.ts
// WHEN+WHY -> expandedInterviewQuestionsB.ts

import { InterviewQuestion } from './expandedInterview.js';
import { EXPANDED_QUESTIONS_A } from './expandedInterviewQuestionsA.js';
import { EXPANDED_QUESTIONS_B } from './expandedInterviewQuestionsB.js';

export const EXPANDED_QUESTIONS: InterviewQuestion[] = [
  ...EXPANDED_QUESTIONS_A,
  ...EXPANDED_QUESTIONS_B,
];
