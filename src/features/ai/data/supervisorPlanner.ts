// [SCOPE] Supervisor plan builder — capability/cost/constraint-aware planning prompt + plan parsing.
// Split from supervisorOrchestrator.ts (Rule 9). The Supervisor is given each worker's REAL specs
// (capability, output budget, context, cost) and a ceiling-aware BUILD STRATEGY so weak/free-only
// rosters still produce buildable plans (more, smaller, over-specified steps) instead of failing.

import { AI_CAPABILITIES } from './guardianAI.js';
import { modelsForProvider } from './modelRegistry.js';
import { getWorkerRules } from '../../../features/api/data/apiClientKnowledge.js';
import { log } from '../../../features/logging/data/redivivusLogger.js';
import { isProviderConstrained, FREE_TIER_MODEL } from './providerTierState.js';
import type { PlanStep } from './supervisorOrchestrator.js';

// Real specs for each available worker — drives constraint-aware assignment and the strategy block.
export interface WorkerProfile {
  ai: string; label: string; capability: number; outputK: number; contextK: number; costTier: number;
}

// Pick the provider's representative model. If quota errors flagged this provider as constrained
// (e.g. Gemini free tier), use its free-tier model's specs instead of its top model — so the plan
// matches the ceiling the user can actually reach, not the one the registry advertises.
function representativeModel(ai: string) {
  const all = modelsForProvider(ai);
  if (isProviderConstrained(ai)) {
    const freeModel = all.find(m => m.modelId === FREE_TIER_MODEL[ai]);
    if (freeModel) { return freeModel; }
  }
  return all[0];
}

export function buildCapabilityProfiles(availableAIs: string[]): WorkerProfile[] {
  return availableAIs.map(ai => {
    const best = representativeModel(ai); // top model, or free-tier model if quota-constrained
    const cap = AI_CAPABILITIES[ai];
    return {
      ai,
      label: cap?.label || ai,
      capability: best?.capability ?? cap?.rank ?? 5,
      outputK: best?.outputK ?? 8,
      contextK: best?.contextK ?? 32,
      costTier: best?.costTier ?? 5,
    };
  });
}

// Ceiling-aware strategy: the plan adapts to the STRONGEST available worker so a free-only roster
// still builds successfully — by decomposing more and choosing simpler, natively-runnable stacks.
// Bands match the real spread of provider-best models: Claude/OpenAI 10, Gemini 9, xAI/DeepSeek 8,
// Groq/Kimi 6. So "careful" (<8) is exactly the free/low-tier-only case the strategy must support.
function strategyBlock(profiles: WorkerProfile[]): string {
  const ceiling = Math.max(0, ...profiles.map(p => p.capability));
  const minOutputK = Math.min(...profiles.map(p => p.outputK));
  const approxLines = Math.round(minOutputK * 30); // ~30 lines per 1k output tokens (rough)
  if (ceiling >= 8) {
    return `BUILD STRATEGY -- strong models available (top capability ${ceiling}/10):
- You may use larger steps and modern stacks (with build config) where the blueprint supports it.
- Still prefer fewer steps; split only when it genuinely reduces risk.`;
  }
  const floor = ceiling <= 4
    ? `\n- This is a very limited model. Keep the WHOLE project tiny in scope. Build the simplest thing that satisfies the core request; offer to extend it afterward rather than attempting everything at once.`
    : '';
  return `BUILD STRATEGY -- modest models only (top capability ${ceiling}/10). Plan for this reality so the build STILL SUCCEEDS:
- DECOMPOSE aggressively: many small, fully-specified steps. A small precise step is reliable even on a modest model; a large ambitious step is where modest models fail.
- Prefer VANILLA HTML/CSS/JS. No TypeScript, JSX, or build tools unless the blueprint demands it -- modest models are far more reliable on natively-runnable code.
- Keep each file under ~${approxLines} lines so it fits the worker output budget (~${minOutputK}k tokens). If a file would be larger, split it across steps.
- Write EXTRA-explicit instructions: name every function, variable, and import. Assume the worker will NOT infer intent.
- Make each step independently verifiable; avoid steps that require juggling many files at once.${floor}`;
}

function aiSpecs(profiles: WorkerProfile[]): string {
  return profiles.map(p => {
    const cap = AI_CAPABILITIES[p.ai];
    return `  "${p.ai}": capability ${p.capability}/10, ~${p.outputK}k output, cost ${p.costTier}/10 -- ${cap?.bestFor || 'general coding'}`;
  }).join('\n');
}

// [WARN] The plan prompt must return strict JSON. Any deviation and parsing fails.
export function buildPlanPrompt(task: string, profiles: WorkerProfile[], context: string): string {
  const minOutputK = Math.min(...profiles.map(p => p.outputK));
  const maxSteps = minOutputK <= 10 ? 8 : 4;
  const isSingleAI = profiles.length === 1;
  // Single-AI mode: the planner IS the builder — it plans steps it will execute itself, serialized.
  const stepDirective = isSingleAI
    ? `You are BOTH the planner AND the builder (only one AI is configured). Create ${maxSteps} or fewer steps — each step is a layer you will execute yourself, one at a time. Size each step so the complete output fits within your ~${minOutputK}k token output budget.`
    : `Create a build plan with ${maxSteps === 8 ? '4-8' : '1-4'} steps (${maxSteps === 4 ? 'fewer is better' : 'sized to each worker output budget'}).`;
  return `You are the shop foreman. You size the job before anyone picks up a wrench. Direct, warm, efficient -- you've seen every kind of job.
- No jargon with the user. You have opinions and share them. If the request doesn't match the goal, say so first.
- ${isSingleAI ? 'You are both planner and builder — assign all steps to yourself.' : 'Assign work to the right AI for each step. Fewer steps is better.'}

You are a senior software architect planning a build task. Create a step-by-step plan and assign each step to the best-fit AI.

TASK: "${task}"

${context ? `PROJECT CONTEXT:\n${context}\n` : ''}AVAILABLE AIs (specs + strengths):
${aiSpecs(profiles)}

${strategyBlock(profiles)}

ASSIGNMENT RULES:
- Match step difficulty to worker capability: give reasoning-heavy or architecturally critical steps to your highest-capability worker; give simple/boilerplate steps to your cheapest capable worker to save the user money.
- NEVER assign a step whose output file would exceed a worker's output budget (the ~Nk output above). If a file is large, split it into steps or use a worker with a bigger output budget.
- Prefer keeping interdependent steps on the SAME worker to avoid style/interface mismatches at the seams.

PROJECT RULES (MUST COMPLY):
${getWorkerRules()}

${stepDirective} Each step produces code.

ARCHITECTURAL REASONING (Follow these steps before generating the plan):
1. Environment Assessment: Evaluate the runtime environment. If there is no build tool (e.g. Vite, Webpack) prescribed in the blueprint, you MUST use natively executable languages (e.g. standard HTML, CSS, Vanilla JS) for browsers. Do NOT use TypeScript or JSX unless you also prescribe the build configuration to compile it.
2. Infrastructure First: If the request requires a modern framework, your first step must establish the infrastructure (e.g. package.json, config files).
3. Logical Decomposition: Break the project down into logical layers (e.g. State, Engine, UI, Styling) rather than arbitrary files.
4. Interface Contracts: Ensure your step specifications clearly name the functions and interfaces so the workers can piece them together perfectly.

Ensure you follow all PROJECT RULES, especially architecture constraints for games.

For each step, you must output a STRICT CONTRACT for the Worker:
- filesToCreate: Array of exact filenames to create/modify.
- dependencies: Array of filenames this step imports or relies on.
- exactInstructions: Precise prescription. Name every function, class, or variable to implement. Quote exact old -> new code for changes.

Respond with ONLY valid JSON, no markdown, no explanation:
[
  {
    "step": 1,
    "description": "Short label describing the logical layer",
    "filesToCreate": ["exact_filename.ext"],
    "dependencies": ["files_this_step_imports.ext"],
    "exactInstructions": "Precise implementation details...",
    "ai": "which_ai_id"
  }
]`;
}

// Reassign a step to the roomiest worker if it creates files but landed on the smallest-output
// worker. Cheap insurance against output truncation; never fails, never blocks a build.
function clampAssignment(ai: string, hasFiles: boolean, profiles: WorkerProfile[]): string {
  if (!hasFiles) { return ai; }
  const assigned = profiles.find(p => p.ai === ai);
  const roomiest = [...profiles].sort((a, b) => b.outputK - a.outputK || a.costTier - b.costTier)[0];
  if (assigned && roomiest && roomiest.outputK - assigned.outputK >= 8) { return roomiest.ai; }
  return ai;
}

export function parsePlan(text: string, profiles: WorkerProfile[]): PlanStep[] {
  const availableAIs = profiles.map(p => p.ai);
  const fallback = availableAIs[1] || availableAIs[0];
  try {
    let clean = text.trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) { clean = match[0]; }
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) { throw new Error('Not an array'); }

    const minOutputK = Math.min(...profiles.map(p => p.outputK));
    const maxSteps = minOutputK <= 10 ? 8 : 4;
    const plan = parsed.slice(0, maxSteps).map((item: any, i: number) => {
      const hasFiles = Array.isArray(item.filesToCreate) && item.filesToCreate.length > 0;
      let ai = availableAIs.includes(item.ai) ? item.ai : fallback;
      ai = clampAssignment(ai, hasFiles, profiles);
      const cap = AI_CAPABILITIES[ai];
      return {
        stepNumber: i + 1,
        description: String(item.description || 'Build step'),
        filesToCreate: hasFiles ? item.filesToCreate : undefined,
        dependencies: Array.isArray(item.dependencies) ? item.dependencies : undefined,
        exactInstructions: item.exactInstructions ? String(item.exactInstructions) : undefined,
        spec: item.spec ? String(item.spec) : undefined,
        assignedAI: ai,
        assignedLabel: cap?.label || ai,
        type: 'code' as const,
      };
    });
    log('debug', 'services', 'supervisorPlanner', 'parsePlan', 'Supervisor Plan Parsed Successfully', { plan });
    return plan;
  } catch (err) {
    log('error', 'services', 'supervisorPlanner', 'parsePlan', 'Supervisor Plan Parse Failed', { rawText: text, error: String(err) });
    const cap = AI_CAPABILITIES[fallback];
    return [{ stepNumber: 1, description: 'Build the requested feature', assignedAI: fallback, assignedLabel: cap?.label || fallback, type: 'code' }];
  }
}
