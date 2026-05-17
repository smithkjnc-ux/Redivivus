// [SCOPE] Expanded Interview Questions A — WHO and WHAT categories
// Combined with expandedInterviewQuestionsB.ts by expandedInterviewQuestions.ts

import type { InterviewQuestion } from './expandedInterview.js';

export const EXPANDED_QUESTIONS_A: InterviewQuestion[] = [
  // === WHO ===
  { id: 'who-skill', category: 'who', question: 'What is the technical skill level of your users?', subtext: 'This affects UI complexity, feature exposure, and documentation needs.', placeholder: 'e.g., Developers, Intermediate, Beginners, Mixed', type: 'choice', choices: ['Technical/Developers', 'Intermediate (some tech knowledge)', 'Beginners (minimal tech knowledge)', 'Mixed audience'], required: true, complexityTrigger: 'standard' },
  { id: 'who-count', category: 'who', question: 'How many concurrent users do you expect?', subtext: 'This determines architecture choices (single-user vs. multiplayer vs. mass-scale).', placeholder: 'e.g., Just me, 10, 1000, 100000+', type: 'choice', choices: ['Just me (personal use)', 'Small team (2-10)', 'Medium scale (10-1000)', 'Large scale (1000-100000)', 'Mass scale (100000+)'], required: true, complexityTrigger: 'deep' },
  { id: 'who-type', category: 'who', question: 'Are these internal users or public customers?', subtext: 'Internal tools can skip polish; customer-facing needs more UX.', placeholder: 'Select user type', type: 'choice', choices: ['Internal team only', 'External customers/clients', 'Both internal and external', 'Not sure yet'], required: true, complexityTrigger: 'standard' },
  { id: 'who-accessibility', category: 'who', question: 'Any accessibility requirements?', subtext: 'Legal compliance and inclusivity considerations.', placeholder: 'Select all that apply', type: 'multichoice', choices: ['Screen reader support', 'Keyboard-only navigation', 'Mobile/touch only', 'High contrast', 'None required'], required: false, complexityTrigger: 'deep' },

  // === WHAT ===
  { id: 'what-core', category: 'what', question: 'In ONE sentence, what is the core function?', subtext: 'The elevator pitch. If you cannot state this simply, the scope is unclear.', placeholder: 'e.g., A multiplayer guessing game where players draw and guess words', type: 'text', required: true, complexityTrigger: 'standard' },
  { id: 'what-features', category: 'what', question: 'List the 3-5 most important features', subtext: 'What MUST exist for this to be considered "working"?', placeholder: 'e.g., Real-time drawing, Chat, Score tracking, Room creation', type: 'text', required: true, complexityTrigger: 'standard' },
  { id: 'what-outofscope', category: 'what', question: 'What is explicitly NOT included?', subtext: 'Critical for preventing scope creep. Define boundaries.', placeholder: 'e.g., No user accounts, No payment processing, No mobile app', type: 'text', required: false, complexityTrigger: 'deep' },
  { id: 'what-success', category: 'what', question: 'How will you know this is "done"?', subtext: 'Specific, testable success criteria.', placeholder: 'e.g., Users can create rooms, draw, guess, and scores update in real-time', type: 'text', required: true, complexityTrigger: 'deep' },

  // === WHERE ===
  { id: 'where-platform', category: 'where', question: 'What platform(s)?', subtext: 'Web, mobile, desktop -- each has different technical requirements.', placeholder: 'Select platform', type: 'choice', choices: ['Web browser', 'Mobile app (iOS/Android)', 'Desktop app (Windows/Mac)', 'Multiple platforms', 'Backend/API only'], required: true, complexityTrigger: 'standard' },
  { id: 'where-deployment', category: 'where', question: 'Where will this be deployed/hosted?', subtext: 'Infrastructure choices affect the build.', placeholder: 'e.g., Vercel, AWS, Self-hosted, Not sure', type: 'choice', choices: ['Vercel/Netlify (serverless)', 'AWS/GCP/Azure (cloud)', 'Self-hosted server', 'Static hosting only', 'Not sure yet'], required: true, complexityTrigger: 'deep' },
  { id: 'where-integrations', category: 'where', question: 'Required third-party integrations?', subtext: 'Auth, payments, APIs, databases -- each adds complexity.', placeholder: 'e.g., Google Auth, Stripe, Firebase, OpenAI API', type: 'text', required: false, complexityTrigger: 'deep' },
  { id: 'where-offline', category: 'where', question: 'Does it need to work offline?', subtext: 'Offline-first requires local storage, sync logic, conflict resolution.', placeholder: 'Yes/No', type: 'choice', choices: ['Yes -- full offline support', 'Partial -- cache recent data', 'No -- always online'], required: true, complexityTrigger: 'deep' },
];
