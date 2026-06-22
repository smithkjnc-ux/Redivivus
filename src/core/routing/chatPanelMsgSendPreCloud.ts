// [SCOPE] Pre-cloudChat routing — runs before the main AI classifier call.
// Handles: keyword shortcuts, URL read, web search, remember, read-result, build
// confirmation, bug-report pre-classifier, project context guard, cloudChat call,
// and null-fallback routing. Returns a result the orchestrator acts on.
// Extracted from chatPanelMsgSendMessage.ts (Rule 9 split — was 345 lines).

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages';
import type { ChatResult } from '../../services/api/apiClientChat';
import { handleKeywordShortcuts } from './chatPanelMsgSendKeywords';
import { handleUrlRead, handleWebSearch, handleRememberIntent, handleReadResult } from './chatPanelMsgSendEarlyExits';
import { checkBuildConfirmation, getWorkspaceFileList } from './chatPanelMsgSendConfirmCheck';
import { handleFixRequest } from './chatPanelMsgFix';
import { handleAIChat } from './chatPanelMsgSendAI';
import { fixLog } from '../../services/logging/fixPipelineLogger';
import { getActiveProjectRoot } from '../../services/project/activeProjectRoot.js';
import { isProjectsContainer } from '../../services/project/redivivusPaths.js';
import { checkProjectContextGuard } from './chatPanelProjectContextGuard.js';
import { getEffectiveProjectRoot } from '../../ui/panels/chat/chatPanelHeaderUtils.js';
import { recordRoutingCost } from '../../services/build/buildRoutingCostTracker.js';

// Return shape from runPreCloudRouting — either a terminal 'done' (early exit) or
// 'continue' with the cloudChat result + resolved workspace context for post-cloud routing.
export type PreCloudResult =
  | { outcome: 'done' }
  | {
      outcome: 'continue';
      chatResult: ChatResult;
      effectiveRoot: string | undefined;
      hasProjectOpen: boolean;
    };

// [WARN] releaseInput must be called on every early-exit path — doSend() sets input busy and
// these paths never reach the releaseInput() inside the post-cloud router.
function releaseInputNow(deps: MessageHandlerDeps) {
  setTimeout(() => deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }), 100);
}

// runPreCloudRouting — all routing that happens BEFORE the cloudChat classifier call.
// Returns 'done' for early exits; 'continue' with the resolved chatResult otherwise.
export async function runPreCloudRouting(
  msg: any,
  userText: string,
  lowerText: string,
  deps: MessageHandlerDeps,
  conversation: any[],
  refresh: () => void,
): Promise<PreCloudResult> {

  // ── Keyword / early-exit shortcuts ──
  if (!msg.fromBlueprintCard && await handleKeywordShortcuts(userText, lowerText, deps)) { releaseInputNow(deps); return { outcome: 'done' }; }
  if (!msg.fromBlueprintCard && await handleUrlRead(userText, lowerText, conversation, refresh)) { releaseInputNow(deps); return { outcome: 'done' }; }
  if (!msg.fromBlueprintCard && await handleWebSearch(userText, lowerText, conversation, refresh)) { releaseInputNow(deps); return { outcome: 'done' }; }
  if (await handleRememberIntent(userText, conversation, refresh)) { releaseInputNow(deps); return { outcome: 'done' }; }
  if (await handleReadResult(lowerText, conversation, refresh)) { releaseInputNow(deps); return { outcome: 'done' }; }

  // ── Build confirmations ──
  if (await checkBuildConfirmation(lowerText, userText, deps, conversation, refresh)) { return { outcome: 'done' }; }

  // ── Resolve effective project root (handles projects-container workspace) ──
  const effectiveRoot = getEffectiveProjectRoot(deps.redivivus.getWorkspaceRoot());
  if (effectiveRoot && effectiveRoot !== deps.redivivus.getWorkspaceRoot()) {
    deps.redivivus = new (deps.redivivus as any).constructor(effectiveRoot);
  }
  const hasWorkspace = !!effectiveRoot;

  // ── Bug-report pre-classifier: skip cloudChat for clear fix signals ──
  // [Rule 18] AI classifier replaced regex keyword matching — catches bug reports the regex missed
  // (paraphrases, non-English signals) and avoids false positives on words like "issue" or "problem".
  let looksLikeBugReport = false;
  if (hasWorkspace) {
    try {
      const bugPrompt = `Reply with YES or NO only. Is this message describing a bug, error, or something that is not working correctly — something the user wants fixed in their project?
Do NOT answer YES for: general questions, requests to build something new from scratch, or questions about how something works.
Message: "${userText.slice(0, 300)}"`;
      const bugResult = await deps.routing.prompt(bugPrompt, 12_000);
      looksLikeBugReport = bugResult.success && !!bugResult.text?.trim().toUpperCase().startsWith('YES');
    } catch { /* classifier unavailable — fall through to cloudChat */ }
  }
  if (looksLikeBugReport) {
    fixLog(`[PRE-CLASSIFY] Bug report detected, routing to fix pipeline: "${userText.slice(0, 60)}..."`);
    await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
    return { outcome: 'done' };
  }

  // ── Project context guard ──
  const _ctxBlock = await checkProjectContextGuard(userText, conversation, refresh, deps.routing, effectiveRoot);
  if (_ctxBlock) {
    conversation.push({ role: 'assistant', content: _ctxBlock, timestamp: Date.now() });
    refresh();
    deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
    return { outcome: 'done' };
  }

  // ── Call cloudChat (AI intent classifier) ──
  const { cloudChat } = await import('../../services/api/apiClientChat.js');
  const _cfgBlueprint = deps.redivivus.isInitialized() ? (deps.redivivus.loadConfig?.() as any)?.blueprint : undefined;
  const hasProjectOpen = effectiveRoot
    ? require('fs').existsSync(require('path').join(effectiveRoot, '.redivivus', 'config.json'))
    : false;

  const chatResult = await cloudChat(userText, {
    blueprint: _cfgBlueprint,
    recentMessages: conversation.slice(-6).map(m => ({ role: m.role, content: m.content })),
    currentTime: new Date().toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    personality: vscode.workspace.getConfiguration('redivivus').get<string>('personality', 'plain'),
    fileList: effectiveRoot ? getWorkspaceFileList(effectiveRoot) : undefined,
    preferred: (msg.manualProvider as string | undefined) || undefined,
    projectOpen: hasProjectOpen,
  }, msg.tier as 'flash' | 'pro' | 'ultra' | undefined).catch(() => null);

  // [COST] Record the cloudChat intent pre-pass usage — runs a real model on every message but is
  // never returned by /build, so it was invisible in the build card and causing billing discrepancies.
  // recordRoutingCost stores it for chatPanelBuildRunner to pick up and add a Routing row to the card.
  if (chatResult && (chatResult.inputTokens || chatResult.outputTokens)) {
    try {
      recordRoutingCost(chatResult.inputTokens || 0, chatResult.outputTokens || 0, chatResult.model || '', chatResult.provider || '');
      deps.usageTracker?.recordUsage(
        (chatResult.inputTokens || 0) + (chatResult.outputTokens || 0), 0, chatResult.model,
        chatResult.inputTokens, chatResult.outputTokens, 'supervisor',
        effectiveRoot ? require('path').basename(effectiveRoot) : undefined,
      );
    } catch { /* usage recording is best-effort */ }
  }

  // ── cloudChat null: backend unavailable / all providers capped ──
  // [WARN] Do NOT go to handleAIChat for fix/feature requests — it uses promptCheap which silently fails for code.
  // [Rule 18] AI classifier (routing.prompt, user's own keys) routes intent when cloudChat is down.
  // Regex is kept as catch-block fallback for when all AI is unavailable simultaneously.
  if (!chatResult) {
    const _ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const _hasProject = !!_ws && !isProjectsContainer(getActiveProjectRoot() || _ws);
    let _routeToFix = false;
    try {
      const nullFallbackPrompt = `Reply with FIX, BUILD, or CHAT only.
- FIX: user describes a bug, error, or broken behavior they want repaired in an existing project
- BUILD: user wants to create a brand-new project, app, game, or website from scratch
- CHAT: user is asking a question or having a general conversation

Message: "${userText.slice(0, 300)}"`;
      const nullResult = await deps.routing.prompt(nullFallbackPrompt, 12_000);
      if (nullResult.success && nullResult.text) {
        const t = nullResult.text.trim().toUpperCase();
        _routeToFix = t.startsWith('FIX') || (t.startsWith('BUILD') && _hasProject);
      }
    } catch {
      // Regex fallback — only fires when both cloudChat AND routing.prompt are unavailable
      const _isQuestion = /^\s*(how|what|why|when|where|who|which|can you|could you|would you|should|is there|are there|does|do you|did|will|explain|tell me|show me|list|describe)\b/i.test(userText) || userText.trim().endsWith('?');
      const _hasFixSignal = /\b(cannot|can't|cant|won't|wont|doesn't|doesnt|not working|broken|fails|failing|stuck|wrong|missing|error|crash|freeze|hang|glitch|bug|issue|problem|blank|empty)\b/i.test(userText);
      const _isImperativeChange = /\b(add|make|change|update|fix|repair|remove|delete|set|move|put|give|turn|adjust|increase|decrease|reduce|raise|lower|replace|rename|enable|disable|hide|show|style|color|colour|resize|swap|connect|wire|implement|write|build|generate)\b/i.test(userText);
      _routeToFix = _hasFixSignal || (_hasProject && !_isQuestion && _isImperativeChange);
    }
    if (_routeToFix) {
      fixLog(`[CLOUD-NULL-FALLBACK] cloudChat null -> fix pipeline (project=${_hasProject})`);
      await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
      return { outcome: 'done' };
    }
    await handleAIChat(msg, userText, deps, conversation, refresh, { manualProvider: (msg.manualProvider as string) || undefined });
    return { outcome: 'done' };
  }

  return { outcome: 'continue', chatResult, effectiveRoot, hasProjectOpen };
}
