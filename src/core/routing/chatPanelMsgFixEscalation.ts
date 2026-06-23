// [SCOPE] Autonomous Escalation Loop — retries Worker on Guardian rejection, escalates to smarter model if retries exhausted.
// Called by chatPanelMsgFix.ts in place of the old sequential Phase 2 + Phase 3 blocks.
// Step helpers live in chatPanelMsgFixEscalationUtils.ts (Rule 9 split); the loop control flow stays here.

import type { MessageHandlerDeps } from './chatPanelMessages';
import { fixLog } from '../../services/logging/fixPipelineLogger';
import { fixActStep, fixActCode } from './fixActivityPanel.js';
import { progressEscalating, progressRetrying } from '../../services/ui/fixProgressStyle.js';
import {
  updateStatus, enrichDepsWithCritiques, runVerifyStep, renderGuardianVerdict,
  represcribeAfterRejection, logExhaustedDeadEnd, isTruncationText,
  type EscalationResult,
} from './chatPanelMsgFixEscalationUtils.js';
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
      // [STAGE 2] Use currentDiagnosis (may be updated by re-prescription)
      const p2 = await runPhase2Worker(currentDiagnosis, fileNames, filesBlock, activePatterns, enrichedDeps, root, onChunk, escalated, forceSurgical);
      if (!p2) { throw new Error('Worker returned null'); }
      workerResponse = p2.workerResponse;
      workerLabel = p2.workerLabel;
      // [FIX-ACTIVITY] Worker done — mark the row complete (the streamed code stays as its detail).
      fixActStep({ phase: 'worker', status: 'pass', label: 'Fix written', model: workerLabel });
    } catch (err) {
      throw new Error(`Worker phase failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── Check for Trivial Fast-Path ──
    const isTrivial = currentDiagnosis.includes('[TRIVIAL: SKIP REVIEW]');
    if (isTrivial) {
      fixLog(`Supervisor flagged fix as trivial — skipping Verify and Guardian`);
      guardianNote = `Guardian: Skipped (trivial fix)`;
      return { finalResponse: workerResponse, workerLabel, guardianLabel: 'skipped (trivial)', guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated };
    }

    // ── Phase 2.5: Supervisor verifies Worker logic ──
    // [SELF-FIX] Skip Verify when escalated — Supervisor wrote this fix itself, so Verify
    // would be grading its own homework. Guardian is the only independent gate here.
    if (!escalated) {
      updateStatus(conversation, supervisorLabel, 'verify', attempt, escalated);
      refresh();
      const verify = await runVerifyStep({ diagnosis: currentDiagnosis, workerResponse, deps, root, conversation, supervisorLabel, attempt, maxRetries, critiques: accumulatedCritiques });
      if (verify.forceSurgical) { forceSurgical = true; }
      if (verify.verifySuggestion && verify.verifySuggestion.length > 20) {
        accumulatedCritiques.push(`[VERIFY SUGGESTED APPROACH] ${verify.verifySuggestion.slice(0, 500)}`);
        fixLog(`[VERIFY-HINT] Stashed Verify suggestion into critiques (${verify.verifySuggestion.length} chars)`);
      }
      if (verify.action === 'fail') {
        // [SELF-FIX] Worker exhausted all Verify attempts — route to Supervisor self-fix
        // instead of throwing, same as Guardian exhaustion path.
        fixLog(`[VERIFY-EXHAUSTED] Worker failed all ${maxRetries + 1} Verify checks — routing to Supervisor self-fix`);
        escalated = true;
        logExhaustedDeadEnd(root, accumulatedCritiques, attempt, maxRetries, false);
        try {
          const { runPhase1Supervisor } = await import('./chatPanelMsgFixPhases.js');
          const failureSummary = accumulatedCritiques
            .filter(c => !c.startsWith('[VERIFY SUGGESTED APPROACH]'))
            .map((c, i) => `Attempt ${i + 1} failed: ${c.slice(0, 200)}`).join('\n');
          const verifySuggestions = accumulatedCritiques
            .filter(c => c.startsWith('[VERIFY SUGGESTED APPROACH]'))
            .map(c => c.replace('[VERIFY SUGGESTED APPROACH] ', '').slice(0, 400)).join('\n');
          const selfFixInstruction = `${userText || 'Fix the issue'}\n\n[SELF-FIX MODE: DO NOT produce a diagnosis for a Worker. Write the complete code fix directly using SEARCH/REPLACE surgical edit format.]\n\nWorker failed all Verify checks:\n${failureSummary}${verifySuggestions ? `\n\nVerify AI suggested the correct approach:\n${verifySuggestions}` : ''}`;
          const enrichedDeadEnds = [projectDeadEnds, failureSummary].filter(Boolean).join('\n\n');
          fixActStep({ phase: 'supervisor', status: 'running', label: 'Worker exhausted — Supervisor writing fix directly' });
          conversation[conversation.length - 1].content = progressEscalating({ supervisorLabel });
          refresh();
          const selfFix = await runPhase1Supervisor(selfFixInstruction, filesBlock, buildContext || '', activePatterns, enrichedDeadEnds, projectRules || '', deps, root, undefined, undefined, true);
          if (selfFix?.diagnosis && selfFix.diagnosis.length > 50) {
            workerResponse = selfFix.diagnosis;
            workerLabel = selfFix.supervisorLabel;
            fixActStep({ phase: 'worker', status: 'pass', label: 'Supervisor wrote fix directly', model: workerLabel });
            fixLog(`[SUPERVISOR-SELF-FIX] Supervisor produced fix after Verify exhaustion (${workerResponse.length} chars)`);
            guardianNote = `⚠️ Written by Supervisor directly after ${maxRetries + 1} Worker failures — please verify the fix worked as expected. If not, retry and past failures are logged.`;
            supervisorSelfFixReady = true;
            break; // exit loop — handled below before exhausted block
          }
        } catch (sfErr) {
          fixLog(`[SUPERVISOR-SELF-FIX] Failed after Verify exhaustion: ${sfErr instanceof Error ? sfErr.message : String(sfErr)}`);
        }
        throw new Error(`Supervisor rejected Worker output after ${maxRetries + 1} attempts. Last issue: ${verify.message}`);
      }
      if (verify.action === 'retry') {
        refresh(); continue;
      }
    }

    // ── Phase 3: Guardian reviews the fix ──
    updateStatus(conversation, supervisorLabel, 'guardian', attempt, escalated);
    refresh();

    try {
      const userRequest = conversation.map(m => m.role === 'user' ? m.content : '').filter(Boolean).pop() || 'Fix the issue';
      const guardianContext = `Original user request: "${userRequest}"\nSupervisor diagnosis:\n${currentDiagnosis}`;
      fixLog(`Guardian review (attempt ${attempt + 1}): Starting...`);
      fixLog(`Guardian context preview`, { context: guardianContext.substring(0, 300) });
      // [ROUTING PANEL] Force the user-chosen Guardian AI if set (no failover).
      const guardianResult = await routing.guardianReview(guardianContext, workerResponse, workerLabel.toLowerCase(), '', deps.routingOverrides?.guardian);
      fixLog(`Guardian review result`, { passed: guardianResult.passed, issueCount: guardianResult.issues?.length || 0 });
      // [FIX] Distinguish a REAL guardian verdict from the "couldn't run on any provider" fallback. routingGuardian
      // returns guardianAI:'none' when EVERY provider failed — that is NOT an approval, it's an unreviewed pass.
      const guardianRan = !!guardianResult.guardianAI && guardianResult.guardianAI !== 'none';
      const guardianProvider = guardianRan
        ? guardianResult.guardianAI
        : ((() => { try { return routing.selectSupervisorAndWorker().supervisor; } catch { return ''; } })() || workerLabel || 'claude');

      const verdict = renderGuardianVerdict({ guardianRan, guardianResult, guardianProvider, workerResponse, root, deps });
      guardianLabel = verdict.guardianLabel;
      scopeNote = verdict.scopeNote;

      // Hand off when the Guardian uses any of its explicit "this needs the Agent" phrasings.
      if (guardianResult.issues?.some((issue: string) => /Simple Pipeline is insufficient|Routing to Agent|Agent Pipeline/i.test(issue))) {
        needsAgentHandoff = true;
        // [HANDOFF] Guardian says the simple pipeline can't do this → route to the Agent. Return NOW so
        // runFixFinalize calls executeAgentHandoff (the live run_command Tool-Gap path) instead of burning
        // Worker retries the Guardian already said can't succeed (the old bug: retried 3x, then died).
        fixLog('Guardian routed to Agent Pipeline — handing off immediately (skipping Worker retries)');
        guardianNote = `Guardian (${guardianLabel}): routing to Agent for environment verification`;
        return { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff: true, retryCount: attempt, escalated, forceSurgical };
      }

      if (guardianResult.passed) {
        guardianNote = guardianRan
          ? `Guardian (${guardianLabel}): Approved`
          : `Guardian: skipped (no reviewer available — fix applied without final review)`;
        fixLog(guardianRan ? `Guardian APPROVED the fix` : `Guardian SKIPPED (no provider) — fix passed through unreviewed`);
        return { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical };
      }

      // Guardian rejected WITHOUT corrected text — accumulate critique and retry
      const critique = guardianResult.issues?.join('; ') || 'Unknown issue';
      accumulatedCritiques.push(critique);
      fixLog(`Guardian REJECTED the fix (attempt ${attempt + 1})`, { critique: critique.substring(0, 300) });

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
      // [FIX] Inject hard DO_NOT_MODIFY constraints into the diagnosis itself — files the Verify/Guardian
      // said to leave untouched. This lives inside the diagnosis (the Worker's primary instruction source)
      // rather than as a separate appended block, so it carries Supervisor-level authority.
      {
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
      }
      // [FIX] Re-prescription may return [AGENT_HANDOFF] — the outer guard in chatPanelMsgFix.ts only
      // checks the original diagnosis, so this path was missed. The Worker receiving [AGENT_HANDOFF] as
      // its prescription produces garbage on the next attempt. Break out and signal agent handoff instead.
      if (/\[AGENT_HANDOFF\]/i.test(currentDiagnosis)) {
        needsAgentHandoff = true;
        fixLog('Re-prescription returned [AGENT_HANDOFF] — breaking out of escalation loop');
        return { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote: 'Re-prescription routed to Agent pipeline', scopeNote, needsAgentHandoff: true, retryCount: attempt, escalated };
      }

      // If we've exhausted Worker retries — have the Supervisor write the fix directly
      if (attempt === maxRetries && !escalated) {
        escalated = true;
        fixLog(`[SUPERVISOR-SELF-FIX] Worker failed ${maxRetries + 1} times — Supervisor writing fix directly`);
        fixActStep({ phase: 'supervisor', status: 'running', label: `Worker exhausted — Supervisor writing fix directly` });
        conversation[conversation.length - 1].content = progressEscalating({ supervisorLabel });
        refresh();
        // Log Worker failures to dead_ends + knowledge.json NOW — before self-fix — so they
        // persist even if the Supervisor self-fix passes Guardian and the loop returns success.
        logExhaustedDeadEnd(root, accumulatedCritiques, attempt, maxRetries, false);
        try {
          const { runPhase1Supervisor } = await import('./chatPanelMsgFixPhases.js');
          const failureSummary = accumulatedCritiques
            .filter(c => !c.startsWith('[VERIFY SUGGESTED APPROACH]'))
            .map((c, i) => `Attempt ${i + 1} failed: ${c.slice(0, 200)}`).join('\n');
          const verifySuggestions = accumulatedCritiques
            .filter(c => c.startsWith('[VERIFY SUGGESTED APPROACH]'))
            .map(c => c.replace('[VERIFY SUGGESTED APPROACH] ', '').slice(0, 300)).join('\n');
          const selfFixInstruction = `${userText || 'Fix the issue'}\n\n[SELF-FIX MODE: DO NOT produce a diagnosis for a Worker. Write the complete code fix directly in your response using SEARCH/REPLACE surgical edit format.]\n\nPrevious Worker attempts all failed:\n${failureSummary}${verifySuggestions ? `\n\nVerify AI suggested approaches:\n${verifySuggestions}` : ''}`;
          const enrichedDeadEnds = [projectDeadEnds, failureSummary].filter(Boolean).join('\n\n');
          const selfFix = await runPhase1Supervisor(selfFixInstruction, filesBlock, buildContext || '', activePatterns, enrichedDeadEnds, projectRules || '', deps, root, undefined, undefined, true);
          if (selfFix?.diagnosis && selfFix.diagnosis.length > 50) {
            workerResponse = selfFix.diagnosis; // Supervisor output IS the fix
            workerLabel = selfFix.supervisorLabel;
            fixActStep({ phase: 'worker', status: 'pass', label: 'Supervisor wrote fix directly', model: workerLabel });
            fixLog(`[SUPERVISOR-SELF-FIX] Supervisor produced fix (${workerResponse.length} chars)`);
            // Flag for the result card — user should manually verify this fix
            guardianNote = `⚠️ Written by Supervisor directly after ${maxRetries + 1} Worker failures — please verify the fix worked as expected. If not, retry and past failures are logged.`;
            // Skip re-prescription — go straight to Guardian (Verify skipped via escalated flag)
            continue;
          }
        } catch (sfErr) {
          fixLog(`[SUPERVISOR-SELF-FIX] Failed: ${sfErr instanceof Error ? sfErr.message : String(sfErr)}`);
        }
        // Self-fix failed or returned nothing — fall through to exhausted
        break;
      }

      // Log the retry in chat
      if (attempt < maxRetries) {
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
