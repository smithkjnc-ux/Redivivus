// [SCOPE] Verify Phase for Escalation Loop
// Extracted from chatPanelMsgFixEscalation.ts (Rule 9 split).

import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';
import { fixLog } from '../../features/logging/data/fixPipelineLogger.js';
import { updateStatus, logExhaustedDeadEnd, isTruncationText } from './chatPanelMsgFixEscalationUtils.js';
import { runSupervisorSelfFix } from './chatPanelMsgFixSelfFix.js';
import { fixActStep } from './fixActivityPanel.js';

/** Phase 2.5 — Supervisor verifies the Worker's logic. Returns a directive for the loop:
 *  'pass' → continue to Guardian; 'retry' → loop again; 'fail' → caller throws (rejected after N tries).
 *  Pushes critiques in place; `forceSurgical` is true when a truncation was detected. */
export async function runVerifyStep(p: {
  diagnosis: string; workerResponse: string; deps: MessageHandlerDeps; root: string;
  conversation: any[]; supervisorLabel: string; attempt: number; maxRetries: number; critiques: string[];
}): Promise<{ action: 'pass' | 'retry' | 'fail'; message?: string; forceSurgical: boolean; verifySuggestion?: string }> {
  const { diagnosis, workerResponse, deps, root, conversation, supervisorLabel, attempt, maxRetries, critiques } = p;
  let forceSurgical = false;
  try {
    const { runSupervisorVerify } = await import('./chatPanelMsgFixVerify.js');
    const { runStaticCompilationGateForFix } = await import('../build/chatPanelBuildReview.js');
    
    // Deterministic Gate: Check syntax/compilation before waking up the LLM Guardian
    fixLog(`Static check (attempt ${attempt + 1}): Running deterministic compilation gate...`);
    const compileError = await runStaticCompilationGateForFix(workerResponse, root);
    
    if (compileError) {
      fixLog(`Static check FAILED (attempt ${attempt + 1})`, { issue: compileError.substring(0, 300) });
      fixActStep({ phase: 'supervisor', status: 'fix', label: "Code failed to compile — retrying", detail: compileError });
      critiques.push(`[COMPILATION ERROR] ${compileError}\n\nFix this error exactly as reported by the compiler.`);
      if (attempt < maxRetries) {
        conversation[conversation.length - 1].content =
          `Supervisor (${supervisorLabel}): done\nWorker: rejected — "Compilation error" — retrying...\nVerify: pending\nGuardian: pending`;
        return { action: 'retry', forceSurgical: false };
      }
      return { action: 'fail', message: compileError, forceSurgical: false };
    }

    const userRequest = conversation.map(m => m.role === 'user' ? m.content : '').filter(Boolean).pop() || 'Fix the issue';
    fixLog(`Supervisor verify (attempt ${attempt + 1}): Starting...`);
    const verifyResult = await runSupervisorVerify(diagnosis, workerResponse, userRequest, deps, root);
    fixLog(`Supervisor verify result`, { passed: verifyResult.passed, issues: verifyResult.issues });

    if (!verifyResult.passed) {
      const logicIssue = verifyResult.issues.join('; ') || 'Logic does not match intent';
      const verifySuggestion = verifyResult.suggestion;
      critiques.push(`[SUPERVISOR LOGIC CHECK] ${logicIssue}`);
      fixLog(`Supervisor REJECTED Worker logic (attempt ${attempt + 1})`, { issue: logicIssue.substring(0, 300) });
      fixActStep({ phase: 'supervisor', status: 'fix', label: "Checked the fix — it didn't match the intent, retrying", detail: logicIssue });

      if (isTruncationText(logicIssue) && attempt < maxRetries) {
        forceSurgical = true;
        fixLog(`[TRUNCATION DETECTED] Switching to surgical format for retry ${attempt + 2}`);
        critiques.push(`[FORMAT CHANGE] Previous attempt used FULL FILE but output was truncated. Use SURGICAL EDITS (SEARCH/REPLACE) instead for reliability.`);
      }

      if (attempt < maxRetries) {
        conversation[conversation.length - 1].content =
          `Supervisor (${supervisorLabel}): done\nWorker: rejected — "${logicIssue.slice(0, 80)}" — retrying...\nVerify: pending\nGuardian: pending`;
        return { action: 'retry', forceSurgical, verifySuggestion };
      }
      return { action: 'fail', message: logicIssue, forceSurgical, verifySuggestion };
    }
    fixActStep({ phase: 'supervisor', status: 'pass', label: 'Checked — the fix matches what you asked for' });
    return { action: 'pass', forceSurgical, verifySuggestion: undefined };
  } catch (e: any) {
    if (e.message?.startsWith('Supervisor rejected Worker output')) { throw e; }
    fixLog(`Supervisor verify skipped (error): ${e?.message || e}`);
    return { action: 'pass', forceSurgical };
  }
}

export type VerifyPhaseResult =
  | { action: 'continue_loop' }
  | { action: 'retry_loop' }
  | { action: 'break_loop', workerResponse: string, workerLabel: string, guardianNote: string }
  | { action: 'error', error: Error };

export async function runVerifyPhase(params: {
  escalated: boolean;
  conversation: any[];
  supervisorLabel: string;
  attempt: number;
  refresh: () => void;
  currentDiagnosis: string;
  workerResponse: string;
  deps: MessageHandlerDeps;
  root: string;
  maxRetries: number;
  accumulatedCritiques: string[];
  forceSurgical: boolean;
  fileNames: string;
  filesBlock: string;
  activePatterns: any[];
}): Promise<VerifyPhaseResult & { forceSurgical: boolean, escalated: boolean }> {
  let { forceSurgical, escalated } = params;
  const { conversation, supervisorLabel, attempt, refresh, currentDiagnosis, workerResponse, deps, root, maxRetries, accumulatedCritiques, fileNames, filesBlock, activePatterns } = params;

  if (escalated) return { action: 'continue_loop', forceSurgical, escalated };

  updateStatus(conversation, supervisorLabel, 'verify', attempt, escalated);
  refresh();
  
  const verify = await runVerifyStep({ diagnosis: currentDiagnosis, workerResponse, deps, root, conversation, supervisorLabel, attempt, maxRetries, critiques: accumulatedCritiques });
  
  if (verify.forceSurgical) { forceSurgical = true; }
  
  if (verify.verifySuggestion && verify.verifySuggestion.length > 20) {
    accumulatedCritiques.push(`[VERIFY SUGGESTED APPROACH] ${verify.verifySuggestion.slice(0, 500)}`);
    fixLog(`[VERIFY-HINT] Stashed Verify suggestion into critiques (${verify.verifySuggestion.length} chars)`);
  }
  
  if (verify.action === 'fail') {
    fixLog(`[VERIFY-EXHAUSTED] Worker failed all ${maxRetries + 1} Verify checks — routing to Supervisor self-fix`);
    escalated = true;
    logExhaustedDeadEnd(root, accumulatedCritiques, attempt, maxRetries, false);
    
    const selfFixResult = await runSupervisorSelfFix({ currentDiagnosis, accumulatedCritiques, supervisorLabel, conversation, refresh, fileNames, filesBlock, activePatterns, deps, root, forceSurgical, maxRetries });
    
    if (selfFixResult) {
      const guardianNote = `⚠️ Written by Supervisor directly after ${maxRetries + 1} Worker failures — please verify the fix worked as expected. If not, retry and past failures are logged.`;
      return { action: 'break_loop', workerResponse: selfFixResult.workerResponse, workerLabel: selfFixResult.workerLabel, guardianNote, forceSurgical, escalated };
    }
    
    return { action: 'error', error: new Error(`Supervisor rejected Worker output after ${maxRetries + 1} attempts. Last issue: ${verify.message}`), forceSurgical, escalated };
  }
  
  if (verify.action === 'retry') {
    return { action: 'retry_loop', forceSurgical, escalated };
  }

  return { action: 'continue_loop', forceSurgical, escalated };
}
