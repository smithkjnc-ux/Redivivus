// [SCOPE] Orchestrated phase build — full multi-AI pipeline for deep complexity phases
// Flow: Supervisor plans → each step assigned to best-fit AI → user approves → Workers execute → Walkthrough
// Utilities (AI_LABELS, parseFileMarkers, etc.) extracted to chatPanelBuildOrchestratedUtils.ts (Rule 9).

import * as path from 'path';
import { AI_RANK, selectGuardianAI } from '../../../shared/ai/infrastructure/guardianAI.js';
import { createPlan, executeStep, reviewOutput } from '../../../shared/ai/infrastructure/supervisorOrchestrator.js';
import { callProvider } from '../../../shared/ai/domain/providers/providerFactory.js';
import type { BuildPlan, BuildPhase } from './services/buildOrchestrator.js';
import type { OrchestratorDeps } from './chatPanelOrchestrator.js';
import { writeBuiltFile } from './chatPanelBuildWriter.js';
import { readProjectDeadEnds } from '../routing/chatPanelMsgFixDeadEnds.js';
import { readProjectRules } from '../routing/chatPanelMsgFixUtils.js';
import { generatePlanId, formatOrchestratedPlanForApproval, awaitPlanApproval } from './chatPanelBuildPlanGate.js';
import { appendWalkthroughToConversation } from './chatPanelBuildWalkthrough.js';
import { log } from '../../../shared/logging/infrastructure/redivivusLogger.js';
import { AI_LABELS, isOrchestratedAvailable, buildPhaseTask, parseFileMarkers, formatPlanBreakdown, pushReviewOutcome } from './chatPanelBuildOrchestratedUtils.js';

// Re-export utilities so existing importers don't break
export { isOrchestratedAvailable, buildPhaseTask } from './chatPanelBuildOrchestratedUtils.js';

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
    content: `🧠 **${supervisorLabel} (Supervisor)** planning architecture...`,
    timestamp: Date.now(),
  });
  deps.refresh();

  log('debug', 'core', 'chatPanelBuildOrchestrated', 'executeOrchestratedPhase', 'Supervisor Planning Requested', {
    task: phaseTask,
    availableAIs: ranked,
    projectRoot: root
  });

  const planSteps = await createPlan(
    phaseTask,
    ranked,
    context,
    callAI
  );

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
    // [M1] Surface a failed step instead of silently dropping it — otherwise the build continues with a
    // missing piece and the user never learns why the result is incomplete.
    if (result.failed) {
      deps.conversation.push({
        role: 'assistant',
        content: `⚠️ **Step ${step.stepNumber} (${step.assignedLabel}) failed** and produced no output: ${result.error}. Continuing with the remaining steps — the result may be incomplete.`,
        timestamp: Date.now(),
      });
      deps.refresh();
    }
    totalTokens += result.tokens;
  }

  // ── Step 3: Independent Guardian reviews assembled output ─────────────────
  // [H1] The reviewer must NOT be the planner (ranked[0]) — that AI authored the plan and would be
  // grading its own work. Select an independent Guardian (a different provider). [H3] If the review
  // FAILS (timeout/error/ambiguous), BLOCK the ship — never write unreviewed code to disk.
  // [DEGRADED] If the user has only one provider configured there is no independent Guardian to call;
  // that is an expected config state, not a failure — proceed but mark the build unreviewed and warn.
  const guardianAI = selectGuardianAI(ranked[0], keyMap);
  const singleProvider = !guardianAI && ranked.length <= 1;
  if (guardianAI) {
    deps.conversation.push({
      role: 'assistant',
      content: `🛡️ **${AI_LABELS[guardianAI] || guardianAI} (Guardian)** reviewing assembled output...`,
      timestamp: Date.now(),
    });
    deps.refresh();
  }

  const review = await reviewOutput(
    phaseTask,
    assembledCode,
    guardianAI || '',
    callAI,
    planSteps.map(s => `Step ${s.stepNumber}: Create ${s.filesToCreate?.join(', ')} -> ${s.exactInstructions}`).join('\\n'),
    singleProvider,
  );
  // [H3] blocked → stop, write nothing. [DEGRADED] degraded → persistent ⚠️ warning, proceed unreviewed.
  if (pushReviewOutcome(deps, review)) { return []; }
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
