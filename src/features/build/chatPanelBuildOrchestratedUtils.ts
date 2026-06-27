// [SCOPE] Orchestrated build utilities — shared helpers for the multi-AI orchestration pipeline
// Extracted from chatPanelBuildOrchestrated.ts to comply with Rule 9 (200-line limit).

import * as fs from 'fs';
import * as path from 'path';
import type { PlanStep } from '../../features/ai/data/supervisorOrchestrator.js';
import { reviewLayer } from '../../features/ai/data/supervisorLayerReview.js';
import type { AIResponse } from '../../features/ai/data/routingTypes.js';
import type { RoleTemperatures } from '../../features/ai/data/roleTemperature.js';
import type { BuildPlan } from './services/buildOrchestrator.js';
import type { OrchestratorDeps } from './chatPanelOrchestrator.js';

/**
 * Reads the project's HTML entry point and build config (Vite, Webpack, etc.) and returns them
 * as a compact context block. Injected into the supervisor prompt so it can verify that CSS/JS
 * files referenced in HTML are actually served at those paths given the build config's root setting.
 * Without this, supervisors plan visual changes on files that aren't even loading in the browser.
 */
export function buildProjectWiringContext(root: string): string {
  const parts: string[] = [];
  const cap = (s: string, n: number) => s.length > n ? s.slice(0, n) + '\n...[truncated]' : s;

  for (const htmlPath of ['index.html', 'public/index.html', 'src/index.html']) {
    const full = path.join(root, htmlPath);
    if (fs.existsSync(full)) {
      parts.push(`=== ${htmlPath} ===\n${cap(fs.readFileSync(full, 'utf8'), 3000)}`);
      break;
    }
  }

  for (const cfgPath of ['vite.config.js', 'vite.config.ts', 'webpack.config.js', 'next.config.js', 'next.config.ts']) {
    const full = path.join(root, cfgPath);
    if (fs.existsSync(full)) {
      parts.push(`=== ${cfgPath} ===\n${cap(fs.readFileSync(full, 'utf8'), 1000)}`);
      break;
    }
  }

  if (parts.length === 0) { return ''; }
  return `PROJECT WIRING (entry points + build config — verify all <link>/<script> paths resolve before planning):\n${parts.join('\n\n')}`;
}

export const AI_LABELS: Record<string, string> = {
  gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', deepseek: 'DeepSeek',
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

/**
 * Renders the Guardian review outcome into the conversation and reports whether the build must stop.
 * Returns true when the build is BLOCKED — the caller must write nothing and return. Three cases:
 *  - blocked  → 🛑 hard stop (a real Guardian failure: timeout/error/ambiguous, H3)
 *  - degraded → ⚠️ persistent warning; the build proceeds unreviewed (single-provider mode, not passed)
 *  - corrected → ✍️ note that the Guardian rewrote the output
 */
export function pushReviewOutcome(
  deps: OrchestratorDeps,
  review: { passed: boolean; notes: string; blocked?: boolean; degraded?: boolean; error?: string; warning?: string },
): boolean {
  if (review.blocked) {
    deps.conversation.push({ role: 'assistant',
      content: `🛑 **Build blocked — nothing was written.** ${review.error}\n\nAn independent Guardian (a second AI provider, different from the one that built this) must review the output before it can ship. Add another provider or retry, then run the build again.`,
      timestamp: Date.now() });
    deps.refresh();
    return true;
  }
  if (review.degraded) {
    deps.conversation.push({ role: 'assistant',
      content: `⚠️ **Shipped without independent review (degraded mode).** ${review.warning}\n\nThe code was written, but only one AI provider is configured — so no *different* AI checked what this one built. Add a second AI provider in Setup to enable full Guardian coverage.`,
      timestamp: Date.now() });
    deps.refresh();
    return false;
  }
  if (!review.passed && review.notes) {
    deps.conversation.push({ role: 'assistant',
      content: `✍️ Guardian applied corrections: ${review.notes}`,
      timestamp: Date.now() });
    deps.refresh();
  }
  return false;
}

/**
 * Runs a per-layer Guardian review after a Worker step completes.
 * Fails OPEN: a transient Guardian error passes the layer through — the integration review is the hard gate.
 * Returns { blocked: true } if the Guardian explicitly blocked this layer; blocked layers stop the build.
 */
export async function runLayerReview(
  deps: OrchestratorDeps,
  step: PlanStep,
  layerCode: string,
  phaseTask: string,
  blueprintContext: string,
  guardianAI: string,
  callAI: (ai: string, prompt: string, temperature?: number) => Promise<AIResponse>,
  temperatures?: RoleTemperatures,
): Promise<{ blocked: boolean; code: string }> {
  if (!layerCode || !guardianAI) {
    return { blocked: false, code: layerCode };
  }
  const layerReview = await reviewLayer(
    phaseTask, step.description, layerCode, blueprintContext,
    step.exactInstructions || step.description, guardianAI, callAI, temperatures,
  );
  if (layerReview.blocked) {
    deps.conversation.push({ role: 'assistant',
      content: `🛑 **Layer ${step.stepNumber} blocked** (${step.description}): ${layerReview.error}`,
      timestamp: Date.now() });
    deps.refresh();
    return { blocked: true, code: '' };
  }
  if (!layerReview.passed && layerReview.notes) {
    deps.conversation.push({ role: 'assistant',
      content: `✍️ **Layer ${step.stepNumber} corrected** — ${layerReview.notes}`,
      timestamp: Date.now() });
    deps.refresh();
  }
  return { blocked: false, code: layerReview.corrected };
}
