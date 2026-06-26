// [SCOPE] Phased build helpers — single-phase execution and build context factory
// Imported by chatPanelPhasedBuild.ts. buildPhase is private to that module.

import * as vscode from 'vscode';
import type { BuildPlan, BuildPhase } from './services/buildOrchestrator.js';
import type { OrchestratorDeps } from './chatPanelOrchestrator.js';
import { runSingleFileBuild } from './chatPanelBuild.js';
import type { BuildContext } from './chatPanelBuild.js';
import { runOrchestratedPhaseBuild, isOrchestratedAvailable, buildPhaseTask } from './chatPanelBuildOrchestrated.js';
import { inspectPhase } from '../../project/domain/inspector/phaseInspector.js';
import { formatInspectionReport } from '../../project/domain/inspector/phaseInspectorReport.js';
import type { PhaseInspection } from '../../project/domain/inspector/phaseInspector.js';
import { isValidBuildRoot } from './chatPanelBuildUtils.js';
import { LearnedMemoryService } from '../application/learnedMemoryService.js';
import { buildPromptInjection } from '../application/userMemoryService.js';

// [FIX] Supervisor contract guidance — tells the Supervisor to produce explicit implementation
// contracts for the Worker, not just problem diagnoses. Applies to ALL local build paths.
// Mirrors the same guidance added to the cloud build path in chatPanelBuildRunner.ts.
const SUPERVISOR_CONTRACT_GUIDANCE = `

SUPERVISOR TO WORKER CONTRACT REQUIREMENT:
Your analysis is the Worker's only instruction set. Structure your output as a complete implementation contract:
- For every function that must exist: name it, state what it calls, state what it returns
- For every rendering concern: explicitly list every entity the draw loop must render
- For every state transition: specify the exact sequence of operations
- Do not describe problems — prescribe solutions with enough precision that any capable model implements them correctly on the first attempt
The Worker has no context beyond your instructions. Ambiguity becomes missing code.`;

export function createBuildContext(task: string, deps: OrchestratorDeps): BuildContext {
  const rawRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const root = isValidBuildRoot(rawRoot) ? rawRoot : '';
  // Enrich task with project-specific never_do rules + supervisor contract guidance
  const neverDo = root ? (() => { try { return new LearnedMemoryService(root).getNeverDoForPrompt(); } catch { return ''; } })() : '';
  const userProfile = (() => { try { return buildPromptInjection(); } catch { return ''; } })();
  const profilePrefix = userProfile ? `${userProfile}\n\n` : '';
  const enrichedTask = `${profilePrefix}${task}${neverDo ? `\n\n${neverDo}` : ''}${SUPERVISOR_CONTRACT_GUIDANCE}`;
  return {
    task: enrichedTask, root,
    blueprintContext: deps.blueprintContext,
    vault: deps.vault,
    redivivus: deps.redivivus,
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
