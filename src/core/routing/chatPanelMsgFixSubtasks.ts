// [SCOPE] Handles iterative chunked execution of massive file edits.
// Runs the Worker repeatedly for each subtask, accumulating file changes.

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
  const { subtasks, executionMode, diagnosis, fileNames, activePatterns, allowedRels, deps, root, supervisorLabel, userText } = params;
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
  
  if (executionMode === 'parallel') {
    deps.conversation[deps.conversation.length - 1].content = `Found the issue — writing massive fix across ${subtasks.length} independent files concurrently...`;
    deps.refresh();
    
    fixLog(`--- Starting ${subtasks.length} Subtasks in PARALLEL ---`);
    
    const promises = subtasks.map(async (subtask, i) => {
      const stepLabel = `[Parallel ${i + 1}/${subtasks.length}]`;
      const chunkDiagnosis = `${diagnosis}\n\n=== CURRENT PARALLEL SUBTASK ${stepLabel} ===\n${subtask}\n\nCRITICAL INSTRUCTION: You MUST use the Surgical Edit XML format (<file>, <edit>, <search>, <replace>). Do NOT output a raw code block. You must precisely locate the code to change and use the <search> block to match it. Only implement this specific subtask. Do not modify anything else.\nCRITICAL INSTRUCTION: Do NOT be lazy. If the subtask requires writing multiple items, you MUST write out EVERY SINGLE ONE. Complete the ENTIRE subtask comprehensively.`;
      
      try {
        const escalation = await runEscalationLoop({
          diagnosis: chunkDiagnosis,
          fileNames,
          filesBlock: currentFilesBlock,
          activePatterns,
          deps,
          root,
          supervisorLabel,
          maxRetries: 1
        });
        
        finalWorkerLabel = escalation.workerLabel;
        finalGuardianLabel = escalation.guardianLabel;
        if (escalation.guardianNote) finalGuardianNote = escalation.guardianNote;
        if (escalation.scopeNote) finalScopeNote = escalation.scopeNote;
        if (escalation.needsAgentHandoff) finalNeedsAgentHandoff = true;
        
        const applyRes = await applyFixContent(escalation.finalResponse, root, allowedRels, userText, { disableLastResort: true });
        
        applyRes.written.forEach(w => allWritten.add(w));
        allFailed.push(...applyRes.failed);
        allSkipped.push(...applyRes.skipped);
        if (applyRes.fixSnapId) lastFixSnapId = applyRes.fixSnapId;
      } catch (err) {
        fixLog(`Subtask ${stepLabel} failed`, { error: String(err) });
        allFailed.push(`Subtask ${i + 1} execution failed: ${String(err)}`);
      }
    });
    
    await Promise.all(promises);
  } else {
    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
    const stepLabel = `[${i + 1}/${subtasks.length}]`;
    fixLog(`--- Starting Subtask ${stepLabel} ---`, { subtask });
    
    deps.conversation[deps.conversation.length - 1].content = `Found the issue — writing massive fix in chunks ${stepLabel}...`;
    deps.refresh();

    // Emphasize to the worker that it's only doing a chunk
    const chunkDiagnosis = `${diagnosis}\n\n=== CURRENT SUBTASK ${stepLabel} ===\n${subtask}\n\nCRITICAL INSTRUCTION: You MUST use the Surgical Edit XML format (<file>, <edit>, <search>, <replace>). Do NOT output a raw code block. You must precisely locate the code to change and use the <search> block to match it. Only implement this specific subtask. Do not modify anything else.\nCRITICAL INSTRUCTION: Do NOT be lazy. If the subtask requires writing multiple items, you MUST write out EVERY SINGLE ONE. Complete the ENTIRE subtask comprehensively.\n[BATCH-FILE PROTOCOL]: If this is a batch asset generation step, APPEND the new assets to the existing object/array in the file. Do NOT overwrite or delete assets from previous batches.`;
    
    try {
      const escalation = await runEscalationLoop({
        diagnosis: chunkDiagnosis,
        fileNames,
        filesBlock: currentFilesBlock,
        activePatterns,
        deps,
        root,
        supervisorLabel,
        maxRetries: 1 // lower retries per chunk to save time
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
      
      // Update filesBlock for the next iteration by reading the updated source files
      if (applyRes.written.length > 0 && i < subtasks.length - 1) {
        const sourceFiles = collectSourceFiles(root, userText);
        currentFilesBlock = sourceFiles.map((f: any) => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');
      }
    } catch (err) {
      fixLog(`Subtask ${stepLabel} failed`, { error: String(err) });
      allFailed.push(`Subtask ${i + 1} execution failed: ${String(err)}`);
    }
  }
  }

  return {
    written: Array.from(allWritten),
    failed: allFailed,
    skipped: allSkipped,
    fixSnapId: lastFixSnapId,
    workerLabel: finalWorkerLabel,
    guardianLabel: finalGuardianLabel,
    guardianNote: finalGuardianNote,
    scopeNote: finalScopeNote,
    needsAgentHandoff: finalNeedsAgentHandoff
  };
}
