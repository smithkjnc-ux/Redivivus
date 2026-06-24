// [SCOPE] Chat fix handler -- 3-phase Supervisor/Worker/Guardian bug fix pipeline
// Phase 1: Supervisor AI (best available) diagnoses ALL bugs.
// Phase 2: Worker AI generates complete corrected files.
// Phase 3: Guardian reviews (pass/fail only — no code correction). Compiler verifies correctness.
// [WARN] Always use routing.prompt() here -- routeByComplexity routes simple-looking bug reports
//        to Groq/cheap models which produce thin output and cause silent pipeline failure.

import * as vscode from 'vscode';
import { getActiveProjectRoot } from '../../services/project/activeProjectRoot.js';
import { isProjectsContainer } from '../../services/project/redivivusPaths.js';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { resolveSourceFiles, collectAllFixContext } from './chatPanelMsgFixContext';
import { detectPatterns } from './chatPanelMsgFixPatterns';
import { initFixLogger, fixLog, finalizeFixLogger } from '../../services/logging/fixPipelineLogger';
import { fixActStart, fixActSupervisor } from './fixActivityPanel.js';
import { fixSessionCostBefore, fixCostByline, fixErrorHint } from './chatPanelMsgFixUsage.js';
import { runFixPhase23 } from './chatPanelMsgFixPhase23.js';
import { progressScanning } from '../../services/ui/fixProgressStyle.js';

// [DEAD] _fixErrorHint moved to chatPanelMsgFixUsage.ts as fixErrorHint (Rule 9 split)
// [DEAD] Phase 2+3 loop moved to chatPanelMsgFixPhase23.ts (Rule 9 split)
// [DEAD] Context assembly moved to collectAllFixContext in chatPanelMsgFixContext.ts (Rule 9 split)
// [DEAD] resolveSourceFiles (subfolder fallback) moved to chatPanelMsgFixContext.ts (Rule 9 split)

export async function handleFixRequest(userText: string, deps: MessageHandlerDeps, imageBase64?: string, imageType?: string): Promise<void> {
  const { conversation, refresh } = deps;
  // [FIX] Resolve the ACTIVE project root — under Model A, workspace is the projects CONTAINER;
  // getActiveProjectRoot() returns the active subfolder so the fix stays in the right project.
  const root = getActiveProjectRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { await deps.handleBuildRequest(userText, true); return; }

  // [NO-PROJECT GUARD] A fix at the container would scan ALL sibling projects and land in the wrong place.
  if (isProjectsContainer(root)) {
    conversation.push({
      role: 'assistant',
      content: `\u{1F6AB} **No project is open.** You're in the projects home (\`~/projects\`), so a fix or edit would run against your **whole projects folder** instead of one project — almost certainly not what you want.\n\n**Open a project first**, then send your request again:\n• Click a project in the sidebar, or\n• **File → Open Folder** and pick the project.\n\n_(Building something new works fine from here — this guard only applies to fixes and edits.)_`,
      timestamp: Date.now(),
    });
    refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
  }

  const _costBefore = fixSessionCostBefore(deps, root);
  initFixLogger(root);
  fixLog('=== Fix Request Started ===', { userText, root, imageProvided: !!imageBase64 });

  const sourceFiles = await resolveSourceFiles(root, userText, deps, imageBase64, imageType);
  fixLog('File scan complete', { count: sourceFiles.length });
  // [FIX] Empty scaffold (no source files yet) — treat as a first build, not a fix.
  if (sourceFiles.length === 0) { await deps.handleBuildRequest(userText, true); return; }

  // [FILE_SIZE_GATE] Check for oversized files before firing any AI calls
  const { runFileSizeGate } = await import('./fileSizeGate.js');
  const gateResult = await runFileSizeGate(sourceFiles, deps);

  // [FIX] Auto-force surgical when largest file exceeds Worker output capacity.
  // The size gate catches 50KB+ but GPT-4o/Groq/Kimi cap at 16K/8K/16K tokens (~12-20KB).
  if (!gateResult.forceSurgical) {
    const { bestModelForRole } = await import('../../services/ai/modelRegistry.js');
    const { worker } = deps.routing.selectSupervisorAndWorker();
    const workerModel = worker ? bestModelForRole(worker, 'flash') : undefined;
    const workerOutputBytes = (workerModel?.outputK ?? 8) * 1000 * 3.5;
    const largestFile = sourceFiles.reduce((max: typeof sourceFiles[0], f: typeof sourceFiles[0]) => f.content.length > max.content.length ? f : max, sourceFiles[0]);
    if (largestFile && largestFile.content.length > workerOutputBytes) {
      fixLog(`[TOKEN_GATE] Forcing surgical: ${largestFile.rel} (${largestFile.content.length} chars > ${Math.round(workerOutputBytes)} limit)`);
      gateResult.forceSurgical = true;
    }
  }
  if (gateResult.shouldAbort) {
    finalizeFixLogger(); conversation.push({ role: 'assistant', content: 'Fix cancelled — the file is too large for reliable AI fixes. Try splitting it first.', timestamp: Date.now() });
    refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
  }

  const allowedRels = new Set<string>(sourceFiles.map((f: { rel: string }) => f.rel));
  let fileNames = sourceFiles.map((f: { rel: string }) => f.rel).join(', ');
  let filesBlock = sourceFiles.map((f: { rel: string; content: string }) => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');
  const activePatterns = detectPatterns(filesBlock, userText);

  // [PREVIEW-AUTOFIX Phase 1] Pre-flight Run-Check
  // If the user hasn't explicitly opened the preview, the runtime reports buffer is empty.
  // We must actually load the app headlessly so the AI can see the real errors before diagnosing.
  try {
    const { verifyPreviewRuns } = await import('../../ui/panels/chat/chatPanelPreviewVerify.js');
    deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });
    conversation.push({ role: 'assistant', content: 'Running the app to check for runtime errors...', timestamp: Date.now() });
    refresh();
    await verifyPreviewRuns(root, 2800);
    // Remove the temporary message
    conversation.pop();
  } catch {}

  const { buildContext, projectDeadEnds, projectRules, verificationCommand } = await collectAllFixContext(root, sourceFiles, userText, deps);

  deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });
  fixActStart(userText, sourceFiles.length);
  // [RULE 18] Size the Supervisor by UNDERSTANDING the request (tiny AI classifier), not regex.
  await (await import('../../services/ai/routeClassifier.js')).applyRouteTier(userText, true, deps);

  // Phase 1: Supervisor diagnoses ALL bugs
  conversation.push({ role: 'assistant', content: progressScanning({ fileCount: sourceFiles.length }), timestamp: Date.now() });
  refresh();
  let diagnosis = ''; let supervisorLabel = 'AI'; let subtasks: string[] = []; let executionMode: 'parallel' | 'sequential' = 'sequential';
  try {
    const { runPhase1Supervisor } = await import('./chatPanelMsgFixPhases.js');
    fixLog('Phase 1: Running Supervisor diagnosis...');
    const p1 = await runPhase1Supervisor(userText, filesBlock, buildContext, activePatterns, projectDeadEnds, projectRules, deps, root, imageBase64, imageType);
    if (!p1) { return; }
    diagnosis = p1.diagnosis;
    if (deps.turnContext) { deps.turnContext.artifacts.prescription = diagnosis; }
    subtasks = p1.subtasks;
    executionMode = p1.executionMode || 'sequential';
    if (p1.expandedFilesBlock !== filesBlock) {
      filesBlock = p1.expandedFilesBlock;
      [...filesBlock.matchAll(/^\/\/ === FILE: (.+?) ===/gm)].forEach(m => allowedRels.add(m[1]));
      fileNames = [...allowedRels].join(', ');
      fixLog('Phase 1: Supervisor expanded context', { newFileCount: allowedRels.size });
    }
    fixLog('Phase 1: Supervisor diagnosis received', { diagnosisPreview: diagnosis.substring(0, 500) });
    const _locLines = (diagnosis.match(/^.*\b(TARGET REGION|DO NOT TOUCH|WORKER_TIER|FULL FILE)\b.*$/gim) || []).map(l => l.trim()).slice(0, 8);
    if (_locLines.length) { fixLog('Phase 1: Region localization', { lines: _locLines }); }
    // [FIX] If the Supervisor's diagnosis mentions files not in allowedRels (e.g. prescribes editing
    // js/constants.js but it wasn't scanned), add them now so applyFixContent doesn't silently skip them.
    // Pattern: backtick paths, `path/to/file.ext`, or bare relative paths ending in a known extension.
    const diagMentionedFiles = [...diagnosis.matchAll(/`([^`\s]+\.[a-zA-Z0-9]{1,6})`|(?:^|\s)([\w./\\-]+\.[a-zA-Z0-9]{1,6})(?=\s|:|,|$)/gm)]
      .flatMap(m => [m[1], m[2]]).filter((f): f is string => !!f && !f.startsWith('http') && f.length < 100)
      .map(f => f.replace(/^\.\//, ''));
    for (const rel of diagMentionedFiles) {
      if (!allowedRels.has(rel)) {
        const absPath = require('path').join(root, rel);
        if (require('fs').existsSync(absPath)) {
          allowedRels.add(rel);
          const content = require('fs').readFileSync(absPath, 'utf-8');
          filesBlock += `\n\n// === FILE: ${rel} ===\n${content}`;
          fileNames = [...allowedRels].join(', ');
          fixLog(`[DIAG-EXPAND] Added Supervisor-prescribed file to allowedRels: ${rel}`);
        }
      }
    }
    supervisorLabel = p1.supervisorLabel;
    fixActSupervisor(diagnosis, supervisorLabel);
  } catch (err) {
    const _errMsg = err instanceof Error ? err.message : String(err);
    const _b64 = Buffer.from(userText, 'utf8').toString('base64');
    conversation[conversation.length - 1].content =
      `⚠️ **Something went wrong while analysing your fix.** ${fixErrorHint(_errMsg)}\n\n` +
      `_Details: ${_errMsg.slice(0, 600)}_${fixCostByline(deps, root, _costBefore)}\n\n` +
      `__RETRY_FIX__:${_b64}__END_RETRY__`;
    finalizeFixLogger(); refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
  }

  // [PLAN-GATE] High-stakes fix? Show plan, wait for user approval BEFORE any Worker or Agent runs.
  let approvedPlan: string | undefined;
  {
    let planFirst = false;
    try { planFirst = !!require('../../ui/panels/chat/chatPanel.js').ChatPanel.extensionContext?.globalState.get('redivivus.planFirst'); } catch { /* default off */ }
    const { shouldGateFix, runFixPlanGate } = await import('./chatPanelMsgFixPlanGate.js');
    if (shouldGateFix(diagnosis, subtasks, planFirst)) {
      const gate = await runFixPlanGate(deps, diagnosis, subtasks, fileNames, userText);
      if (!gate.proceed) { finalizeFixLogger(); refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return; }
      diagnosis = gate.diagnosis;
      approvedPlan = gate.approvedPlan;
      if (deps.turnContext) { deps.turnContext.artifacts.prescription = diagnosis; }
    }
  }

  // [AGENT-GATE] Supervisor emits [AGENT_HANDOFF] when the task needs environment (run/build/install).
  // Route straight to Agent — skip Worker/Verify/Guardian so we never write throwaway code.
  if (/\[AGENT_HANDOFF\]/i.test(diagnosis)) {
    fixLog('Supervisor routed to Agent at diagnosis time — skipping Worker/Verify/Guardian');
    const { executeAgentHandoff } = await import('./chatPanelMsgFixAgentHandoff.js');
    await executeAgentHandoff(deps, root, userText, [], undefined, conversation, approvedPlan, diagnosis);
    finalizeFixLogger(); refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
  }

  // Phase 2+3: Worker generates fix → Guardian reviews → retry/escalate if rejected
  await runFixPhase23({ subtasks, executionMode, diagnosis, fileNames, filesBlock, activePatterns, allowedRels, deps, root, supervisorLabel, userText, forceSurgical: gateResult.forceSurgical, approvedPlan, costBefore: _costBefore, projectDeadEnds, projectRules, buildContext, verificationCommand });
}
