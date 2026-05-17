// [SCOPE] Orchestrated phase build — full multi-AI pipeline for deep complexity phases
// Flow: Supervisor plans → each step assigned to best-fit AI → Supervisor reviews → files written
// Imported by chatPanelBuildPhase.ts. Falls back to single-file build when only 1 AI is configured.

import * as path from 'path';
import { AI_RANK, AI_CAPABILITIES } from '../../services/ai/guardianAI.js';
import { createPlan, executeStep, reviewOutput, PlanStep } from '../../services/ai/supervisorOrchestrator.js';
import { callProvider } from '../../services/ai/routingProviders.js';
import { BuildPlan, BuildPhase } from '../../services/build/buildOrchestrator.js';
import { OrchestratorDeps } from './chatPanelOrchestrator.js';
import { writeBuiltFile } from './chatPanelBuildWriter.js';
import { readProjectDeadEnds, readProjectRules } from './chatPanelMsgFixUtils.js';

const AI_LABELS: Record<string, string> = {
  gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi',
};

/** Returns true when 2+ AI providers are configured (enables full orchestration) */
export function isOrchestratedAvailable(deps: OrchestratorDeps): boolean {
  const { worker } = deps.routing.selectSupervisorAndWorker();
  return !!worker;
}

/** Builds the phase-specific task description passed to each Worker AI */
export function buildPhaseTask(
  phase: { name: string; description: string; outputs: string[] },
  plan: BuildPlan
): string {
  return [
    `Build the ${phase.name} phase of: ${plan.blueprint.what}`,
    ``,
    `Phase description: ${phase.description}`,
    `Expected output files: ${phase.outputs.join(', ')}`,
    ``,
    `Blueprint:`,
    `- WHO: ${plan.blueprint.who}`,
    `- WHAT: ${plan.blueprint.what}`,
    `- WHERE: ${plan.blueprint.where}`,
    `- WHY: ${plan.blueprint.why}`,
    ``,
    `RULES:`,
    `- If producing multiple files, prefix each file's code block with:  // FILE: relative/path/to/file.ext`,
    `- Each file must be complete and working. No placeholders.`,
    `- Leave extension points for later phases. Do not hard-code values future phases will own.`,
    `- Return ONLY code. No markdown fences. No explanation.`,
  ].join('\n');
}

/**
 * Parses // FILE: path markers from assembled code into a map of { relPath → code }.
 * If no markers found, all code goes to primaryOutput.
 */
function parseFileMarkers(code: string, primaryOutput: string): Map<string, string> {
  const map = new Map<string, string>();
  const markerPattern = /^(?:\/\/|#)\s*FILE:\s*(.+)$/m;
  const parts = code.split(markerPattern);

  if (parts.length <= 1) {
    map.set(primaryOutput, code.trim());
    return map;
  }
  // parts is: [pre, fileName1, code1, fileName2, code2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const filePath = parts[i]?.trim();
    const fileCode = (parts[i + 1] || '').trim();
    if (filePath) { map.set(filePath, fileCode); }
  }
  return map;
}

/** Formats plan steps as a readable breakdown for the chat conversation */
function formatPlanBreakdown(steps: PlanStep[]): string {
  return steps.map(s =>
    `  **Step ${s.stepNumber}** &#x2014; ${s.assignedLabel}: ${s.description}`
  ).join('\n');
}

/**
 * Runs a single phase using the full multi-AI orchestration pipeline.
 * Returns the list of written file paths, or [] on failure.
 * [WARN] Only called when isOrchestratedAvailable() returns true (2+ AIs configured).
 */
export async function runOrchestratedPhaseBuild(
  phase: { id: BuildPhase; name: string; description: string; icon: string; outputs: string[] },
  plan: BuildPlan,
  deps: OrchestratorDeps,
  root: string
): Promise<string[]> {
  const { routing, blueprintContext } = deps;

  const keyMap = routing.getKeyMap();
  const ranked = Object.entries(AI_RANK)
    .filter(([ai]) => keyMap[ai]?.())
    .sort(([, a], [, b]) => b - a)
    .map(([ai]) => ai);

  const fetchFn = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 90_000);
  const callAI = (ai: string, prompt: string) => callProvider(ai, prompt, fetchFn);

  const phaseTask = buildPhaseTask(phase, plan);
  const [_de, _pr] = [readProjectDeadEnds(root), readProjectRules(root)];
  const context = [blueprintContext||'', _de?`PREVIOUSLY FAILED APPROACHES:\n${_de}`:'', _pr?`PROJECT RULES:\n${_pr}`:''].filter(Boolean).join('\n\n');
  const supervisorLabel = AI_LABELS[ranked[0]] || ranked[0];

  // ── Step 1: Supervisor plans ──────────────────────────────────────────────
  deps.conversation.push({
    role: 'assistant',
    content: `&#x1F3AF; **${supervisorLabel} (Supervisor)** is planning the ${phase.icon} ${phase.name} phase...`,
    timestamp: Date.now(),
  });
  deps.refresh();

  const planSteps = await createPlan(phaseTask, ranked, context, callAI);

  deps.conversation.push({
    role: 'assistant',
    content: [
      `**${phase.icon} ${phase.name} &#x2014; AI Build Plan**`,
      ``,
      formatPlanBreakdown(planSteps),
      ``,
      `_Each AI working in sequence..._`,
    ].join('\n'),
    timestamp: Date.now(),
  });
  deps.refresh();

  // ── Step 2: Execute each step with its assigned AI ────────────────────────
  let assembledCode = '';
  let totalTokens = 0;

  for (const step of planSteps) {
    deps.conversation.push({
      role: 'assistant',
      content: `&#x2699; **${step.assignedLabel}** &#x2014; ${step.description}`,
      timestamp: Date.now(),
    });
    deps.refresh();

    const result = await executeStep(step, phaseTask, assembledCode, callAI);
    assembledCode = result.code || assembledCode;
    totalTokens += result.tokens;
  }

  // ── Step 3: Supervisor reviews assembled output ───────────────────────────
  deps.conversation.push({
    role: 'assistant',
    content: `&#x1F6E1; **${supervisorLabel} (Supervisor)** reviewing assembled output...`,
    timestamp: Date.now(),
  });
  deps.refresh();

  const review = await reviewOutput(phaseTask, assembledCode, ranked[0], callAI);
  if (!review.passed && review.notes) {
    deps.conversation.push({
      role: 'assistant',
      content: `&#x270F; Supervisor applied corrections: ${review.notes}`,
      timestamp: Date.now(),
    });
    deps.refresh();
  }
  const finalCode = review.corrected;

  // ── Step 4: Parse FILE markers and write each file ────────────────────────
  const primaryOutput = phase.outputs[0] || 'src/output.ts';
  const fileMap = parseFileMarkers(finalCode, primaryOutput);
  const writtenFiles: string[] = [];

  for (const [relPath, code] of fileMap) {
    try {
      writeBuiltFile(path.join(root, relPath), code);
      writtenFiles.push(relPath);
    } catch (err) {
      deps.conversation.push({
        role: 'assistant',
        content: `&#x26A0; Failed to write \`${relPath}\`: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    }
  }

  deps.conversation.push({
    role: 'assistant',
    content: [
      `&#x2705; **${phase.name} built by ${planSteps.length} AI${planSteps.length > 1 ? 's' : ''}**`,
      writtenFiles.map(f => `  - \`${f}\``).join('\n'),
      `_~${totalTokens} tokens across ${planSteps.length} step${planSteps.length > 1 ? 's' : ''}_`,
    ].join('\n'),
    timestamp: Date.now(),
  });
  deps.refresh();

  return writtenFiles;
}
