// [SCOPE] Phased build executor — executes BuildPlan phases via BuildOrchestrator
// buildPhase helper + createBuildContext -> chatPanelBuildPhase.ts

import * as vscode from 'vscode';
import { BuildPlan, BuildOrchestrator } from '../../services/build/buildOrchestrator.js';
import { OrchestratorDeps } from './chatPanelOrchestrator.js';
import { runSingleFileBuild, BuildContext } from './chatPanelBuild.js';
export { runSingleFileBuild, BuildContext };
import { isValidBuildRoot } from './chatPanelBuildUtils.js';
import { buildPhase, createBuildContext } from './chatPanelBuildPhase.js';
export { createBuildContext };

export async function executePhasedBuild(
  plan: BuildPlan,
  deps: OrchestratorDeps,
  orchestrator: BuildOrchestrator
): Promise<void> {
  const rawRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const root = isValidBuildRoot(rawRoot) ? rawRoot : undefined;
  if (!root) { return; }

  const summary = orchestrator.getPlanSummary(plan.task);
  deps.conversation.push({ role: 'assistant', content: summary + '\n\n**Starting Phase 1...**', timestamp: Date.now() });
  deps.refresh();

  let currentPhase = orchestrator.getCurrentPhase(plan.task);
  let phaseNumber = 1;

  while (currentPhase) {
    const result = await buildPhase(currentPhase, plan, deps);

    if (!result.passed) {
      deps.conversation.push({
        role: 'assistant',
        content: [
          `&#x26D4; **Phase Gate Closed**`, ``,
          `${currentPhase.name} did not pass inspection.`, ``,
          `Like an engine failing compression tests -- we cannot install it.`, ``,
          `**Options:**`,
          `1. Fix the issues and re-inspect`,
          `2. Rebuild this phase with different approach`,
          `3. Pause and reconsider the blueprint`,
        ].join('\n'),
        timestamp: Date.now(),
      });
      deps.refresh();
      plan.state = 'paused';
      orchestrator.savePlans?.();
      return;
    }

    orchestrator.completeCurrentPhase(plan.task);
    currentPhase = orchestrator.getCurrentPhase(plan.task);
    phaseNumber++;

    if (currentPhase) {
      deps.conversation.push({
        role: 'assistant',
        content: `&#x2705; **Phase ${phaseNumber - 1} passed inspection.**\n\n&#x1F528; Starting: ${currentPhase.icon} ${currentPhase.name}...`,
        timestamp: Date.now(),
      });
      deps.refresh();
    }
  }

  deps.conversation.push({
    role: 'assistant',
    content: `&#x1F389; **Build Complete!** All ${plan.phases.length} phases passed inspection and built successfully.`,
    timestamp: Date.now(),
  });
  deps.refresh();
}
