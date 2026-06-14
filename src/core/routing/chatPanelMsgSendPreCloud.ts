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
  // [RULE 18] This is a structural signal check (not language understanding). The AI classifier
  // below handles nuanced intent; this only catches unambiguous failure keywords.
  const looksLikeBugReport = hasWorkspace && (
    /\b(blank|empty|not working|broken|error|crash|freeze|hang|slow|weird|strange|bug|issue|problem|fix|correct|repair)\b/i.test(lowerText) ||
    /\b(preview|browser|screen|display|render|show|load|fetch)\b.*\b(broken|fail|error|blank|empty|not)/i.test(lowerText) ||
    /\b(game|app|page|site|project)\b.*\b(broken|not working|blank|empty|weird)/i.test(lowerText)
  );
  if (looksLikeBugReport) {
    fixLog(`[PRE-CLASSIFY] Bug report detected, routing to fix pipeline: "${userText.slice(0, 60)}..."`);
    await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
    return { outcome: 'done' };
  }

  // ── Project context guard ──
  const _ctxBlock = checkProjectContextGuard(userText, conversation, refresh, effectiveRoot);
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

  // ── cloudChat null: backend unavailable / all providers capped ──
  // [WARN] Do NOT go to handleAIChat for fix/feature requests — it uses promptCheap which silently fails for code.
  if (!chatResult) {
    const _ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const _hasProject = !!_ws && !isProjectsContainer(getActiveProjectRoot() || _ws);
    const _isQuestion = /^\s*(how|what|why|when|where|who|which|can you|could you|would you|should|is there|are there|does|do you|did|will|explain|tell me|show me|list|describe)\b/i.test(userText) || userText.trim().endsWith('?');
    const _hasFixSignal = /\b(cannot|can't|cant|won't|wont|doesn't|doesnt|not working|broken|fails|failing|stuck|wrong|missing|error|crash|freeze|hang|glitch|bug|issue|problem|blank|empty)\b/i.test(userText);
    const _isImperativeChange = /\b(add|make|change|update|fix|repair|remove|delete|set|move|put|give|turn|adjust|increase|decrease|reduce|raise|lower|replace|rename|enable|disable|hide|show|style|color|colour|resize|swap|connect|wire|implement|write|build|generate)\b/i.test(userText);
    if (_hasFixSignal || (_hasProject && !_isQuestion && _isImperativeChange)) {
      fixLog(`[CLOUD-NULL-FALLBACK] cloudChat null -> fix pipeline (project=${_hasProject}, fixSignal=${_hasFixSignal}, imperative=${_isImperativeChange})`);
      await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
      return { outcome: 'done' };
    }
    await handleAIChat(msg, userText, deps, conversation, refresh, { manualProvider: (msg.manualProvider as string) || undefined });
    return { outcome: 'done' };
  }

  return { outcome: 'continue', chatResult, effectiveRoot, hasProjectOpen };
}
