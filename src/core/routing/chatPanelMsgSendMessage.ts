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
import { autoCreateProject } from '../build/chatPanelBuildAutoCreate';
import { runSingleFileBuild } from '../build/chatPanelBuild';

// [FIX] Confirmed builds bypass the backend agent (which asks duplicate questions).
// Uses local supervisor→worker→guardian pipeline instead.
async function runConfirmedLocalBuild(
  task: string,
  _userText: string,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<void> {
  const { getAccountToken } = await import('../../services/api/apiClient.js');
  const token = await getAccountToken();
  if (!token) {
    conversation.push({ role: 'assistant', content: '🔒 **Sign in to use Redivivus**\n\nRun **Redivivus: Sign In** from the command palette.', timestamp: Date.now() });
    refresh(); vscode.commands.executeCommand('redivivus.signIn'); return;
  }

  deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });
  let root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let autoCreated = false;
  // [FIX] Reject extension directory as a build root — must auto-create a real project folder
  const _isValidRoot = (r: string | undefined): boolean => {
    if (!r) return false;
    const lower = r.toLowerCase();
    if (lower.includes('/extensions/redivivus') || lower.includes('\\extensions\\redivivus')) return false;
    if (lower.includes('/resources/app/extensions/') || lower.includes('\\resources\\app\\extensions\\')) return false;
    return true;
  };
  if (!_isValidRoot(root)) {
    try {
      const created = await autoCreateProject(task, deps as any);
      root = created.dir;
      autoCreated = true;
    } catch (e) {
      deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
      conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
      refresh(); return;
    }
  }

  const ctx = {
    task, root: root!, blueprintContext: (deps as any).blueprintContext || '',
    routing: deps.routing, conversation, refresh,
    logError: (_t: string, _p: string, _e: string, _l: number) => {},
    postToWebview: (m: any) => deps.panel.webview.postMessage(m),
    redivivus: deps.redivivus, usageTracker: deps.usageTracker,
  };

  try {
    await runSingleFileBuild(ctx as any);
    // [FIX] Always switch to the project folder after a confirmed local build.
    // Whether auto-created or not, the user expects to see their new project.
    if (root) {
      const CP = require('../../ui/panels/chat/chatPanel.js').ChatPanel;
      if (CP?.extensionContext) { CP.extensionContext.globalState.update('redivivus.skipConversationRestore', true); }
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: false });
    }
  } finally {
    deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
  }
}

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

  // ── STEP 1: Fast-path classification (instant, no API call) ──
  // Questions, commands, and run intents are caught here BEFORE anything else.
  // This prevents the clarify wizard from hijacking questions.
  const { checkHardcodedOverrides } = await import('../ai/chatPanelClassifierOverrides.js');
  const fastPath = checkHardcodedOverrides(lowerText);

  // Commands: execute immediately
  if (fastPath && fastPath.type === 'command' && fastPath.command) {
    const label = (fastPath.command as string).replace(/^(redivivus|workbench\.action)\./, '').replace(/([A-Z])/g, ' $1').trim();
    await vscode.commands.executeCommand(fastPath.command as string);
    conversation.push({ role: 'assistant', content: `Done -- **${label}**`, timestamp: Date.now() });
    refresh(); return;
  }

  // Run intents: execute immediately
  if (fastPath && fastPath.type === 'run') {
    await handleRunIntent(fastPath, deps, conversation, refresh); return;
  }

  // Questions: answer with cheap AI immediately — skip clarify, adaptive, everything
  if (fastPath && fastPath.type === 'question') {
    await handleAIChat(msg, userText, deps, conversation, refresh);
    return;
  }

  // ── Build confirmations: "that sounds perfect, lets build it" after prior conversation ──
  // These are NOT new tasks — they confirm what was discussed. Carry full conversation context.
  const _BUILD_CONFIRM = /\b(build\s+it|lets\s+(build|do)\s+it|go\s+ahead|make\s+it|start\s+building|lets\s+go)\b/i;
  const _AGREEMENT = /\b(sounds?\s+(good|great|perfect|awesome)|that('s|\s+is)?\s+(good|great|perfect|awesome)|love\s+it|exactly|yes.*build)\b/i;
  if ((_BUILD_CONFIRM.test(lowerText) || _AGREEMENT.test(lowerText)) && lowerText.length < 80) {
    // [FIX] Iterate backwards from the current message to find the actual request+plan
    // for THIS thread. Collect ALL user messages and the most recent assistant plan.
    let foundPlan = '';
    const threadRequests: string[] = [];
    // Find the user's confirmation message (the current one)
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].role === 'user' && conversation[i].content === userText) {
        // Collect all assistant/user pairs going backwards until a gap or old session
        for (let j = i - 1; j >= 0; j--) {
          if (conversation[j].role === 'assistant' && conversation[j].content.length > 80 && !conversation[j].content.startsWith('__CLARIFY__')) {
            if (!foundPlan) { foundPlan = conversation[j].content.replace(/\n---\n\*-- .*\*[\s\S]*$/, '').trim(); }
          }
          if (conversation[j].role === 'user' && conversation[j].content.length > 15) {
            threadRequests.push(conversation[j].content);
          }
          // Stop if we hit an old build result card or result message
          if (conversation[j].content.includes('__RESULT_CARD__') || conversation[j].content.includes('✅ Done! Built')) { break; }
        }
        break;
      }
    }
    // [FIX] Pick the user request with the most build keywords as the primary request.
    // Follow-ups like "it should have X" lack the subject (checkers game) and confuse the AI.
    const buildKeywords = /\b(game|app|website|tool|build|make|create|generate|checker|chess|snake|todo|calc|dashboard|api|server|client|html|css|js)\b/i;
    let foundRequest = threadRequests[0] || '';
    let bestScore = 0;
    for (const req of threadRequests) {
      const score = (req.match(buildKeywords) || []).length;
      if (score > bestScore) { bestScore = score; foundRequest = req; }
    }
    if (foundRequest && foundPlan) {
      const featureBits = foundPlan.slice(0, 600).replace(/\s+/g, ' ');
      const cleanTask = `${foundRequest} ${featureBits}`.trim();
      const conciseTask = cleanTask.length > 500 ? cleanTask.slice(0, 500) : cleanTask;
      await runConfirmedLocalBuild(conciseTask, userText, deps, conversation, refresh);
      return;
    }
  }

  // ── STEP 2: Clarify step (design triage) — only for short/vague build requests ──
  const _BUG_KEYWORDS = /\b(fix|broken|bug|doesn't work|not working|error|crash|fail|cut off|cropped|overflow|overlap|misaligned|off screen|clipped|hidden|invisible|not showing|not displaying|not rendering|too small|too big|too large|doesn't fit|won't fit|out of|beyond|autosize|responsive|resize|scale|fit|glitch|stuck|missing|wrong)\b/i;
  const isClearBugReport = _BUG_KEYWORDS.test(lowerText);
  // [FIX] Skip clarify when user gives detailed specs (>50 chars with requirement words).
  // "it should have an AI opponent, must take jumps" is explicit — nothing to clarify.
  const hasDetailedSpecs = userText.length > 50 && /\b(should|must|need|require|include|have|obey|follow|support)\b/i.test(lowerText);
  let clarify = { cancelled: false, routedText: userText };

  if (!msg.fromPreview && !isClearBugReport && !hasDetailedSpecs && deps.buildMode !== 'direct') {
    try {
      clarify = await runChatClarifyStep(userText, deps.routing, conversation, refresh);
      if (clarify.cancelled) { return; }
    } catch (e) {
      // [FIX] Never silently swallow clarify errors — fall through to build
    }
  }
  const routedText = clarify.routedText;

  // ── STEP 3: Adaptive Mode — auto-route between simple pipeline and agent pipeline ──
  // [FIX] Skip adaptive when the user already confirmed the blueprint — they said "build this",
  // so just build it. Don't re-route to agent and ask MORE questions.
  const blueprintConfirmed = routedText !== userText && routedText.startsWith('Build:');
  const { evaluateTaskComplexity } = await import('../../services/ai/adaptiveClassifier.js');
  const route = blueprintConfirmed ? 'simple' : await evaluateTaskComplexity(routedText, deps.routing);
  if (route === 'complex') {
    conversation.push({ role: 'assistant', content: '🔀 **Adaptive:** Routing to Agent Pipeline (environment task detected)...', timestamp: Date.now() });
    refresh();
    await runAgentMode(routedText, deps, conversation, refresh);
    return;
  }

  // ── STEP 4: AI intent classification (cloud classifier or fallback) ──
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

  // Default: question / unknown → AI chat (cheap model)
  await handleAIChat(msg, userText, deps, conversation, refresh);
}
