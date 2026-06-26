// [SCOPE] Worker Fix Generation Phase for Escalation Loop
// Extracted from chatPanelMsgFixEscalation.ts (Rule 9 split).

import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';
import { fixActStep, fixActCode } from './fixActivityPanel.js';
import { enrichDepsWithCritiques, updateStatus } from './chatPanelMsgFixEscalationUtils.js';

export async function runWorkerPhase(params: {
  escalated: boolean;
  originalWorkerProvider: string;
  deps: MessageHandlerDeps;
  conversation: any[];
  supervisorLabel: string;
  attempt: number;
  refresh: () => void;
  accumulatedCritiques: string[];
  currentDiagnosis: string;
  fileNames: string;
  filesBlock: string;
  activePatterns: any[];
  root: string;
  forceSurgical: boolean;
}): Promise<{ workerResponse: string; workerLabel: string; originalWorkerProvider: string }> {
  let { originalWorkerProvider } = params;
  const { escalated, deps, conversation, supervisorLabel, attempt, refresh, accumulatedCritiques, currentDiagnosis, fileNames, filesBlock, activePatterns, root, forceSurgical } = params;

  if (!escalated && !originalWorkerProvider) {
    try { originalWorkerProvider = deps.routing.selectSupervisorAndWorker().worker || ''; } catch { /* ignore */ }
  }
  
  updateStatus(conversation, supervisorLabel, 'worker', attempt, escalated);
  refresh();
  
  // [FIX-ACTIVITY] Live Worker row — its code streams into this row's code block (live:true).
  fixActStep({ phase: 'worker', status: 'running', live: true,
    label: attempt > 0 ? `Rewriting the fix (retry ${attempt})` : 'Writing the fix' });

  try {
    const { runPhase2Worker } = await import('./chatPanelMsgFixPhases.js');
    // Inject accumulated critiques into the worker context for retries
    const enrichedDeps = attempt > 0 ? enrichDepsWithCritiques(deps, accumulatedCritiques) : deps;
    let streamBytes = 0;
    const onChunk = (chunk: string) => {
      streamBytes += chunk.length;
      updateStatus(conversation, supervisorLabel, 'worker', attempt, escalated, streamBytes);
      fixActCode(chunk); // [FIX-ACTIVITY] stream the Worker's fix into the panel live
      refresh();
    };
    
    const p2 = await runPhase2Worker(currentDiagnosis, fileNames, filesBlock, activePatterns, enrichedDeps, root, onChunk, escalated, forceSurgical);
    if (!p2) { throw new Error('Worker returned null'); }
    
    // [FIX-ACTIVITY] Worker done — mark the row complete (the streamed code stays as its detail).
    fixActStep({ phase: 'worker', status: 'pass', label: 'Fix written', model: p2.workerLabel });
    
    return { workerResponse: p2.workerResponse, workerLabel: p2.workerLabel, originalWorkerProvider };
  } catch (err) {
    throw new Error(`Worker phase failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
