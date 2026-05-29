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

// [FIX] Confirmed builds use the local supervisor→worker→guardian pipeline
// with proper Redivivus infrastructure (blueprint extraction, auto-create, post-build actions).
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

  // Step 1: Extract blueprint from the task using Redivivus AI → gets suggestedName + 5W
  let extracted: any = { suggestedName: '', who: '', what: '', where: '', when: '', why: '' };
  try {
    const { extractBlueprintFromPrompt } = await import('../../services/blueprint/blueprintExtractor.js');
    extracted = await extractBlueprintFromPrompt(task, deps.routing);
  } catch {
    // [WARN] AI extraction failed — use heuristic fallback
    const slug = task.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
    extracted = { suggestedName: slug, who: '', what: task.slice(0, 120), where: '', when: 'now', why: '' };
  }

  // Step 2: Use Redivivus autoCreateProject which creates folder + scaffold with proper name
  let root: string;
  let blueprintContext: string;
  let autoCreated = false;
  const existingRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const isValidRoot = (r: string | undefined): boolean => {
    if (!r) return false;
    const lower = r.toLowerCase();
    if (lower.includes('/extensions/redivivus') || lower.includes('\\extensions\\redivivus')) return false;
    if (lower.includes('/resources/app/extensions/') || lower.includes('\\resources\\app\\extensions\\')) return false;
    return true;
  };

  if (isValidRoot(existingRoot)) {
    root = existingRoot!;
    // Build blueprint context from extracted data for existing projects
    blueprintContext = [
      `Project: ${extracted.suggestedName}`,
      `Who: ${extracted.who || '?' }`,
      `What: ${extracted.what || task.slice(0, 120) }`,
      `Where: ${extracted.where || '?' }`,
      `When: ${extracted.when || 'now' }`,
      `Why: ${extracted.why || '?' }`,
    ].join('\n');
  } else {
    try {
      const created = await autoCreateProject(task, deps as any);
      root = created.dir;
      blueprintContext = created.blueprintContext;
      autoCreated = true;
    } catch (e) {
      deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
      conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
      refresh(); return;
    }
  }

  // Step 3: Build with full Redivivus context (supervisor→worker→guardian)
  const { readProjectDeadEnds } = await import('../routing/chatPanelMsgFixDeadEnds.js');
  const { readProjectRules, getRecentBuildsContext } = await import('../routing/chatPanelMsgFixUtils.js');
  const { buildGitContextBlock } = await import('../../services/workspace/gitContext.js');
  const deadEnds = readProjectDeadEnds(root);
  const projectRules = readProjectRules(root);
  const gitCtx = buildGitContextBlock(root);
  const fullBlueprintContext = [
    blueprintContext,
    deadEnds ? `PREVIOUSLY FAILED APPROACHES (do not repeat):\n${deadEnds}` : '',
    projectRules ? `PROJECT RULES (must not violate):\n${projectRules}` : '',
    gitCtx,
    getRecentBuildsContext(root),
  ].filter(Boolean).join('\n\n');

  const ctx = {
    task, root, blueprintContext: fullBlueprintContext,
    routing: deps.routing, conversation, refresh,
    logError: (_t: string, _p: string, _e: string, _l: number) => {},
    postToWebview: (m: any) => deps.panel.webview.postMessage(m),
    redivivus: deps.redivivus, usageTracker: deps.usageTracker,
    onBuildFinished: (_t: string, _f?: string[]) => {
      if (autoCreated && root) {
        const CP = require('../../ui/panels/chat/chatPanel.js').ChatPanel;
        if (CP?.extensionContext) { CP.extensionContext.globalState.update('redivivus.skipConversationRestore', true); }
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: false });
      }
    },
  };

  try {
    await runSingleFileBuild(ctx as any);
  } catch (e: any) {
    const errMsg = e?.message || 'Build failed';
    conversation.push({ role: 'assistant', content: `❌ **Build failed:** ${errMsg}\n\n_Try rephrasing your request or check your AI keys._`, timestamp: Date.now() });
    refresh();
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
  const _BUILD_CONFIRM = /\b(build\s+it|lets\s+(build|do)\s+it|go\s+ahead|make\s+it|start\s+building|lets\s+go)\b/i;
  const _AGREEMENT = /\b(sounds?\s+(good|great|perfect|awesome)|that('s|\s+is)?\s+(good|great|perfect|awesome)|love\s+it|exactly|yes.*build)\b/i;
  if ((_BUILD_CONFIRM.test(lowerText) || _AGREEMENT.test(lowerText)) && lowerText.length < 80) {
    // [FIX] Dead simple: find the most recent user message BEFORE this confirmation.
    // That's the request. No keyword scoring, no plan stitching, no nested loops.
    let foundRequest = '';
    for (let i = conversation.length - 2; i >= 0; i--) {
      if (conversation[i].role === 'user') {
        const prior = conversation[i].content.toLowerCase();
        // Skip if this prior message is itself a confirmation (user double-confirmed)
        if (_BUILD_CONFIRM.test(prior) || _AGREEMENT.test(prior)) { continue; }
        foundRequest = conversation[i].content;
        break;
      }
    }
    if (foundRequest) {
      await runConfirmedLocalBuild(foundRequest, userText, deps, conversation, refresh);
      return;
    }
    // Fallback: user confirmed but we can't find a prior request
    conversation.push({ role: 'assistant', content: 'I\'m ready to build — what would you like me to make?', timestamp: Date.now() });
    refresh(); return;
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
