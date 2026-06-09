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

import { runChatClarifyStep } from './chatPanelMsgSendClarify';
import { handleBuildIntent } from './chatPanelMsgSendBuildIntent';
import { checkBuildConfirmation, getWorkspaceFileList } from './chatPanelMsgSendConfirmCheck';
import { fixLog } from '../../services/logging/fixPipelineLogger';

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

  // [FIX] fromBlueprintCard: skip the verbose enriched-task user bubble — card is already the context
  if (!msg.fromBlueprintCard) {
    const _lastSm = conversation[conversation.length - 1];
    if (!_lastSm || _lastSm.role !== 'user' || _lastSm.content !== userText) { conversation.push({ role: 'user', content: userText, timestamp: Date.now() }); }
    refresh();
    if (!/\bdone.*session\b|\bstart.*session\b/i.test(userText)) { try { const _CP = require('../../ui/panels/chat/chatPanel.js').ChatPanel; const ss = (_CP as any).startSessionSilent; if (ss) { ss(userText); } } catch {} }
  }

  const lowerText = userText.toLowerCase();

  // [FIX] Skip keyword shortcuts for blueprint card confirmations — the enriched task text contains
  // portfolio/project language that trips the "my.*project" keyword pattern and shows the wrong picker.
  if (!msg.fromBlueprintCard && await handleKeywordShortcuts(userText, lowerText, deps)) { return; }
  if (!msg.fromBlueprintCard && await handleUrlRead(userText, lowerText, conversation, refresh)) { return; }
  if (!msg.fromBlueprintCard && await handleWebSearch(userText, lowerText, conversation, refresh)) { return; }
  if (await handleRememberIntent(userText, conversation, refresh)) { return; }
  if (await handleReadResult(lowerText, conversation, refresh)) { return; }

  // ── Build confirmations — extracted to chatPanelMsgSendConfirmCheck.ts (Rule 9 split) ──
  if (await checkBuildConfirmation(lowerText, userText, deps, conversation, refresh)) { return; }

  // [FIX] Pre-classification: if workspace is open and message looks like a bug report,
  // skip the general chat classifier and go directly to fix pipeline.
  const hasWorkspace = !!vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const looksLikeBugReport = hasWorkspace && (
    /\b(blank|empty|not working|broken|error|crash|freeze|hang|slow|weird|strange|bug|issue|problem|fix|correct|repair)\b/i.test(lowerText) ||
    /\b(preview|browser|screen|display|render|show|load|fetch)\b.*\b(broken|fail|error|blank|empty|not)/i.test(lowerText) ||
    /\b(game|app|page|site|project)\b.*\b(broken|not working|blank|empty|weird)/i.test(lowerText)
  );
  if (looksLikeBugReport) {
    fixLog(`[PRE-CLASSIFY] Bug report detected, routing to fix pipeline: "${userText.slice(0, 60)}..."`);
    await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
    return;
  }

  // ── Supervisor chat — Claude classifies AND answers in one call ──
  // [FIX] Replaces broken cloudClassify() (/classify never existed) + promptCheap() (wrong model for Q&A).
  const { cloudChat } = await import('../../services/api/apiClientChat.js');
  const _cfgBlueprint = deps.redivivus.isInitialized() ? (deps.redivivus.loadConfig?.() as any)?.blueprint : undefined;
  const _wsRootFL = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const chatResult = await cloudChat(userText, {
    blueprint: _cfgBlueprint,
    recentMessages: conversation.slice(-6).map(m => ({ role: m.role, content: m.content })),
    currentTime: new Date().toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    personality: vscode.workspace.getConfiguration('redivivus').get<string>('personality', 'plain'),
    fileList: _wsRootFL ? getWorkspaceFileList(_wsRootFL) : undefined,
  }, msg.tier as 'flash' | 'pro' | 'ultra' | undefined).catch(() => null);

  if (!chatResult) { await handleAIChat(msg, userText, deps, conversation, refresh); return; }
  // [FIX] doSend() calls setInputBusy(true); only set-status:ready releases it on all non-build paths.
  const releaseInput = () => setTimeout(() => deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }), 200);
  if (chatResult.action === 'offtopic') { chatResult.action = 'answer'; }

  const PROVIDER_LABEL: Record<string, string> = { claude: 'Claude', gemini: 'Gemini', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };
  const _m = chatResult.model || '', _pr = PROVIDER_LABEL[chatResult.provider] ?? 'Claude';
  const _ms = _m.includes('haiku')?'Haiku':_m.includes('sonnet')?'Sonnet':_m.includes('opus')?'Opus':_m.includes('flash')?'Flash':_m.includes('4o-mini')?'GPT-4o mini':_m.includes('4o')?'GPT-4o':'';
  const _byline = `${_pr}${_ms&&_ms!==_pr?' '+_ms:''} · ↑${chatResult.inputTokens??0} ↓${chatResult.outputTokens??0} tok`;

  if (chatResult.action === 'answer' || chatResult.action === 'clarify') {
    // [FIX] Don't show verbose build specs as chat text -- blueprint card handles build intent display
    const isBuildSpec = /[`\s]*\{[\s\S]*"action"\s*:\s*"build"/i.test(chatResult.text?.trim() ?? '');
    const displayText = isBuildSpec ? '' : chatResult.text;
    if (displayText) {
      conversation.push({ role: 'assistant', content: `${displayText}\n\n---\n*-- ${_byline}*`, timestamp: Date.now() });
      refresh();
    }
    releaseInput();
    await deps.usageTracker?.recordUsage(chatResult.inputTokens + chatResult.outputTokens, 0, chatResult.model, chatResult.inputTokens, chatResult.outputTokens, 'qa').catch(() => {});
    return;
  }
  if (chatResult.action === 'command' && chatResult.task) {
    try { await vscode.commands.executeCommand(chatResult.task); } catch { /* needs args or unknown — still show text */ }
    conversation.push({ role: 'assistant', content: chatResult.text || `Done -- **${chatResult.task.replace(/^(redivivus|workbench\.action)\./, '').replace(/([A-Z])/g, ' $1').trim()}**`, timestamp: Date.now() });
    refresh(); releaseInput(); return;
  }
  if (chatResult.action === 'personality-picker') {
    conversation.push({ role: 'assistant', content: `${chatResult.text}\n\n---\n*-- ${_byline}*`, timestamp: Date.now() });
    refresh(); releaseInput();
    setTimeout(() => import('../../commands/personalityPicker.js').then(m => m.pickPersonality()), 400);
    return;
  }
  if (chatResult.action === 'run') { releaseInput(); await handleRunIntent({ type: 'run' }, deps, conversation, refresh); return; }
  if (chatResult.action === 'convert') { await handleAIChat(msg, userText, deps, conversation, refresh, { isConvert: true }); return; }

  const intent = { type: chatResult.action as 'build' | 'fix' | 'scaffold' | 'service' };
  const _claudeTask = chatResult.task || userText;
  if (msg.fromBlueprintCard && intent.type === 'build') { conversation.push({ role: 'assistant', content: 'Analyzing your build... __BUILD_WORKING__', timestamp: Date.now() }); refresh(); }
  let clarify = { cancelled: false, routedText: userText };
  let _jobTier = 'offer-choices'; // hoisted for Stage 4 diagnostic

  // [FIX] Skip clarify for new-project builds — blueprint inference card handles pre-build questions
  const _wsR = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const _pd = (vscode.workspace.getConfiguration('redivivus').get('projectsDirectory', '~/projects') as string).replace('~', require('os').homedir());
  if (!msg.fromPreview && deps.buildMode !== 'direct' && intent.type === 'build' && _wsR && require('path').resolve(_wsR) !== require('path').resolve(_pd)) {
    const { sizeJob } = await import('../ai/jobSizer.js');
    const jobSize = await sizeJob(userText, deps.routing);
    _jobTier = jobSize.tier;
    if (jobSize.tier === 'tell-them') {
      // Supervisor acknowledges trivial task — no questions, straight to build
      conversation.push({ role: 'assistant', content: 'Got it — on it.', timestamp: Date.now() });
      refresh();
    } else {
      try {
        clarify = await runChatClarifyStep(userText, deps.routing, conversation, refresh, jobSize.suggestedQuestions);
        if (clarify.cancelled) { return; }
      } catch (_e) {
        // [FIX] Never silently swallow clarify errors — fall through to build
      }
    }
  }
  let routedText = clarify.routedText;

  // Stage 4 — Five W's pre-commit diagnostic (goal-alignment check before build fires)
  {
    const { runFiveWsDiagnostic, handleMismatch } = await import('../ai/fiveWsDiagnostic.js');
    const diagnostic = await runFiveWsDiagnostic(routedText, _jobTier, intent.type, deps.routing);
    if (!diagnostic.aligned) {
      const resolved = await handleMismatch(diagnostic, routedText, deps.routing, conversation, refresh);
      if (!resolved) { return; } // user cancelled or chose "let me explain"
      routedText = resolved;
    }
    // WHO calibration: append experience level so Guardian calibrates response depth
    if (diagnostic.who !== undefined) {
      const whoDesc = diagnostic.who < 0.35 ? 'non-technical -- explain outcomes, no code jargon'
        : diagnostic.who < 0.7 ? 'intermediate -- name files but explain what they do'
        : 'technical -- use technical terms, be concise';
      routedText += `\n\nUSER EXPERIENCE LEVEL: ${diagnostic.who.toFixed(1)} (${whoDesc})`;
    }
  }

  // Stage 5 — Visual Spec: establish visual contract before build fires (UI requests only)
  if (!msg.fromPreview && (intent.type === 'build' || intent.type === 'scaffold')) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      try {
        const { shouldRunVisualSpec, orchestrateVisualSpec, formatVisualContractBlock, setCurrentSpec } = await import('../ai/visualSpecService.js');
        if (shouldRunVisualSpec(routedText, _jobTier, root)) {
          const { spec, statusMsg } = await orchestrateVisualSpec(routedText, root, deps.routing);
          setCurrentSpec(spec);
          routedText += formatVisualContractBlock(spec);
          conversation.push({ role: 'assistant', content: statusMsg, timestamp: Date.now() });
          refresh();
        }
      } catch { /* visual spec optional -- never block a build */ }
    }
  }

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

  // ── Final routing by intent — use Claude's extracted task when available ──
  // [FIX] Pass original userText — _claudeTask is AI-rewritten and shows up in history/vault/deadends instead of the user's actual words.
  if (intent.type === 'fix') { await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType); return; }
  if (intent.type === 'scaffold') { await handleScaffoldIntent(_claudeTask, deps, conversation, refresh); return; }
  if (intent.type === 'service') { await handleServiceIntent(_claudeTask, deps, conversation, refresh); return; }
  if (intent.type === 'build') { await handleBuildIntent(routedText || _claudeTask, _claudeTask, msg, deps, conversation, refresh); return; }

  await handleAIChat(msg, userText, deps, conversation, refresh);
}
