// [SCOPE] Fix pipeline finalize — pattern-retry, output, compile check, agent handoff, vault.
// Extracted from chatPanelMsgFix.ts (Rule 9 split).

import * as path from 'path';
import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { finalizeFixLogger, fixLog } from '../../services/logging/fixPipelineLogger';
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
}): Promise<void> {
  let { written, workerLabel } = params;
  const { failed, skipped, fixSnapId, diagnosis, supervisorLabel, guardianLabel, scopeNote, needsAgentHandoff, userText, root, deps, activePatterns, conversation, refresh, allowedRels } = params;

  // Auto-retry if known patterns survived the first write — transparent to user on success
  const { retryPatternFix } = await import('./chatPanelMsgFixRetry.js');
  const retryRes = await retryPatternFix({ written, activePatterns, root, diagnosis, supervisorLabel, allowedRels, deps, userText, conversation, refresh });
  if (retryRes.retried && retryRes.written.length > 0) { written = retryRes.written; workerLabel = retryRes.workerLabel; }

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
  await presentFixResult({ written, failed, skipped, fixSnapId, diagnosis, supervisorLabel, workerLabel, guardianLabel, scopeNote, userText, root, deps, activePatterns });
  fixActFinish(written, failed); // [FIX-ACTIVITY] final marker on the Build Activity panel (green if fixed, red if not)
  if (written.length > 0) {
    try { await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, written[0])), { preview: false, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }); } catch {}
  }

  // Compiler as truth — real execution feedback Guardian AI cannot provide
  if (written.length > 0) {
    const { runCompileAutoFix } = await import('../../services/build/compileAutoFix.js');
    const ctx = { task: userText, root, blueprintContext: '', routing: deps.routing, conversation, refresh, logError: () => {}, vault: deps.vault, postToWebview: (m: any) => deps.panel?.webview?.postMessage(m) };
    await runCompileAutoFix(ctx as any, written);
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
    const { autoCaptureFiles } = await import('../../services/vault/vaultAutoCapture.js');
    autoCaptureFiles(absPaths, path.basename(root), deps.vault, `fix: ${userText.slice(0, 120)}`, callAI).catch(() => {});
  }
}
