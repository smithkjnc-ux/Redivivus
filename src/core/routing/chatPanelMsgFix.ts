// [SCOPE] Chat fix handler -- 3-phase Supervisor/Worker/Guardian bug fix pipeline
// Phase 1: Supervisor AI (best available) diagnoses ALL bugs.
// Phase 2: Worker AI generates complete corrected files.
// Phase 3: Guardian reviews (pass/fail only — no code correction). Compiler verifies correctness.
// [WARN] Always use routing.prompt() here -- routeByComplexity routes simple-looking bug reports
//        to Groq/cheap models which produce thin output and cause silent pipeline failure.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { parseFixResponse, takeSnapshot, readProjectRules, writeProjectRoadmapEntry, modelLabel } from './chatPanelMsgFixUtils';
import { collectSourceFiles } from './chatPanelMsgFixContext';
import { readProjectDeadEnds, appendProjectDeadEnd } from './chatPanelMsgFixDeadEnds';
import { findRelevantByTask } from '../../services/vault/buildFromVaultSearch';
import { formatVaultContext, isVaultEnabled } from '../../services/vault/vaultContextService';
import { collectFixContext } from './chatPanelMsgFixContext';
import { detectPatterns, buildSupervisorNotes, buildWorkerRules, validateOutputFiles } from './chatPanelMsgFixPatterns';
import { Redivivus_WORKER_RULES } from '../../services/ai/redivivusWorkerRules';
import { BuildHistoryService, makeBuildHistoryEntry } from '../../services/build/buildHistoryService';
import { initFixLogger, fixLog, finalizeFixLogger, getCurrentLogPath } from '../../services/logging/fixPipelineLogger';
import { runFixFinalize } from './chatPanelMsgFixFinalize';

// [DEAD] modelLabel defined here -- moved to chatPanelMsgFixUtils.ts to keep this file under 200 lines

export async function handleFixRequest(userText: string, deps: MessageHandlerDeps, imageBase64?: string, imageType?: string): Promise<void> {
  const { routing, conversation, refresh } = deps;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  // [FIX] No workspace open means no code to fix — treat as a new build request so autoCreateProject runs.
  if (!root) { await deps.handleBuildRequest(userText, true); return; }

  // [LOG] Initialize file-based logging for this fix session
  initFixLogger(root);
  fixLog('=== Fix Request Started ===', { userText, root, imageProvided: !!imageBase64 });

  // [DIAG] Log source file discovery for debugging
  const diagLog = (msg: string) => { try { fs.appendFileSync('/tmp/redivivus_debug.log', `[fix] ${msg}\n`); } catch {} fixLog(msg); };
  diagLog(`root=${root} exists=${fs.existsSync(root)}`);

  let sourceFiles = collectSourceFiles(root, userText);
  diagLog(`initial scan: ${sourceFiles.length} files`);

  // [FIX] After auto-open, workspace root may be set but point to a wrapper or multi-root.
  // Scan one level deep for a subfolder containing source files as fallback.
  if (sourceFiles.length === 0) {
    try {
      const entries = fs.readdirSync(root);
      diagLog(`root entries: ${entries.join(', ')}`);
      for (const entry of entries) {
        if (entry.startsWith('.')) { continue; }
        const sub = path.join(root, entry);
        if (fs.statSync(sub).isDirectory()) {
          const subFiles = collectSourceFiles(sub, userText);
          diagLog(`subfolder ${entry}: ${subFiles.length} files`);
          if (subFiles.length > 0) { sourceFiles = subFiles; break; }
        }
      }
    } catch (e: any) {
      diagLog(`fallback scan error: ${e.message}`);
    }
  }
  // [FIX] Empty scaffold (no source files yet) — treat as a first build, not a fix.
  if (sourceFiles.length === 0) { await deps.handleBuildRequest(userText, true); return; }

  // [FILE_SIZE_GATE] Check for oversized files before firing any AI calls
  const { runFileSizeGate } = await import('./fileSizeGate.js');
  const gateResult = await runFileSizeGate(sourceFiles, deps);
  if (gateResult.shouldAbort) {
    fixLog('[FILE_SIZE_GATE] Fix aborted by user');
    finalizeFixLogger();
    conversation.push({
      role: 'assistant',
      content: 'Fix cancelled — the file is too large for reliable AI fixes. Try splitting it first.',
      timestamp: Date.now()
    });
    refresh();
    deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
    return;
  }

  const allowedRels = new Set(sourceFiles.map(f => f.rel));
  let fileNames = sourceFiles.map(f => f.rel).join(', ');
  let filesBlock = sourceFiles.map(f => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');

  // [LOG] Debug: What files are we sending to the AI?
  fixLog('Files selected for AI context', { fileNames, count: sourceFiles.length });
  sourceFiles.forEach(f => fixLog(`  File: ${f.rel}`, { chars: f.content.length }));
  const activePatterns = detectPatterns(filesBlock, userText);
  const projectDeadEnds = readProjectDeadEnds(root);
  const vaultCtx = (deps.vault && isVaultEnabled()) ? (() => { const h = findRelevantByTask(userText, deps.vault!.listItems()); return h.items.length > 0 ? formatVaultContext(h.items.slice(0, 4)) + '\n' : ''; })() : '';
  const buildContext = vaultCtx + collectFixContext(root, sourceFiles);
  const projectRules = readProjectRules(root);
  deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });

  // Phase 1: Supervisor diagnoses ALL bugs
  conversation.push({ role: 'assistant', content: `Scanning ${sourceFiles.length} file${sourceFiles.length !== 1 ? 's' : ''}...`, timestamp: Date.now() });
  refresh();
  let diagnosis = ''; let supervisorLabel = 'AI'; let subtasks: string[] = []; let executionMode: 'parallel' | 'sequential' = 'sequential';
  try {
    const { runPhase1Supervisor } = await import('./chatPanelMsgFixPhases.js');
    fixLog('Phase 1: Running Supervisor diagnosis...');
    const p1 = await runPhase1Supervisor(userText, filesBlock, buildContext, activePatterns, projectDeadEnds, projectRules, deps, root, imageBase64, imageType);
    if (!p1) {return;} // shouldn't happen based on throw
    diagnosis = p1.diagnosis;
    subtasks = p1.subtasks;
    executionMode = p1.executionMode || 'sequential';
    // If Supervisor fetched additional files, expand Worker context and allowedRels
    if (p1.expandedFilesBlock !== filesBlock) {
      filesBlock = p1.expandedFilesBlock;
      [...filesBlock.matchAll(/^\/\/ === FILE: (.+?) ===/gm)].forEach(m => allowedRels.add(m[1]));
      fileNames = [...allowedRels].join(', ');
      fixLog('Phase 1: Supervisor expanded context', { newFileCount: allowedRels.size });
    }
    fixLog('Phase 1: Supervisor diagnosis received', { diagnosisPreview: diagnosis.substring(0, 500) });
    supervisorLabel = p1.supervisorLabel;

    // [PHASE-1-HARDENING] Agentic Fetch removed — complex asset orchestration moves to backend in Phase 2.

  } catch (err) {
    const _errMsg = err instanceof Error ? err.message : String(err);
    const _isKeyErr = /401|403|invalid.{0,10}(api.)?key|api.key.{0,10}(invalid|missing|expired)|unauthorized/i.test(_errMsg);
    const _hint = _isKeyErr ? 'This looks like an API key issue — check **Setup → AI API Keys**.' : 'This is usually a temporary network hiccup — try again.';
    const _b64 = Buffer.from(userText, 'utf8').toString('base64');
    conversation[conversation.length - 1].content =
      `⚠️ **Something went wrong while analysing your fix.** ${_hint}\n\n` +
      `_Details: ${_errMsg.slice(0, 300)}_\n\n` +
      `__RETRY_FIX__:${_b64}__END_RETRY__`;
    finalizeFixLogger(); refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
  }

  // Phase 2+3: Worker generates fix → Guardian reviews → retry/escalate if rejected
  let finalResponse = ''; let workerLabel = 'AI'; let guardianLabel = 'AI'; let guardianNote = ''; let scopeNote = ''; let needsAgentHandoff = false;
  let written: string[] = []; let failed: string[] = []; let skipped: string[] = []; let fixSnapId: string | undefined;

  try {
    if (subtasks.length > 0) {
      fixLog('Phase 2: Starting Iterative Subtasks Loop...', { subtasksCount: subtasks.length });
      const { runSubtasksLoop } = await import('./chatPanelMsgFixSubtasks.js');
      const subtaskRes = await runSubtasksLoop({ subtasks, executionMode, diagnosis, fileNames, filesBlock, activePatterns, allowedRels, deps, root, supervisorLabel, userText });
      written = subtaskRes.written;
      failed = subtaskRes.failed;
      skipped = subtaskRes.skipped;
      fixSnapId = subtaskRes.fixSnapId;
      workerLabel = subtaskRes.workerLabel;
      guardianLabel = subtaskRes.guardianLabel;
      guardianNote = subtaskRes.guardianNote;
      scopeNote = subtaskRes.scopeNote;
      needsAgentHandoff = subtaskRes.needsAgentHandoff;
      fixLog('Phase 3: Iterative Application complete', { written, failed, skipped });
    } else {
      const { runEscalationLoop } = await import('./chatPanelMsgFixEscalation.js');
      fixLog('Phase 2: Starting Worker fix application...', { forceSurgical: gateResult.forceSurgical });
      const escalation = await runEscalationLoop({ diagnosis, fileNames, filesBlock, activePatterns, deps, root, supervisorLabel, forceSurgical: gateResult.forceSurgical, userText, buildContext, projectDeadEnds, projectRules });
      finalResponse = escalation.finalResponse;
      workerLabel = escalation.workerLabel;
      fixLog('Phase 2: Worker response received', { preview: finalResponse.substring(0, 500), totalLength: finalResponse.length, workerLabel });
      guardianLabel = escalation.guardianLabel;
      guardianNote = escalation.guardianNote;
      scopeNote = escalation.scopeNote;
      needsAgentHandoff = escalation.needsAgentHandoff;
      if (escalation.retryCount > 0) {
        guardianNote += escalation.escalated ? ' (escalated to best model)' : ` (${escalation.retryCount} retries)`;
      }

      // [FIX] Try surgical edits first (SEARCH/REPLACE), fall back to full-file parsing
      fixLog('Phase 3: Applying fix content...');
      const { applyFixContent } = await import('./chatPanelMsgFixApply.js');
      const targetFiles = fileNames.split(', ').slice(0, 3).join(', ');
      conversation[conversation.length - 1].content = `${supervisorLabel}: diagnosis done\nWorker: fix written\nVerify: done\nGuardian: approved\nWriting ${targetFiles}...`;
      refresh();
      const applyRes = await applyFixContent(finalResponse, root, allowedRels, userText);
      written = applyRes.written; failed = applyRes.failed; skipped = applyRes.skipped; fixSnapId = applyRes.fixSnapId;
      fixLog('Phase 3: Application complete', { written, failed, skipped });
    }
  } catch (err) {
    const _errMsg2 = err instanceof Error ? err.message : String(err);
    const _isKeyErr2 = /401|403|invalid.{0,10}(api.)?key|api.key.{0,10}(invalid|missing|expired)|unauthorized/i.test(_errMsg2);
    const _hint2 = _isKeyErr2 ? 'This looks like an API key issue — check **Setup → AI API Keys**.' : 'This is usually a temporary network hiccup — try again.';
    const _b642 = Buffer.from(userText, 'utf8').toString('base64');
    conversation[conversation.length - 1].content =
      `⚠️ **Something went wrong while writing the fix.** ${_hint2}\n\n` +
      `_Details: ${_errMsg2.slice(0, 300)}_\n\n` +
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
      // Extract PRESCRIPTION section so user knows what to do next
      const prescriptionRaw = (diagnosis.match(/PRESCRIPTION:([\s\S]*?)(?:\[TRIVIAL|$)/)?.[1] ?? '').trim();
      const prescriptionLines = prescriptionRaw.split('\n').filter(l => l.trim().match(/^[-•*]|^##/)).slice(0, 6).join('\n').trim();
      // Build a specific suggested prompt from what the Supervisor already knows
      const suggestedPrompt = plain
        ? `__SUGGEST__${plain} — please write the complete corrected file using FULL FILE format (not surgical edits).`
        : `__SUGGEST__${userText} — please write the complete corrected files, not surgical edits.`;
      const _b64sug = Buffer.from(suggestedPrompt, 'utf8').toString('base64');
      // [FIX] Record actual failure reason not a hardcoded generic message
      const deadEndReason = failed.length > 0
        ? failed.join('; ')
        : plain || 'Worker produced no parseable file edits';
      const deadEndWhat = written.length === 0 && skipped.length === 0
        ? 'No files were written after retry'
        : `Skipped files: ${skipped.join(', ')}`;
      const deadEndNext = plain
        ? `Try: ${plain} -- use FULL FILE format`
        : 'Use FULL FILE format with complete file content';
      appendProjectDeadEnd(root, `fix-failed: ${userText.slice(0,80)}`, deadEndReason, deadEndWhat, deadEndNext);
      fixLog('FINAL FAILURE: no parseable output after retry', { plain, skipNote, failedErrors: failed });
      finalizeFixLogger();
      let failMsg = plain ? `**What I found:** ${plain}\n\n` : '';
      if (prescriptionLines) { failMsg += `**What to do:**\n${prescriptionLines}\n\n`; }
      failMsg += `The fix didn't apply cleanly. Click the button to retry with a more specific prompt:\n\n__RETRY_FIX__:${_b64sug}__END_RETRY__${skipNote}`;
      conversation[conversation.length - 1].content = failMsg;
      refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
    }
  }

  await runFixFinalize({ written, failed, skipped, fixSnapId, diagnosis, supervisorLabel, workerLabel, guardianLabel, scopeNote, needsAgentHandoff, userText, root, deps, activePatterns, conversation, refresh, allowedRels });
}
