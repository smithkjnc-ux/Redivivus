// [SCOPE] Orchestrated phase build — full multi-AI pipeline, including single-AI serialized mode.
// Flow: Supervisor plans → steps assigned → user approves → Workers execute with per-layer Guardian → integration check
// Utilities (AI_LABELS, parseFileMarkers, etc.) extracted to chatPanelBuildOrchestratedUtils.ts (Rule 9).

import * as path from 'path';
import { AI_RANK, selectGuardianAI } from '../../features/ai/data/guardianAI.js';
import { createPlan, executeStep } from '../../features/ai/data/supervisorOrchestrator.js';
import { reviewIntegration } from '../../features/ai/data/supervisorLayerReview.js';
import { buildCapabilityProfiles } from '../../features/ai/data/supervisorPlanner.js';
import { resolveRoleTemps } from '../../features/ai/data/roleTemperature.js';
import { callProvider } from '../../features/ai/logic/providers/providerFactory.js';
import type { BuildPlan, BuildPhase } from './services/buildOrchestrator.js';
import type { OrchestratorDeps } from './chatPanelOrchestrator.js';
import { writeBuiltFile } from './chatPanelBuildWriter.js';
import { readProjectDeadEnds } from '../fix/chatPanelMsgFixDeadEnds.js';
import { readProjectRules } from '../fix/chatPanelMsgFixUtils.js';
import { generatePlanId, formatOrchestratedPlanForApproval, awaitPlanApproval } from './chatPanelBuildPlanGate.js';
import { appendWalkthroughToConversation } from './chatPanelBuildWalkthrough.js';
import { log } from '../../features/logging/data/redivivusLogger.js';
import { AI_LABELS, isOrchestratedAvailable, buildPhaseTask, parseFileMarkers, formatPlanBreakdown, pushReviewOutcome, runLayerReview, buildProjectWiringContext } from './chatPanelBuildOrchestratedUtils.js';
import { buildExistingSourceContext } from './chatPanelBuildContextReader.js';
import { runBuildCompileCheck, runBuildVisualCheck } from './chatPanelBuildPostVerify.js';

// Re-export utilities so existing importers don't break
export { isOrchestratedAvailable, buildPhaseTask } from './chatPanelBuildOrchestratedUtils.js';

/** Runs a single phase using the multi-AI (or single-AI serialized) orchestration pipeline.
 *  Returns the list of written file paths, or [] on failure. */
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
  const storedTemps = (deps.redivivus as any)?.getSessionAiTemperature?.();
  const roleTemps = resolveRoleTemps(storedTemps);
  const callAI = (ai: string, prompt: string, temperature?: number) => callProvider(ai, prompt, fetchFn, undefined, undefined, undefined, undefined, temperature);

  const phaseTask = buildPhaseTask(phase, plan);
  // [Gap 1 fix] Read current file contents BEFORE planning — supervisor sees what IS there, not just what should be.
  const [_de, _pr, _wiring, _src] = [readProjectDeadEnds(root), readProjectRules(root), buildProjectWiringContext(root), buildExistingSourceContext(root, phase.outputs)];
  const context = [blueprintContext||'', _wiring, _src, _de?`PREVIOUSLY FAILED APPROACHES:\n${_de}`:'', _pr?`PROJECT RULES:\n${_pr}`:''].filter(Boolean).join('\n\n');
  // Guardian + profiles set up before the loop — used in per-layer review and integration check.
  const profiles = buildCapabilityProfiles(ranked);
  const guardianAI = selectGuardianAI(ranked[0], keyMap);
  const singleProvider = !guardianAI && ranked.length <= 1;

  // ── Step 1: Supervisor plans ──────────────────────────────────────────────
  deps.conversation.push({
    role: 'assistant',
    content: `🧠 **${AI_LABELS[ranked[0]] || ranked[0]} (Supervisor)** planning architecture...`,
    timestamp: Date.now(),
  });
  deps.refresh();

  log('debug', 'core', 'chatPanelBuildOrchestrated', 'executeOrchestratedPhase', 'Supervisor Planning Requested', {
    task: phaseTask,
    availableAIs: ranked,
    projectRoot: root
  });

  const planSteps = await createPlan(phaseTask, ranked, context, callAI, roleTemps);

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

  // ── Step 2: Execute each step with per-layer Guardian review ─────────────
  let assembledCode = '';
  let totalTokens = 0;

  for (const step of planSteps) {
    deps.conversation.push({
      role: 'assistant',
      content: `⚙️ **${step.assignedLabel}** — ${step.description}`,
      timestamp: Date.now(),
    });
    deps.refresh();

    const result = await executeStep(step, phaseTask, assembledCode, callAI, planSteps, profiles, blueprintContext, roleTemps);
    totalTokens += result.tokens;
    if (result.failed) {
      deps.conversation.push({
        role: 'assistant',
        content: `⚠️ **Step ${step.stepNumber} (${step.assignedLabel}) failed**: ${result.error}. Continuing — result may be incomplete.`,
        timestamp: Date.now(),
      });
      deps.refresh();
      continue;
    }

    // Per-layer Guardian: catch errors before the next step builds on them. Fails OPEN.
    const { blocked, code: layerCode } = await runLayerReview(deps, step, result.code, phaseTask, blueprintContext || '', guardianAI || '', callAI, roleTemps);
    if (blocked) { return []; }
    assembledCode = assembledCode ? `${assembledCode}\n\n${layerCode}` : layerCode;
  }

  // ── Step 3: Final integration check — do the layers fit together? ─────────
  // [H3] Fails CLOSED: unreviewed code never ships. [DEGRADED] single-provider: proceeds with ⚠️ warning.
  if (guardianAI) {
    deps.conversation.push({ role: 'assistant', content: `🛡️ **${AI_LABELS[guardianAI] || guardianAI} (Guardian)** checking layer integration...`, timestamp: Date.now() });
    deps.refresh();
  }

  const review = await reviewIntegration(phaseTask, assembledCode, planSteps, blueprintContext || '', guardianAI || '', callAI, singleProvider, roleTemps);
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

  // [Gap 2 + Visual fix] Post-write: compile check then vision AI check. Both non-blocking.
  await runBuildCompileCheck(deps, root, writtenFiles);
  await runBuildVisualCheck(deps, root, phaseTask, writtenFiles);

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
