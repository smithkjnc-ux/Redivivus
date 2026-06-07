// [SCOPE] Iterative subtask execution for multi-step fix requests.
// [PHASE-1-HARDENING] Simplified for Phase 2 server-side orchestration.
// Always runs subtasks sequentially; executionMode param retained for API compatibility.

import type { MessageHandlerDeps } from './chatPanelMessages';
import { fixLog } from '../../services/logging/fixPipelineLogger';

export async function runSubtasksLoop(params: {
  subtasks: string[];
  executionMode?: 'parallel' | 'sequential';
  diagnosis: string;
  fileNames: string;
  filesBlock: string;
  activePatterns: any[];
  allowedRels: Set<string>;
  deps: MessageHandlerDeps;
  root: string;
  supervisorLabel: string;
  userText: string;
}) {
  const { subtasks, diagnosis, fileNames, activePatterns, allowedRels, deps, root, supervisorLabel, userText } = params;
  const { runEscalationLoop } = await import('./chatPanelMsgFixEscalation.js');
  const { applyFixContent } = await import('./chatPanelMsgFixApply.js');
  const { collectSourceFiles } = await import('./chatPanelMsgFixContext.js');

  let currentFilesBlock = params.filesBlock;
  const allWritten = new Set<string>();
  const allFailed: string[] = [];
  const allSkipped: string[] = [];
  let lastFixSnapId: string | undefined;
  let finalWorkerLabel = 'AI';
  let finalGuardianLabel = 'AI';
  let finalGuardianNote = '';
  let finalScopeNote = '';
  let finalNeedsAgentHandoff = false;

  for (let i = 0; i < subtasks.length; i++) {
    const stepLabel = `[${i + 1}/${subtasks.length}]`;
    fixLog(`--- Starting Subtask ${stepLabel} ---`, { subtask: subtasks[i] });
    deps.conversation[deps.conversation.length - 1].content = `Found the issue — writing fix ${stepLabel}...`;
    deps.refresh();

    const chunkDiagnosis = `${diagnosis}\n\nSubtask ${stepLabel}: ${subtasks[i]}`;

    try {
      const escalation = await runEscalationLoop({
        diagnosis: chunkDiagnosis, fileNames, filesBlock: currentFilesBlock,
        activePatterns, deps, root, supervisorLabel, maxRetries: 1
      });

      finalWorkerLabel = escalation.workerLabel;
      finalGuardianLabel = escalation.guardianLabel;
      finalGuardianNote = escalation.guardianNote;
      if (escalation.scopeNote) finalScopeNote = escalation.scopeNote;
      if (escalation.needsAgentHandoff) finalNeedsAgentHandoff = true;

      const applyRes = await applyFixContent(escalation.finalResponse, root, allowedRels, userText, { disableLastResort: true });
      applyRes.written.forEach(w => allWritten.add(w));
      allFailed.push(...applyRes.failed);
      allSkipped.push(...applyRes.skipped);
      if (applyRes.fixSnapId) lastFixSnapId = applyRes.fixSnapId;

      if (applyRes.written.length > 0 && i < subtasks.length - 1) {
        const sourceFiles = collectSourceFiles(root, userText);
        currentFilesBlock = sourceFiles.map((f: any) => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');
      }
    } catch (err) {
      fixLog(`Subtask ${stepLabel} failed`, { error: String(err) });
      allFailed.push(`Subtask ${i + 1} failed: ${String(err)}`);
    }
  }

  return {
    written: Array.from(allWritten), failed: allFailed, skipped: allSkipped,
    fixSnapId: lastFixSnapId, workerLabel: finalWorkerLabel, guardianLabel: finalGuardianLabel,
    guardianNote: finalGuardianNote, scopeNote: finalScopeNote, needsAgentHandoff: finalNeedsAgentHandoff
  };
}
