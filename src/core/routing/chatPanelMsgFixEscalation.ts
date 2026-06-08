// [SCOPE] Autonomous Escalation Loop — retries Worker on Guardian rejection, escalates to smarter model if retries exhausted.
// Called by chatPanelMsgFix.ts in place of the old sequential Phase 2 + Phase 3 blocks.

import type { MessageHandlerDeps } from './chatPanelMessages';
import { modelLabel } from './chatPanelMsgFixUtils';
import { fixLog } from '../../services/logging/fixPipelineLogger';

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
}

/** Runs Phase 2 (Worker) → Phase 3 (Guardian) with automatic retry and escalation. */
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
}): Promise<EscalationResult> {
  const { diagnosis, fileNames, filesBlock, activePatterns, deps, root, supervisorLabel, forceSurgical: initialForceSurgical } = params;
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

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // ── Phase 2: Worker generates fix ──
    updateStatus(conversation, supervisorLabel, 'worker', attempt, escalated);
    refresh();

    try {
      const { runPhase2Worker } = await import('./chatPanelMsgFixPhases.js');
      // Inject accumulated critiques into the worker context for retries
      const enrichedDeps = attempt > 0 ? enrichDepsWithCritiques(deps, accumulatedCritiques) : deps;
      let streamBytes = 0;
      const onChunk = (chunk: string) => {
        streamBytes += chunk.length;
        updateStatus(conversation, supervisorLabel, 'worker', attempt, escalated, streamBytes);
        refresh();
      };
      const p2 = await runPhase2Worker(diagnosis, fileNames, filesBlock, activePatterns, enrichedDeps, root, onChunk, escalated, forceSurgical);
      if (!p2) { throw new Error('Worker returned null'); }
      workerResponse = p2.workerResponse;
      workerLabel = p2.workerLabel;
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
  return { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: maxRetries, escalated, forceSurgical };
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
