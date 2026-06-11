// [SCOPE] Supervisor Orchestrator — multi-AI build pipeline: Plan → Execute → Review
// When 2+ AIs are configured, the Supervisor (highest-ranked) creates a step-by-step plan,
// assigns each step to the best-fit worker AI, dispatches work, and reviews the assembled output.

import { AI_CAPABILITIES } from './guardianAI.js';
import type { AIResponse } from './routingTypes.js';
import { getWorkerRules } from '../api/apiClientKnowledge.js';
import { log } from '../logging/redivivusLogger.js';
import { buildCapabilityProfiles, buildPlanPrompt, parsePlan } from './supervisorPlanner.js';

export interface PlanStep {
  stepNumber: number;
  description: string;
  filesToCreate?: string[];
  dependencies?: string[];
  exactInstructions?: string;
  spec?: string;          // Backwards compatibility
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
  // Constraint-aware profiles (capability, output budget, context, cost) drive assignment + strategy.
  const profiles = buildCapabilityProfiles(availableAIs);
  const prompt = buildPlanPrompt(task, profiles, context);
  const res = await callAI(supervisor, prompt);

  if (!res.success || !res.text) {
    // Fallback: supervisor failed to plan, assign everything to best worker
    const worker = availableAIs[1] || availableAIs[0];
    const cap = AI_CAPABILITIES[worker];
    return [{ stepNumber: 1, description: task, assignedAI: worker, assignedLabel: cap?.label || worker, type: 'code' }];
  }

  return parsePlan(res.text, profiles);
}

/** Execute a single plan step — sends the step prompt to the assigned AI */
export async function executeStep(
  step: PlanStep,
  task: string,
  previousOutput: string,
  callAI: (ai: string, prompt: string) => Promise<AIResponse>,
  allSteps?: PlanStep[]
): Promise<{ code: string; tokens: number }> {
  // Reconstruct a strict text contract for the Worker
  let specText = '';
  if (step.filesToCreate || step.dependencies || step.exactInstructions) {
    specText += step.filesToCreate ? `FILES TO CREATE:\n${step.filesToCreate.map(f => `- ${f}`).join('\n')}\n\n` : '';
    specText += step.dependencies ? `DEPENDENCIES:\n${step.dependencies.map(d => `- ${d}`).join('\n')}\n\n` : '';
    specText += step.exactInstructions ? `INSTRUCTIONS:\n${step.exactInstructions}` : '';
  } else {
    specText = step.spec || step.description;
  }

  const planBlock = allSteps && allSteps.length > 1
    ? `\nFULL BUILD PLAN (all steps — know what each Worker is responsible for):\n` +
      allSteps.map(s => {
        const status = s.stepNumber < step.stepNumber ? '[DONE]' : s.stepNumber === step.stepNumber ? '[YOUR STEP]' : '[PENDING]';
        const stepSpec = s.filesToCreate ? `Create ${s.filesToCreate.join(', ')}` : (s.spec || s.description);
        return `  Step ${s.stepNumber} ${status}: ${stepSpec}`;
      }).join('\n') + '\n'
    : '';
  const workerPersona = `You are the mechanic. You turn wrenches. You do not talk to the customer.\nYour output goes to the Guardian, who translates it.\nWrite clean code. Leave clear comments. That's your communication.\nWhen you're unsure: flag it with [WARN] in a comment so the Guardian sees it. Do not guess silently.\n\nPROJECT RULES (MUST COMPLY):\n${getWorkerRules()}\n\n`;
  const stepPrompt = previousOutput
    ? `${workerPersona}You are completing step ${step.stepNumber} of a build plan.\n\nORIGINAL TASK: "${task}"\n${planBlock}\nSTRICT CONTRACT FOR YOUR STEP:\n${specText}\n\nPREVIOUS OUTPUT (from prior steps):\n${previousOutput}\n\nImplement YOUR STEP exactly. Match interfaces/names from previous output. Implement the FULL logic. DO NOT use placeholders or leave functions empty. Output ONLY the complete working code.`
    : `${workerPersona}You are building: "${task}"\n${planBlock}\nSTRICT CONTRACT:\n${specText}\n\nImplement exactly as prescribed. Implement the FULL logic. DO NOT use placeholders or leave functions empty. Output ONLY the complete working code.`;

  log('debug', 'services', 'supervisorOrchestrator', 'executeStep', `Worker Prompt for Step ${step.stepNumber}`, {
    ai: step.assignedAI,
    contract: specText,
    fullPrompt: stepPrompt
  });

  const res = await callAI(step.assignedAI, stepPrompt);
  
  log('debug', 'services', 'supervisorOrchestrator', 'executeStep', `Worker Output for Step ${step.stepNumber}`, {
    success: res.success,
    tokens: Math.ceil((res.text || '').length / 4),
    fullResponse: res.text
  });

  if (!res.success) { return { code: '', tokens: 0 }; }
  const tokens = Math.ceil((res.text || '').length / 4);
  return { code: res.text || '', tokens };
}

/** Supervisor reviews the assembled output */
export async function reviewOutput(
  task: string,
  assembledCode: string,
  supervisorAI: string,
  callAI: (ai: string, prompt: string) => Promise<AIResponse>,
  planContext?: string
): Promise<{ passed: boolean; corrected: string; notes: string }> {
  const prompt = `You are a Senior Architect/Guardian reviewing assembled code from a junior worker.

ORIGINAL TASK: "${task}"
${planContext ? `\nSTRICT BUILD PLAN (CONTRACT):\n${planContext}\n` : ''}
CODE FROM WORKER:
${assembledCode}

Did the worker strictly follow the exact instructions? Did they create the specified files and link the correct dependencies? Does this code work correctly and completely fulfill the task?
- If YES: respond with EXACTLY "REVIEW_PASS"
- If NO: respond with "REVIEW_FIX:" followed by the complete corrected code. Do NOT output markdown fences if rewriting code.`;

  log('debug', 'services', 'supervisorOrchestrator', 'reviewOutput', 'Guardian Review Prompt', { fullPrompt: prompt });

  const res = await callAI(supervisorAI, prompt);
  
  log('debug', 'services', 'supervisorOrchestrator', 'reviewOutput', 'Guardian Review Outcome', {
    success: res.success,
    fullResponse: res.text
  });

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
