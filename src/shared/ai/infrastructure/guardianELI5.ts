// [SCOPE] Guardian ELI5 translation — converts technical work-log entries to plain English for non-technical guardians
// Called by guardianService. No risk scanning or health score logic here.

import type { ELI5Entry } from './guardianTypes.js';

export function translateToELI5(technical: string, sessionId: string): ELI5Entry {
  // Dictionary of common technical terms → plain English
  const translations: Record<string, string> = {
    'OAuth callback': 'the part that lets you log in with Google or Facebook',
    'refactor': 'reorganized the code so it is cleaner and easier to fix later',
    'unit test': 'added a small check to make sure a feature works correctly',
    'dependency injection': 'made the code more flexible so parts can be swapped out easily',
    'WebSocket': 'set up real-time messaging so the screen updates instantly',
    'API endpoint': 'created a new web address the app can talk to',
    'middleware': 'added a helper that checks things before a request is handled',
    'database migration': 'updated the data storage layout safely',
    'CI/CD': 'set up automatic testing so bugs get caught before going live',
  };

  let plainEnglish = technical;
  for (const [term, translation] of Object.entries(translations)) {
    if (plainEnglish.toLowerCase().includes(term.toLowerCase())) {
      plainEnglish = plainEnglish.replace(new RegExp(term, 'gi'), translation);
    }
  }

  // Fallback generic simplification
  if (plainEnglish === technical) {
    plainEnglish = `Made a technical improvement: ${technical}. In plain terms, this helps the app work more reliably.`;
  }

  return {
    technical,
    plainEnglish,
    timestamp: new Date().toISOString(),
    sessionId,
  };
}
