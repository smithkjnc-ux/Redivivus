// [SCOPE] Supervisor Self-Fix Pipeline — invoked when Worker exhausts retries
// Extracted from chatPanelMsgFixEscalation.ts (Rule 9 split).

import type { MessageHandlerDeps } from './chatPanelMessages';
import { fixLog } from '../../services/logging/fixPipelineLogger';
import { fixActStep } from './fixActivityPanel.js';
import { progressEscalating } from '../../services/ui/fixProgressStyle.js';

export async function runSupervisorSelfFix(params: {
  currentDiagnosis: string;
  accumulatedCritiques: string[];
  supervisorLabel: string;
  conversation: any[];
  refresh: () => void;
  fileNames: string;
  filesBlock: string;
  activePatterns: any[];
  deps: MessageHandlerDeps;
  root: string;
  forceSurgical: boolean;
  maxRetries: number;
}): Promise<{ workerResponse: string, workerLabel: string } | null> {
  const { currentDiagnosis, accumulatedCritiques, supervisorLabel, conversation, refresh, fileNames, filesBlock, activePatterns, deps, root, forceSurgical, maxRetries } = params;
  
  try {
    const { runPhase2Worker } = await import('./chatPanelMsgFixPhases.js');
    const failureSummary = accumulatedCritiques
      .filter(c => !c.startsWith('[VERIFY SUGGESTED APPROACH]'))
      .map((c, i) => `Attempt ${i + 1} failed: ${c.slice(0, 200)}`).join('\n');
    const verifySuggestions = accumulatedCritiques
      .filter(c => c.startsWith('[VERIFY SUGGESTED APPROACH]'))
      .map(c => c.replace('[VERIFY SUGGESTED APPROACH] ', '').slice(0, 400)).join('\n');
    
    // Build a diagnosis that IS the correct approach — Worker prompt on Supervisor model
    const selfFixDiagnosis = `${currentDiagnosis}\n\n[SELF-FIX — SUPERVISOR MODEL WRITING DIRECTLY]\nWORKER_TIER: ultra\nAll previous Worker attempts failed. You are the Supervisor model writing the fix yourself.\nUse SURGICAL SEARCH/REPLACE edits ONLY — do NOT rewrite entire files.\nPrevious attempts failed because:\n${failureSummary}${verifySuggestions ? `\n\nThe correct approach (from Verify analysis):\n${verifySuggestions}\nImplement this exactly using surgical edits.` : ''}`;
    
    fixActStep({ phase: 'supervisor', status: 'running', label: 'Worker exhausted — Supervisor writing fix directly' });
    conversation[conversation.length - 1].content = progressEscalating({ supervisorLabel });
    refresh();
    
    const selfFix = await runPhase2Worker(selfFixDiagnosis, fileNames, filesBlock, activePatterns, deps, root, undefined, true /* escalated=Supervisor model */, forceSurgical);
    
    if (selfFix?.workerResponse && selfFix.workerResponse.length > 50) {
      const workerResponse = selfFix.workerResponse;
      const workerLabel = selfFix.workerLabel || supervisorLabel;
      fixActStep({ phase: 'worker', status: 'pass', label: 'Supervisor wrote fix directly', model: workerLabel });
      fixLog(`[SUPERVISOR-SELF-FIX] Supervisor produced fix (${workerResponse.length} chars)`);
      return { workerResponse, workerLabel };
    }
  } catch (sfErr) {
    fixLog(`[SUPERVISOR-SELF-FIX] Failed: ${sfErr instanceof Error ? sfErr.message : String(sfErr)}`);
  }
  return null;
}
