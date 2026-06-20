// [SCOPE] Chat fix handler -- 3-phase Supervisor/Worker/Guardian bug fix pipeline
// Phase 1: Supervisor AI (best available) diagnoses ALL bugs.
// Phase 2: Worker AI generates complete corrected files.
// Phase 3: Guardian reviews (pass/fail only — no code correction). Compiler verifies correctness.
// [WARN] Always use routing.prompt() here -- routeByComplexity routes simple-looking bug reports
//        to Groq/cheap models which produce thin output and cause silent pipeline failure.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getActiveProjectRoot } from '../../services/project/activeProjectRoot.js';
import { isProjectsContainer } from '../../services/project/redivivusPaths.js';
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
import { fixActStart, fixActSupervisor, fixActFinish } from './fixActivityPanel.js';
import { fixSessionCostBefore, fixCostByline } from './chatPanelMsgFixUsage.js';

// [DEAD] modelLabel defined here -- moved to chatPanelMsgFixUtils.ts to keep this file under 200 lines

// [FIX] Classify a fix-pipeline failure into a plain-English hint. Distinguishes a USAGE/QUOTA limit (retry
// won't help — add credit or switch AI) from an auth/key problem from a genuine transient error. Without this,
// an Anthropic "you have reached your specified API usage limits" 400 was shown as "temporary network hiccup —
// try again", which is misleading (cry-wolf) and the wrong advice. ASCII-safe (plain text, used in chat markdown).
function _fixErrorHint(errMsg: string): string {
  if (/usage limit|rate.?limit|\bquota\b|insufficient.{0,12}(credit|balance|fund|quota)|reached your specified|regain access|\b429\b|too many requests|billing|payment required|\b402\b/i.test(errMsg)) {
    return 'Your AI provider has hit its usage limit or run out of credit. Add credit / raise the limit in your provider account, or switch to another configured AI from the picker below. Retrying will hit the same limit.';
  }
  if (/401|403|invalid.{0,10}(api.)?key|api.key.{0,10}(invalid|missing|expired)|unauthorized/i.test(errMsg)) {
    return 'This looks like an API key issue — check **Setup → AI API Keys**.';
  }
  return 'This is usually a temporary network hiccup — try again.';
}

export async function handleFixRequest(userText: string, deps: MessageHandlerDeps, imageBase64?: string, imageType?: string): Promise<void> {
  const { routing, conversation, refresh } = deps;
  // [FIX] Resolve the ACTIVE project root, not the raw workspace folder. Under Model A the workspace is the
  // projects CONTAINER (~/projects); using it made the fix scan the container, find no top-level source, then
  // (see the fallback below) reach into the FIRST sibling project alphabetically — it "fixed" `breakout` inside
  // a `frogger` project. getActiveProjectRoot() returns the active subfolder so the fix stays in this project.
  const root = getActiveProjectRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  // [FIX] No workspace open means no code to fix — treat as a new build request so autoCreateProject runs.
  if (!root) { await deps.handleBuildRequest(userText, true); return; }

  // [NO-PROJECT GUARD] A fix/edit needs a specific project. When the workspace is the bare projects container
  // (~/projects) with no project open, a fix would scan ALL sibling projects and land changes in the wrong
  // place (the "I forgot to open the project" trap). Warn and stop BEFORE any AI calls. Builds are exempt —
  // a build at the container legitimately creates a new project, so this guard lives only in the fix path.
  if (isProjectsContainer(root)) {
    conversation.push({
      role: 'assistant',
      content: `⚠️ **No project is open.** You’re in the projects home (\`~/projects\`), so a fix or edit would run against your **whole projects folder** instead of one project — almost certainly not what you want.\n\n**Open a project first**, then send your request again:\n• Click a project in the sidebar, or\n• **File → Open Folder** and pick the project.\n\n_(Building something new works fine from here — this guard only applies to fixes and edits.)_`,
      timestamp: Date.now(),
    });
    refresh();
    deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
    return;
  }

  // [FIX] Snapshot session cost now so every result message (incl. failures) can show THIS fix's cost (delta).
  const _costBefore = fixSessionCostBefore(deps, root);

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
  // [WARN] PARADOX GUARD: NEVER run this one-level-deep scan when root is the projects CONTAINER — its
  // subfolders are OTHER projects, and this loop would grab the first one (alphabetically) and edit a sibling
  // project's files. Only allowed when root is a real project (its subfolders are src/, lib/, etc.).
  if (sourceFiles.length === 0 && !isProjectsContainer(root)) {
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

  // [FIX] Auto-force surgical when largest file exceeds Worker output capacity.
  // File size gate only catches 50KB+ files, but GPT-4o/Groq/Kimi cap at 16K/8K/16K tokens (~12-20KB).
  // Without this check, FULL FILE output is always truncated for mid-size files on low-limit providers.
  if (!gateResult.forceSurgical) {
    const { bestModelForRole } = await import('../../services/ai/modelRegistry.js');
    const { worker } = deps.routing.selectSupervisorAndWorker();
    const workerModel = worker ? bestModelForRole(worker, 'flash') : undefined;
    // outputK is in thousands of tokens; 3.5 chars/token is conservative for code
    const workerOutputK = workerModel?.outputK ?? 8;
    const workerOutputBytes = workerOutputK * 1000 * 3.5;
    const largestFile = sourceFiles.reduce((max, f) => f.content.length > max.content.length ? f : max, sourceFiles[0]);
    if (largestFile && largestFile.content.length > workerOutputBytes) {
      fixLog(`[TOKEN_GATE] Forcing surgical: ${largestFile.rel} is ${largestFile.content.length} chars, worker ${workerModel?.modelId ?? worker} limit ~${Math.round(workerOutputBytes)} chars (${workerOutputK}K tokens)`);
      gateResult.forceSurgical = true;
    }
  }

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

  // [Stage 3] Query global dead end vault for matching community patterns
  let globalDeadEndCtx = '';
  try {
    const base = require('../../services/api/apiClient.js').getApiBase();
    const token = await require('../../services/api/apiClient.js').getAccountToken();
    const keywords = userText.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 10);
    const dqRes = await fetch(`${base}/dead-end-query/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ keywords }),
    });
    if (dqRes.ok) {
      const dqData = await dqRes.json() as { patterns?: any[] };
      if (dqData.patterns && dqData.patterns.length > 0) {
        globalDeadEndCtx = '\n\nGLOBAL DEAD END VAULT (community-verified patterns):\n' +
          dqData.patterns.map((p: any) => `- ${p.symptom}: ${p.supervisor_note}`).join('\n');
        fixLog(`[GLOBAL_VAULT] Injected ${dqData.patterns.length} community pattern(s)`);
      }
    }
  } catch (e) { fixLog('[GLOBAL_VAULT] Query failed (non-blocking)', { error: String(e) }); }

  const vaultCtx = (deps.vault && isVaultEnabled()) ? (() => { const h = findRelevantByTask(userText, deps.vault!.listItems()); return h.items.length > 0 ? formatVaultContext(h.items.slice(0, 4)) + '\n' : ''; })() : '';
  // [PHASE 2b] Share the recent conversation with the fix Supervisor AND Worker via the shared TurnContext, so
  // the fix isn't built from a re-summarized handoff — they see what the user actually said this turn (e.g. the
  // prior "build a frogger game" that this fix follows). Brings the fix path to parity with the build path,
  // which already threads recentChat. See docs/REDIVIVUS_INTENT_ARCHITECTURE.md.
  const convoCtx = (() => {
    const msgs = (deps.turnContext?.conversation ?? conversation)
      .filter(m => m.role === 'user')
      .slice(-4)
      .map(m => `- ${String(m.content).replace(/\s+/g, ' ').slice(0, 400)}`);
    return msgs.length ? `\n\nRECENT USER MESSAGES (this turn's intent — honor what they actually asked):\n${msgs.join('\n')}` : '';
  })();
  const buildContext = vaultCtx + collectFixContext(root, sourceFiles) + globalDeadEndCtx + convoCtx;
  const projectRules = readProjectRules(root);
  deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });

  // [FIX-ACTIVITY] Open the rich Build Activity panel for this fix so the user can WATCH the work (Supervisor
  // diagnosis -> Worker fix -> Guardian verdict), not just a vague chat bubble. Best-effort; never blocks.
  fixActStart(userText, sourceFiles.length);

  // [RULE 18] Size the Supervisor by UNDERSTANDING the request (tiny AI classifier), not regex. Offline-safe.
  await (await import('../../services/ai/routeClassifier.js')).applyRouteTier(userText, true, deps);

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
    // [PHASE 2b] Record the Supervisor's prescription on the shared turn so later stages read THIS, not a
    // re-summarized handoff. (Worker already gets it via `diagnosis`; this makes it first-class on the context.)
    if (deps.turnContext) { deps.turnContext.artifacts.prescription = diagnosis; }
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
    // [REGION MAP] Surface the localization decision explicitly — the 500-char preview above often truncates the
    // PRESCRIPTION, so pull the scope lines (TARGET REGION / DO NOT TOUCH / WORKER_TIER / FULL FILE) wherever they sit.
    const _locLines = (diagnosis.match(/^.*\b(TARGET REGION|DO NOT TOUCH|WORKER_TIER|FULL FILE)\b.*$/gim) || []).map(l => l.trim()).slice(0, 8);
    if (_locLines.length) { fixLog('Phase 1: Region localization', { lines: _locLines }); }
    supervisorLabel = p1.supervisorLabel;
    // [FIX-ACTIVITY] Show the Supervisor's verdict in the panel — a plain "Found: …" line plus the full
    // diagnosis as expandable detail, so the user can read exactly what it found.
    fixActSupervisor(diagnosis, supervisorLabel);

    // [PHASE-1-HARDENING] Agentic Fetch removed — complex asset orchestration moves to backend in Phase 2.

  } catch (err) {
    const _errMsg = err instanceof Error ? err.message : String(err);
    const _hint = _fixErrorHint(_errMsg);
    const _b64 = Buffer.from(userText, 'utf8').toString('base64');
    conversation[conversation.length - 1].content =
      `⚠️ **Something went wrong while analysing your fix.** ${_hint}\n\n` +
      `_Details: ${_errMsg.slice(0, 300)}_${fixCostByline(deps, root, _costBefore)}\n\n` +
      `__RETRY_FIX__:${_b64}__END_RETRY__`;
    finalizeFixLogger(); refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
  }

  // [PLAN-GATE] High-stakes fix? Show the plan — plain English + the EDITABLE steps — and wait for the user
  // to approve / edit / cancel BEFORE any Worker or Agent runs. Smart-trigger only (environment handoff or
  // multi-step), or always when Plan-First is on. runFixPlanGate is fail-open, so a gate hiccup never blocks.
  let approvedPlan: string | undefined; // the user-approved (possibly edited) plan — flows to the Agent path
  {
    let planFirst = false;
    try { planFirst = !!require('../../ui/panels/chat/chatPanel.js').ChatPanel.extensionContext?.globalState.get('redivivus.planFirst'); } catch { /* default off */ }
    const { shouldGateFix, runFixPlanGate } = await import('./chatPanelMsgFixPlanGate.js');
    if (shouldGateFix(diagnosis, subtasks, planFirst)) {
      const gate = await runFixPlanGate(deps, diagnosis, subtasks, fileNames, userText);
      if (!gate.proceed) { finalizeFixLogger(); refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return; }
      diagnosis = gate.diagnosis; // Worker path: carry the user's edits forward as the contract
      approvedPlan = gate.approvedPlan; // Agent path: carry the user's edits to the handoff
      if (deps.turnContext) { deps.turnContext.artifacts.prescription = diagnosis; }
    }
  }

  // [AGENT-GATE] Diagnosis-time handoff (bulletproof): the Supervisor decides up-front, BEFORE the Worker runs,
  // whether the task needs the environment (run/build/install/serve/test) and emits [AGENT_HANDOFF]. Route
  // straight to the Agent — skip Worker/Verify/Guardian so we never write throwaway code the direct editor
  // can't run or verify. (The Guardian gate is the safety net for tasks that slip past this earlier check.)
  if (/\[AGENT_HANDOFF\]/i.test(diagnosis)) {
    fixLog('Supervisor routed to Agent at diagnosis time — skipping Worker/Verify/Guardian');
    const { executeAgentHandoff } = await import('./chatPanelMsgFixAgentHandoff.js');
    await executeAgentHandoff(deps, root, userText, [], undefined, conversation, approvedPlan);
    finalizeFixLogger(); refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
    return;
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

      // [FIX] Verify prescribed files were actually written -- catches false success where Worker fixes wrong file.
      // Extract file mentions from PRESCRIPTION section of diagnosis.
      const prescriptionSection = diagnosis.match(/PRESCRIPTION:([\s\S]*?)(?:\[TRIVIAL\]|$)/)?.[1] ?? '';
      const prescribedFiles = [...prescriptionSection.matchAll(/`?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)`?/g)]
        .map(m => m[1])
        .filter(f => [...allowedRels].some(r => r.endsWith(f) || f.endsWith(r)));
      const unwrittenPrescribed = prescribedFiles.filter(f => !written.some(w => w.endsWith(f) || f.endsWith(w)));
      if (unwrittenPrescribed.length > 0 && written.length > 0) {
        fixLog('[PRESCRIPTION_CHECK] Prescribed files not written', { unwritten: unwrittenPrescribed, written });
        failed = [...failed, ...unwrittenPrescribed.map(f => `${f}: prescribed but not written`)];
        written = []; // Force retry
      }
    }
  } catch (err) {
    const _errMsg2 = err instanceof Error ? err.message : String(err);
    const _hint2 = _fixErrorHint(_errMsg2);
    const _b642 = Buffer.from(userText, 'utf8').toString('base64');
    conversation[conversation.length - 1].content =
      `⚠️ **Something went wrong while writing the fix.** ${_hint2}\n\n` +
      `_Details: ${_errMsg2.slice(0, 300)}_${fixCostByline(deps, root, _costBefore)}\n\n` +
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
      // [Stage 3] Extract failure pattern to global dead end vault
      try {
        const base3 = require('../../services/api/apiClient.js').getApiBase();
        const token3 = await require('../../services/api/apiClient.js').getAccountToken();
        const keysPayload3 = require('../../services/api/apiClient.js').collectKeys();
        const { supervisor: sup3 } = deps.routing.selectSupervisorAndWorker();
        fixLog('[GLOBAL_VAULT] Firing failure extract...');
        const extractRes3 = await fetch(`${base3}/dead-end-extract/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token3}` },
          body: JSON.stringify({
            outcome: 'failure',
            symptom: userText,
            deadEnds: projectDeadEnds,
            diagnosis,
            solution: null,
            projectPath: root,
            keys: keysPayload3,
            supervisorProvider: sup3,
          }),
        });
        fixLog('[GLOBAL_VAULT] Failure extract response', { status: extractRes3.status });
      } catch (e) { fixLog('[GLOBAL_VAULT] Extract failed (non-blocking)', { error: String(e) }); }
      finalizeFixLogger();
      let failMsg = plain ? `**What I found:** ${plain}\n\n` : '';
      if (prescriptionLines) { failMsg += `**What to do:**\n${prescriptionLines}\n\n`; }
      failMsg += `The fix didn't apply cleanly. Click the button to retry with a more specific prompt:\n\n__RETRY_FIX__:${_b64sug}__END_RETRY__${skipNote}${fixCostByline(deps, root, _costBefore)}`;
      conversation[conversation.length - 1].content = failMsg;
      fixActFinish([], failed.length ? failed : ['fix']); // [FIX-ACTIVITY] red finish marker
      refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
    }
  }

  // [FIX] A clean Guardian approval (or trivial-skip) means the fix passed review — tell finalize to skip the
  // redundant pattern-retry that was re-running the whole pipeline (the "approved then did it again" double-run).
  const guardianApproved = /approved|skipped/i.test(guardianNote || '');
  await runFixFinalize({ written, failed, skipped, fixSnapId, diagnosis, supervisorLabel, workerLabel, guardianLabel, scopeNote, needsAgentHandoff, userText, root, deps, activePatterns, conversation, refresh, allowedRels, guardianApproved });
}
