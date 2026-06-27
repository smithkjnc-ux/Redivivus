// [SCOPE] Iterative subtask execution for multi-step fix requests.
// [PHASE-1-HARDENING] Simplified for Phase 2 server-side orchestration.
// Always runs subtasks sequentially; executionMode param retained for API compatibility.

import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';
import { fixLog } from '../../features/logging/data/fixPipelineLogger.js';

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
  const { resolveSourceFiles } = await import('./chatPanelMsgFixContext.js');

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
    // [SEQUENTIAL-DEP] Steps marked [DEPENDS_ON_PREV] cannot be correctly prescribed until
    // the previous step's output exists on disk. The Worker for these steps receives ONLY
    // its own step instruction + the fresh file state — not the full multi-step diagnosis.
    // This prevents the Worker from seeing prescriptions written against a file state that
    // no longer reflects reality (e.g. "fix CSS to match HTML" before the HTML was written).
    const dependsOnPrev = subtasks[i].startsWith('[DEPENDS_ON_PREV]');
    const stepInstruction = subtasks[i].replace(/^\[DEPENDS_ON_PREV\]\s*/, '');

    fixLog(`--- Starting Subtask ${stepLabel} ---`, { subtask: stepInstruction, dependsOnPrev });
    deps.conversation[deps.conversation.length - 1].content =
      `Supervisor (${supervisorLabel}): done\nWorker: fix ${stepLabel} — ${stepInstruction.slice(0, 60)}...\nVerify: pending\nGuardian: pending`;
    deps.refresh();

    // [SCOPE ISOLATION] Dependent steps get only their own instruction + fresh files.
    // Independent steps get the full diagnosis so the Worker has full context.
    const chunkDiagnosis = dependsOnPrev
      ? [
          `TASK: ${userText || stepInstruction}`,
          `\nPREVIOUS STEP(S) COMPLETE — files below are re-read from disk and reflect the current state.`,
          `\nEXECUTE ONLY THIS STEP (${stepLabel}):`,
          stepInstruction,
          `\nWrite ONLY the file(s) this step requires. Do not redo any previous step's work.`
        ].join('\n')
      : `${diagnosis}\n\nSubtask ${stepLabel}: ${stepInstruction}`;

    try {
      const escalation = await runEscalationLoop({
        diagnosis: chunkDiagnosis, fileNames, filesBlock: currentFilesBlock,
        activePatterns, deps, root, supervisorLabel, maxRetries: 1, userText
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
        const sourceFiles = await resolveSourceFiles(root, userText, deps);
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
