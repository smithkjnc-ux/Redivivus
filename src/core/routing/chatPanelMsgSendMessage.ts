// [SCOPE] Chat message handler: send-message — the main user chat path
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.
// [RULE 18] Intent classification uses AI (deps.classifyIntent), never regex pattern matching.
// [DONE] Rule 9 split: URL/search/memory intercepts extracted to chatPanelMsgSendEarlyExits.ts

import * as vscode from 'vscode';
import { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { MessageHandlerDeps } from './chatPanelMessages';

import { detectBlueprintGaps, buildGapPromptMessage } from '../../services/blueprint/blueprintGapDetector';
import { _pendingGuidedBuilds } from './chatPanelMsgSpecial';
import { handleAIChat } from './chatPanelMsgSendAI';
import { handleKeywordShortcuts } from './chatPanelMsgSendKeywords';
import { handleFixRequest } from './chatPanelMsgFix';
import { runTemplateWizard } from '../../services/project/templateWizard';
import { handleRunIntent, handleScaffoldIntent, handleServiceIntent } from './chatPanelMsgIntentActions';
import { handleUrlRead, handleWebSearch, handleRememberIntent, handleReadResult } from './chatPanelMsgSendEarlyExits';
import { runAgentMode } from './chatPanelMsgSendAgent';
import { ChatPanel } from '../../ui/panels/chat/chatPanel';
import { generateClarifyQuestions, encodeClarifyToken, formatAnswersForPrompt } from '../../ui/panels/chat/chatPanelClarify';
import { setPendingClarifyResolve } from '../../ui/panels/chat/chatPanelClarifyBridge';

export async function handleSendMessage(msg: any, deps: MessageHandlerDeps, buildMode?: any): Promise<void> {
  const { chassis, routing, usageTracker, conversation, panel, refresh } = deps;
  const userText = msg.text?.trim();
  if (!userText) { return; }

  const _lastSm = conversation[conversation.length - 1];
  if (!_lastSm || _lastSm.role !== 'user' || _lastSm.content !== userText) {
    conversation.push({ role: 'user', content: userText, timestamp: Date.now() });
  }
  refresh();

  // [CHASSIS] Auto-session: silently start on first user message if no session is active
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
  if (deps.buildMode === 'direct' && !deps.chassis?.isInitialized?.() && !/\b(fix|broken|bug|doesn't work|not working|error|crash|fail|no sound|not playing|done for now|done for today|end session|stop session|finish session|start session)\b/i.test(userText)) { await deps.handleBuildRequest(userText); return; }

  // [CHASSIS] Design triage — ask clarifying questions BEFORE routing so all modes get user preferences
  let routedText = userText;
  const clarifyQuestions = await generateClarifyQuestions(userText, '', deps.routing);
  if (clarifyQuestions.length > 0) {
    conversation.push({ role: 'assistant', content: encodeClarifyToken(clarifyQuestions), timestamp: Date.now() });
    refresh();
    const answers = await new Promise<Record<string, string>>((resolve) => {
      setPendingClarifyResolve(resolve);
      setTimeout(() => resolve({}), 120_000);
    });
    if ((answers as any)._cancelled === 'true') {
      conversation[conversation.length - 1].content = '❌ Build canceled.';
      refresh(); return;
    }
    const answersBlock = formatAnswersForPrompt(answers);
    if (answersBlock) {
      const summary = Object.entries(answers).map(([q, a]) => `  \u2022 ${q}: **${a}**`).join('\n');
      conversation[conversation.length - 1].content = `✅ Got it — building with your choices:\n${summary}`;
      refresh();
      routedText = `${userText}\n\n${answersBlock}`;
    } else {
      conversation.pop(); refresh();
    }
  }

  // [CHASSIS] Early Exit: Hardcoded Command Overrides (bypasses Adaptive/Agent Mode)
  const { checkHardcodedOverrides } = await import('../ai/chatPanelClassifierOverrides.js');
  const hardcodedCmd = checkHardcodedOverrides(lowerText);
  if (hardcodedCmd && hardcodedCmd.type === 'command' && hardcodedCmd.command) {
    const label = (hardcodedCmd.command as string).replace(/^(chassis|workbench\.action)\./, '').replace(/([A-Z])/g, ' $1').trim();
    await vscode.commands.executeCommand(hardcodedCmd.command as string);
    conversation.push({ role: 'assistant', content: `Done -- **${label}**`, timestamp: Date.now() });
    refresh(); return;
  }

  // [CHASSIS] Adaptive Mode — auto-route between simple pipeline and agent pipeline
  const { evaluateTaskComplexity } = await import('../../services/ai/adaptiveClassifier.js');
  const route = await evaluateTaskComplexity(routedText, deps.routing);
  if (route === 'complex') {
    conversation.push({ role: 'assistant', content: '🔀 **Adaptive:** Routing to Agent Pipeline (environment task detected)...', timestamp: Date.now() });
    refresh();
    await runAgentMode(routedText, deps, conversation, refresh);
    return;
  }
  // Simple path: fall through to classifier below

  // [RULE 18] AI intent classification — never use regex to simulate language understanding.
  // [WARN] If classifyIntent throws (e.g. no API key), fall back to keyword check.
  const _BUILD_FALLBACK = /^\s*(add|change|update|remove|delete|rename|replace|fix|edit|make|give|put|set|increase|decrease|toggle|enable|disable|switch|move|style|color)\b/i;
  let intent = deps.classifyIntent ? (await deps.classifyIntent(userText).catch(() => _BUILD_FALLBACK.test(lowerText) ? { type: 'build' as const } : { type: 'question' as const })) : { type: 'question' as const };

  if (intent.type === 'offtopic') {
    conversation.push({ role: 'assistant', content: "I'm a coding assistant -- I can help you build, fix, explain, or review code. What are you building today?", timestamp: Date.now() });
    refresh(); return;
  }

  if (intent.type === 'command' && intent.command) {
    const label = (intent.command as string).replace(/^(chassis|workbench\.action)\./, '').replace(/([A-Z])/g, ' $1').trim();
    await vscode.commands.executeCommand(intent.command as string);
    conversation.push({ role: 'assistant', content: `Done -- **${label}**`, timestamp: Date.now() });
    refresh(); return;
  }

  // Conversions (port/rewrite/transform existing code) stay on the AI chat path — dead end log prohibits routing them through the build pipeline.
  if (intent.type === 'convert') {
    await handleAIChat(msg, userText, deps, conversation, refresh, { isConvert: true });
    return;
  }

  if (intent.type === 'run') { await handleRunIntent(intent, deps, conversation, refresh); return; }

  if (intent.type === 'fix') {
    await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
    return;
  }

  if (intent.type === 'scaffold') { await handleScaffoldIntent(userText, deps, conversation, refresh); return; }
  if (intent.type === 'service') { await handleServiceIntent(userText, deps, conversation, refresh); return; }

  if (intent.type === 'build') {
    // [RULE] Initialized projects use the edit pipeline (reads all files, makes surgical changes).
    // Only show mode popover for brand-new uninitialized projects WITH a folder open.
    if (!deps.buildMode) {
      // [FIX] No workspace open → just build, don't show mode popover. Auto-create handles the rest.
      if (!vscode.workspace.workspaceFolders?.length) { await deps.handleBuildRequest(routedText); return; }
      // [FIX] Initialized project + "build" intent = user is modifying existing code → use edit pipeline (has file context)
      if (deps.chassis?.isInitialized?.()) { await handleFixRequest(routedText, deps, msg.imageBase64, msg.imageType); return; }
      panel.webview.postMessage({ type: 'show-mode-popover', pendingText: userText });
      return;
    }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      const config = deps.chassis?.isInitialized?.() ? deps.chassis?.loadConfig?.() : null;
      const gapResult = detectBlueprintGaps(config?.blueprint);
      if (gapResult.hasGaps) {
        _pendingGuidedBuilds.set(gapResult.sessionId, userText);
        conversation.push({ role: 'assistant', content: buildGapPromptMessage(gapResult, userText), timestamp: Date.now() });
        refresh(); return;
      }
    }
    // Template wizard — new projects only; initialized projects skip it (user is modifying, not starting fresh)
    if (deps.buildMode === 'plan' && !deps.chassis?.isInitialized?.()) {
      const wiz = await runTemplateWizard(userText, (m) => panel.webview.postMessage(m), deps.routing);
      if (wiz.handled && wiz.customizationPrompt) { await deps.handleBuildRequest(wiz.customizationPrompt); return; }
    }
    // [FIX] Initialized project → edit pipeline (reads existing files). New project → build pipeline (creates from scratch).
    await (deps.chassis?.isInitialized?.() ? handleFixRequest(routedText, deps, msg.imageBase64, msg.imageType) : deps.handleBuildRequest(routedText));
    return;
  }

  // Default: question / unknown → AI chat
  await handleAIChat(msg, userText, deps, conversation, refresh);
}

