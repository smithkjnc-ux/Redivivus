// [SCOPE] Orchestrated build utilities — shared helpers for the multi-AI orchestration pipeline
// Extracted from chatPanelBuildOrchestrated.ts to comply with Rule 9 (200-line limit).

import type { PlanStep } from '../../services/ai/supervisorOrchestrator';
import type { BuildPlan } from '../../services/build/buildOrchestrator';
import type { OrchestratorDeps } from './chatPanelOrchestrator';

export const AI_LABELS: Record<string, string> = {
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
export function parseFileMarkers(code: string, primaryOutput: string): Map<string, string> {
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
    let fileCode = (parts[i + 1] || '').trim();
    fileCode = fileCode.replace(/^```[a-z]*\n?/gm, '').replace(/```$/gm, '').trim();
    if (filePath) { map.set(filePath, fileCode); }
  }
  return map;
}

/** Formats plan steps as a readable breakdown for the chat conversation */
export function formatPlanBreakdown(steps: PlanStep[]): string {
  return steps.map(s =>
    `  **Step ${s.stepNumber}** — ${s.assignedLabel}: ${s.description}`
  ).join('\n');
}
