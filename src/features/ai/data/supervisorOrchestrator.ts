// [SCOPE] Supervisor Orchestrator — multi-AI build pipeline: Plan → Execute
// Supervisor (highest-ranked AI) creates a step-by-step plan, assigns each step to the best-fit
// worker AI, and dispatches work sequentially. Guardian review lives in supervisorLayerReview.ts.
// [DONE] 2026-06-26: Fix 1 — single-AI bypass removed; single AI now plans its own serialized steps.
// [DONE] 2026-06-26: Fix 3+4 — executeStep caps previousOutput to worker context window + injects blueprint.
// [DEAD] reviewOutput removed — replaced by reviewLayer + reviewIntegration in supervisorLayerReview.ts.

import { AI_CAPABILITIES } from './guardianAI.js';
import type { AIResponse } from './routingTypes.js';
import { getWorkerRules } from '../../../features/api/data/apiClientKnowledge.js';
import { log } from '../../../features/logging/data/redivivusLogger.js';
import { buildCapabilityProfiles, buildPlanPrompt, parsePlan, type WorkerProfile } from './supervisorPlanner.js';

export interface PlanStep {
  stepNumber: number;
  description: string;
  filesToCreate?: string[];
  dependencies?: string[];
  exactInstructions?: string;
  spec?: string;         // Backwards compatibility
  assignedAI: string;
  assignedLabel: string;
  type: 'code' | 'review' | 'structure';
}

export interface OrchestratedResult {
  finalCode: string;
  plan: PlanStep[];
  reviewPassed: boolean;
  reviewNotes: string;
  totalTokensEstimate: number;
  // [DEGRADED] True when shipped WITHOUT independent Guardian review (single-provider config).
  degraded?: boolean;
}

export type ProgressCallback = (phase: string, detail: string) => void;

/** Ask the Supervisor AI to create a build plan */
export async function createPlan(
  task: string,
  availableAIs: string[],
  context: string,
  callAI: (ai: string, prompt: string) => Promise<AIResponse>
): Promise<PlanStep[]> {
  if (availableAIs.length === 0) { return []; }

  // [DONE] Fix 1: Single AI now plans its own serialized work — no more single-step dump.
  // Groq (8K output) planning 3-8 small steps is far more reliable than one prompt with a
  // non-trivial project that silently truncates at token limit.
  if (availableAIs.length === 1) {
    const ai = availableAIs[0];
    const profiles = buildCapabilityProfiles([ai]);
    const prompt = buildPlanPrompt(task, profiles, context);
    const res = await callAI(ai, prompt);
    if (!res.success || !res.text) {
      // Planning call itself failed — last-resort single step fallback only.
      const cap = AI_CAPABILITIES[ai];
      return [{ stepNumber: 1, description: task, assignedAI: ai, assignedLabel: cap?.label || ai, type: 'code' }];
    }
    return parsePlan(res.text, profiles);
  }

  const supervisor = availableAIs[0]; // highest-ranked = supervisor
  const profiles = buildCapabilityProfiles(availableAIs);
  const prompt = buildPlanPrompt(task, profiles, context);
  const res = await callAI(supervisor, prompt);

  if (!res.success || !res.text) {
    // Supervisor failed to plan — assign everything to best worker as fallback.
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
  allSteps?: PlanStep[],
  profiles?: WorkerProfile[],    // Fix 3: caps previousOutput to the worker's context window
  blueprintContext?: string,      // Fix 4: injected into every step — Worker never loses the spec
): Promise<{ code: string; tokens: number; failed?: boolean; error?: string }> {
  let specText = '';
  if (step.filesToCreate || step.dependencies || step.exactInstructions) {
    specText += step.filesToCreate ? `FILES TO CREATE:\n${step.filesToCreate.map(f => `- ${f}`).join('\n')}\n\n` : '';
    specText += step.dependencies ? `DEPENDENCIES:\n${step.dependencies.map(d => `- ${d}`).join('\n')}\n\n` : '';
    specText += step.exactInstructions ? `INSTRUCTIONS:\n${step.exactInstructions}` : '';
  } else {
    specText = step.spec || step.description;
  }

  // [FIX 3] Cap previousOutput to the worker's context window to prevent overflow.
  // Reserve ~12K tokens for prompt + new output; remainder is available for prior layers.
  const contextK = profiles?.find(p => p.ai === step.assignedAI)?.contextK ?? 32;
  const maxPrevChars = Math.max(2000, (contextK - 12) * 750);
  const safePrevious = previousOutput.length > maxPrevChars
    ? `[earlier layers summarized — blueprint has the full spec]\n\n${previousOutput.slice(-maxPrevChars)}`
    : previousOutput;

  // [FIX 4] Blueprint anchor — every step gets the project spec so context resets are harmless.
  const blueprintBlock = blueprintContext
    ? `\nBLUEPRINT (your source of truth — read before writing anything):\n${blueprintContext}\n`
    : '';

  const planBlock = allSteps && allSteps.length > 1
    ? `\nFULL BUILD PLAN (all steps — know what each Worker is responsible for):\n` +
      allSteps.map(s => {
        const status = s.stepNumber < step.stepNumber ? '[DONE]' : s.stepNumber === step.stepNumber ? '[YOUR STEP]' : '[PENDING]';
        const stepSpec = s.filesToCreate ? `Create ${s.filesToCreate.join(', ')}` : (s.spec || s.description);
        return `  Step ${s.stepNumber} ${status}: ${stepSpec}`;
      }).join('\n') + '\n'
    : '';
  const workerPersona = `You are the mechanic. You turn wrenches. You do not talk to the customer.\nYour output goes to the Guardian, who translates it.\nWrite clean code. Leave clear comments. That's your communication.\nWhen you're unsure: flag it with [WARN] in a comment so the Guardian sees it. Do not guess silently.\n\nPROJECT RULES (MUST COMPLY):\n${getWorkerRules()}\n\n`;
  const stepPrompt = safePrevious
    ? `${workerPersona}You are completing step ${step.stepNumber} of a build plan.\n\nORIGINAL TASK: "${task}"\n${blueprintBlock}${planBlock}\nSTRICT CONTRACT FOR YOUR STEP:\n${specText}\n\nPREVIOUS LAYERS (Guardian-approved):\n${safePrevious}\n\nImplement YOUR STEP exactly. Match interfaces/names from previous output. Implement the FULL logic. DO NOT use placeholders or leave functions empty. Output ONLY the complete working code.`
    : `${workerPersona}You are building: "${task}"\n${blueprintBlock}${planBlock}\nSTRICT CONTRACT:\n${specText}\n\nImplement exactly as prescribed. Implement the FULL logic. DO NOT use placeholders or leave functions empty. Output ONLY the complete working code.`;

  log('debug', 'services', 'supervisorOrchestrator', 'executeStep', `Worker Prompt for Step ${step.stepNumber}`, {
    ai: step.assignedAI, contract: specText, contextCap: maxPrevChars, fullPrompt: stepPrompt
  });

  const res = await callAI(step.assignedAI, stepPrompt);

  log('debug', 'services', 'supervisorOrchestrator', 'executeStep', `Worker Output for Step ${step.stepNumber}`, {
    success: res.success, tokens: Math.ceil((res.text || '').length / 4), fullResponse: res.text
  });

  // [M1] Signal failure explicitly — a silently dropped step leaves the build incomplete with no trace.
  if (!res.success) { return { code: '', tokens: 0, failed: true, error: res.error || 'worker produced no output' }; }
  const tokens = Math.ceil((res.text || '').length / 4);
  return { code: res.text || '', tokens };
}
