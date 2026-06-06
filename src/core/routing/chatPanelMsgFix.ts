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
  conversation.push({ role: 'assistant', content: 'Reading your project files...', timestamp: Date.now() });
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

    if (p1.requiresAssetFetch && p1.fetchInstructions) {
      fixLog('Phase 1.5: Executing Agentic Asset Fetch...');
      conversation.push({
          role: 'assistant',
          content: `> 🔄 **Agentic Asset Fetch Initiated:** Task requires massive external assets. Handing off to Terminal Agent to download them safely...`,
          timestamp: Date.now()
      });
      deps.refresh();
      
      try {
          const { executeAgentTask } = await import('../../services/ai/agentService.js');
          const agentCtx: any = {
              root: root,
              task: `[ASSET FETCH] ${p1.fetchInstructions}. Use cross-platform Node.js scripts (e.g. using 'https' or 'fs') instead of OS-specific tools like wget or curl if possible. DO NOT MODIFY EXISTING PROJECT CODE. ONLY download raw assets into the requested raw directory.\n\nANTI-BOT EVASION: If your fetch script fails with HTTP 403 or 429, you must dynamically adapt:\n1. First, modify your script to spoof a real browser User-Agent header.\n2. If the source still blocks you, immediately PIVOT and write a new script to download the assets from a developer-friendly mirror (like raw.githubusercontent.com or an open API) instead of fighting the firewall.`,
              log: (msg: string) => { conversation.push({ role: 'assistant', content: msg, timestamp: Date.now() }); deps.refresh(); },
              modifiedFiles: new Set<string>(),
              snapshotId: undefined,
              routing: deps.routing,
              blueprintContext: ''
          };
          await executeAgentTask(agentCtx.task, 'Project Context: Downloading massive assets', deps.routing, agentCtx, agentCtx.log);
          
          conversation.push({
              role: 'assistant',
              content: `> ✅ **Assets Fetched!** Returning to Surgical Worker to modularize them into the codebase...`,
              timestamp: Date.now()
          });
          deps.refresh();
      } catch (e) {
          fixLog('Phase 1.5: Agentic Fetch Failed', { error: String(e) });
          throw new Error("Agentic Asset Fetch Failed: " + String(e));
      }
    }

  } catch (err) {
    const _errMsg = err instanceof Error ? err.message : String(err);
    const _isKeyErr = /401|403|invalid.{0,10}(api.)?key|api.key.{0,10}(invalid|missing|expired)|unauthorized/i.test(_errMsg);
    const _hint = _isKeyErr ? 'This looks like an API key issue — check **Setup → AI API Keys**.' : 'This is usually a temporary network hiccup — try again.';
    const _b64 = Buffer.from(userText, 'utf8').toString('base64');
    conversation[conversation.length - 1].content =
      `⚠️ **Something went wrong while analysing your fix.** ${_hint}\n\n` +
      `_Details: ${_errMsg.slice(0, 300)}_\n\n` +
      `__RETRY_FIX__:${_b64}__END_RETRY__`;
    refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
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
      conversation[conversation.length - 1].content = 'Found the issue — writing the fix now...';
      refresh();
      const { runEscalationLoop } = await import('./chatPanelMsgFixEscalation.js');
      fixLog('Phase 2: Starting Worker fix application...');
      const escalation = await runEscalationLoop({ diagnosis, fileNames, filesBlock, activePatterns, deps, root, supervisorLabel });
      finalResponse = escalation.finalResponse;
      workerLabel = escalation.workerLabel;
      fixLog('Phase 2: Worker response received', { 
        preview: finalResponse.substring(0, 500), 
        totalLength: finalResponse.length,
        workerLabel
      });
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
    refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
  }
  
  if (written.length === 0) {
    const { retryNoOutput } = await import('./chatPanelMsgFixRetry.js');
    const retryResult = await retryNoOutput({ diagnosis, filesBlock, fileNames, activePatterns, allowedRels, deps, userText, conversation, refresh, supervisorLabel, root, failedErrors: failed });
    if (retryResult.written.length > 0) {
      written = retryResult.written; failed = retryResult.failed; skipped = retryResult.skipped; fixSnapId = retryResult.fixSnapId; workerLabel = retryResult.workerLabel;
    } else {
      const plain = diagnosis.match(/^PLAIN:\s*(.+?)(?:\n|$)/m)?.[1]?.trim() ?? '';
      const skipNote = skipped.length > 0 ? `\n\n⚠️ AI tried to create ${skipped.length} file(s) not in this project: ${skipped.join(', ')}` : '';
      appendProjectDeadEnd(root, `fix-no-output: ${userText.slice(0,80)}`, plain || 'Worker produced no parseable file edits', 'No FILE: blocks or SEARCH/REPLACE markers after two attempts', 'Add FILE: header with fenced code block for each changed file');
      conversation[conversation.length - 1].content = (plain ? `**What I found:** ${plain}\n\n` : '') + `Couldn't make the change automatically. Try describing what to fix in more detail.${skipNote}`;
      refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
    }
  }

  // Auto-retry if known patterns survived the first write — transparent to user on success
  const { retryPatternFix } = await import('./chatPanelMsgFixRetry.js');
  const retryRes = await retryPatternFix({ written, activePatterns, root, diagnosis, supervisorLabel, allowedRels, deps, userText, conversation, refresh });
  if (retryRes.retried && retryRes.written.length > 0) { written = retryRes.written; workerLabel = retryRes.workerLabel; }

  finalizeFixLogger();
  const { presentFixResult } = await import('./chatPanelMsgFixOutput.js');
  await presentFixResult({ written, failed, skipped, fixSnapId, diagnosis, supervisorLabel, workerLabel, guardianLabel, scopeNote, userText, root, deps, activePatterns });
  if (written.length > 0) { try { await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, written[0])), { preview: false, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }); } catch {} }

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

  // Auto-capture fixed files to vault so the fix pattern is reusable
  fixLog('=== Fix Request Completed ===', { written, failed });
  if (deps.vault && written.length > 0) {
    const absPaths = written.map(f => path.join(root, f));
    const projectName = path.basename(root);
    const fixTask = `fix: ${userText.slice(0, 120)}`;
    const callAI = (p: string) => deps.routing.prompt(p, 12_000);
    const { autoCaptureFiles } = await import('../../services/vault/vaultAutoCapture.js');
    autoCaptureFiles(absPaths, projectName, deps.vault, fixTask, callAI).catch(() => { /* best-effort */ });
  }
}
