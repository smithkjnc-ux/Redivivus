// [SCOPE] Chat message handler: send-message — thin orchestrator for the main user chat path.
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.
// [RULE 18] Intent classification uses AI (cloudChat), never regex pattern matching for intent.
// [DONE] Rule 9 split (Jun 14, 2026): 345-line file split into 3 modules:
//   - chatPanelMsgSendPreCloud.ts  — pre-cloudChat routing (shortcuts, guard, cloudChat call)
//   - chatPanelMsgSendPostCloud.ts — post-cloudChat routing (flips, answer/fix/build dispatch)
//   - this file                    — auth, user-bubble, TurnContext, blueprintCard fast path

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages.js';
import { handleBuildIntent } from './chatPanelMsgSendBuildIntent.js';
import { createTurnContext } from './turnContext.js';
import { getActiveProjectRoot } from '../../project/logic/activeProjectRoot.js';
import { runPreCloudRouting } from './chatPanelMsgSendPreCloud.js';
import { routeCloudChatResult } from './chatPanelMsgSendPostCloud.js';

export async function handleSendMessage(msg: any, deps: MessageHandlerDeps, buildMode?: any): Promise<void> {
  const { conversation, refresh } = deps;
  const userText = msg.text?.trim();
  if (!userText) { return; }
  // [ROUTING PANEL] Stash per-role AI overrides for this turn so the fix pipeline can force the chosen providers.
  deps.routingOverrides = msg.routingOverrides || undefined;
  // [MANUAL MODEL PICKER] Stash the exact model the user locked, so the build/fix worker runs THAT model.
  deps.manualModel = (msg.manualModel as string) || undefined;

  // ── Auth gate ──
  const { getAccountToken } = await import('../../../features/api/data/apiClient.js');
  if (!(await getAccountToken())) {
    conversation.push({
      role: 'assistant',
      content: '🔒 **Sign in to use Redivivus**\n\nOpen the command palette and run **Redivivus: Sign In** to connect your account.',
      timestamp: Date.now(),
    });
    refresh();
    return;
  }

  // ── User bubble push ──
  // [FIX] fromBlueprintCard: skip the verbose enriched-task user bubble — card is already the context
  if (!msg.fromBlueprintCard) {
    const _lastSm = conversation[conversation.length - 1];
    if (!_lastSm || _lastSm.role !== 'user' || _lastSm.content !== userText) {
      conversation.push({ 
        role: 'user', 
        content: userText, 
        timestamp: Date.now(),
        ...(msg.imageBase64 ? { imageBase64: msg.imageBase64, imageType: msg.imageType } : {})
      });
    }
    refresh();
    if (!/\bdone.*session\b|\bstart.*session\b/i.test(userText)) { try { const _CP = require('../ui/chatPanel.js').ChatPanel; const ss = (_CP as any).startSessionSilent; if (ss) { ss(userText); } } catch {} }
  }

  // ── TurnContext creation (Phase 0 scaffold) ──
  const _bpForCtx = deps.redivivus.isInitialized() ? (deps.redivivus.loadConfig?.() as any)?.blueprint : undefined;
  const turnCtx = createTurnContext(userText, conversation, { projectRoot: getActiveProjectRoot(), blueprint: _bpForCtx });
  deps.turnContext = turnCtx;

  // ── Blueprint card fast-path: confirmed card = unambiguous BUILD ──
  // [FIX][BUILD-NOT-FIX] cloudChat misroutes enriched blueprint tasks as 'fix' when the workspace
  // holds sibling project folders. Skip the classifier entirely — route straight to build.
  if (msg.fromBlueprintCard) {
    turnCtx.hint = { action: 'build', task: userText };
    await handleBuildIntent(userText, userText, msg, deps, conversation, refresh);
    return;
  }

  const lowerText = userText.toLowerCase();

  // ── Pre-cloud routing (shortcuts, bug-report pre-classifier, cloudChat call) ──
  const preResult = await runPreCloudRouting(msg, userText, lowerText, deps, conversation, refresh);
  if (preResult.outcome === 'done') { return; }

  // ── Post-cloud routing (flips, dispatch, silent-drop recovery) ──
  await routeCloudChatResult(
    msg, userText, deps, conversation, refresh,
    preResult.chatResult,
    preResult.effectiveRoot,
    preResult.hasProjectOpen,
  );
}
