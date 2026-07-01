// [SCOPE] Pre-cloudChat routing — runs before the main AI classifier call.
// Handles: keyword shortcuts, URL read, web search, remember, read-result, build
// confirmation, bug-report pre-classifier, project context guard, cloudChat call,
// and null-fallback routing. Returns a result the orchestrator acts on.
// Extracted from chatPanelMsgSendMessage.ts (Rule 9 split — was 345 lines).

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages.js';
import type { ChatResult } from '../../../features/api/data/apiClientChat.js';
import { handleKeywordShortcuts } from './chatPanelMsgSendKeywords.js';
import { handleUrlRead, handleWebSearch, handleRememberIntent, handleReadResult } from './chatPanelMsgSendEarlyExits.js';
import { checkBuildConfirmation, getWorkspaceFileList } from './chatPanelMsgSendConfirmCheck.js';
import { handleFixRequest } from '../../fix/chatPanelMsgFix.js';
import { handleAIChat } from './chatPanelMsgSendAI.js';
import { fixLog } from '../../../features/logging/data/fixPipelineLogger.js';
import { getActiveProjectRoot } from '../../project/logic/activeProjectRoot.js';
import { isProjectsContainer } from '../../project/logic/redivivusPaths.js';
import { checkProjectContextGuard } from './chatPanelProjectContextGuard.js';
import { getEffectiveProjectRoot } from '../ui/chatPanelHeaderUtils.js';
import { recordRoutingCost } from '../../build/services/buildRoutingCostTracker.js';
import { applyRouteTier } from '../../../features/ai/data/routeClassifier.js';

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

  // ── Project context guard ──
  // [DEAD] looksLikeBugReport pre-classifier (regex then AI) was removed — it added a network call
  // before cloudChat on every message, defeating the point of a fast-path. Bug classification is
  // cloudChat's job; the pre-classifier caused both latency overhead and false positives on words
  // like "issue" and "problem" in non-bug messages.
  const _ctxBlock = checkProjectContextGuard(userText, conversation, refresh, effectiveRoot);
  if (_ctxBlock) {
    conversation.push({ role: 'assistant', content: _ctxBlock, timestamp: Date.now() });
    refresh();
    deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
    return { outcome: 'done' };
  }

  // ── Call cloudChat (AI intent classifier) ──
  const { cloudChat } = await import('../../../features/api/data/apiClientChat.js');
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
  }, msg.tier as 'flash' | 'pro' | 'ultra' | undefined, msg.imageBase64, msg.imageType).catch(() => null);

  // [COST] Record the cloudChat intent pre-pass usage — runs a real model on every message but is
  // never returned by /build, so it was invisible in the build card and causing billing discrepancies.
  // recordRoutingCost stores it for chatPanelBuildRunner to pick up and add a Routing row to the card.
  // [FIX] Only record routing cost — not usageTracker. usageTracker is for the AI pipeline roles
  // (supervisor/worker/guardian/qa). cloudChat is infrastructure routing overhead, already captured
  // by recordRoutingCost for the build card "Routing" row. Recording it in usageTracker too
  // produces a phantom "QA (deepseek-chat)" entry in every fix pipeline usage breakdown.
  if (chatResult && (chatResult.inputTokens || chatResult.outputTokens)) {
    try {
      recordRoutingCost(chatResult.inputTokens || 0, chatResult.outputTokens || 0, chatResult.model || '', chatResult.provider || '');
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
    let _routeToBuild = false;
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
        // [FIX] BUILD with no project open must route to the build pipeline, not Q&A chat.
        // Previously this fell through to handleAIChat which returned generic Q&A responses
        // like "I'm ready to build — what would you like me to make?" instead of starting
        // the build pipeline. Synthesize a ChatResult so post-cloud routing handles it. (Jun 23, 2026)
        _routeToBuild = t.startsWith('BUILD') && !_hasProject;
      }
    } catch {
      // Regex fallback — only fires when both cloudChat AND routing.prompt are unavailable
      const _isQuestion = /^\s*(how|what|why|when|where|who|which|can you|could you|would you|should|is there|are there|does|do you|did|will|explain|tell me|show me|list|describe)\b/i.test(userText) || userText.trim().endsWith('?');
      const _hasFixSignal = /\b(cannot|can't|cant|won't|wont|doesn't|doesnt|not working|broken|fails|failing|stuck|wrong|missing|error|crash|freeze|hang|glitch|bug|issue|problem|blank|empty)\b/i.test(userText);
      const _isImperativeChange = /\b(add|make|change|update|fix|repair|remove|delete|set|move|put|give|turn|adjust|increase|decrease|reduce|raise|lower|replace|rename|enable|disable|hide|show|style|color|colour|resize|swap|connect|wire|implement|write|build|generate)\b/i.test(userText);
      _routeToFix = _hasFixSignal || (_hasProject && !_isQuestion && _isImperativeChange);
      // Regex fallback for BUILD: imperative create/build/make verb + not a question + no project open
      _routeToBuild = !_hasProject && !_isQuestion && _isImperativeChange && !_hasFixSignal;
    }
    if (_routeToFix) {
      fixLog(`[CLOUD-NULL-FALLBACK] cloudChat null -> fix pipeline (project=${_hasProject})`);
      // [FIX] cloudChat never ran so resolvedTier was never set — classify tier now so the
      // Supervisor isn't forced to 'pro' for every null-fallback fix regardless of complexity.
      await applyRouteTier(userText, _hasProject, deps);
      await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
      return { outcome: 'done' };
    }
    if (_routeToBuild) {
      fixLog(`[CLOUD-NULL-FALLBACK] cloudChat null -> build pipeline (no project open)`);
      await applyRouteTier(userText, false, deps);
      // Synthesize a ChatResult so post-cloud routing handles the build dispatch normally
      const syntheticResult: ChatResult = {
        action: 'build', text: 'Building your project now.', task: userText,
        model: 'local-fallback', provider: 'local', inputTokens: 0, outputTokens: 0,
        confidence: 0.8, resolvedTier: (deps as any).supervisorTierHint || 'pro',
      };
      return { outcome: 'continue', chatResult: syntheticResult, effectiveRoot, hasProjectOpen };
    }
    await handleAIChat(msg, userText, deps, conversation, refresh, { manualProvider: (msg.manualProvider as string) || undefined });
    return { outcome: 'done' };
  }

  return { outcome: 'continue', chatResult, effectiveRoot, hasProjectOpen };
}
