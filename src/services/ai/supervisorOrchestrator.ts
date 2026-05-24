// [SCOPE] Supervisor Orchestrator — multi-AI build pipeline: Plan → Execute → Review
// When 2+ AIs are configured, the Supervisor (highest-ranked) creates a step-by-step plan,
// assigns each step to the best-fit worker AI, dispatches work, and reviews the assembled output.

import { AI_CAPABILITIES } from './guardianAI.js';
import type { AIResponse } from './routingTypes.js';

/** A single step in the supervisor's execution plan */
export interface PlanStep {
  stepNumber: number;
  description: string;
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

  return `You are a senior software architect planning a build task. You will create a step-by-step plan and assign each step to the best-fit AI.

TASK: "${task}"

${context ? `PROJECT CONTEXT:\n${context}\n` : ''}
AVAILABLE AIs AND THEIR STRENGTHS:
${aiDescriptions}

Create a build plan with 1-4 steps (fewer is better). Each step produces code.
For simple tasks (1 file, straightforward), use just 1 step.
For complex tasks (multi-file, architecture decisions), use 2-4 steps.

Respond with ONLY valid JSON, no markdown, no explanation:
[
  { "step": 1, "description": "what to build in this step", "ai": "which_ai_id" }
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
    const clean = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) { throw new Error('Not an array'); }

    return parsed.slice(0, 4).map((item: any, i: number) => {
      const ai = availableAIs.includes(item.ai) ? item.ai : availableAIs[1] || availableAIs[0];
      const cap = AI_CAPABILITIES[ai];
      return {
        stepNumber: i + 1,
        description: String(item.description || 'Build step'),
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
  callAI: (ai: string, prompt: string) => Promise<AIResponse>
): Promise<{ code: string; tokens: number }> {
  const stepPrompt = previousOutput
    ? `You are completing step ${step.stepNumber} of a build plan.\n\nORIGINAL TASK: "${task}"\n\nSTEP: ${step.description}\n\nPREVIOUS OUTPUT:\n${previousOutput}\n\nContinue building. Output ONLY code.`
    : `You are building: "${task}"\n\nSTEP: ${step.description}\n\nOutput ONLY the complete working code.`;

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
