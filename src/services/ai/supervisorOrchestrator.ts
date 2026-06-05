// [SCOPE] Supervisor Orchestrator — multi-AI build pipeline: Plan → Execute → Review
// When 2+ AIs are configured, the Supervisor (highest-ranked) creates a step-by-step plan,
// assigns each step to the best-fit worker AI, dispatches work, and reviews the assembled output.

import { AI_CAPABILITIES } from './guardianAI.js';
import type { AIResponse } from './routingTypes.js';
import { getWorkerRules } from '../api/apiClientKnowledge.js';

/** A single step in the supervisor's execution plan */
export interface PlanStep {
  stepNumber: number;
  description: string;
  spec?: string;          // Exact prescription: file + functions + signatures — Worker reads this directly
  assignedAI: string;     // AI id (e.g., 'gemini', 'claude')
  assignedLabel: string;  // Human label (e.g., 'Gemini')
  type: 'code' | 'review' | 'structure';
}

export interface OrchestratedResult {
  finalCode: string;
  plan: PlanStep[];
  reviewPassed: boolean;
  reviewNotes: string;
  totalTokensEstimate: number;
}

/** Progress callback for UI updates */
export type ProgressCallback = (phase: string, detail: string) => void;

// [WARN] The plan prompt must return strict JSON. Any deviation and parsing fails.
function buildPlanPrompt(task: string, availableAIs: string[], context: string): string {
  const aiDescriptions = availableAIs
    .filter(ai => AI_CAPABILITIES[ai])
    .map(ai => {
      const cap = AI_CAPABILITIES[ai];
      return `  "${ai}": "${cap.bestFor}"`;
    })
    .join('\n');

  return `You are the shop foreman. You size the job before anyone picks up a wrench. Direct, warm, efficient -- you've seen every kind of job.
- No jargon with the user. You have opinions and share them. If the request doesn't match the goal, say so first.
- Assign work to the right AI for each step. Fewer steps is better.

You are a senior software architect planning a build task. Create a step-by-step plan and assign each step to the best-fit AI.

TASK: "${task}"

${context ? `PROJECT CONTEXT:\n${context}\n` : ''}
AVAILABLE AIs AND THEIR STRENGTHS:
${aiDescriptions}

PROJECT RULES (MUST COMPLY):
${getWorkerRules()}

Create a build plan with 1-4 steps (fewer is better). Each step produces code.
For simple tasks (1 file, straightforward), use just 1 step.
For complex tasks (multi-file, architecture decisions), use 2-4 steps.
Ensure you follow all PROJECT RULES, especially architecture constraints for games.

For each step, "spec" must be a precise prescription the Worker can follow without guessing:
- Include the exact filename
- Name every function, class, or variable to implement
- For changes: quote exact old → new code
- Specify key constants, types, and behaviors

Respond with ONLY valid JSON, no markdown, no explanation:
[
  { "step": 1, "description": "short label shown in UI", "spec": "File: src/game.ts — export function startGame(): void — calls requestAnimationFrame at 60fps — CANVAS_WIDTH=800 CANVAS_HEIGHT=600", "ai": "which_ai_id" }
]`;
}

/** Ask the Supervisor AI to create a build plan */
export async function createPlan(
  task: string,
  availableAIs: string[],
  context: string,
  callAI: (ai: string, prompt: string) => Promise<AIResponse>
): Promise<PlanStep[]> {
  if (availableAIs.length === 0) { return []; }

  // [WARN] If only 1 AI available, skip planning — just assign everything to it
  if (availableAIs.length === 1) {
    const ai = availableAIs[0];
    const cap = AI_CAPABILITIES[ai];
    return [{
      stepNumber: 1,
      description: task,
      assignedAI: ai,
      assignedLabel: cap?.label || ai,
      type: 'code',
    }];
  }

  const supervisor = availableAIs[0]; // highest-ranked = supervisor
  const prompt = buildPlanPrompt(task, availableAIs, context);
  const res = await callAI(supervisor, prompt);

  if (!res.success || !res.text) {
    // Fallback: supervisor failed to plan, assign everything to best worker
    const worker = availableAIs[1] || availableAIs[0];
    const cap = AI_CAPABILITIES[worker];
    return [{ stepNumber: 1, description: task, assignedAI: worker, assignedLabel: cap?.label || worker, type: 'code' }];
  }

  return parsePlan(res.text, availableAIs);
}

/** Parse JSON plan from AI response */
function parsePlan(text: string, availableAIs: string[]): PlanStep[] {
  try {
    // Strip markdown fences if present
    let clean = text.trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) { clean = match[0]; }
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) { throw new Error('Not an array'); }

    return parsed.slice(0, 4).map((item: any, i: number) => {
      const ai = availableAIs.includes(item.ai) ? item.ai : availableAIs[1] || availableAIs[0];
      const cap = AI_CAPABILITIES[ai];
      return {
        stepNumber: i + 1,
        description: String(item.description || 'Build step'),
        spec: item.spec ? String(item.spec) : undefined,
        assignedAI: ai,
        assignedLabel: cap?.label || ai,
        type: 'code' as const,
      };
    });
  } catch {
    // Parse failed — single step to best worker
    const worker = availableAIs[1] || availableAIs[0];
    const cap = AI_CAPABILITIES[worker];
    return [{ stepNumber: 1, description: 'Build the requested feature', assignedAI: worker, assignedLabel: cap?.label || worker, type: 'code' }];
  }
}

/** Execute a single plan step — sends the step prompt to the assigned AI */
export async function executeStep(
  step: PlanStep,
  task: string,
  previousOutput: string,
  callAI: (ai: string, prompt: string) => Promise<AIResponse>,
  allSteps?: PlanStep[]
): Promise<{ code: string; tokens: number }> {
  const spec = step.spec || step.description;
  const planBlock = allSteps && allSteps.length > 1
    ? `\nFULL BUILD PLAN (all steps — know what each Worker is responsible for):\n` +
      allSteps.map(s => {
        const status = s.stepNumber < step.stepNumber ? '[DONE]' : s.stepNumber === step.stepNumber ? '[YOUR STEP]' : '[PENDING]';
        return `  Step ${s.stepNumber} ${status}: ${s.spec || s.description}`;
      }).join('\n') + '\n'
    : '';
  const workerPersona = `You are the mechanic. You turn wrenches. You do not talk to the customer.\nYour output goes to the Guardian, who translates it.\nWrite clean code. Leave clear comments. That's your communication.\nWhen you're unsure: flag it with [WARN] in a comment so the Guardian sees it. Do not guess silently.\n\nPROJECT RULES (MUST COMPLY):\n${getWorkerRules()}\n\n`;
  const stepPrompt = previousOutput
    ? `${workerPersona}You are completing step ${step.stepNumber} of a build plan.\n\nORIGINAL TASK: "${task}"\n${planBlock}\nPRESCRIPTION FOR YOUR STEP:\n${spec}\n\nPREVIOUS OUTPUT (from prior steps):\n${previousOutput}\n\nImplement YOUR STEP exactly. Match interfaces/names from previous output. Output ONLY code.`
    : `${workerPersona}You are building: "${task}"\n${planBlock}\nPRESCRIPTION:\n${spec}\n\nImplement exactly as prescribed. Output ONLY the complete working code.`;

  const res = await callAI(step.assignedAI, stepPrompt);
  if (!res.success) { return { code: '', tokens: 0 }; }
  const tokens = Math.ceil((res.text || '').length / 4);
  return { code: res.text || '', tokens };
}

/** Supervisor reviews the assembled output */
export async function reviewOutput(
  task: string,
  assembledCode: string,
  supervisorAI: string,
  callAI: (ai: string, prompt: string) => Promise<AIResponse>
): Promise<{ passed: boolean; corrected: string; notes: string }> {
  const prompt = `You are a senior engineer reviewing assembled code.\n\nORIGINAL TASK: "${task}"\n\nCODE:\n${assembledCode}\n\nDoes this code work correctly and completely fulfill the task?\n- If YES: respond with EXACTLY "REVIEW_PASS"\n- If NO: respond with "REVIEW_FIX:" followed by the complete corrected code`;

  const res = await callAI(supervisorAI, prompt);
  if (!res.success || !res.text) { return { passed: true, corrected: assembledCode, notes: '' }; }

  const text = res.text.trim();
  if (text.startsWith('REVIEW_PASS')) {
    return { passed: true, corrected: assembledCode, notes: 'Supervisor approved' };
  }
  const fixMatch = text.match(/REVIEW_FIX:\s*([\s\S]*)/);
  if (fixMatch) {
    return { passed: false, corrected: fixMatch[1].trim(), notes: 'Supervisor corrected output' };
  }
  return { passed: true, corrected: assembledCode, notes: '' };
}
