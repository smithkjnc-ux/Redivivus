// [SCOPE] Chat message handler: send-message — the main user chat path
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.
// [RULE 18] Intent classification uses AI (deps.classifyIntent), never regex pattern matching.

import * as vscode from 'vscode';
import { ChatMessage } from './chatPanelHtml.js';
import { MessageHandlerDeps } from './chatPanelMessages.js';

import { detectBlueprintGaps, buildGapPromptMessage } from '../../services/blueprint/blueprintGapDetector.js';
import { ProjectOperations } from '../../services/project/projectOperations.js';
import { _pendingGuidedBuilds } from './chatPanelMsgSpecial.js';
import { _scanChassisProjects } from '../chassisProjectScanner.js';
import { handleAIChat } from './chatPanelMsgSendAI.js';
import { handleFixRequest } from './chatPanelMsgFix.js';
import { runTemplateWizard } from '../../services/project/templateWizard.js';
import { handleRunIntent, handleScaffoldIntent, handleServiceIntent } from './chatPanelMsgIntentActions.js';

export async function handleSendMessage(msg: any, deps: MessageHandlerDeps, buildMode?: any): Promise<void> {
  const { chassis, routing, usageTracker, conversation, panel, refresh } = deps;
  const projectOps = new ProjectOperations();
  const userText = msg.text?.trim();
  if (!userText) { return; }

  const _lastSm = conversation[conversation.length - 1];
  if (!_lastSm || _lastSm.role !== 'user' || _lastSm.content !== userText) {
    conversation.push({ role: 'user', content: userText, timestamp: Date.now() });
  }
  refresh();

  const lowerText = userText.toLowerCase();

  // Template listing
  if (/what\s+templates|show.*templates|list.*templates|templates.*available|templates.*do\s+you\s+have|what\s+can\s+you\s+build|what\s+types.*build|what.*project.*types/i.test(lowerText)) {
    try {
      const { TEMPLATE_CATEGORIES } = await import('../../services/project/templateRegistry.js');
      const lines = ['**CHASSIS Template Library** -- here\'s what I can build:\n', ...TEMPLATE_CATEGORIES.flatMap(cat => [`**${cat.label}** -- ${cat.description}`, ...cat.subcategories.map(sub => `  - **${sub.label}**: ${sub.description}${sub.tags?.length ? ' (' + sub.tags.slice(0, 3).join(', ') + ')' : ''}`)]), '\nJust say **"build me a [type]"** and I\'ll walk you through it.'];
      conversation.push({ role: 'assistant', content: lines.join('\n'), timestamp: Date.now() });
    } catch {
      conversation.push({ role: 'assistant', content: 'I have templates for **Websites**, **Games**, **Apps/Tools**, and **APIs/Backends**. Just say "build me a [type]" to start.', timestamp: Date.now() });
    }
    refresh(); return;
  }

  // Run / open program — check BEFORE AI classifier to avoid vault/build path
  if (/^(run|open|launch|show|preview|view)\s+(it|the\s+(program|app|site|page|game|file|project|result|output)|my\s+(program|app|site|game))/i.test(lowerText) || lowerText.trim() === 'run it') {
    const _runRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (_runRoot) {
      const { detectPostBuildInfo } = await import('./chatPanelPostBuild.js');
      const _info = detectPostBuildInfo(_runRoot, []);
      if (_info.entryFile) {
        const _p = require('path') as typeof import('path');
        await vscode.env.openExternal(vscode.Uri.file(_p.join(_runRoot, _info.entryFile)));
        conversation.push({ role: 'assistant', content: `Opening \`${_info.entryFile}\` in your browser.`, timestamp: Date.now() });
        refresh(); return;
      }
    }
  }

  // Scan project
  if (/scan.*for\s+(problems?|issues?|errors?|bugs?|warnings?)|analyze\s+(the\s+)?project|check\s+(my\s+|the\s+)?project|find.*problems|project.*health|run\s+scan|scan\s+project/i.test(lowerText)) {
    conversation.push({ role: 'assistant', content: 'Running project scan now -- opening the Recommendations panel...', timestamp: Date.now() });
    refresh(); await vscode.commands.executeCommand('chassis.analyze'); return;
  }

  // Current project info
  if (/what\s+(am\s+i\s+working|project\s+is\s+this)/i.test(lowerText)) {
    const info = await projectOps.getCurrentProjectInfo();
    conversation.push({ role: 'assistant', content: `**Current project:** ${info || 'No project info available'}`, timestamp: Date.now() });
    refresh(); return;
  }

  // Setup progress
  if (/how'?s\s+my\s+setup|setup\s+progress|what'?s\s+left|what\s+to\s+do\s+next/i.test(lowerText)) {
    const _spRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (_spRoot && chassis) {
      const { SetupProgressService } = await import('../../services/project/setupProgressService.js');
      const { showSetupProgressPanel } = await import('../../services/project/setupProgressPanel.js');
      const svc = new SetupProgressService(chassis, _spRoot); const prog = await svc.getProgress();
      showSetupProgressPanel(prog, () => svc.getProgress());
      conversation.push({ role: 'assistant', content: `Setup progress panel opened. You're **${prog.percentage}% complete** (${prog.completedCount} of ${prog.totalCount} steps done).`, timestamp: Date.now() });
      refresh(); return;
    }
  }

  // List projects
  if (/list.*project|show.*project|available.*project|my.*project/i.test(lowerText)) {
    const projects = _scanChassisProjects();
    const reply = projects.length ? `Found **${projects.length} CHASSIS project${projects.length === 1 ? '' : 's'}** -- opening the picker now.` : 'No CHASSIS projects found.';
    conversation.push({ role: 'assistant', content: reply, timestamp: Date.now() }); refresh();
    if (projects.length) { panel.webview.postMessage({ type: 'show-projects-modal', projects }); }
    return;
  }
  // Explain project files — non-tech file explanation, before AI classifier
  if (/explain.*files?|what.*files?|what.*folder|why.*extra.*code|what.*all.*this/i.test(lowerText)) {
    const _exRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (_exRoot) { const { explainProjectFiles } = await import('./chatPanelFileExplainer.js'); conversation.push({ role: 'assistant', content: await explainProjectFiles(_exRoot), timestamp: Date.now() }); refresh(); return; }
  }
  // [FIX] Web search + URL reading -- intercept before classifier
  const { extractUrl, detectSearchIntent, readUrl, searchWeb } = await import('../../services/webSearchService.js');
  const pastedUrl = extractUrl(userText);
  if (pastedUrl && /\b(read|use|look at|check|fetch|get|from|reference)\b/i.test(lowerText)) {
    conversation.push({ role: 'assistant', content: `Reading \`${pastedUrl}\`...`, timestamp: Date.now() });
    refresh();
    const page = await readUrl(pastedUrl);
    if (page) {
      const summary = page.text.slice(0, 4000);
      const truncNote = page.truncated ? '\n_(Page was large -- showing first portion)_' : '';
      conversation[conversation.length - 1].content = `**${page.title || pastedUrl}**\n\n${summary}${truncNote}`;
    } else {
      conversation[conversation.length - 1].content = `Could not read that URL. It may be blocked, require login, or be non-text content.`;
    }
    refresh(); return;
  }
  const searchQuery = detectSearchIntent(userText);
  if (searchQuery && !pastedUrl) {
    conversation.push({ role: 'assistant', content: `Searching the web for "${searchQuery}"...`, timestamp: Date.now() });
    refresh();
    const results = await searchWeb(searchQuery);
    if (results.length > 0) {
      const formatted = results.map((r, i) => `${i + 1}. **[${r.title}](${r.url})**\n   ${r.snippet}`).join('\n\n');
      conversation[conversation.length - 1].content = `**Web results for "${searchQuery}":**\n\n${formatted}\n\n_Say "read #1" to fetch the full page, or ask me to use these results in a build._`;
    } else {
      conversation[conversation.length - 1].content = `No results found for "${searchQuery}". Try rephrasing or check your internet connection.`;
    }
    refresh(); return;
  }
  // [FIX] "remember that..." — store explicit preference in user memory (0 AI tokens)
  const { detectRememberIntent, rememberExplicit } = await import('../../services/userMemoryService.js');
  const rememberText = detectRememberIntent(userText);
  if (rememberText) {
    rememberExplicit(rememberText);
    conversation.push({ role: 'assistant', content: `Got it -- I'll remember: **"${rememberText}"**\n\n_This preference will be used in all future builds across all projects._`, timestamp: Date.now() });
    refresh(); return;
  }

  // [FIX] "read #N" — fetch a specific search result from the previous results
  const readResultMatch = lowerText.match(/^read\s+#?(\d+)/);
  if (readResultMatch) {
    const prevMsg = [...conversation].reverse().find(m => m.role === 'assistant' && m.content.includes('**Web results for'));
    if (prevMsg) {
      const urlMatches = [...prevMsg.content.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)];
      const idx = parseInt(readResultMatch[1]) - 1;
      if (urlMatches[idx]) {
        const targetUrl = urlMatches[idx][2];
        conversation.push({ role: 'assistant', content: `Reading \`${targetUrl}\`...`, timestamp: Date.now() });
        refresh();
        const page = await readUrl(targetUrl);
        if (page) {
          const truncNote = page.truncated ? '\n_(Page was large -- showing first portion)_' : '';
          conversation[conversation.length - 1].content = `**${page.title || targetUrl}**\n\n${page.text.slice(0, 4000)}${truncNote}`;
        } else {
          conversation[conversation.length - 1].content = `Could not read that page.`;
        }
        refresh(); return;
      }
    }
  }

  // [FIX] Just Build (direct) mode skips classifier ONLY for pure build tasks — fix/bug/broken words fall through to classifier
  // [DEAD] Was: skip classifier entirely — routed "this needs fixed" to build pipeline, wiped the project
  if (deps.buildMode === 'direct' && !deps.agentMode && !/\b(fix|broken|bug|doesn't work|not working|error|crash|fail|no sound|not playing)\b/i.test(userText)) { await deps.handleBuildRequest(userText); return; }

  // [CHASSIS] Phase 2: Agent Mode routing
  if (deps.agentMode) {
    const { executeAgentTask } = await import('../../services/ai/agentService.js');
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const agentCtx: any = {
      root: rootPath,
      task: userText,
      log: (msg: string) => {
        conversation.push({ role: 'assistant', content: msg, timestamp: Date.now() });
        refresh();
      },
      modifiedFiles: new Set<string>(),
      snapshotId: undefined
    };
    const config = deps.chassis.isInitialized() ? deps.chassis.loadConfig() : null;
    let projectContext = config?.blueprint ? `Blueprint: ${JSON.stringify(config.blueprint)}` : 'No blueprint available.';
    try {
      const files = await vscode.workspace.findFiles('**/*.*', '**/node_modules/**,**/.git/**,**/dist/**,**/out/**');
      const fileList = files.map(f => vscode.workspace.asRelativePath(f)).slice(0, 100).join('\n- ');
      projectContext += `\n\nPROJECT FILES IN WORKSPACE:\n- ${fileList}\n\n(Use these exact paths when reading/writing files.)`;
    } catch (e) {}
    const result = await executeAgentTask(userText, projectContext, deps.routing, agentCtx, agentCtx.log);
    
    if (!result.success && result.error) {
      conversation.push({ role: 'assistant', content: `**Agent failed:** ${result.error}`, timestamp: Date.now() });
    } else if (result.finalAnswer) {
      let finalContent = result.finalAnswer;
      if (agentCtx.modifiedFiles.size > 0 && result.ledger) {
        const { buildResultCard } = await import('./chatPanelStory.js');
        const { BuildHistoryService, makeBuildHistoryEntry } = await import('../../services/build/buildHistoryService.js');
        const ledgerSummary = result.ledger.hasData() ? result.ledger.getSummary() : undefined;
        const totalTokens = ledgerSummary ? ledgerSummary.reduce((s, l) => s + l.tokens, 0) : 0;
        const totalCost = ledgerSummary ? ledgerSummary.reduce((s, l) => s + l.costUSD, 0) : 0;
        const files: string[] = Array.from(agentCtx.modifiedFiles as Set<string>);
        const card = buildResultCard(files, 0, totalTokens, totalCost, 0, agentCtx.snapshotId, 0, true, ledgerSummary);
        finalContent += `\n\n${card}`;
        
        const sw = deps.routing.selectSupervisorAndWorker();
        new BuildHistoryService(rootPath).record(makeBuildHistoryEntry({
          snapshotId: agentCtx.snapshotId || Date.now().toString(),
          task: userText,
          files,
          tokensUsed: totalTokens,
          costUSD: totalCost,
          source: 'ai',
          supervisor: sw.supervisor,
          worker: null,
          resultCardToken: card
        }));
      }
      conversation.push({ role: 'assistant', content: finalContent, timestamp: Date.now() });
    }
    refresh();
    return;
  }

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
    // [RULE] If no mode chosen yet: initialized projects auto-route to direct build (user is modifying, not starting fresh).
    // Only show mode popover for brand-new uninitialized projects WITH a folder open.
    if (!deps.buildMode) {
      // [FIX] No workspace open → just build, don't show mode popover. Auto-create handles the rest.
      if (!vscode.workspace.workspaceFolders?.length) { await deps.handleBuildRequest(userText); return; }
      if (deps.chassis?.isInitialized?.()) { await deps.handleBuildRequest(userText); return; }
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
    await deps.handleBuildRequest(userText);
    return;
  }

  // Default: question / unknown → AI chat
  await handleAIChat(msg, userText, deps, conversation, refresh);
}
