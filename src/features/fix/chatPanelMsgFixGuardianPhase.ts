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

    // [GAP2] Include pre-fix runtime state so Code Inspector knows what was broken BEFORE the fix.
    const _runtimeBefore = buildContext?.trim()
      ? `\n\nPRE-FIX RUNTIME STATE (errors that existed before the Worker's fix — the correct fix must address these):\n${buildContext.slice(0, 800)}`
      : '';
    // [GAP3] Structured rejection format so re-prescription targets the right files.
    const _structuredFmt = `\n\nSTRUCTURED REJECTION FORMAT — if rejecting, prefix each GUARDIAN_ISSUES line with [FILE: path/to/file.ext]:\n- [FILE: exact/path.ext] specific reason\nOutput GUARDIAN_PASS if the fix is correct.`;

    const baseContext = `Original user request: "${userRequest}"\nSupervisor diagnosis:\n${currentDiagnosis}`;
    const guardianWorkerHint = escalated && originalWorkerProvider ? originalWorkerProvider : workerLabel.toLowerCase();
    const guardianBlueprint = filesBlock
      ? `COMPLETE FILE STATE (all project files — use these to verify any uncertainty):\n${filesBlock.slice(0, 12000)}`
      : '';

    fixLog(`Two-layer Guardian review (attempt ${attempt + 1}): starting...`);

    // ── LAYER 1: Compliance Verifier ────────────────────────────────────────
    // Pure mechanical check: did the Worker implement every prescription item?
    // No pre-apply needed — this is a text comparison only.
    // ────────────────────────────────────────────────────────────────────────
    const verifyResult = await deps.routing.guardianReview(
      baseContext + _structuredFmt, workerResponse, guardianWorkerHint, '', deps.routingOverrides?.guardian, 'verify'
    );
    const verifyRan = !!verifyResult.guardianAI && verifyResult.guardianAI !== 'none';
    const verifyProvider = verifyRan ? verifyResult.guardianAI
      : ((() => { try { return deps.routing.selectSupervisorAndWorker().supervisor; } catch { return ''; } })() || workerLabel || 'claude');

    fixLog(`Compliance Verifier result`, { passed: verifyResult.passed, issues: verifyResult.issues?.length || 0 });
    const verifyVerdict = renderGuardianVerdict({ guardianRan: verifyRan, guardianResult: verifyResult, guardianProvider: verifyProvider, workerResponse, root, deps, layerName: 'Compliance Verifier' });
    guardianLabel = verifyVerdict.guardianLabel;

    // Infrastructure failure on Verifier — treat as skipped (not a code rejection)
    if (!verifyRan && verifyResult.guardianAI === 'none') {
      guardianNote = `Compliance Verifier: skipped (${verifyResult.issues?.[0]?.slice(0, 120) || 'all providers unavailable'})`;
      fixLog('Compliance Verifier SKIPPED — infrastructure failure. Proceeding to Code Inspector.');
      // Fall through to Layer 2 — skipping verifier is better than blocking
    } else if (!verifyResult.passed) {
      // Prescription items missing — reject immediately, skip pre-apply and Code Inspector
      const critique = verifyResult.issues?.join('; ') || 'Prescription items not implemented';
      const _isFormatMismatch = critique.includes('no structured reason') || critique.includes('format mismatch');
      if (_isFormatMismatch) {
        guardianNote = `Compliance Verifier (${verifyProvider}): inconclusive — fix applied`;
        fixLog('Compliance Verifier format-mismatch — shipping fix as inconclusive');
        return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical } };
      }
      accumulatedCritiques.push(critique);
      fixLog(`Compliance Verifier REJECTED (attempt ${attempt + 1})`, { critique: critique.substring(0, 300) });
      if (escalated) {
        guardianNote = `⚠️ Compliance Verifier flagged unimplemented items after Supervisor self-fix: ${critique.slice(0, 200)}. Please review manually or retry.`;
        return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical } };
      }
      if (isTruncationText(critique) && attempt < maxRetries) { forceSurgical = true; accumulatedCritiques.push(`[FORMAT CHANGE] Output was truncated. Use SURGICAL EDITS on retry.`); }
      const rp = await represcribeAfterRejection({ attempt, maxRetries, userText, root, filesBlock, currentDiagnosis, accumulatedCritiques, projectDeadEnds, buildContext, activePatterns, projectRules, deps });
      filesBlock = rp.filesBlock; currentDiagnosis = rp.diagnosis;
      const doNotFiles: string[] = [];
      for (const c of accumulatedCritiques) { const matches = c.matchAll(/(?:leaving|unchanged|do not (?:touch|modify)|should not (?:touch|modify)|must not (?:touch|modify)|only involve[^,]+,\s*leaving)\s+[`']?([\w./\\-]+\.[a-zA-Z0-9]{1,6})[`']?/gi); for (const m of matches) { if (!doNotFiles.includes(m[1])) { doNotFiles.push(m[1]); } } }
      if (doNotFiles.length > 0) { currentDiagnosis = currentDiagnosis + `\n\n[WORKER CONSTRAINTS — ABSOLUTE]\nDO NOT MODIFY: ${doNotFiles.join(', ')}`; }
      if (/\[AGENT_HANDOFF\]/i.test(currentDiagnosis)) { return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote: 'Re-prescription routed to Agent pipeline', scopeNote, needsAgentHandoff: true, retryCount: attempt, escalated } }; }
      return { action: 'continue', forceSurgical, filesBlock, currentDiagnosis };
    }

    // ── LAYER 2: Code Inspector ──────────────────────────────────────────────
    // Prescription verified ✓. Now check: does the code actually work correctly?
    // Pre-apply here so Inspector sees post-fix runtime state.
    // ────────────────────────────────────────────────────────────────────────
    let _preApply: import('./chatPanelMsgFixGuardianPreview.js').PreApplyResult | null = null;
    let inspectorContext = baseContext + _runtimeBefore + _structuredFmt;
    // Start with original blueprint — will be refreshed with post-apply disk state below
    let refreshedBlueprint = guardianBlueprint;
    try {
      const { runPreApplyCapture } = await import('./chatPanelMsgFixGuardianPreview.js');
      const _allowedRels = new Set([...filesBlock.matchAll(/^\/\/ === FILE: (.+?) ===/gm)].map(m => m[1]));
      _preApply = await runPreApplyCapture(workerResponse, root, _allowedRels, userText || '');
      if (_preApply?.runtimeSummary) {
        inspectorContext += `\n\nPOST-FIX RUNTIME STATE (what the app does AFTER applying the Worker\'s fix):\n${_preApply.runtimeSummary}`;
        fixLog(`[PRE-APPLY] Applied and captured runtime: ${_preApply.runtimeSummary}`);
      }
      // [FIX] Refresh blueprint with post-apply disk content so Inspector sees CURRENT file state,
      // not the pipeline-start snapshot. Only re-reads files the Worker actually wrote.
      if (_preApply?.appliedFiles?.length) {
        const fs = await import('fs');
        const path = await import('path');
        let updatedBlock = filesBlock;
        for (const rel of _preApply.appliedFiles) {
          try {
            const diskContent = fs.readFileSync(path.join(root, rel), 'utf8');
            const marker = `// === FILE: ${rel} ===`;
            // Replace the stale entry with fresh disk content
            const entryRe = new RegExp(`(\\/\\/ === FILE: ${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ===)[\\s\\S]*?(?=\\/\\/ === FILE:|$)`);
            updatedBlock = updatedBlock.replace(entryRe, `${marker}\n${diskContent}\n`);
            fixLog(`[PRE-APPLY] Refreshed blueprint entry for ${rel} (${diskContent.length} bytes)`);
          } catch { /* non-blocking — keep stale entry if read fails */ }
        }
        refreshedBlueprint = updatedBlock
          ? `COMPLETE FILE STATE (post-fix, read from disk):\n${updatedBlock.slice(0, 12000)}`
          : guardianBlueprint;
      }
    } catch (e) { fixLog(`[PRE-APPLY] Skipped (non-blocking): ${String(e).slice(0, 80)}`); }

    const guardianResult = await deps.routing.guardianReview(
      inspectorContext, workerResponse, guardianWorkerHint, refreshedBlueprint, deps.routingOverrides?.guardian, 'inspect'
    );
    fixLog(`Code Inspector result`, { passed: guardianResult.passed, issueCount: guardianResult.issues?.length || 0 });

    const guardianRan = !!guardianResult.guardianAI && guardianResult.guardianAI !== 'none';
    const guardianProvider = guardianRan
      ? guardianResult.guardianAI
      : ((() => { try { return deps.routing.selectSupervisorAndWorker().supervisor; } catch { return ''; } })() || workerLabel || 'claude');

    const critique = guardianResult.issues?.join('; ') || 'Unknown issue';
    const _isFormatMismatch = !guardianResult.passed && (critique.includes('no structured reason') || critique.includes('format mismatch'));

    if (_isFormatMismatch) {
      fixActStep({ phase: 'guardian', status: 'failover', label: `Code Inspector (${guardianProvider}): inconclusive — no reason given, fix applied`, model: guardianProvider });
      deps.usageTracker?.recordUsage(Math.ceil(workerResponse.length / 4), 0, guardianProvider, guardianResult.inputTokens, guardianResult.outputTokens, 'guardian', require('path').basename(root));
      guardianNote = `Code Inspector (${guardianProvider}): inconclusive — no reason given, fix applied`;
      fixLog('Code Inspector format-mismatch: returned GUARDIAN_FAIL with no extractable reason — shipping fix as inconclusive');
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel: guardianProvider || 'Inspector', guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical, preApplied: !!_preApply, preAppliedFiles: _preApply?.appliedFiles } };
    }

    const verdict = renderGuardianVerdict({ guardianRan, guardianResult, guardianProvider, workerResponse, root, deps, layerName: 'Code Inspector' });
    guardianLabel = verdict.guardianLabel;
    scopeNote = verdict.scopeNote;

    if (guardianResult.issues?.some((issue: string) => /Simple Pipeline is insufficient|Routing to Agent|Agent Pipeline/i.test(issue))) {
      needsAgentHandoff = true;
      fixLog('Code Inspector routed to Agent Pipeline');
      guardianNote = `Code Inspector (${guardianLabel}): routing to Agent for environment verification`;
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff: true, retryCount: attempt, escalated, forceSurgical } };
    }

    if (guardianResult.passed) {
      guardianNote = guardianRan ? `Code Inspector (${guardianLabel}): Approved` : `Code Inspector: skipped (no reviewer available — fix applied without review)`;
      fixLog(guardianRan ? `Code Inspector APPROVED the fix` : `Code Inspector SKIPPED — fix applied unreviewed`);
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel, guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical, preApplied: !!_preApply, preAppliedFiles: _preApply?.appliedFiles } };
    }

    if (!guardianRan && guardianResult.guardianAI === 'none') {
      guardianNote = `Code Inspector: skipped (${guardianResult.issues?.[0]?.slice(0, 120) || 'all providers unavailable'})`;
      fixLog('Code Inspector SKIPPED — infrastructure failure, fix applied unreviewed.');
      return { action: 'return', payload: { finalResponse: workerResponse, workerLabel, guardianLabel: 'skipped (unavailable)', guardianNote, scopeNote, needsAgentHandoff, retryCount: attempt, escalated, forceSurgical } };
    }

    if (_preApply) {
      _preApply.rollback();
      fixLog('[PRE-APPLY] Code Inspector rejected — rolled back pre-applied changes');
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
