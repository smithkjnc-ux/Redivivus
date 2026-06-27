// [SCOPE] Guardian Review Phase for Escalation Loop
// Extracted from chatPanelMsgFixEscalation.ts (Rule 9 split).

import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';
import { fixLog } from '../../features/logging/data/fixPipelineLogger.js';
import { renderGuardianVerdict, represcribeAfterRejection, isTruncationText, type EscalationResult } from './chatPanelMsgFixEscalationUtils.js';

export type GuardianPhaseResult = 
  | { action: 'return', payload: EscalationResult }
  | { action: 'continue', forceSurgical: boolean, filesBlock: string, currentDiagnosis: string }
  | { action: 'error', guardianNote: string, guardianLabel: string };

export async function runGuardianPhase(params: {
  conversation: any[];
  supervisorLabel: string;
  attempt: number;
  escalated: boolean;
  currentDiagnosis: string;
  workerResponse: string;
  workerLabel: string;
  originalWorkerProvider: string;
  deps: MessageHandlerDeps;
  root: string;
  maxRetries: number;
  userText?: string;
  filesBlock: string;
  accumulatedCritiques: string[];
  projectDeadEnds?: string;
  buildContext?: string;
  activePatterns: any[];
  projectRules?: string;
  forceSurgical: boolean;
}): Promise<GuardianPhaseResult> {
  let { forceSurgical, filesBlock, currentDiagnosis } = params;
  const { conversation, supervisorLabel, attempt, escalated, workerResponse, workerLabel, originalWorkerProvider, deps, root, maxRetries, userText, accumulatedCritiques, projectDeadEnds, buildContext, activePatterns, projectRules } = params;
  
  let guardianLabel = 'AI';
  let guardianNote = '';
  let scopeNote = '';
  let needsAgentHandoff = false;

  try {
    const userRequest = conversation.map(m => m.role === 'user' ? m.content : '').filter(Boolean).pop() || 'Fix the issue';
    const guardianContext = `Original user request: "${userRequest}"\nSupervisor diagnosis:\n${currentDiagnosis}`;
    fixLog(`Guardian review (attempt ${attempt + 1}): Starting...`);
    fixLog(`Guardian context preview`, { context: guardianContext.substring(0, 300) });
    
    // [ROUTING PANEL] Force the user-chosen Guardian AI if set (no failover).
    const guardianWorkerHint = escalated && originalWorkerProvider ? originalWorkerProvider : workerLabel.toLowerCase();
    const guardianResult = await deps.routing.guardianReview(guardianContext, workerResponse, guardianWorkerHint, '', deps.routingOverrides?.guardian);
    fixLog(`Guardian review result`, { passed: guardianResult.passed, issueCount: guardianResult.issues?.length || 0 });
    
    // [FIX] Distinguish a REAL guardian verdict from the "couldn't run on any provider" fallback.
    const guardianRan = !!guardianResult.guardianAI && guardianResult.guardianAI !== 'none';
    const guardianProvider = guardianRan
      ? guardianResult.guardianAI
      : ((() => { try { return deps.routing.selectSupervisorAndWorker().supervisor; } catch { return ''; } })() || workerLabel || 'claude');

    const verdict = renderGuardianVerdict({ guardianRan, guardianResult, guardianProvider, workerResponse, root, deps });
    guardianLabel = verdict.guardianLabel;
    scopeNote = verdict.scopeNote;

    // Hand off when the Guardian uses any of its explicit "this needs the Agent" phrasings.
    if (guardianResult.issues?.some((issue: string) => /Simple Pipeline is insufficient|Routing to Agent|Agent Pipeline/i.test(issue))) {
      needsAgentHandoff = true;
      fixLog('Guardian routed to Agent Pipeline — handing off immediately (skipping Worker retries)');
      guardianNote = `Guardian (${guardianLabel}): routing to Agent for environment verification`;
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff: true, retryCount: attempt, escalated, forceSurgical } };
    }

    if (guardianResult.passed) {
      guardianNote = guardianRan
        ? `Guardian (${guardianLabel}): Approved`
        : `Guardian: skipped (no reviewer available — fix applied without final review)`;
      fixLog(guardianRan ? `Guardian APPROVED the fix` : `Guardian SKIPPED (no provider) — fix passed through unreviewed`);
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical } };
    }

    // [H2 degraded] Guardian infrastructure failure (no providers available / all failed) — NOT a code rejection.
    // Treat as skipped, not rejected — re-prescription with an infra error message is nonsensical and causes cascading errors.
    if (!guardianRan && guardianResult.guardianAI === 'none') {
      guardianNote = `Guardian: skipped (${guardianResult.issues?.[0]?.slice(0, 120) || 'all providers unavailable'})`;
      fixLog('Guardian SKIPPED — infrastructure failure, not a code rejection. Fix applied unreviewed.');
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel: 'skipped (unavailable)', guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical } };
    }

    // Guardian rejected WITHOUT corrected text — accumulate critique and retry
    const critique = guardianResult.issues?.join('; ') || 'Unknown issue';
    accumulatedCritiques.push(critique);
    fixLog(`Guardian REJECTED the fix (attempt ${attempt + 1})`, { critique: critique.substring(0, 300) });

    // [SELF-FIX] If escalated (Supervisor wrote this fix), don't re-enter the Worker loop
    if (escalated) {
      fixLog(`[SUPERVISOR-SELF-FIX] Guardian rejected Supervisor fix — returning with user warning`);
      guardianNote = `⚠️ Written by Supervisor directly after Worker failures, but Guardian flagged issues: ${critique.slice(0, 200)}. Please review manually or retry.`;
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical } };
    }

    // [FIX] Detect truncation errors and force surgical format on retry
    if (isTruncationText(critique) && attempt < maxRetries) {
      forceSurgical = true;
      fixLog(`[TRUNCATION DETECTED] Switching to surgical format for retry ${attempt + 2}`);
      accumulatedCritiques.push(`[FORMAT CHANGE] Previous attempt used FULL FILE but output was truncated. Use SURGICAL EDITS (SEARCH/REPLACE) instead for reliability.`);
    }

    // [STAGE 2] RE-PRESCRIPTION: Call Supervisor again with enriched context after Guardian rejection
    const rp = await represcribeAfterRejection({ attempt, maxRetries, userText, root, filesBlock, currentDiagnosis, accumulatedCritiques, projectDeadEnds, buildContext, activePatterns, projectRules, deps });
    filesBlock = rp.filesBlock;
    currentDiagnosis = rp.diagnosis;
    
    // [FIX] Inject hard DO_NOT_MODIFY constraints into the diagnosis itself
    const doNotFiles: string[] = [];
    for (const c of accumulatedCritiques) {
      const matches = c.matchAll(/(?:leaving|unchanged|do not (?:touch|modify)|should not (?:touch|modify)|must not (?:touch|modify)|only involve[^,]+,\s*leaving)\s+[`']?([\w./\\-]+\.[a-zA-Z0-9]{1,6})[`']?/gi);
      for (const m of matches) { if (!doNotFiles.includes(m[1])) { doNotFiles.push(m[1]); } }
    }
    if (doNotFiles.length > 0) {
      const constraint = `\n\n[WORKER CONSTRAINTS — ABSOLUTE]\nDO NOT MODIFY: ${doNotFiles.join(', ')}\nPrevious fix attempts failed because the Worker incorrectly modified these files. Your fix MUST leave them completely unchanged.`;
      currentDiagnosis = currentDiagnosis + constraint;
      fixLog(`[DIAG-CONSTRAINT] Injected DO_NOT_MODIFY into diagnosis: ${doNotFiles.join(', ')}`);
    }
    
    // [FIX] Re-prescription may return [AGENT_HANDOFF]
    if (/\\[AGENT_HANDOFF\\]/i.test(currentDiagnosis)) {
      needsAgentHandoff = true;
      fixLog('Re-prescription returned [AGENT_HANDOFF] — breaking out of escalation loop');
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote: 'Re-prescription routed to Agent pipeline', scopeNote, needsAgentHandoff: true, retryCount: attempt, escalated } };
    }

    return { action: 'continue', forceSurgical, filesBlock, currentDiagnosis };
  } catch {
    return { action: 'error', guardianNote: 'Guardian: skipped (error)', guardianLabel: 'skipped (error)' };
  }
}
