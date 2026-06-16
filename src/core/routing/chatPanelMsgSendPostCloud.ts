// [SCOPE] Post-cloudChat routing — processes the AI classifier result and dispatches to the
// correct pipeline (answer, build, fix, scaffold, service, command, run, convert, personality-picker).
// THIS IS WHERE THE SILENT-DROP BUG FIX LIVES: empty answer/clarify text inside an open
// project with an imperative message is now recovered to the fix pipeline instead of being silently
// discarded. Extracted from chatPanelMsgSendMessage.ts (Rule 9 split — was 345 lines).
// [WARN] Never add new intent actions here without also registering them in the ChatResult type (apiClientChat.ts).

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages';
import type { ChatResult } from '../../services/api/apiClientChat';
import { handleFixRequest } from './chatPanelMsgFix';
import { handleAIChat } from './chatPanelMsgSendAI';
import { handleRunIntent, handleScaffoldIntent, handleServiceIntent } from './chatPanelMsgIntentActions';
import { runChatClarifyStep } from './chatPanelMsgSendClarify';
import { handleBuildIntent } from './chatPanelMsgSendBuildIntent';
import { fixLog } from '../../services/logging/fixPipelineLogger';
import { calcCost } from '../../services/usageTracker';
import { isProjectsContainer } from '../../services/project/redivivusPaths.js';
import { getActiveProjectRoot } from '../../services/project/activeProjectRoot.js';
import { handleChangeRequest } from './handleChangeRequest.js';

// Routes the resolved chatResult from the AI classifier to the correct pipeline.
// Called after cloudChat succeeds (non-null). Returns void — all side effects are via deps/conversation.
export async function routeCloudChatResult(
  msg: any,
  userText: string,
  deps: MessageHandlerDeps,
  conversation: any[],
  refresh: () => void,
  chatResult: ChatResult,
  effectiveRoot: string | undefined,
  hasProjectOpen: boolean,
): Promise<void> {

  // [DIAG] Direct write — fixLog is silent until initFixLogger() is called (only happens inside handleFixRequest).
  // Use appendFileSync so this ALWAYS appears in ~/redivivus_debug.log regardless of pipeline state.
  const _dbg = require('fs').appendFileSync.bind(null, require('os').homedir() + '/redivivus_debug.log');
  _dbg(`[CLOUD-RESULT] action=${chatResult.action} conf=${chatResult.confidence ?? 'n/a'} text="${(chatResult.text ?? '').slice(0, 80)}" hasProject=${hasProjectOpen}\n`);

  const releaseInput = () => setTimeout(() => deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }), 200);
  if (chatResult.action === 'offtopic') { chatResult.action = 'answer'; }

  // [SUPERVISOR_TIER] Reuse chat pre-pass complexity tier to size the fix Supervisor's model.
  if (chatResult.resolvedTier) { deps.supervisorTierHint = chatResult.resolvedTier; }

  // [PHASE 1] Record classifier decision on TurnContext.
  const turnCtx = deps.turnContext;
  if (turnCtx) {
    turnCtx.hint = { action: chatResult.action, task: chatResult.task, confidence: chatResult.confidence, model: chatResult.model, provider: chatResult.provider };
  }

  // [PHASE 1] Low-confidence 'fix' with no project open → flip to build (nothing to fix).
  if (chatResult.action === 'fix' && (chatResult.confidence ?? 1) < 0.5 && isProjectsContainer(getActiveProjectRoot() || '')) {
    fixLog(`[PHASE1] low-confidence fix (conf=${chatResult.confidence}) with no active project -> routing as build`);
    chatResult.action = 'build';
    if (turnCtx?.hint) { turnCtx.hint.action = 'build'; }
  }

  // [FIX] Hard rule: cannot BUILD a new project from INSIDE an open one. Misclassified 'build'
  // while a project is open (e.g. "add sounds to the vehicles") → treat as fix/modification.
  if (chatResult.action === 'build' && hasProjectOpen && !isProjectsContainer(effectiveRoot || '')) {
    fixLog(`[BUILD-IN-PROJECT] classifier returned build inside an open project -> routing as fix`);
    chatResult.action = 'fix';
    chatResult.task = chatResult.task || userText;
    if (turnCtx?.hint) { turnCtx.hint.action = 'fix'; }
  }

  // ── Cost / byline helpers ──
  const PROVIDER_LABEL: Record<string, string> = { claude: 'Claude', gemini: 'Gemini', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', deepseek: 'DeepSeek' };
  const _m = chatResult.model || '', _pr = PROVIDER_LABEL[chatResult.provider] ?? 'Claude';
  const _ms = _m.includes('haiku') ? 'Haiku' : _m.includes('sonnet') ? 'Sonnet' : _m.includes('opus') ? 'Opus' : _m.includes('flash') ? 'Flash' : _m.includes('4o-mini') ? 'GPT-4o mini' : _m.includes('4o') ? 'GPT-4o' : '';
  const _cost = calcCost(chatResult.model || '', chatResult.inputTokens ?? 0, chatResult.outputTokens ?? 0);
  const _costStr = _cost < 0.00005 ? '<$0.0001' : '$' + _cost.toFixed(_cost < 0.01 ? 4 : 2);
  const _byline = `${_pr}${_ms && _ms !== _pr ? ' ' + _ms : ''} · ↑${chatResult.inputTokens ?? 0} ↓${chatResult.outputTokens ?? 0} tok · ${_costStr}`;

  // ── answer / clarify ──
  if (chatResult.action === 'answer' || chatResult.action === 'clarify') {
    // [FIX][SILENT-DROP] Classifier returned a BUILD spec embedded in answer/clarify text — rescue it.
    const isBuildSpec = /[`\s]*\{[\s\S]*"action"\s*:\s*"build"/i.test(chatResult.text?.trim() ?? '');
    if (isBuildSpec) {
      try {
        const _m2 = chatResult.text.match(/\{[\s\S]*\}/);
        if (_m2) { const _spec = JSON.parse(_m2[0]); if (_spec && typeof _spec.task === 'string' && _spec.task.trim()) { chatResult.task = _spec.task.trim(); } }
      } catch { /* keep userText as the task */ }
      // [FIX] BUILD spec inside an open project → fix, not build.
      // The backend embedded a "build" action in answer text, but we're already inside a project.
      // Route straight to fix so the Supervisor applies the change rather than launching a new build wizard.
      // [FIX] ...UNLESS the root is a projects CONTAINER (e.g. ~/projects holding many apps). A new build
      // spec there is a brand-new app, not a modification of the container — fall through to build so it
      // gets a blueprint + its own sub-project, matching the clean-`action:"build"` path at line 61. Without
      // this guard, a malformed (answer-wrapped) build response silently became a fix with no blueprint.
      if (hasProjectOpen && !isProjectsContainer(effectiveRoot || '')) {
        _dbg(`[BUILD-SPEC-IN-PROJECT] isBuildSpec + hasProject → routing to fix directly\n`);
        await handleFixRequest(chatResult.task || userText, deps, msg.imageBase64, msg.imageType);
        return;
      }
      chatResult.action = 'build';
      // fall through to build routing below — do NOT return
    } else {
      const _isImperative = /\b(add|make|change|update|fix|repair|remove|delete|set|move|put|give|turn|adjust|increase|decrease|reduce|raise|lower|replace|rename|enable|disable|hide|show|style|color|colour|resize|swap|connect|wire|implement|write|build|generate)\b/i.test(userText);
      const _isQuestion = /^\s*(how|what|why|when|where|who|which|can you|could you|would you|should|is there|are there|does|do you|did|will|explain|tell me|show me|list|describe)\b/i.test(userText) || userText.trim().endsWith('?');
      const _isRecoverableToFix = hasProjectOpen && _isImperative && !_isQuestion;

      // [FIX] answer OR clarify on an imperative inside an open project → always route to fix.
      // The backend returns this response under 'clarify' sometimes and 'answer' other times —
      // both are wrong for an imperative inside an open project. The Supervisor has full context.
      // [RULE] _isQuestion guards against catching genuine Q&A (e.g. "how does X work?").
      if (_isRecoverableToFix) {
        _dbg(`[IMPERATIVE-RECOVERY] action=${chatResult.action} + open project + imperative → routing to fix\n`);
        fixLog(`[IMPERATIVE-RECOVERY] ${chatResult.action} on imperative inside open project → routing to fix`);
        await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
        return;
      }

      // [FIX][SILENT-DROP] Empty text with no imperative/project context — release and return.
      if (!chatResult.text) {
        _dbg(`[SILENT-DROP] no recovery (hasProject=${hasProjectOpen}, imperative=${_isImperative})\n`);
        fixLog(`[SILENT-DROP] answer/clarify empty text, no recovery (hasProject=${hasProjectOpen}, imperative=${_isImperative})`);
        releaseInput();
        return;
      }
      // Normal answer/clarify with non-empty text — genuine Q&A (question detected or no project open)
      conversation.push({ role: 'assistant', content: `${chatResult.text}\n\n---\n*-- ${_byline}*`, timestamp: Date.now() });
      refresh();
      releaseInput();
      await deps.usageTracker?.recordUsage(chatResult.inputTokens + chatResult.outputTokens, 0, chatResult.model, chatResult.inputTokens, chatResult.outputTokens, 'qa').catch(() => {});
      return;
    }
  }


  // ── command ──
  if (chatResult.action === 'command' && chatResult.task) {
    try { await vscode.commands.executeCommand(chatResult.task); } catch { /* needs args or unknown */ }
    conversation.push({ role: 'assistant', content: chatResult.text || `Done -- **${chatResult.task.replace(/^(redivivus|workbench\.action)\./, '').replace(/([A-Z])/g, ' $1').trim()}**`, timestamp: Date.now() });
    refresh(); releaseInput(); return;
  }

  // ── personality-picker ──
  if (chatResult.action === 'personality-picker') {
    conversation.push({ role: 'assistant', content: `${chatResult.text}\n\n---\n*-- ${_byline}*`, timestamp: Date.now() });
    refresh(); releaseInput();
    setTimeout(() => import('../../commands/personalityPicker.js').then(m => m.pickPersonality()), 400);
    return;
  }

  if (chatResult.action === 'run') { releaseInput(); await handleRunIntent({ type: 'run' }, deps, conversation, refresh); return; }
  if (chatResult.action === 'convert') { await handleAIChat(msg, userText, deps, conversation, refresh, { isConvert: true, manualProvider: (msg.manualProvider as string) || undefined }); return; }

  // ── build / fix — guided clarify wizard (plan mode only) ──
  const intent = { type: chatResult.action as 'build' | 'fix' | 'scaffold' | 'service' };
  const _claudeTask = chatResult.task || userText;

  // [FIX] Guaranteed feedback: show indicator immediately when build intent is detected.
  if (intent.type === 'build') {
    const _wm = msg.fromBlueprintCard ? ' __BUILD_WORKING__' : '';
    conversation.push({ role: 'assistant', content: `Analyzing your build...${_wm}`, timestamp: Date.now() });
    refresh();
  }

  let clarify = { cancelled: false, routedText: userText };
  const _wsR = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const _pd = (vscode.workspace.getConfiguration('redivivus').get('projectsDirectory', '~/projects') as string).replace('~', require('os').homedir());
  // [P0] Clarify wizard runs ONLY in explicit Guided mode. Unset mode = Auto (skip wizard).
  if (!msg.fromPreview && deps.buildMode === 'plan' && intent.type === 'build' && _wsR && require('path').resolve(_wsR) !== require('path').resolve(_pd)) {
    const { sizeJob } = await import('../ai/jobSizer.js');
    const jobSize = await sizeJob(userText, deps.routing);
    if (jobSize.tier === 'tell-them') {
      conversation.push({ role: 'assistant', content: 'Got it — on it.', timestamp: Date.now() });
      refresh();
    } else {
      try {
        clarify = await runChatClarifyStep(userText, deps.routing, conversation, refresh, jobSize.suggestedQuestions);
        if (clarify.cancelled) { return; }
      } catch { /* fall through to build */ }
    }
  }
  const routedText = clarify.routedText;

  /* [DEAD][STRIP-0] Five W's / Visual Spec / Adaptive stages — preserved for restore. See chatPanelMsgSendMessage.ts history. */

  // ── Final dispatch ──
  if (intent.type === 'fix' || intent.type === 'build') {
    await handleChangeRequest(msg, deps, { intent: intent.type, routedText: routedText || _claudeTask, claudeTask: _claudeTask });
    return;
  }
  if (intent.type === 'scaffold') { await handleScaffoldIntent(_claudeTask, deps, conversation, refresh); return; }
  if (intent.type === 'service') { await handleServiceIntent(_claudeTask, deps, conversation, refresh); return; }

  await handleAIChat(msg, userText, deps, conversation, refresh);
}
