// [SCOPE] Autonomous Escalation Loop — retries Worker on Guardian rejection, escalates to smarter model if retries exhausted.
// Called by chatPanelMsgFix.ts in place of the old sequential Phase 2 + Phase 3 blocks.
// Step helpers live in chatPanelMsgFixEscalationUtils.ts (Rule 9 split); the loop control flow stays here.

import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';
import { fixLog } from '../../features/logging/data/fixPipelineLogger.js';
import { fixActStep, fixActCode } from './fixActivityPanel.js';
import { progressEscalating, progressRetrying } from './fixProgressStyle.js';
import {
  updateStatus, enrichDepsWithCritiques, renderGuardianVerdict,
  represcribeAfterRejection, logExhaustedDeadEnd, isTruncationText,
  type EscalationResult,
} from './chatPanelMsgFixEscalationUtils.js';
import { runSupervisorSelfFix } from './chatPanelMsgFixSelfFix.js';
import { runGuardianPhase } from './chatPanelMsgFixGuardianPhase.js';
import { runWorkerPhase } from './chatPanelMsgFixWorkerPhase.js';
import { runVerifyPhase } from './chatPanelMsgFixVerifyPhase.js';
// [DONE] EscalationResult interface moved to chatPanelMsgFixEscalationUtils.ts (Rule 9 split)
export type { EscalationResult } from './chatPanelMsgFixEscalationUtils.js';

/** Runs Phase 2 (Worker) → Phase 3 (Guardian) with automatic retry and escalation.
 *  [STAGE 2] Now includes re-prescription: Supervisor is called again after each Guardian
 *  rejection with full context of what failed and why, enabling new prescription strategies.
 */
export async function runEscalationLoop(params: {
  diagnosis: string;
  fileNames: string;
  filesBlock: string;
  activePatterns: any[];
  deps: MessageHandlerDeps;
  root: string;
  supervisorLabel: string;
  maxRetries?: number;
  forceSurgical?: boolean;
  // [STAGE 2] NEW parameters for re-prescription after Guardian rejection:
  userText?: string;        // original user request
  buildContext?: string;    // build context for Supervisor
  projectDeadEnds?: string; // existing dead ends from dead_ends.md
  projectRules?: string;    // project rules for Supervisor
}): Promise<EscalationResult> {
  const { diagnosis, fileNames, filesBlock: initialFilesBlock, activePatterns, deps, root, supervisorLabel, forceSurgical: initialForceSurgical } = params;
  const { userText, buildContext, projectDeadEnds, projectRules } = params;
  const maxRetries = params.maxRetries ?? 2;
  const { routing, conversation, refresh } = deps;

  let workerResponse = '';
  let workerLabel = 'AI';
  let originalWorkerProvider = ''; // tracks the Worker's provider before self-fix overrides workerLabel
  let guardianLabel = 'AI';
  let guardianNote = '';
  let scopeNote = '';
  let needsAgentHandoff = false;
  let retryCount = 0; let escalated = false;
  let forceSurgical = !!initialForceSurgical;
  let supervisorSelfFixReady = false; // set true when self-fix bypasses loop to go to Guardian
  // [FIX] Tracks if truncation forced surgical format

  // [WARN] Accumulates Guardian critiques across retries so the Worker learns from ALL past failures
  let accumulatedCritiques: string[] = [];

  // [STAGE 2] Track mutable state for re-prescription
  let currentDiagnosis = diagnosis;
  let filesBlock = initialFilesBlock;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // ── Phase 2: Worker generates fix ──
    const workerPhaseResult = await runWorkerPhase({
      escalated, originalWorkerProvider, deps, conversation, supervisorLabel, attempt, refresh, accumulatedCritiques, currentDiagnosis, fileNames, filesBlock, activePatterns, root, forceSurgical
    });
    workerResponse = workerPhaseResult.workerResponse;
    workerLabel = workerPhaseResult.workerLabel;
    originalWorkerProvider = workerPhaseResult.originalWorkerProvider;

    // ── Check for Trivial Fast-Path ──
    const isTrivial = currentDiagnosis.includes('[TRIVIAL: SKIP REVIEW]');
    if (isTrivial) {
      fixLog(`Supervisor flagged fix as trivial — skipping Verify and Guardian`);
      guardianNote = `Guardian: Skipped (trivial fix)`;
      return { finalResponse: workerResponse, workerLabel, guardianLabel: 'skipped (trivial)', guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated };
    }

    // ── Phase 2.5: Supervisor verifies Worker logic ──
    const verifyPhaseResult = await runVerifyPhase({
      escalated, conversation, supervisorLabel, attempt, refresh, currentDiagnosis, workerResponse, deps, root, maxRetries, accumulatedCritiques, forceSurgical, fileNames, filesBlock, activePatterns
    });

    forceSurgical = verifyPhaseResult.forceSurgical;
    escalated = verifyPhaseResult.escalated;

    if (verifyPhaseResult.action === 'error') throw verifyPhaseResult.error;
    if (verifyPhaseResult.action === 'retry_loop') { refresh(); continue; }
    if (verifyPhaseResult.action === 'break_loop') {
      workerResponse = verifyPhaseResult.workerResponse;
      workerLabel = verifyPhaseResult.workerLabel;
      guardianNote = verifyPhaseResult.guardianNote;
      supervisorSelfFixReady = true;
      break;
    }

    try {
      // ── Phase 3: Guardian reviews the fix ──
      updateStatus(conversation, supervisorLabel, 'guardian', attempt, escalated);
      refresh();

      const guardianPhaseResult = await runGuardianPhase({
        conversation, supervisorLabel, attempt, escalated, currentDiagnosis, workerResponse, workerLabel, originalWorkerProvider, deps, root, maxRetries, userText, filesBlock, accumulatedCritiques, projectDeadEnds, buildContext, activePatterns, projectRules, forceSurgical
      });

      if (guardianPhaseResult.action === 'return' && guardianPhaseResult.payload) {
        return guardianPhaseResult.payload;
      } else if (guardianPhaseResult.action === 'error') {
        guardianNote = guardianPhaseResult.guardianNote;
        return { finalResponse: workerResponse, workerLabel, guardianLabel: guardianPhaseResult.guardianLabel || 'skipped (error)', guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical };
      } else if (guardianPhaseResult.action === 'continue') {
        forceSurgical = guardianPhaseResult.forceSurgical;
        filesBlock = guardianPhaseResult.filesBlock;
        currentDiagnosis = guardianPhaseResult.currentDiagnosis;
      }

      // If we've exhausted Worker retries — have the Supervisor write the fix directly
      if (attempt === maxRetries && !escalated) {
        escalated = true;
        fixLog(`[SUPERVISOR-SELF-FIX] Worker failed ${maxRetries + 1} times — Supervisor writing fix directly`);
        // Log Worker failures to dead_ends + knowledge.json NOW — before self-fix — so they
        // persist even if the Supervisor self-fix passes Guardian and the loop returns success.
        logExhaustedDeadEnd(root, accumulatedCritiques, attempt, maxRetries, false);
        const selfFixResult = await runSupervisorSelfFix({ currentDiagnosis, accumulatedCritiques, supervisorLabel, conversation, refresh, fileNames, filesBlock, activePatterns, deps, root, forceSurgical, maxRetries });
        if (selfFixResult) {
          workerResponse = selfFixResult.workerResponse;
          workerLabel = selfFixResult.workerLabel;
          guardianNote = `⚠️ Written by Supervisor directly after ${maxRetries + 1} Worker failures — please verify the fix worked as expected. If not, retry and past failures are logged.`;
          continue; // go straight to Guardian (Verify skipped via escalated flag)
        }
        // Self-fix failed or returned nothing — fall through to exhausted
        break;
      }

      // Log the retry in chat
      if (attempt < maxRetries) {
        const critique = accumulatedCritiques[accumulatedCritiques.length - 1] || 'Unknown issue';
        conversation[conversation.length - 1].content =
          progressRetrying({ supervisorLabel, retryCount: attempt, critique });
        refresh();
      }
    } catch {
      guardianNote = 'Guardian: skipped (error)';
      return { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical };
    }
  }

  // ── Post-loop: Guardian review for Supervisor self-fix (Verify-exhaustion path) ──
  if (supervisorSelfFixReady) {
    try {
      updateStatus(conversation, supervisorLabel, 'guardian', maxRetries, escalated);
      refresh();
      const userRequest = conversation.map(m => m.role === 'user' ? m.content : '').filter(Boolean).pop() || 'Fix the issue';
      const guardianContext = `Original user request: "${userRequest}"\nSupervisor diagnosis:\n${currentDiagnosis}`;
      const guardianResult = await routing.guardianReview(guardianContext, workerResponse, workerLabel.toLowerCase(), '', deps.routingOverrides?.guardian);
      const guardianRan = !!guardianResult.guardianAI && guardianResult.guardianAI !== 'none';
      const guardianProvider = guardianRan ? guardianResult.guardianAI : ((() => { try { return routing.selectSupervisorAndWorker().supervisor; } catch { return ''; } })() || workerLabel || 'claude');
      const verdict = renderGuardianVerdict({ guardianRan, guardianResult, guardianProvider, workerResponse, root, deps });
      guardianLabel = verdict.guardianLabel;
      scopeNote = verdict.scopeNote;
      // Guardian approval or rejection — either way return the Supervisor's fix with the warning note
      fixLog(`[SUPERVISOR-SELF-FIX] Guardian result: ${guardianResult.passed ? 'passed' : 'rejected'}`);
    } catch {
      guardianLabel = 'skipped (error)';
    }
    return { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: maxRetries + 1, escalated, forceSurgical };
  }

  // All retries + escalation exhausted
  // [FIX] Loop runs attempt 0..maxRetries inclusive = maxRetries+1 total attempts.
  // Previously reported retryCount=maxRetries (e.g. "2 retries" when 3 attempts ran).
  const totalAttempts = maxRetries + 1;
  guardianNote = `Guardian (${guardianLabel}): Failed after ${totalAttempts} attempt${totalAttempts !== 1 ? 's' : ''}${escalated ? ' + escalation' : ''}. Applying best available fix.`;
  logExhaustedDeadEnd(root, accumulatedCritiques, totalAttempts, maxRetries, escalated);
  return { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: totalAttempts, escalated, forceSurgical, accumulatedCritiques };
}
