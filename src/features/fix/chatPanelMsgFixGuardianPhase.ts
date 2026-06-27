// [SCOPE] Guardian Review Phase for Escalation Loop
// Extracted from chatPanelMsgFixEscalation.ts (Rule 9 split).

import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';
import { fixLog } from '../../features/logging/data/fixPipelineLogger.js';
import { renderGuardianVerdict, represcribeAfterRejection, isTruncationText, type EscalationResult } from './chatPanelMsgFixEscalationUtils.js';
import { fixActStep } from './fixActivityPanel.js';

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

    // [GAP2] Include pre-fix runtime state so Guardian knows what was broken BEFORE the fix.
    // buildContext is captured before the Supervisor runs (runtime errors, failed loads, etc.)
    const _runtimeBefore = buildContext?.trim()
      ? `\n\nPRE-FIX RUNTIME STATE (errors that existed before the Worker's fix — the correct fix must address these):\n${buildContext.slice(0, 800)}`
      : '';

    // [GAP3] Request structured per-file rejection format so re-prescription knows exactly which files failed.
    const _structuredFmt = `\n\nSTRUCTURED REJECTION FORMAT — if rejecting, prefix each GUARDIAN_ISSUES line with [FILE: path/to/file.ext] so the re-prescription AI knows which file to target:\n- [FILE: exact/path.ext] specific reason this file\'s change is wrong or incomplete\nOutput GUARDIAN_PASS if the fix is correct.`;

    let guardianContext = `Original user request: "${userRequest}"\nSupervisor diagnosis:\n${currentDiagnosis}${_runtimeBefore}${_structuredFmt}`;
    fixLog(`Guardian review (attempt ${attempt + 1}): Starting...`);
    fixLog(`Guardian context preview`, { context: guardianContext.substring(0, 300) });

    // [GAP1] Apply fix to disk before Guardian reviews — gives Guardian real execution evidence,
    // not just code text. Rollback if Guardian rejects. If approved, files are already on disk.
    let _preApply: import('./chatPanelMsgFixGuardianPreview.js').PreApplyResult | null = null;
    try {
      const { runPreApplyCapture } = await import('./chatPanelMsgFixGuardianPreview.js');
      const _allowedRels = new Set([...filesBlock.matchAll(/^\/\/ === FILE: (.+?) ===/gm)].map(m => m[1]));
      _preApply = await runPreApplyCapture(workerResponse, root, _allowedRels, userText || '');
      if (_preApply?.runtimeSummary) {
        guardianContext += `\n\nPOST-FIX RUNTIME STATE (what the app does AFTER applying the Worker\'s fix):\n${_preApply.runtimeSummary}`;
        fixLog(`[PRE-APPLY] Applied and captured runtime: ${_preApply.runtimeSummary}`);
      }
    } catch (e) { fixLog(`[PRE-APPLY] Skipped (non-blocking): ${String(e).slice(0, 80)}`); }

    // [ROUTING PANEL] Force the user-chosen Guardian AI if set (no failover).
    const guardianWorkerHint = escalated && originalWorkerProvider ? originalWorkerProvider : workerLabel.toLowerCase();
    // Pass the full file state as blueprintContext so the Guardian can verify uncertainties
    // by looking up answers in the actual code — not guessing. "Do class names match HTML?"
    // is a binary question answerable by reading both files. Guardian has no excuse to guess.
    const guardianBlueprint = filesBlock
      ? `COMPLETE FILE STATE (all project files — use these to verify any uncertainty):\n${filesBlock.slice(0, 12000)}`
      : '';
    const guardianResult = await deps.routing.guardianReview(guardianContext, workerResponse, guardianWorkerHint, guardianBlueprint, deps.routingOverrides?.guardian);
    fixLog(`Guardian review result`, { passed: guardianResult.passed, issueCount: guardianResult.issues?.length || 0 });
    
    // [FIX] Distinguish a REAL guardian verdict from the "couldn't run on any provider" fallback.
    const guardianRan = !!guardianResult.guardianAI && guardianResult.guardianAI !== 'none';
    const guardianProvider = guardianRan
      ? guardianResult.guardianAI
      : ((() => { try { return deps.routing.selectSupervisorAndWorker().supervisor; } catch { return ''; } })() || workerLabel || 'claude');

    // [FIX] Extract critique BEFORE renderGuardianVerdict so format-mismatch cases never show
    // "[!] Final review found issues — improving" — that label fired even when we immediately
    // shipped the fix as inconclusive, making it look like a retry happened when it didn't.
    const critique = guardianResult.issues?.join('; ') || 'Unknown issue';
    const _isFormatMismatch = !guardianResult.passed && (critique.includes('no structured reason') || critique.includes('format mismatch'));

    if (_isFormatMismatch) {
      fixActStep({ phase: 'guardian', status: 'failover', label: `Guardian (${guardianProvider}): inconclusive — no reason given, fix applied`, model: guardianProvider });
      deps.usageTracker?.recordUsage(Math.ceil(workerResponse.length / 4), 0, guardianProvider, guardianResult.inputTokens, guardianResult.outputTokens, 'guardian', require('path').basename(root));
      guardianNote = `Guardian (${guardianProvider}): inconclusive — no reason given, fix applied`;
      fixLog('Guardian format-mismatch: returned GUARDIAN_FAIL with no extractable reason — shipping fix as inconclusive');
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel: guardianProvider || 'Guardian', guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical, preApplied: !!_preApply, preAppliedFiles: _preApply?.appliedFiles } };
    }

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
      // [GAP1] Files already on disk from pre-apply — signal Phase23 to skip re-apply
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical, preApplied: !!_preApply, preAppliedFiles: _preApply?.appliedFiles } };
    }

    // [H2 degraded] Guardian infrastructure failure (no providers available / all failed) — NOT a code rejection.
    // Treat as skipped, not rejected — re-prescription with an infra error message is nonsensical and causes cascading errors.
    if (!guardianRan && guardianResult.guardianAI === 'none') {
      guardianNote = `Guardian: skipped (${guardianResult.issues?.[0]?.slice(0, 120) || 'all providers unavailable'})`;
      fixLog('Guardian SKIPPED — infrastructure failure, not a code rejection. Fix applied unreviewed.');
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel: 'skipped (unavailable)', guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical } };
    }

    // [GAP1] Guardian rejected — rollback pre-applied changes so the next Worker attempt starts clean
    if (_preApply) {
      _preApply.rollback();
      fixLog('[PRE-APPLY] Guardian rejected — rolled back pre-applied changes');
    }

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
