// [SCOPE] Blueprint interview questions — InterviewQuestion interface and QUESTIONS constant
// Used by blueprintService for the 5-question blueprint interview.

import type { Blueprint } from '../../types/index.js';

export interface InterviewQuestion {
  key: keyof Pick<Blueprint, 'who' | 'what' | 'where' | 'when' | 'why'>;
  preamble: string;
  prompt: string;
  placeholder: string;
}

export const QUESTIONS: InterviewQuestion[] = [
  {
    key: 'who',
    preamble: 'This shapes every decision about complexity, UI, and assumptions.',
    prompt: 'WHO is going to use this? Picture the person — their skill level, their context.',
    placeholder: 'e.g., Non-technical users who want to sell stuff locally without an account',
  },
  {
    key: 'what',
    preamble: 'Not the dream feature list — the minimum thing that makes this useful.',
    prompt: 'WHAT does it need to do? One sentence that describes success.',
    placeholder: 'e.g., Let users post and find local listings anonymously via P2P',
  },
  {
    key: 'where',
    preamble: 'This determines the entire tech stack and deployment model.',
    prompt: 'WHERE does this live and run? Web? Mobile? Desktop? Local? Cloud?',
    placeholder: 'e.g., React Native mobile app, Firebase backend, Android first',
  },
  {
    key: 'when',
    preamble: 'Not just timeline — also: real-time? Batch? On-demand? This shapes architecture.',
    prompt: 'WHEN does this need to work? Timeline and responsiveness requirements.',
    placeholder: 'e.g., MVP in 2 months, real-time P2P messaging, 24hr listing lifetime',
  },
  {
    key: 'why',
    preamble: 'The gut check. If the answer is weak, we should know before writing code.',
    prompt: 'WHY does this need to exist? What problem isn\'t already solved?',
    placeholder: 'e.g., No marketplace lets you sell locally without creating a tracked account',
  },
];
