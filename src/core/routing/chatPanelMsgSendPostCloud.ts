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
import { handleAnswerClarifyResult, handleCommandResult } from './chatPanelMsgSendPostCloudHandlers';

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

  // [FIX] If the classifier returns 'fix' but no project is open, there is nothing to fix.
  // Previously this only flipped when confidence < 0.5, but the AI can return high-confidence 'fix'
  // if conversation history mentions a prior build of the same thing (e.g. "Build a typing speed test
  // game" after a failed build → AI thinks it's a retry/fix). With no project open, flip unconditionally.
  if (chatResult.action === 'fix' && !hasProjectOpen) {
    fixLog(`[NO-PROJECT-FIX-FLIP] classifier returned fix (conf=${chatResult.confidence ?? 'n/a'}) but no project open → build`);
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
    const _r = await handleAnswerClarifyResult(msg, userText, deps, conversation, refresh, chatResult, effectiveRoot, hasProjectOpen, _byline, releaseInput, _dbg);
    if (_r === 'handled') { return; }
    // 'fall-through-build' — chatResult.action already set to 'build' by the handler
  }

  // ── command ──
  if (chatResult.action === 'command') {
    await handleCommandResult(msg, userText, deps, conversation, refresh, chatResult, hasProjectOpen, releaseInput, _dbg);
    return;
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
