// [SCOPE] Chat message handler: send-message — the main user chat path
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.
// [RULE 18] Intent classification uses AI (deps.classifyIntent), never regex pattern matching.
// [DONE] Rule 9 split: confirmed build extracted to chatPanelMsgSendConfirmedBuild.ts

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages';

import { handleAIChat } from './chatPanelMsgSendAI';
import { handleKeywordShortcuts } from './chatPanelMsgSendKeywords';
import { handleFixRequest } from './chatPanelMsgFix';
import { handleRunIntent, handleScaffoldIntent, handleServiceIntent } from './chatPanelMsgIntentActions';
import { handleUrlRead, handleWebSearch, handleRememberIntent, handleReadResult } from './chatPanelMsgSendEarlyExits';
import { runAgentMode } from './chatPanelMsgSendAgent';

import { runChatClarifyStep } from './chatPanelMsgSendClarify';
import { handleBuildIntent } from './chatPanelMsgSendBuildIntent';
import { checkBuildConfirmation, getWorkspaceFileList } from './chatPanelMsgSendConfirmCheck';
import { fixLog } from '../../services/logging/fixPipelineLogger';
import { createTurnContext } from './turnContext.js';
import { getActiveProjectRoot } from '../../services/project/activeProjectRoot.js';
import { isProjectsContainer } from '../../services/project/redivivusPaths.js';
import { handleChangeRequest } from './handleChangeRequest.js';
import { checkProjectContextGuard } from './chatPanelProjectContextGuard.js';

export async function handleSendMessage(msg: any, deps: MessageHandlerDeps, buildMode?: any): Promise<void> {
  const { conversation, refresh } = deps;
  const userText = msg.text?.trim();
  if (!userText) { return; }

  const { getAccountToken } = await import('../../services/api/apiClient.js');
  if (!(await getAccountToken())) {
    conversation.push({
      role: 'assistant',
      content: '🔒 **Sign in to use Redivivus**\n\nOpen the command palette and run **Redivivus: Sign In** to connect your account.',
      timestamp: Date.now(),
    });
    refresh();
    vscode.commands.executeCommand('redivivus.signIn');
    return;
  }

  // [FIX] fromBlueprintCard: skip the verbose enriched-task user bubble — card is already the context
  if (!msg.fromBlueprintCard) {
    const _lastSm = conversation[conversation.length - 1];
    if (!_lastSm || _lastSm.role !== 'user' || _lastSm.content !== userText) { conversation.push({ role: 'user', content: userText, timestamp: Date.now() }); }
    refresh();
    if (!/\bdone.*session\b|\bstart.*session\b/i.test(userText)) { try { const _CP = require('../../ui/panels/chat/chatPanel.js').ChatPanel; const ss = (_CP as any).startSessionSilent; if (ss) { ss(userText); } } catch {} }
  }

  // [PHASE 0] Create the shared TurnContext for this turn and thread it via deps. Scaffold only — nothing
  // reads it yet, so behavior is unchanged. The `hint` is set at each routing decision below for later phases.
  // See docs/REDIVIVUS_INTENT_ARCHITECTURE.md.
  const _bpForCtx = deps.redivivus.isInitialized() ? (deps.redivivus.loadConfig?.() as any)?.blueprint : undefined;
  const turnCtx = createTurnContext(userText, conversation, { projectRoot: getActiveProjectRoot(), blueprint: _bpForCtx });
  deps.turnContext = turnCtx;

  // [FIX][BUILD-NOT-FIX] A confirmed blueprint card is unambiguously a BUILD. Skip re-classification here —
  // cloudChat flips the enriched task to 'fix' when the workspace holds existing project folders (it read
  // "arcade game collection addition" + the 12 sibling folders as "modify my collection"). That misroute
  // ran the FIX pipeline ("Scanning N files", "fix didn't apply"), wrote a surgical edit, and created NO
  // project folder. Route straight to the build path, which auto-creates the project subfolder and builds.
  if (msg.fromBlueprintCard) {
    turnCtx.hint = { action: 'build', task: userText };
    await handleBuildIntent(userText, userText, msg, deps, conversation, refresh);
    return;
  }

  const lowerText = userText.toLowerCase();

  // [FIX] Skip keyword shortcuts for blueprint card confirmations — the enriched task text contains
  // portfolio/project language that trips the "my.*project" keyword pattern and shows the wrong picker.
  if (!msg.fromBlueprintCard && await handleKeywordShortcuts(userText, lowerText, deps)) { return; }
  if (!msg.fromBlueprintCard && await handleUrlRead(userText, lowerText, conversation, refresh)) { return; }
  if (!msg.fromBlueprintCard && await handleWebSearch(userText, lowerText, conversation, refresh)) { return; }
  if (await handleRememberIntent(userText, conversation, refresh)) { return; }
  if (await handleReadResult(lowerText, conversation, refresh)) { return; }

  // ── Build confirmations — extracted to chatPanelMsgSendConfirmCheck.ts (Rule 9 split) ──
  if (await checkBuildConfirmation(lowerText, userText, deps, conversation, refresh)) { return; }

  // [FIX] Pre-classification: if workspace is open and message looks like a bug report,
  // skip the general chat classifier and go directly to fix pipeline.
  const hasWorkspace = !!vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const looksLikeBugReport = hasWorkspace && (
    /\b(blank|empty|not working|broken|error|crash|freeze|hang|slow|weird|strange|bug|issue|problem|fix|correct|repair)\b/i.test(lowerText) ||
    /\b(preview|browser|screen|display|render|show|load|fetch)\b.*\b(broken|fail|error|blank|empty|not)/i.test(lowerText) ||
    /\b(game|app|page|site|project)\b.*\b(broken|not working|blank|empty|weird)/i.test(lowerText)
  );
  if (looksLikeBugReport) {
    turnCtx.hint = { action: 'fix' };
    fixLog(`[PRE-CLASSIFY] Bug report detected, routing to fix pipeline: "${userText.slice(0, 60)}..."`);
    await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
    return;
  }
  // ── Project context guard — runs before any AI call ──
  // Blocks new builds inside an open project; blocks fix/edit with no project open.
  // Compound commands ("open X then build Y") always pass through.
  const _ctxBlock = checkProjectContextGuard(userText, conversation, refresh);
  if (_ctxBlock) {
    conversation.push({ role: 'assistant', content: _ctxBlock, timestamp: Date.now() });
    refresh();
    deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
    return;
  }

  // [FIX] Replaces broken cloudClassify() (/classify never existed) + promptCheap() (wrong model for Q&A).
  const { cloudChat } = await import('../../services/api/apiClientChat.js');
  const _cfgBlueprint = deps.redivivus.isInitialized() ? (deps.redivivus.loadConfig?.() as any)?.blueprint : undefined;
  const _wsRootFL = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  // [CONTEXT] Pass project state to cloudChat so the backend AI classifier knows if a project is open.
  // Without this the AI can return action='build' for a fix request inside a project, or vice versa.
  const _hasProjectOpen = _wsRootFL ? require('fs').existsSync(require('path').join(_wsRootFL, '.redivivus', 'config.json')) : false;
  const chatResult = await cloudChat(userText, {
    blueprint: _cfgBlueprint,
    recentMessages: conversation.slice(-6).map(m => ({ role: m.role, content: m.content })),
    currentTime: new Date().toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    personality: vscode.workspace.getConfiguration('redivivus').get<string>('personality', 'plain'),
    fileList: _wsRootFL ? getWorkspaceFileList(_wsRootFL) : undefined,
    preferred: (msg.manualProvider as string | undefined) || undefined,
    // [CONTEXT] Tell the backend whether a project is open — so the classifier can't return build inside a project
    projectOpen: _hasProjectOpen,
  }, msg.tier as 'flash' | 'pro' | 'ultra' | undefined).catch(() => null);

  // [FIX] cloudChat returned null — backend unavailable or all providers capped (e.g. Claude billing).
  // Smart local fallback: if workspace is open and text has clear fix signals, route to handleFixRequest
  // (which uses routing.prompt() with full failover). Otherwise Q&A via handleAIChat.
  // [WARN] Do NOT go to handleAIChat for fix requests — it uses promptCheap which silently fails for code.
  if (!chatResult) {
    const _hasWs = !!vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const _looksLikeFix = _hasWs && /\b(cannot|can't|cant|won't|wont|doesn't|doesnt|not working|broken|fails|failing|stuck|wrong|missing|error|crash|freeze|hang|glitch|bug|issue|problem|blank|empty)\b/i.test(userText);
    if (_looksLikeFix) {
      fixLog(`[CLOUD-NULL-FALLBACK] cloudChat null + fix signals → fix pipeline`);
      await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
      return;
    }
    await handleAIChat(msg, userText, deps, conversation, refresh, { manualProvider: (msg.manualProvider as string) || undefined });
    return;
  }
  // [FIX] doSend() calls setInputBusy(true); only set-status:ready releases it on all non-build paths.
  const releaseInput = () => setTimeout(() => deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }), 200);
  if (chatResult.action === 'offtopic') { chatResult.action = 'answer'; }
  // [PHASE 1] Record the classifier's decision + confidence as the turn hint — now READ (just below). In
  // Phase 3 the Supervisor, not this hint, will decide build-vs-fix for code requests.
  turnCtx.hint = { action: chatResult.action, task: chatResult.task, confidence: chatResult.confidence, model: chatResult.model, provider: chatResult.provider };
  // [PHASE 1] First soft-signal use of the hint: a LOW-confidence 'fix' with NO project open can't be a real
  // fix (there's nothing to fix) — it's almost certainly a build. Flip it here so we skip the fix-pipeline
  // churn ("Scanning… no files… building instead") and route straight to build. Absent/high confidence is
  // unchanged (?? 1), so obvious cases behave exactly as before. (Backend must emit confidence — needs deploy.)
  if (chatResult.action === 'fix' && (chatResult.confidence ?? 1) < 0.5 && isProjectsContainer(getActiveProjectRoot() || '')) {
    fixLog(`[PHASE1] low-confidence fix (conf=${chatResult.confidence}) with no active project -> routing as build`);
    chatResult.action = 'build';
    if (turnCtx.hint) { turnCtx.hint.action = 'build'; }
  }

  const PROVIDER_LABEL: Record<string, string> = { claude: 'Claude', gemini: 'Gemini', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', deepseek: 'DeepSeek' };
  const _m = chatResult.model || '', _pr = PROVIDER_LABEL[chatResult.provider] ?? 'Claude';
  const _ms = _m.includes('haiku')?'Haiku':_m.includes('sonnet')?'Sonnet':_m.includes('opus')?'Opus':_m.includes('flash')?'Flash':_m.includes('4o-mini')?'GPT-4o mini':_m.includes('4o')?'GPT-4o':'';
  const _byline = `${_pr}${_ms&&_ms!==_pr?' '+_ms:''} · ↑${chatResult.inputTokens??0} ↓${chatResult.outputTokens??0} tok`;

  if (chatResult.action === 'answer' || chatResult.action === 'clarify') {
    // [FIX][SILENT-DROP] The classifier sometimes returns a BUILD request mislabeled as answer/clarify,
    // with the build JSON embedded in `text`. The old code blanked that text and RETURNED — silently
    // dropping the build (spinner cleared via releaseInput, nothing rendered, no project created). Now we
    // detect the embedded build-spec and route it as a real build instead of dropping it, pulling the task
    // out of the spec when present. (See REDIVIVUS_FIXES.md — this was the "nothing happens" bug.)
    const isBuildSpec = /[`\s]*\{[\s\S]*"action"\s*:\s*"build"/i.test(chatResult.text?.trim() ?? '');
    if (isBuildSpec) {
      try {
        const _m2 = chatResult.text.match(/\{[\s\S]*\}/);
        if (_m2) { const _spec = JSON.parse(_m2[0]); if (_spec && typeof _spec.task === 'string' && _spec.task.trim()) { chatResult.task = _spec.task.trim(); } }
      } catch { /* keep userText as the task */ }
      chatResult.action = 'build';
      // fall through to the build routing below — do NOT return
    } else {
      if (chatResult.text) {
        conversation.push({ role: 'assistant', content: `${chatResult.text}\n\n---\n*-- ${_byline}*`, timestamp: Date.now() });
        refresh();
      }
      releaseInput();
      await deps.usageTracker?.recordUsage(chatResult.inputTokens + chatResult.outputTokens, 0, chatResult.model, chatResult.inputTokens, chatResult.outputTokens, 'qa').catch(() => {});
      return;
    }
  }
  if (chatResult.action === 'command' && chatResult.task) {
    try { await vscode.commands.executeCommand(chatResult.task); } catch { /* needs args or unknown — still show text */ }
    conversation.push({ role: 'assistant', content: chatResult.text || `Done -- **${chatResult.task.replace(/^(redivivus|workbench\.action)\./, '').replace(/([A-Z])/g, ' $1').trim()}**`, timestamp: Date.now() });
    refresh(); releaseInput(); return;
  }
  if (chatResult.action === 'personality-picker') {
    conversation.push({ role: 'assistant', content: `${chatResult.text}\n\n---\n*-- ${_byline}*`, timestamp: Date.now() });
    refresh(); releaseInput();
    setTimeout(() => import('../../commands/personalityPicker.js').then(m => m.pickPersonality()), 400);
    return;
  }
  if (chatResult.action === 'run') { releaseInput(); await handleRunIntent({ type: 'run' }, deps, conversation, refresh); return; }
  if (chatResult.action === 'convert') { await handleAIChat(msg, userText, deps, conversation, refresh, { isConvert: true, manualProvider: (msg.manualProvider as string) || undefined }); return; }

  const intent = { type: chatResult.action as 'build' | 'fix' | 'scaffold' | 'service' };
  const _claudeTask = chatResult.task || userText;
  // [FIX] Guaranteed feedback: ALWAYS show an indicator the moment a build intent is detected, so a build
  // never looks frozen while the AI infers/plans. Use the animated __BUILD_WORKING__ marker only on the
  // card re-entry path (runBuildAfterGates clears it); on the first message use a plain line so we never
  // leave a spinner stuck above the blueprint card.
  if (intent.type === 'build') {
    const _wm = msg.fromBlueprintCard ? ' __BUILD_WORKING__' : '';
    conversation.push({ role: 'assistant', content: `Analyzing your build...${_wm}`, timestamp: Date.now() });
    refresh();
  }
  let clarify = { cancelled: false, routedText: userText };
  let _jobTier = 'offer-choices'; // hoisted for Stage 4 diagnostic

  // [P0] Clarify wizard runs ONLY in explicit Guided mode. An unset mode means Auto (skip the wizard) —
  // it must never be treated as "ask 5 questions first." (Was `!== 'direct'`, which fired by default.)
  const _wsR = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const _pd = (vscode.workspace.getConfiguration('redivivus').get('projectsDirectory', '~/projects') as string).replace('~', require('os').homedir());
  if (!msg.fromPreview && deps.buildMode === 'plan' && intent.type === 'build' && _wsR && require('path').resolve(_wsR) !== require('path').resolve(_pd)) {
    const { sizeJob } = await import('../ai/jobSizer.js');
    const jobSize = await sizeJob(userText, deps.routing);
    _jobTier = jobSize.tier;
    if (jobSize.tier === 'tell-them') {
      // Supervisor acknowledges trivial task — no questions, straight to build
      conversation.push({ role: 'assistant', content: 'Got it — on it.', timestamp: Date.now() });
      refresh();
    } else {
      try {
        clarify = await runChatClarifyStep(userText, deps.routing, conversation, refresh, jobSize.suggestedQuestions);
        if (clarify.cancelled) { return; }
      } catch (_e) {
        // [FIX] Never silently swallow clarify errors — fall through to build
      }
    }
  }
  let routedText = clarify.routedText;

  // [STRIP-0] Adaptive-planning strip-down Step 0 (naked body test). Commented out — NOT deleted — the
  // three extra pre-build AI stages (Five W's diagnostic, Visual Spec, Adaptive complexity routing) so the
  // build path is the bare body: classify -> infer -> confirm card -> build. Each was an extra AI call that
  // ran on every build and is a misfire surface. Re-evaluate each as an opt-in garment in Step 3.
  // See docs/REDIVIVUS_ADAPTIVE_PLANNING.md (STATUS LOG). To restore: uncomment the [DEAD] block below.
  /* [DEAD][STRIP-0] Stages 4, 5, Adaptive — preserved for restore
  // Stage 4 — Five W's pre-commit diagnostic (goal-alignment + WHO calibration before build fires)
  {
    const { runFiveWsDiagnostic, handleMismatch } = await import('../ai/fiveWsDiagnostic.js');
    const diagnostic = await runFiveWsDiagnostic(routedText, _jobTier, intent.type, deps.routing);
    // [P0] In Auto ('direct') mode the AI NEVER interrogates the user — it infers and the blueprint card
    // confirms; correction is cheap (P3). Only Guided ('plan') mode pauses to resolve a 5W mismatch.
    // (The runFiveWsDiagnostic call above is silent — no user prompt — so we still get WHO calibration.)
    if (!diagnostic.aligned && deps.buildMode === 'plan') {
      const resolved = await handleMismatch(diagnostic, routedText, deps.routing, conversation, refresh);
      if (!resolved) { return; } // user cancelled or chose "let me explain"
      routedText = resolved;
    }
    // WHO calibration: append experience level so Guardian calibrates response depth
    if (diagnostic.who !== undefined) {
      const whoDesc = diagnostic.who < 0.35 ? 'non-technical -- explain outcomes, no code jargon'
        : diagnostic.who < 0.7 ? 'intermediate -- name files but explain what they do'
        : 'technical -- use technical terms, be concise';
      routedText += `\n\nUSER EXPERIENCE LEVEL: ${diagnostic.who.toFixed(1)} (${whoDesc})`;
    }
  }

  // Stage 5 — Visual Spec: establish visual contract before build fires (UI requests only)
  if (!msg.fromPreview && (intent.type === 'build' || intent.type === 'scaffold')) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      try {
        const { shouldRunVisualSpec, orchestrateVisualSpec, formatVisualContractBlock, setCurrentSpec } = await import('../ai/visualSpecService.js');
        if (shouldRunVisualSpec(routedText, _jobTier, root)) {
          const { spec, statusMsg } = await orchestrateVisualSpec(routedText, root, deps.routing);
          setCurrentSpec(spec);
          routedText += formatVisualContractBlock(spec);
          conversation.push({ role: 'assistant', content: statusMsg, timestamp: Date.now() });
          refresh();
        }
      } catch { // visual spec optional -- never block a build
      }
    }
  }

  // ── Adaptive Mode — auto-route between simple pipeline and agent pipeline ──
  const blueprintConfirmed = routedText !== userText && routedText.startsWith('Build:');
  const { evaluateTaskComplexity } = await import('../../services/ai/adaptiveClassifier.js');
  const route = blueprintConfirmed ? 'simple' : await evaluateTaskComplexity(routedText, deps.routing);
  if (route === 'complex') {
    conversation.push({ role: 'assistant', content: 'Adaptive: Routing to Agent Pipeline (environment task detected)...', timestamp: Date.now() });
    refresh();
    await runAgentMode(routedText, deps, conversation, refresh);
    return;
  }
  [DEAD][STRIP-0] end preserved block */

  // ── Final routing by intent — use Claude's extracted task when available ──
  // [PHASE 2a] build + fix now route through the unified handleChangeRequest seam (single context-owning
  // entrypoint). Behaviour-preserving: it dispatches to the same pipelines (fix gets the original userText via
  // turnCtx.rawMessage; build gets routedText||task). scaffold/service stay inline (different pipelines).
  if (intent.type === 'fix' || intent.type === 'build') {
    await handleChangeRequest(msg, deps, { intent: intent.type, routedText: routedText || _claudeTask, claudeTask: _claudeTask });
    return;
  }
  if (intent.type === 'scaffold') { await handleScaffoldIntent(_claudeTask, deps, conversation, refresh); return; }
  if (intent.type === 'service') { await handleServiceIntent(_claudeTask, deps, conversation, refresh); return; }

  await handleAIChat(msg, userText, deps, conversation, refresh);
}
