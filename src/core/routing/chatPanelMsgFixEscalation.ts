// [SCOPE] Autonomous Escalation Loop — retries Worker on Guardian rejection, escalates to smarter model if retries exhausted.
// Called by chatPanelMsgFix.ts in place of the old sequential Phase 2 + Phase 3 blocks.

import type { MessageHandlerDeps } from './chatPanelMessages';
import { modelLabel } from './chatPanelMsgFixUtils';
import { fixLog } from '../../services/logging/fixPipelineLogger';
import { appendProjectDeadEnd } from './chatPanelMsgFixDeadEnds';
import { fixActStep, fixActCode } from './fixActivityPanel.js';

export interface EscalationResult {
  finalResponse: string;
  workerLabel: string;
  guardianLabel: string;
  guardianNote: string;
  scopeNote: string;
  needsAgentHandoff: boolean;
  retryCount: number;
  escalated: boolean;
  forceSurgical?: boolean; // [FIX] When true, retry with surgical format instead of FULL FILE
  accumulatedCritiques?: string[]; // [FIX] Guardian rejection reasons for dead end logging
}

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
  let forceSurgical = !!initialForceSurgical; // [FIX] Tracks if truncation forced surgical format

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
    const isTrivial = diagnosis.includes('[TRIVIAL: SKIP REVIEW]');
    if (isTrivial) {
      fixLog(`Supervisor flagged fix as trivial — skipping Verify and Guardian`);
      guardianNote = `Guardian: Skipped (trivial fix)`;
      return { finalResponse: workerResponse, workerLabel, guardianLabel: 'none', guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated };
    }

    // ── Phase 2.5: Supervisor verifies Worker logic ──
    updateStatus(conversation, supervisorLabel, 'verify', attempt, escalated);
    refresh();

    try {
      const { runSupervisorVerify } = await import('./chatPanelMsgFixVerify.js');
      const userRequest = conversation.map(m => m.role === 'user' ? m.content : '').filter(Boolean).pop() || 'Fix the issue';
      fixLog(`Supervisor verify (attempt ${attempt + 1}): Starting...`);
      const verifyResult = await runSupervisorVerify(diagnosis, workerResponse, userRequest, deps, root);
      fixLog(`Supervisor verify result`, { passed: verifyResult.passed, issues: verifyResult.issues });

      if (!verifyResult.passed) {
        const logicIssue = verifyResult.issues.join('; ') || 'Logic does not match intent';
        accumulatedCritiques.push(`[SUPERVISOR LOGIC CHECK] ${logicIssue}`);
        fixLog(`Supervisor REJECTED Worker logic (attempt ${attempt + 1})`, { issue: logicIssue.substring(0, 300) });
        // [FIX-ACTIVITY] Verify step — show WHAT was different from what the fix should be (the logic mismatch).
        fixActStep({ phase: 'supervisor', status: 'fix', label: "Checked the fix — it didn't match the intent, retrying", detail: logicIssue });

        // [FIX] Detect truncation errors and force surgical format on retry
        const isTruncated = /truncated|incomplete|cuts off mid-function|max_tokens|finish_reason.*length/i.test(logicIssue);
        if (isTruncated && attempt < maxRetries) {
          forceSurgical = true;
          fixLog(`[TRUNCATION DETECTED] Switching to surgical format for retry ${attempt + 2}`);
          accumulatedCritiques.push(`[FORMAT CHANGE] Previous attempt used FULL FILE but output was truncated. Use SURGICAL EDITS (SEARCH/REPLACE) instead for reliability.`);
        }

        if (attempt < maxRetries) {
          conversation[conversation.length - 1].content =
            `Supervisor (${supervisorLabel}): done\nWorker: rejected \u2014 "${logicIssue.slice(0, 80)}" \u2014 retrying...\nVerify: pending\nGuardian: pending`;
          refresh();
          continue;
        } else {
          throw new Error(`Supervisor rejected Worker output after ${maxRetries + 1} attempts. Last issue: ${logicIssue}`);
        }
      }
      // [FIX-ACTIVITY] Verify passed — the fix matches the intent.
      fixActStep({ phase: 'supervisor', status: 'pass', label: 'Checked — the fix matches what you asked for' });
    } catch (e: any) {
      if (e.message?.startsWith('Supervisor rejected Worker output')) throw e;
      fixLog(`Supervisor verify skipped (error): ${e?.message || e}`);
    }

    // ── Phase 3: Guardian reviews the fix ──
    updateStatus(conversation, supervisorLabel, 'guardian', attempt, escalated);
    refresh();

    try {
      const userRequest = conversation.map(m => m.role === 'user' ? m.content : '').filter(Boolean).pop() || 'Fix the issue';
      const guardianContext = `Original user request: "${userRequest}"\nSupervisor diagnosis:\n${diagnosis}`;
      fixLog(`Guardian review (attempt ${attempt + 1}): Starting...`);
      fixLog(`Guardian context preview`, { context: guardianContext.substring(0, 300) });
      const guardianResult = await routing.guardianReview(guardianContext, workerResponse, workerLabel.toLowerCase(), '');
      fixLog(`Guardian review result`, { passed: guardianResult.passed, issueCount: guardianResult.issues?.length || 0 });
      // [FIX-ACTIVITY] Guardian verdict — approved, or the issues it wants addressed (expandable detail).
      fixActStep({ phase: 'guardian', status: guardianResult.passed ? 'pass' : 'fix',
        label: guardianResult.passed ? 'Final review — approved' : 'Final review found issues — improving',
        detail: (guardianResult.issues || []).join('\n') || undefined,
        model: modelLabel(guardianResult.guardianAI || '') });
      if (guardianResult.issues?.length) {
        fixLog(`Guardian issues found`, { issues: guardianResult.issues });
      }
      deps.usageTracker?.recordUsage(
        Math.ceil(workerResponse.length / 4), 0,
        guardianResult.guardianAI || '', guardianResult.inputTokens, guardianResult.outputTokens,
        'guardian', require('path').basename(root)
      );

      if (guardianResult.scopeAlerts?.length) {
        scopeNote = `\n\n**Guardian also noticed (not applied -- say "also fix..." to address):**\n${guardianResult.scopeAlerts.map((a: string) => `- ${a}`).join('\n')}`;
      }
      guardianLabel = modelLabel(guardianResult.guardianAI || '');

      // Check Simple Pipeline insufficiency
      if (guardianResult.issues?.some((issue: string) => issue.includes("Simple Pipeline is insufficient"))) {
        needsAgentHandoff = true;
      }

      if (guardianResult.passed) {
        guardianNote = `Guardian (${guardianLabel}): Approved`;
        fixLog(`Guardian APPROVED the fix`);
        return { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical };
      }

      // Guardian rejected WITHOUT corrected text — accumulate critique and retry
      const critique = guardianResult.issues?.join('; ') || 'Unknown issue';
      accumulatedCritiques.push(critique);
      fixLog(`Guardian REJECTED the fix (attempt ${attempt + 1})`, { critique: critique.substring(0, 300) });

      // [FIX] Detect truncation errors and force surgical format on retry
      const isTruncated = /truncated|incomplete|cuts off mid-function|max_tokens|finish_reason.*length/i.test(critique);
      if (isTruncated && attempt < maxRetries) {
        forceSurgical = true;
        fixLog(`[TRUNCATION DETECTED] Switching to surgical format for retry ${attempt + 2}`);
        accumulatedCritiques.push(`[FORMAT CHANGE] Previous attempt used FULL FILE but output was truncated. Use SURGICAL EDITS (SEARCH/REPLACE) instead for reliability.`);
      }

      // [STAGE 2] RE-PRESCRIPTION: Call Supervisor again with enriched context after Guardian rejection
      if (attempt < maxRetries && userText) {
        fixLog(`[RE-PRESCRIBE] Guardian rejected attempt ${attempt + 1} — calling Supervisor for new prescription`);
        try {
          // Re-read file contents after failed attempt (file may have changed or not depending on truncation)
          const { collectSourceFiles } = await import('./chatPanelMsgFixContext.js');
          const refreshedFiles = collectSourceFiles(root, userText);
          if (refreshedFiles && refreshedFiles.length > 0) {
            filesBlock = refreshedFiles.map((f: { rel: string; content: string }) => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');
            fixLog(`[RE-PRESCRIBE] Refreshed file contents for re-prescription (${refreshedFiles.length} files)`);
          }

          // Build enriched dead ends including this session's accumulated failures
          const sessionDeadEnds = accumulatedCritiques
            .map((c, i) => `## Attempt ${i + 1} failed\n- What was tried: ${currentDiagnosis.slice(0, 100).replace(/\n/g, ' ')}...\n- Why it failed: ${c}\n- Do NOT repeat this approach`)
            .join('\n\n');
          const enrichedDeadEnds = [projectDeadEnds, sessionDeadEnds].filter(Boolean).join('\n\n---\n\n');

          const { runPhase1Supervisor } = await import('./chatPanelMsgFixPhases.js');
          const rePrescription = await runPhase1Supervisor(
            userText,
            filesBlock,
            buildContext || '',
            activePatterns,
            enrichedDeadEnds,
            projectRules || '',
            deps,
            root,
            undefined, undefined,
            true  // isRetry = true
          );

          if (rePrescription && rePrescription.diagnosis) {
            const oldDiagnosis = currentDiagnosis.slice(0, 80);
            currentDiagnosis = rePrescription.diagnosis;
            fixLog(`[RE-PRESCRIBE] New prescription received`, {
              oldPreview: oldDiagnosis + '...',
              newPreview: currentDiagnosis.substring(0, 200) + '...'
            });
          } else {
            fixLog(`[RE-PRESCRIBE] Supervisor returned no new diagnosis, continuing with original prescription`);
          }
        } catch (err) {
          fixLog(`[RE-PRESCRIBE] Re-prescription failed, continuing with original prescription`, {
            err: err instanceof Error ? err.message : String(err)
          });
          // Non-fatal — fall through to retry with original/current prescription
        }
      }

      // If we've exhausted retries, escalate to supervisor model
      if (attempt === maxRetries && !escalated) {
        escalated = true;
        conversation[conversation.length - 1].content =
          `Supervisor (${supervisorLabel}): done\nWorker: retries exhausted — escalating to best model...\nVerify: pending\nGuardian: pending`;
        refresh();
        // One more attempt with the best model — the enriched deps will force supervisor-level prompting
        continue;
      }

      // Log the retry in chat
      if (attempt < maxRetries) {
        conversation[conversation.length - 1].content =
          `Supervisor (${supervisorLabel}): done\nWorker: rejected — "${critique.slice(0, 80)}" — retrying...\nVerify: pending\nGuardian: pending`;
        refresh();
      }
    } catch {
      guardianNote = 'Guardian: skipped (error)';
      return { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical };
    }
  }

  // All retries + escalation exhausted
  guardianNote = `Guardian (${guardianLabel}): Failed after ${retryCount} retries${escalated ? ' + escalation' : ''}. Applying best available fix.`;
  // [FIX] Write actual Guardian rejection reasons to dead_ends.md
  // [STAGE 2] Include re-prescription attempts in dead end logging
  if (accumulatedCritiques.length > 0) {
    const critiqueText = accumulatedCritiques.join('; ');
    const prescriptionAttempts = `Original + ${retryCount} re-prescription(s)`;
    appendProjectDeadEnd(
      root,
      `guardian-rejected: ${critiqueText.slice(0, 80)}`,
      critiqueText,
      `Guardian rejected after ${maxRetries + 1} attempts${escalated ? ' including escalation' : ''} with ${prescriptionAttempts}`,
      'Try FULL FILE format instead of surgical edits, or rephrase the fix request more specifically'
    );
    fixLog('[DEAD END] Wrote Guardian rejection reasons to dead_ends.md', { critiques: accumulatedCritiques, prescriptionAttempts });
  }
  return { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: maxRetries, escalated, forceSurgical, accumulatedCritiques };
}

/** Renders a 4-step progress list into the last conversation message. */
function updateStatus(conversation: any[], supervisorLabel: string, phase: 'worker' | 'verify' | 'guardian', attempt: number, escalated: boolean, streamBytes = 0): void {
  const lastMsg = conversation[conversation.length - 1];
  if (!lastMsg) { return; }
  const retry = attempt > 0 ? (escalated ? ' — escalated' : ` — retry ${attempt}`) : '';
  const kbNote = streamBytes > 512 ? ` (${(streamBytes / 1024).toFixed(1)} KB)` : '';
  const workerStatus = phase === 'worker' ? `writing fix${kbNote}${retry}...` : `fix written${attempt > 0 ? retry : ''}`;
  const verifyStatus = phase === 'verify' ? 'checking logic...' : phase === 'guardian' ? 'done' : 'pending';
  const guardianStatus = phase === 'guardian' ? 'reviewing...' : 'pending';
  lastMsg.content =
    `Supervisor (${supervisorLabel}): done\n` +
    `Worker: ${workerStatus}\n` +
    `Verify: ${verifyStatus}\n` +
    `Guardian: ${guardianStatus}`;
}

/** Creates a copy of deps with accumulated Guardian critiques injected into the routing context */
function enrichDepsWithCritiques(deps: MessageHandlerDeps, critiques: string[]): MessageHandlerDeps {
  const critiqueBlock = critiques.map((c, i) => `Attempt ${i + 1} failed: ${c}`).join('\n');
  const enrichedRouting = Object.create(deps.routing);
  const originalPrompt = deps.routing.prompt.bind(deps.routing);
  enrichedRouting.prompt = async (text: string, timeoutMs?: number, imageBase64?: string, imageType?: string) => {
    const enriched = `${text}\n\nPREVIOUS GUARDIAN REJECTIONS (your fix MUST address ALL of these):\n${critiqueBlock}`;
    return originalPrompt(enriched, timeoutMs, imageBase64, imageType);
  };
  return { ...deps, routing: enrichedRouting };
}
