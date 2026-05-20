// [SCOPE] Phased build helpers — single-phase execution and build context factory
// Imported by chatPanelPhasedBuild.ts. buildPhase is private to that module.

import * as vscode from 'vscode';
import { BuildPlan, BuildPhase } from '../../services/build/buildOrchestrator.js';
import { OrchestratorDeps } from './chatPanelOrchestrator.js';
import { runSingleFileBuild } from './chatPanelBuild.js';
import { BuildContext } from './chatPanelBuild.js';
import { runOrchestratedPhaseBuild, isOrchestratedAvailable, buildPhaseTask } from './chatPanelBuildOrchestrated.js';
import { inspectPhase } from '../../services/phaseInspector.js';
import { formatInspectionReport } from '../../services/phaseInspectorReport.js';
import { PhaseInspection } from '../../services/phaseInspector.js';
import { isValidBuildRoot } from './chatPanelBuildUtils.js';

export function createBuildContext(task: string, deps: OrchestratorDeps): BuildContext {
  const rawRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const root = isValidBuildRoot(rawRoot) ? rawRoot : '';
  return {
    task, root,
    blueprintContext: deps.blueprintContext,
    vault: deps.vault,
    chassis: deps.chassis,
    routing: deps.routing,
    conversation: deps.conversation,
    refresh: deps.refresh,
    logError: deps.logError,
    postToWebview: deps.postToWebview,
    precomputedVaultSearch: deps.precomputedVaultSearch,
    assistMode: deps.assistMode,
  };
}

export async function buildPhase(
  phase: { id: BuildPhase; name: string; description: string; icon: string; outputs: string[] },
  plan: BuildPlan,
  deps: OrchestratorDeps
): Promise<{ passed: boolean; inspection: PhaseInspection }> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return { passed: false, inspection: null as any }; }

  const phaseTask = buildPhaseTask(phase, plan);
  deps.conversation.push({ role: 'assistant', content: `🛠️ ${phase.icon} **Building ${phase.name}...**`, timestamp: Date.now() });
  deps.refresh();

  try {
    if (isOrchestratedAvailable(deps)) {
      await runOrchestratedPhaseBuild(phase, plan, deps, root);
    } else {
      const ctx = createBuildContext(phaseTask, deps);
      await runSingleFileBuild(ctx);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    deps.logError(plan.task, phaseTask, errMsg, Math.ceil(phaseTask.length / 4));
    throw err;
  }

  deps.conversation.push({ role: 'assistant', content: `🔍 **Inspecting ${phase.name}...** (like testing an engine before installation)`, timestamp: Date.now() });
  deps.refresh();

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

  const inspection = await inspectPhase(phase.id, builtFiles, root, plan.blueprint, deps.routing);
  const report = formatInspectionReport(inspection);
  deps.conversation.push({ role: 'assistant', content: report, timestamp: Date.now() });
  deps.refresh();

  if (inspection.status === 'fail') { return { passed: false, inspection }; }
  return { passed: true, inspection };
}
