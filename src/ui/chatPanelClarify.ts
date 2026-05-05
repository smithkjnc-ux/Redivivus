// [SCOPE] CHASSIS Build Clarification — AI generates context questions before multi-file builds
// Flow: task + blueprint → AI returns 3-5 questions → shown as form → answers injected into build prompts

import { RoutingService } from '../services/routingService.js';

export interface ClarifyOption {
  label: string;
}

export interface ClarifyQuestion {
  id: string;
  question: string;
  options: ClarifyOption[];
}

/** Ask AI to generate 3-5 clarifying questions for the build task */
export async function generateClarifyQuestions(
  task: string,
  blueprintContext: string,
  routing: RoutingService,
): Promise<ClarifyQuestion[]> {
  const prompt = `You are CHASSIS. A user wants to build: "${task}"
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}
Before building, generate 3-5 SHORT clarifying questions that would most affect how the code is written.
Each question needs 2-3 concrete option choices — not open-ended.
Focus on: input method, data storage, initial config, key behaviour, output format.

Return ONLY a valid JSON array — no markdown, no explanation:
[
  {
    "id": "q1",
    "question": "How should data be entered?",
    "options": [
      {"label": "Type commands (e.g. add 50 food lunch)"},
      {"label": "Interactive menu with prompts"}
    ]
  }
]`;

  try {
    const res = await routing.prompt(prompt);
    if (!res.success) { return []; }
    let raw = res.text.trim().replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (arrMatch) { raw = arrMatch[0]; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) { return []; }
    return parsed as ClarifyQuestion[];
  } catch {
    return [];
  }
}

/** Encode questions as a __CLARIFY__ token for the conversation renderer */
export function encodeClarifyToken(questions: ClarifyQuestion[]): string {
  return `__CLARIFY__${JSON.stringify(questions)}__END_CLARIFY__`;
}

/** Format answers map as a block to inject into build prompts */
export function formatAnswersForPrompt(answers: Record<string, string>): string {
  if (Object.keys(answers).length === 0) { return ''; }
  const lines = Object.entries(answers).map(([q, a]) => `- ${q}: ${a}`);
  return `USER REQUIREMENTS (chosen before building — implement these exactly):\n${lines.join('\n')}`;
}
