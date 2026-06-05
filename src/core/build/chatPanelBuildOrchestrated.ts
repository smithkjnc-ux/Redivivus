// [SCOPE] Orchestrated phase build — full multi-AI pipeline for deep complexity phases
// Flow: Supervisor plans → each step assigned to best-fit AI → user approves → Workers execute → Walkthrough
// Utilities (AI_LABELS, parseFileMarkers, etc.) extracted to chatPanelBuildOrchestratedUtils.ts (Rule 9).

import * as path from 'path';
import { AI_RANK } from '../../services/ai/guardianAI';
import { createPlan, executeStep, reviewOutput } from '../../services/ai/supervisorOrchestrator';
import { callProvider } from '../ai/providers/providerFactory';
import type { BuildPlan, BuildPhase } from '../../services/build/buildOrchestrator';
import type { OrchestratorDeps } from './chatPanelOrchestrator';
import { writeBuiltFile } from './chatPanelBuildWriter';
import { readProjectDeadEnds } from '../routing/chatPanelMsgFixDeadEnds.js';
import { readProjectRules } from '../routing/chatPanelMsgFixUtils.js';
import { generatePlanId, formatOrchestratedPlanForApproval, awaitPlanApproval } from './chatPanelBuildPlanGate';
import { appendWalkthroughToConversation } from './chatPanelBuildWalkthrough';
import { AI_LABELS, isOrchestratedAvailable, buildPhaseTask, parseFileMarkers, formatPlanBreakdown } from './chatPanelBuildOrchestratedUtils';

// Re-export utilities so existing importers don't break
export { isOrchestratedAvailable, buildPhaseTask } from './chatPanelBuildOrchestratedUtils';

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
    content: `🎯 **${supervisorLabel} (Supervisor)** is planning the ${phase.icon} ${phase.name} phase...`,
    timestamp: Date.now(),
  });
  deps.refresh();

  const planSteps = await createPlan(phaseTask, ranked, context, callAI);

  deps.conversation.push({
    role: 'assistant',
    content: [
      `**${phase.icon} ${phase.name} — AI Build Plan**`,
      ``,
      formatPlanBreakdown(planSteps),
    ].join('\n'),
    timestamp: Date.now(),
  });
  deps.refresh();

  // [FIX] Plan Approval Gate — show orchestrated plan to user and wait for approval
  const planId = generatePlanId();
  const planCard = formatOrchestratedPlanForApproval(planSteps, phase.name, planId);
  deps.conversation.push({ role: 'assistant', content: planCard, timestamp: Date.now() });
  deps.refresh();
  const decision = await awaitPlanApproval(planId, deps.conversation, deps.refresh);
  if (decision === 'cancel') {
    deps.conversation.push({ role: 'assistant', content: '\u274c Build cancelled.', timestamp: Date.now() });
    deps.refresh();
    return [];
  }
  if (decision === 'revise') {
    deps.conversation.push({ role: 'assistant', content: '\u270f\ufe0f Revision requested \u2014 please describe what you want changed and resend.', timestamp: Date.now() });
    deps.refresh();
    return [];
  }
  deps.conversation.push({ role: 'assistant', content: '\u2705 Plan approved \u2014 each AI working in sequence...', timestamp: Date.now() });
  deps.refresh();

  // ── Step 2: Execute each step with its assigned AI ────────────────────────
  let assembledCode = '';
  let totalTokens = 0;

  for (const step of planSteps) {
    deps.conversation.push({
      role: 'assistant',
      content: `⚙️ **${step.assignedLabel}** — ${step.description}`,
      timestamp: Date.now(),
    });
    deps.refresh();

    const result = await executeStep(step, phaseTask, assembledCode, callAI, planSteps);
    if (result.code) {
      assembledCode = assembledCode ? assembledCode + '\n\n' + result.code : result.code;
    }
    totalTokens += result.tokens;
  }

  // ── Step 3: Supervisor reviews assembled output ───────────────────────────
  deps.conversation.push({
    role: 'assistant',
    content: `🛡️ **${supervisorLabel} (Supervisor)** reviewing assembled output...`,
    timestamp: Date.now(),
  });
  deps.refresh();

  const review = await reviewOutput(phaseTask, assembledCode, ranked[0], callAI);
  if (!review.passed && review.notes) {
    deps.conversation.push({
      role: 'assistant',
      content: `✍️ Supervisor applied corrections: ${review.notes}`,
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
        content: `⚠️ Failed to write \`${relPath}\`: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    }
  }

  deps.conversation.push({
    role: 'assistant',
    content: [
      `✅ **${phase.name} built by ${planSteps.length} AI${planSteps.length > 1 ? 's' : ''}**`,
      writtenFiles.map(f => `  - \`${f}\``).join('\n'),
      `_~${totalTokens} tokens across ${planSteps.length} step${planSteps.length > 1 ? 's' : ''}_`,
    ].join('\n'),
    timestamp: Date.now(),
  });
  deps.refresh();

  // [FIX] Walkthrough Handoff — generate a structured summary of the orchestrated build
  try {
    await appendWalkthroughToConversation(
      plan.blueprint.what || phase.name,
      writtenFiles,
      root,
      deps.routing,
      deps.conversation,
      deps.refresh,
    );
  } catch { /* non-blocking */ }

  return writtenFiles;
}
