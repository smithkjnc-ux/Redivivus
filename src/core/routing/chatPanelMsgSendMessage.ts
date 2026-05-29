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
import { ChatPanel } from '../../ui/panels/chat/chatPanel';
import { runChatClarifyStep, shouldClarify } from './chatPanelMsgSendClarify';
import { handleBuildIntent } from './chatPanelMsgSendBuildIntent';
import { runConfirmedLocalBuild } from './chatPanelMsgSendConfirmedBuild';

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
  if (!/\bdone\s+for\s+(now|today)\b|\bend\s+(the\s+)?session\b|\bstart\s+(a\s+)?session\b/i.test(userText)) {
    try { const silentStart = (ChatPanel as any).startSessionSilent; if (silentStart) { silentStart(userText); } } catch { /* non-blocking */ }
  }

  const lowerText = userText.toLowerCase();

  if (await handleKeywordShortcuts(userText, lowerText, deps)) { return; }
  if (await handleUrlRead(userText, lowerText, conversation, refresh)) { return; }
  if (await handleWebSearch(userText, lowerText, conversation, refresh)) { return; }
  if (await handleRememberIntent(userText, conversation, refresh)) { return; }
  if (await handleReadResult(lowerText, conversation, refresh)) { return; }

  // ── Build confirmations: "that sounds perfect, lets build it" after prior conversation ──
  // [RULE 18] Kept as structural fast-path: short explicit agreement + prior conversation context lookup.
  // The cloud classifier cannot reach back into conversation history — this must stay as code.
  const _BUILD_CONFIRM = /\b(build\s+it|lets\s+(build|do)\s+it|go\s+ahead|make\s+it|start\s+building|lets\s+go)\b/i;
  const _AGREEMENT = /\b(sounds?\s+(good|great|perfect|awesome)|that('s|\s+is)?\s+(good|great|perfect|awesome)|love\s+it|exactly|yes.*build)\b/i;
  if ((_BUILD_CONFIRM.test(lowerText) || _AGREEMENT.test(lowerText)) && lowerText.length < 80) {
    let foundRequest = '';
    for (let i = conversation.length - 2; i >= 0; i--) {
      if (conversation[i].role === 'user') {
        const prior = conversation[i].content.toLowerCase();
        if (_BUILD_CONFIRM.test(prior) || _AGREEMENT.test(prior)) { continue; }
        foundRequest = conversation[i].content;
        break;
      }
    }
    if (foundRequest) {
      await runConfirmedLocalBuild(foundRequest, userText, deps, conversation, refresh);
      return;
    }
    conversation.push({ role: 'assistant', content: 'I\'m ready to build — what would you like me to make?', timestamp: Date.now() });
    refresh(); return;
  }

  // ── AI intent classification — single cloud call classifies everything ──
  // [DONE] Replaced hardcoded regex fast-path with cloud classifier for all intents.
  // Questions, commands, run intents, offtopic — all handled by the same AI call.
  const _BUILD_FALLBACK = /^\s*(add|change|update|remove|delete|rename|replace|fix|edit|make|give|put|set|increase|decrease|toggle|enable|disable|switch|move|style|color)\b/i;
  const intent = deps.classifyIntent
    ? (await deps.classifyIntent(userText).catch(() => _BUILD_FALLBACK.test(lowerText) ? { type: 'build' as const } : { type: 'question' as const }))
    : { type: 'question' as const };

  // Immediate exits — no clarify step needed for these
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
  if (intent.type === 'question') {
    await handleAIChat(msg, userText, deps, conversation, refresh); return;
  }
  if (intent.type === 'run') {
    await handleRunIntent(intent, deps, conversation, refresh); return;
  }
  if (intent.type === 'convert') {
    await handleAIChat(msg, userText, deps, conversation, refresh, { isConvert: true }); return;
  }

  // ── Clarify step (design triage) — only for build intents ──
  // [DONE] Bug-keyword regex and spec-length heuristic replaced with AI judgment (shouldClarify).
  let clarify = { cancelled: false, routedText: userText };

  if (!msg.fromPreview && deps.buildMode !== 'direct' && intent.type === 'build') {
    const needsClarify = await shouldClarify(userText, deps.routing);
    if (needsClarify) {
      try {
        clarify = await runChatClarifyStep(userText, deps.routing, conversation, refresh);
        if (clarify.cancelled) { return; }
      } catch (_e) {
        // [FIX] Never silently swallow clarify errors — fall through to build
      }
    }
  }
  const routedText = clarify.routedText;

  // ── Adaptive Mode — auto-route between simple pipeline and agent pipeline ──
  const blueprintConfirmed = routedText !== userText && routedText.startsWith('Build:');
  const { evaluateTaskComplexity } = await import('../../services/ai/adaptiveClassifier.js');
  const route = blueprintConfirmed ? 'simple' : await evaluateTaskComplexity(routedText, deps.routing);
  if (route === 'complex') {
    conversation.push({ role: 'assistant', content: '🔀 **Adaptive:** Routing to Agent Pipeline (environment task detected)...', timestamp: Date.now() });
    refresh();
    await runAgentMode(routedText, deps, conversation, refresh);
    return;
  }

  // ── Final routing by intent ──
  if (intent.type === 'fix') { await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType); return; }
  if (intent.type === 'scaffold') { await handleScaffoldIntent(userText, deps, conversation, refresh); return; }
  if (intent.type === 'service') { await handleServiceIntent(userText, deps, conversation, refresh); return; }
  if (intent.type === 'build') { await handleBuildIntent(routedText, userText, msg, deps, conversation, refresh); return; }

  await handleAIChat(msg, userText, deps, conversation, refresh);
}
