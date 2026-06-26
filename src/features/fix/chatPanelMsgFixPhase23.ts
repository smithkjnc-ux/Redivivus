// [SCOPE] Fix pipeline Phase 2+3 — Worker generates fix, Guardian reviews, retry/escalate on rejection.
// Extracted from chatPanelMsgFix.ts (Rule 9 split). Called by handleFixRequest after Phase 1 and gates.
// Phase 2: Worker generates fix content (subtasks loop OR escalation loop).
// Phase 3: Guardian reviews + apply (applyFixContent). Failure path: retryNoOutput + dead-end vault.

import type { MessageHandlerDeps } from './chatPanelMessages.js';
import { fixLog, finalizeFixLogger } from '../../../shared/logging/infrastructure/fixPipelineLogger.js';
import { fixCostByline, fixErrorHint } from './chatPanelMsgFixUsage.js';
import { appendProjectDeadEnd } from './chatPanelMsgFixDeadEnds.js';
import { fixActFinish } from './fixActivityPanel.js';
import { runFixFinalize } from './chatPanelMsgFixFinalize.js';
import { explainFixFailure, formatELI5Block } from '../../../shared/ai/infrastructure/fixFailureELI5.js';
import { progressApplying } from '../ui/fixProgressStyle.js';

export interface FixPhase23Params {
  subtasks: string[];
  executionMode: 'parallel' | 'sequential';
  diagnosis: string;
  fileNames: string;
  filesBlock: string;
  activePatterns: any;
  allowedRels: Set<string>;
  deps: MessageHandlerDeps;
  root: string;
  supervisorLabel: string;
  userText: string;
  forceSurgical: boolean;
  approvedPlan: string | undefined;
  costBefore: number;
  projectDeadEnds: string;
  projectRules: string;
  buildContext: string;
  verificationCommand?: string | null;
}

export async function runFixPhase23(p: FixPhase23Params): Promise<void> {
  const { subtasks, executionMode, diagnosis, fileNames, filesBlock, activePatterns, allowedRels, deps, root, supervisorLabel, userText, forceSurgical, costBefore, projectDeadEnds, projectRules, buildContext } = p;
  const { conversation, refresh } = deps;

  let finalResponse = ''; let workerLabel = 'AI'; let guardianLabel = 'AI'; let guardianNote = ''; let scopeNote = ''; let needsAgentHandoff = false;
  let written: string[] = []; let failed: string[] = []; let skipped: string[] = []; let fixSnapId: string | undefined;
  let retryCount = 0; let escalated = false;

  try {
    if (subtasks.length > 0) {
      fixLog('Phase 2: Starting Iterative Subtasks Loop...', { subtasksCount: subtasks.length });
      const { runSubtasksLoop } = await import('./chatPanelMsgFixSubtasks.js');
      const subtaskRes = await runSubtasksLoop({ subtasks, executionMode, diagnosis, fileNames, filesBlock, activePatterns, allowedRels, deps, root, supervisorLabel, userText });
      written = subtaskRes.written; failed = subtaskRes.failed; skipped = subtaskRes.skipped; fixSnapId = subtaskRes.fixSnapId;
      workerLabel = subtaskRes.workerLabel; guardianLabel = subtaskRes.guardianLabel; guardianNote = subtaskRes.guardianNote;
      scopeNote = subtaskRes.scopeNote; needsAgentHandoff = subtaskRes.needsAgentHandoff;
      fixLog('Phase 3: Iterative Application complete', { written, failed, skipped });
    } else {
      const { runEscalationLoop } = await import('./chatPanelMsgFixEscalation.js');
      fixLog('Phase 2: Starting Worker fix application...', { forceSurgical });
      const escalation = await runEscalationLoop({ diagnosis, fileNames, filesBlock, activePatterns, deps, root, supervisorLabel, forceSurgical, userText, buildContext, projectDeadEnds, projectRules });
      finalResponse = escalation.finalResponse; workerLabel = escalation.workerLabel;
      fixLog('Phase 2: Worker response received', { preview: finalResponse.substring(0, 500), totalLength: finalResponse.length, workerLabel });
      guardianLabel = escalation.guardianLabel; guardianNote = escalation.guardianNote;
      scopeNote = escalation.scopeNote; needsAgentHandoff = escalation.needsAgentHandoff;
      retryCount = escalation.retryCount; escalated = escalation.escalated;
      if (escalation.retryCount > 0) {
        guardianNote += escalation.escalated ? ' (escalated to best model)' : ` (${escalation.retryCount} retries)`;
      }

      fixLog('Phase 3: Applying fix content...');
      const { applyFixContent } = await import('./chatPanelMsgFixApply.js');
      const targetFiles = fileNames.split(', ').slice(0, 3).join(', ');
      conversation[conversation.length - 1].content = progressApplying({ supervisorLabel, targetFiles });
      refresh();
      const applyRes = await applyFixContent(finalResponse, root, allowedRels, userText);
      written = applyRes.written; failed = applyRes.failed; skipped = applyRes.skipped; fixSnapId = applyRes.fixSnapId;
      fixLog('Phase 3: Application complete', { written, failed, skipped });

      // [FIX] Verify prescribed files were actually written — catches false success where Worker fixes wrong file.
      const prescriptionSection = diagnosis.match(/PRESCRIPTION:([\s\S]*?)(?:\[TRIVIAL\]|$)/)?.[1] ?? '';
      const prescribedFiles = [...prescriptionSection.matchAll(/`?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)`?/g)]
        .map(m => m[1]).filter(f => [...allowedRels].some(r => r.endsWith(f) || f.endsWith(r)));
      const unwrittenPrescribed = prescribedFiles.filter(f => !written.some(w => w.endsWith(f) || f.endsWith(w)));
      if (unwrittenPrescribed.length > 0 && written.length > 0) {
        fixLog('[PRESCRIPTION_CHECK] Prescribed files not written', { unwritten: unwrittenPrescribed, written });
        failed = [...failed, ...unwrittenPrescribed.map(f => `${f}: prescribed but not written`)];
        written = []; // Force retry
      }
    }
  } catch (err) {
    const _raw2 = err instanceof Error ? err.message : String(err);
    let _errMsg2 = _raw2;
    try { const j = _raw2.indexOf('{'); if (j !== -1) { const p = JSON.parse(_raw2.slice(j)); _errMsg2 = p?.error?.message || p?.message || _raw2; } } catch { /* keep raw */ }
    const _b642 = Buffer.from(userText, 'utf8').toString('base64');
    const _eli5Err = await explainFixFailure({ userText, accumulatedCritiques: [], guardianNote: '', errorMessage: _errMsg2, deps }).catch(() => null);
    const _eli5Block = _eli5Err ? formatELI5Block(_eli5Err) : '';
    conversation[conversation.length - 1].content =
      `${_eli5Block}⚠️ **Something went wrong while writing the fix.** ${fixErrorHint(_errMsg2)}\n\n` +
      `_Details: ${_errMsg2.slice(0, 600)}_${fixCostByline(deps, root, costBefore)}\n\n` +
      `__RETRY_FIX__:${_b642}__END_RETRY__`;
    finalizeFixLogger(); refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
  }

  if (written.length === 0) {
    const { retryNoOutput } = await import('./chatPanelMsgFixRetry.js');
    const retryResult = await retryNoOutput({ diagnosis, filesBlock, fileNames, activePatterns, allowedRels, deps, userText, conversation, refresh, supervisorLabel, root, failedErrors: failed });
    if (retryResult.written.length > 0) {
      written = retryResult.written; failed = retryResult.failed; skipped = retryResult.skipped; fixSnapId = retryResult.fixSnapId; workerLabel = retryResult.workerLabel;
    } else {
      const plain = diagnosis.match(/^PLAIN:\s*(.+?)(?:\n|$)/m)?.[1]?.trim() ?? '';
      const skipNote = skipped.length > 0 ? `\n\n⚠️ AI tried to create ${skipped.length} file(s) not in this project: ${skipped.join(', ')}` : '';
      const prescriptionRaw = (diagnosis.match(/PRESCRIPTION:([\s\S]*?)(?:\[TRIVIAL|$)/)?.[1] ?? '').trim();
      const prescriptionLines = prescriptionRaw.split('\n').filter(l => l.trim().match(/^[-•*]|^##/)).slice(0, 6).join('\n').trim();
      const suggestedPrompt = plain
        ? `__SUGGEST__${plain} — please write the complete corrected file using FULL FILE format (not surgical edits).`
        : `__SUGGEST__${userText} — please write the complete corrected files, not surgical edits.`;
      const _b64sug = Buffer.from(suggestedPrompt, 'utf8').toString('base64');
      const deadEndReason = failed.length > 0 ? failed.join('; ') : plain || 'Worker produced no parseable file edits';
      const deadEndWhat = written.length === 0 && skipped.length === 0 ? 'No files were written after retry' : `Skipped files: ${skipped.join(', ')}`;
      const deadEndNext = plain ? `Try: ${plain} -- use FULL FILE format` : 'Use FULL FILE format with complete file content';
      appendProjectDeadEnd(root, `fix-failed: ${userText.slice(0,80)}`, deadEndReason, deadEndWhat, deadEndNext);
      fixLog('FINAL FAILURE: no parseable output after retry', { plain, skipNote, failedErrors: failed });
      const _eli5NoOut = await explainFixFailure({ userText, accumulatedCritiques: failed, guardianNote: guardianNote || '', deps }).catch(() => null);
      const _eli5NoOutBlock = _eli5NoOut ? formatELI5Block(_eli5NoOut) : '';
      // [Stage 3] Extract failure pattern to global dead end vault
      try {
        const base3 = require('../../services/api/apiClient.js').getApiBase();
        const token3 = await require('../../services/api/apiClient.js').getAccountToken();
        const keysPayload3 = require('../../services/api/apiClient.js').collectKeys();
        const { supervisor: sup3 } = deps.routing.selectSupervisorAndWorker();
        const extractRes3 = await fetch(`${base3}/dead-end-extract/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token3}` },
          body: JSON.stringify({ outcome: 'failure', symptom: userText, deadEnds: projectDeadEnds, diagnosis, solution: null, projectPath: root, keys: keysPayload3, supervisorProvider: sup3 }),
        });
        fixLog('[GLOBAL_VAULT] Failure extract response', { status: extractRes3.status });
      } catch (e) { fixLog('[GLOBAL_VAULT] Extract failed (non-blocking)', { error: String(e) }); }
      finalizeFixLogger();
      let failMsg = _eli5NoOutBlock;
      if (plain) { failMsg += `**What I found:** ${plain}\n\n`; }
      if (prescriptionLines) { failMsg += `**What to do:**\n${prescriptionLines}\n\n`; }
      failMsg += `The fix didn't apply cleanly. Click the button to retry with a more specific prompt:\n\n__RETRY_FIX__:${_b64sug}__END_RETRY__${skipNote}${fixCostByline(deps, root, costBefore)}`;
      conversation[conversation.length - 1].content = failMsg;
      fixActFinish([], failed.length ? failed : ['fix']);
      refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
    }
  }

  const guardianApproved = /approved|skipped/i.test(guardianNote || '');
  await runFixFinalize({ written, failed, skipped, fixSnapId, diagnosis, supervisorLabel, workerLabel, guardianLabel, scopeNote, needsAgentHandoff, userText, root, deps, activePatterns, conversation, refresh, allowedRels, guardianApproved, guardianNote, retryCount, escalated, verificationCommand: p.verificationCommand ?? null });
}
