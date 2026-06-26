// [SCOPE] Fix pipeline finalize — pattern-retry, output, compile check, agent handoff, vault.
// Extracted from chatPanelMsgFix.ts (Rule 9 split).

import * as path from 'path';
import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages.js';
import { finalizeFixLogger, fixLog } from '../../../shared/logging/infrastructure/fixPipelineLogger.js';
import { fixActFinish } from './fixActivityPanel.js';

export async function runFixFinalize(params: {
  written: string[];
  failed: string[];
  skipped: string[];
  fixSnapId: string | undefined;
  diagnosis: string;
  supervisorLabel: string;
  workerLabel: string;
  guardianLabel: string;
  scopeNote: string;
  needsAgentHandoff: boolean;
  userText: string;
  root: string;
  deps: MessageHandlerDeps;
  activePatterns: any[];
  conversation: any[];
  refresh: () => void;
  allowedRels: Set<string>;
  guardianApproved?: boolean; // [FIX] true when the Guardian already approved — skip the redundant pattern-retry
  guardianNote?: string;
  retryCount?: number;
  escalated?: boolean;
  verificationCommand?: string | null;
}): Promise<void> {
  let { written, workerLabel } = params;
  const { failed, skipped, fixSnapId, diagnosis, supervisorLabel, guardianLabel, scopeNote, needsAgentHandoff, userText, root, deps, activePatterns, conversation, refresh, allowedRels, guardianNote, retryCount, escalated } = params;

  // [FIX] Auto-retry if known patterns survived — BUT skip it entirely when the Guardian already APPROVED the
  // fix. retryPatternFix re-runs a FULL escalation (Worker + Verify + Guardian) on its own pattern check; doing
  // that after the authoritative Guardian already passed the fix is the "approved it, then did it again" bug —
  // it doubled the cost (and a second run that the result card didn't even count). Only run the pattern
  // safety-net when the fix did NOT get a clean Guardian approval.
  if (!params.guardianApproved) {
    const { retryPatternFix } = await import('./chatPanelMsgFixRetry.js');
    const retryRes = await retryPatternFix({ written, activePatterns, root, diagnosis, supervisorLabel, allowedRels, deps, userText, conversation, refresh });
    if (retryRes.retried && retryRes.written.length > 0) { written = retryRes.written; workerLabel = retryRes.workerLabel; }
  }

  // [Stage 3] Extract success pattern to global dead end vault
  if (written.length > 0) {
    try {
      const { getApiBase, getAccountToken } = require('../../services/api/apiClient.js');
      const base = getApiBase();
      const token = await getAccountToken();
      fixLog('[GLOBAL_VAULT] Firing success extract from finalize...');
      const extractRes = await fetch(`${base}/dead-end-extract/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          outcome: 'success',
          symptom: userText,
          diagnosis,
          solution: diagnosis.match(/PRESCRIPTION:([\s\S]*?)(?:\[TRIVIAL|$)/)?.[1]?.trim() ?? '',
          projectPath: root,
          keys: {},
          supervisorProvider: 'groq',
        }),
      });
      const extractBody = await extractRes.json().catch(() => ({}));
      fixLog('[GLOBAL_VAULT] Extract response', { status: extractRes.status, body: JSON.stringify(extractBody).slice(0,200) });
    } catch (e) { fixLog('[GLOBAL_VAULT] Extract failed', { error: String(e) }); }
  }

  finalizeFixLogger();
  const { presentFixResult } = await import('./chatPanelMsgFixOutput.js');
  await presentFixResult({ written, failed, skipped, fixSnapId, diagnosis, supervisorLabel, workerLabel, guardianLabel, scopeNote, userText, root, deps, activePatterns, guardianNote, retryCount, escalated });
  if (written.length > 0) {
    try { await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, written[0])), { preview: false, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }); } catch {}
  }

  // [POST-FIX VERIFICATION] Re-run the command that originally failed to confirm the fix worked
  if (written.length > 0 && params.verificationCommand) {
    try {
      const { runPostFixVerification } = await import('../../workspace/infrastructure/postFixVerification.js');
      const { fixActStep } = await import('./fixActivityPanel.js');
      fixActStep({ phase: 'verify', status: 'running', label: `Verifying: ${params.verificationCommand}` });
      const pfResult = await runPostFixVerification(params.verificationCommand, root);
      fixActStep({
        phase: 'verify',
        status: pfResult.passed ? 'pass' : 'fail',
        label: pfResult.passed ? `✅ Verified: \`${params.verificationCommand}\` passed` : `⚠️ Post-fix check failed: \`${params.verificationCommand}\``,
        detail: pfResult.passed ? undefined : [pfResult.stderr || pfResult.stdout].filter(Boolean).join('\n').slice(0, 500),
      });
      fixLog(`[POST-FIX] ${pfResult.summary}`);
    } catch (e) {
      fixLog(`[POST-FIX] Verification error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Compiler as truth — real execution feedback Guardian AI cannot provide
  if (written.length > 0) {
    const { runCompileAutoFix } = await import('../build/services/compileAutoFix.js');
    const ctx = { task: userText, root, blueprintContext: '', routing: deps.routing, conversation, refresh, logError: () => {}, vault: deps.vault, postToWebview: (m: any) => deps.panel?.webview?.postMessage(m) };
    await runCompileAutoFix(ctx as any, written);
  }

  fixActFinish(written, failed); // [FIX-ACTIVITY] final marker — after verification + compile so all steps show

  // [PREVIEW-AUTOFIX Phase 2] Preview as truth — for a web project, actually RUN the result. Verify/Guardian
  // only READ the code; this proves it executes. If it still doesn't run, say so HONESTLY instead of leaving a
  // flat "Fixed" (the file WAS changed, but it doesn't work yet). The auto-fix loop (Phase 3) will act on this.
  if (written.length > 0) {
    try {
      const { verifyPreviewRuns } = await import('../ui/chatPanelPreviewVerify.js');
      const v = await verifyPreviewRuns(root);
      if (v.applicable) {
        const { BuildActivityPanel } = await import('../ui/buildActivity/buildActivityPanel.js');
        if (v.ok) {
          BuildActivityPanel.current?.step({ phase: 'guardian', status: 'pass', label: 'Ran the preview - it works' });
        } else {
          BuildActivityPanel.current?.step({ phase: 'guardian', status: 'fix', label: 'Ran the preview - ' + v.summary });
          conversation.push({ role: 'assistant', content: `Heads up: the file was changed and it passed review, but my automated preview flagged a potential problem: ${v.summary}\n\nPlease try the game yourself to see if it's working. If it does not run or has problems, click Fix again (or describe what you see) and I'll take another run at it.`, timestamp: Date.now() });
          refresh();
        }
      }
    } catch { /* preview verify is best-effort — never block finalize */ }
  }

  if (needsAgentHandoff) {
    const { executeAgentHandoff } = await import('./chatPanelMsgFixAgentHandoff.js');
    await executeAgentHandoff(deps, root, userText, written, fixSnapId, conversation);
    return;
  }

  fixLog('=== Fix Request Completed ===', { written, failed });
  if (deps.vault && written.length > 0) {
    const absPaths = written.map(f => path.join(root, f));
    const callAI = (p: string) => deps.routing.prompt(p, 12_000);
    const { autoCaptureFiles } = await import('../../vault/infrastructure/vaultAutoCapture.js');
    autoCaptureFiles(absPaths, path.basename(root), deps.vault, `fix: ${userText.slice(0, 120)}`, callAI).catch(() => {});
  }

  // [LIVING BLUEPRINT Phase 2] Record this accepted change as a behavioral revision: distill what changed (reusing
  // the worker that did the fix), append it to the ledger, and fold the reconciled contract back into the HEAD.
  // Fire-and-forget so it never delays the result; only on a real change. See docs/REDIVIVUS_LIVING_BLUEPRINT.md.
  if (written.length > 0) {
    (async () => {
      try {
        const { distillFixRevision } = await import('../../project/infrastructure/blueprint/livingBlueprintDistill.js');
        const { appendRevision, nextRev, setMechanics } = await import('../../project/infrastructure/blueprint/livingBlueprintService.js');
        const d = await distillFixRevision(deps.routing, deps, userText, diagnosis);
        if (d) {
          appendRevision(root, { rev: nextRev(root), ts: new Date().toISOString(), kind: 'fix', request: userText.slice(0, 400), summary: d.summary, mechanics_delta: d.delta, files: written, by: workerLabel, snapshotId: fixSnapId });
          setMechanics(deps, d.mechanics);
          fixLog('[LIVING BLUEPRINT] Revision recorded', { rev: nextRev(root) - 1, summary: d.summary });
        }
      } catch { /* living-blueprint capture is best-effort — never affect the fix outcome */ }
    })();
  }
}
