// [SCOPE] Phased build executor — executes BuildPlan phases via BuildOrchestrator
// Extracted from chatPanelOrchestrator.ts

import * as vscode from 'vscode';
import { BuildPlan, BuildOrchestrator, BuildPhase } from '../../services/build/buildOrchestrator.js';
import { OrchestratorDeps } from './chatPanelOrchestrator.js';
import { runSingleFileBuild, BuildContext } from './chatPanelBuild.js';
export { runSingleFileBuild, BuildContext };
import { inspectPhase } from '../../services/phaseInspector.js';
import { formatInspectionReport } from '../../services/phaseInspectorReport.js';
import { PhaseInspection } from '../../services/phaseInspector.js';

export async function executePhasedBuild(
  plan: BuildPlan,
  deps: OrchestratorDeps,
  orchestrator: BuildOrchestrator
): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return; }

  // Show build plan summary
  const summary = orchestrator.getPlanSummary(plan.task);
  deps.conversation.push({
    role: 'assistant',
    content: summary + '\n\n**Starting Phase 1...**',
    timestamp: Date.now(),
  });
  deps.refresh();

  // Build phase by phase with inspection gates
  let currentPhase = orchestrator.getCurrentPhase(plan.task);
  let phaseNumber = 1;
  
  while (currentPhase) {
    // Build this phase + inspect
    const result = await buildPhase(currentPhase, plan, deps);

    // Gate: Stop if inspection failed
    if (!result.passed) {
      deps.conversation.push({
        role: 'assistant',
        content: [
          `⛔ **Phase Gate Closed**`,
          ``,
          `${currentPhase.name} did not pass inspection.`,
          ``,
          `Like an engine failing compression tests — we cannot install it.`,
          ``,
          `**Options:**`,
          `1. Fix the issues and re-inspect`,
          `2. Rebuild this phase with different approach`,
          `3. Pause and reconsider the blueprint`,
        ].join('\n'),
        timestamp: Date.now(),
      });
      deps.refresh();
      
      // Pause the build plan
      plan.state = 'paused';
      orchestrator.savePlans?.();
      return;
    }

    // Phase passed — complete and advance
    orchestrator.completeCurrentPhase(plan.task);
    currentPhase = orchestrator.getCurrentPhase(plan.task);
    phaseNumber++;

    if (currentPhase) {
      deps.conversation.push({
        role: 'assistant',
        content: `✅ **Phase ${phaseNumber - 1} passed inspection.**\n\n🔨 Starting: ${currentPhase.icon} ${currentPhase.name}...`,
        timestamp: Date.now(),
      });
      deps.refresh();
    }
  }

  // All phases complete
  deps.conversation.push({
    role: 'assistant',
    content: `🎉 **Build Complete!** All ${plan.phases.length} phases passed inspection and built successfully.`,
    timestamp: Date.now(),
  });
  deps.refresh();
}

// Build a single phase with inspection gate
async function buildPhase(
  phase: { id: BuildPhase; name: string; description: string; icon: string; outputs: string[] },
  plan: BuildPlan,
  deps: OrchestratorDeps
): Promise<{ passed: boolean; inspection: PhaseInspection }> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return { passed: false, inspection: null as any }; }

  // Generate phase-specific prompt
  const prompt = [
    `You are building: ${plan.blueprint.what}`,
    ``,
    `## Current Phase: ${phase.name} ${phase.icon}`,
    `${phase.description}`,
    ``,
    `### Blueprint Context:`,
    `- WHO: ${plan.blueprint.who}`,
    `- WHAT: ${plan.blueprint.what}`,
    `- WHERE: ${plan.blueprint.where}`,
    `- WHEN: ${plan.blueprint.when}`,
    `- WHY: ${plan.blueprint.why}`,
    ``,
    `### Phase Instructions:`,
    `1. Build ONLY the ${phase.name} phase`,
    `2. Expected outputs: ${phase.outputs.join(', ')}`,
    `3. Generate working, complete code — NO placeholders`,
    `4. Leave extension points for next phases`,
    ``,
    `Return ONLY code — no markdown fences, no explanation.`,
  ].join('\n');

  // Build context for this phase
  const ctx = createBuildContext(plan.task, deps);

  // Execute build
  deps.conversation.push({
    role: 'assistant',
    content: `🔨 ${phase.icon} **Building ${phase.name}...**`,
    timestamp: Date.now(),
  });
  deps.refresh();

  try {
    await runSingleFileBuild(ctx);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    deps.logError(plan.task, prompt, errMsg, Math.ceil(prompt.length / 4));
    throw err;
  }

  // ── PHASE INSPECTION ──
  deps.conversation.push({
    role: 'assistant',
    content: `🔍 **Inspecting ${phase.name}...** (like testing an engine before installation)`,
    timestamp: Date.now(),
  });
  deps.refresh();

  // Collect built files (from the outputs patterns)
  const builtFiles: string[] = [];
  const fs = require('fs');
  const path = require('path');
  for (const pattern of phase.outputs) {
    const dir = pattern.includes('/') ? path.join(root, path.dirname(pattern)) : root;
    const filePattern = path.basename(pattern).replace(/\*/g, '');
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter((f: string) => f.includes(filePattern.replace('*', '')))
        .map((f: string) => path.join(dir, f));
      builtFiles.push(...files);
    }
  }

  // Run inspection
  const inspection = await inspectPhase(
    phase.id,
    builtFiles,
    root,
    plan.blueprint,
    deps.routing
  );

  // Show inspection results
  const report = formatInspectionReport(inspection);
  deps.conversation.push({
    role: 'assistant',
    content: report,
    timestamp: Date.now(),
  });
  deps.refresh();

  // Gate: Don't proceed if failed
  if (inspection.status === 'fail') {
    return { passed: false, inspection };
  }

  return { passed: true, inspection };
}

// Helper to create build context
export function createBuildContext(task: string, deps: OrchestratorDeps): BuildContext {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

  return {
    task,
    root,
    blueprintContext: deps.blueprintContext,
    vault: deps.vault,
    chassis: deps.chassis,
    routing: deps.routing,
    conversation: deps.conversation,
    refresh: deps.refresh,
    logError: deps.logError,
    postToWebview: deps.postToWebview,
    precomputedVaultSearch: deps.precomputedVaultSearch,
  };
}