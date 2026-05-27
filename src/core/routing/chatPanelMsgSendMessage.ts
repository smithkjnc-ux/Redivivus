// [SCOPE] Chat message handler: send-message — the main user chat path
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.
// [RULE 18] Intent classification uses AI (deps.classifyIntent), never regex pattern matching.
// [DONE] Rule 9 split: URL/search/memory intercepts extracted to chatPanelMsgSendEarlyExits.ts

import * as vscode from 'vscode';
import { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { MessageHandlerDeps } from './chatPanelMessages';

import { handleAIChat } from './chatPanelMsgSendAI';
import { handleKeywordShortcuts } from './chatPanelMsgSendKeywords';
import { handleFixRequest } from './chatPanelMsgFix';
import { handleRunIntent, handleScaffoldIntent, handleServiceIntent } from './chatPanelMsgIntentActions';
import { handleUrlRead, handleWebSearch, handleRememberIntent, handleReadResult } from './chatPanelMsgSendEarlyExits';
import { runAgentMode } from './chatPanelMsgSendAgent';
import { ChatPanel } from '../../ui/panels/chat/chatPanel';
import { runChatClarifyStep } from './chatPanelMsgSendClarify';
import { handleBuildIntent } from './chatPanelMsgSendBuildIntent';

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

  const _lastSm = conversation[conversation.length - 1];
  if (!_lastSm || _lastSm.role !== 'user' || _lastSm.content !== userText) {
    conversation.push({ role: 'user', content: userText, timestamp: Date.now() });
  }
  refresh();

  // [Redivivus] Auto-session: silently start on first user message if no session is active
  // [FIX] Skip for session commands — prevents ghost session creation before override check fires
  if (!/\bdone\s+for\s+(now|today)\b|\bend\s+(the\s+)?session\b|\bstart\s+(a\s+)?session\b/i.test(userText)) {
    try { const silentStart = (ChatPanel as any).startSessionSilent; if (silentStart) { silentStart(userText); } } catch { /* non-blocking */ }
  }

  const lowerText = userText.toLowerCase();

  if (await handleKeywordShortcuts(userText, lowerText, deps)) { return; }
  // [FIX] Web search / URL / remember / read-#N — delegated to chatPanelMsgSendEarlyExits.ts (Rule 9 split)
  if (await handleUrlRead(userText, lowerText, conversation, refresh)) { return; }
  if (await handleWebSearch(userText, lowerText, conversation, refresh)) { return; }
  if (await handleRememberIntent(userText, conversation, refresh)) { return; }
  if (await handleReadResult(lowerText, conversation, refresh)) { return; }

  // [FIX] Direct mode bypass only for new projects. Initialized projects fall through so "add X"/"change Y" routes to
  // the edit pipeline (reads existing files) not build-from-scratch. [DEAD] Was: all direct-mode non-fix text bypassed.
  if (deps.buildMode === 'direct' && !deps.redivivus?.isInitialized?.() && !/\b(fix|broken|bug|doesn't work|not working|error|crash|fail|no sound|not playing|done for now|done for today|end session|stop session|finish session|start session)\b/i.test(userText)) { await deps.handleBuildRequest(userText); return; }

  // [Redivivus] Design triage — ask clarifying questions BEFORE routing so all modes get user preferences
  // [FIX] Bypass clarify if message comes from the Live Preview overlay. The overlay blocks the main chat,
  // so any interactive clarify questions would be invisible to the user, causing a silent hang.
  let clarify = { cancelled: false, routedText: userText };
  if (!msg.fromPreview) {
    clarify = await runChatClarifyStep(userText, deps.routing, conversation, refresh);
    if (clarify.cancelled) { return; }
  }
  const routedText = clarify.routedText;

  // [Redivivus] Early Exit: Hardcoded Command Overrides (bypasses Adaptive/Agent Mode)
  const { checkHardcodedOverrides } = await import('../ai/chatPanelClassifierOverrides.js');
  const hardcodedCmd = checkHardcodedOverrides(lowerText);
  if (hardcodedCmd && hardcodedCmd.type === 'command' && hardcodedCmd.command) {
    const label = (hardcodedCmd.command as string).replace(/^(redivivus|workbench\.action)\./, '').replace(/([A-Z])/g, ' $1').trim();
    await vscode.commands.executeCommand(hardcodedCmd.command as string);
    conversation.push({ role: 'assistant', content: `Done -- **${label}**`, timestamp: Date.now() });
    refresh(); return;
  }

  // [Redivivus] Adaptive Mode — auto-route between simple pipeline and agent pipeline
  const { evaluateTaskComplexity } = await import('../../services/ai/adaptiveClassifier.js');
  const route = await evaluateTaskComplexity(routedText, deps.routing);
  if (route === 'complex') {
    conversation.push({ role: 'assistant', content: '🔀 **Adaptive:** Routing to Agent Pipeline (environment task detected)...', timestamp: Date.now() });
    refresh();
    await runAgentMode(routedText, deps, conversation, refresh);
    return;
  }

  // [RULE 18] AI intent classification — never use regex to simulate language understanding.
  // [WARN] If classifyIntent throws (e.g. no API key), fall back to keyword check.
  const _BUILD_FALLBACK = /^\s*(add|change|update|remove|delete|rename|replace|fix|edit|make|give|put|set|increase|decrease|toggle|enable|disable|switch|move|style|color)\b/i;
  const intent = deps.classifyIntent ? (await deps.classifyIntent(userText).catch(() => _BUILD_FALLBACK.test(lowerText) ? { type: 'build' as const } : { type: 'question' as const })) : { type: 'question' as const };

  if (intent.type === 'offtopic') {
    conversation.push({ role: 'assistant', content: "I'm a coding assistant -- I can help you build, fix, explain, or review code. What are you building today?", timestamp: Date.now() });
    refresh(); return;
  }

  if (intent.type === 'command' && intent.command) {
    const label = (intent.command as string).replace(/^(redivivus|workbench\.action)\./, '').replace(/([A-Z])/g, ' $1').trim();
    await vscode.commands.executeCommand(intent.command as string);
    conversation.push({ role: 'assistant', content: `Done -- **${label}**`, timestamp: Date.now() });
    refresh(); return;
  }

  if (intent.type === 'convert') { await handleAIChat(msg, userText, deps, conversation, refresh, { isConvert: true }); return; }
  if (intent.type === 'run') { await handleRunIntent(intent, deps, conversation, refresh); return; }
  if (intent.type === 'fix') { await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType); return; }
  if (intent.type === 'scaffold') { await handleScaffoldIntent(userText, deps, conversation, refresh); return; }
  if (intent.type === 'service') { await handleServiceIntent(userText, deps, conversation, refresh); return; }
  if (intent.type === 'build') { await handleBuildIntent(routedText, userText, msg, deps, conversation, refresh); return; }

  // Default: question / unknown → AI chat
  await handleAIChat(msg, userText, deps, conversation, refresh);
}
