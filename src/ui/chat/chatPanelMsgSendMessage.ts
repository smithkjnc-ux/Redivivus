// [SCOPE] Chat message handler: send-message — the main user chat path
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ChatMessage } from './chatPanelHtml.js';
import { MessageHandlerDeps } from './chatPanelMessages.js';
import { tryRouteToVSCodeCommand } from '../../services/commandRouter.js';
import { hasPendingScopeQuestion, resolveScopeQuestion, clearPendingScopeQuestion, getScopeQuestionTimestamp } from '../../services/project/templateScopeService.js';
import { detectBlueprintGaps, buildGapPromptMessage } from '../../services/blueprint/blueprintGapDetector.js';
import { ProjectOperations } from '../../services/project/projectOperations.js';
import { _pendingGuidedBuilds } from './chatPanelMsgSpecial.js';
import { handleAIChat } from './chatPanelMsgSendAI.js';
import { _scanChassisProjects } from '../chassisProjectScanner.js';

// [CHASSIS] Explicit build triggers — only these words trigger the full build pipeline
// [WARN] Do NOT add conversion verbs here (convert/turn/transform/rewrite) — they stall the build pipeline.
// Conversion requests go through the AI chat path where chatPanelAutoSave.ts handles file creation.
const BUILD_TRIGGER_RE = /\b(build|create|make|generate|write|add|implement|code|develop|produce)\s+(a|an|the|my|new|some|that|this|those)?\s*(website|app|application|page|site|component|function|class|file|code|script|tool|api|backend|frontend|feature|thing|project|module|library|plugin|extension|html|css|js|ts|python|go|rust|java|component|form|button|handler|utility)/i;
const OFFTOPIC_KEYWORDS = /\b(weather|forecast|temperature|recipe|cook(ing)?|sports score|nba|nfl|mlb|joke|funny|travel|vacation|celebrity|movie review|song lyrics|restaurant|food delivery|news today|politics|stock price|crypto|bitcoin|horoscope|dating tip)\b/i;
const DEV_OVERRIDE = /\b(api|debug|code|build|deploy|server|database|function|component|script|project|file|test|error|bug|fix|performance|architecture|framework|library)\b/i;

export async function handleSendMessage(msg: any, deps: MessageHandlerDeps): Promise<void> {
  const { chassis, routing, usageTracker, conversation, panel, refresh } = deps;
  const projectOps = new ProjectOperations();
  const userText = msg.text?.trim();
  if (!userText) { return; }

  const _lastSm = conversation[conversation.length - 1];
  if (!_lastSm || _lastSm.role !== 'user' || _lastSm.content !== userText) {
    conversation.push({ role: 'user', content: userText, timestamp: Date.now() });
  }
  refresh();

  // Scope clarification intercept
  if (hasPendingScopeQuestion()) {
    const scopeAge = Date.now() - getScopeQuestionTimestamp();
    if (scopeAge < 120_000 && userText.length < 100) { resolveScopeQuestion(userText); return; }
    clearPendingScopeQuestion();
  }

  const lowerText = userText.toLowerCase();

  // Template listing
  if (/what\s+templates|show.*templates|list.*templates|templates.*available|templates.*do\s+you\s+have|what\s+can\s+you\s+build|what\s+types.*build|what.*project.*types/i.test(lowerText)) {
    try {
      const { TEMPLATE_CATEGORIES } = await import('../../services/project/templateRegistry.js');
      const lines: string[] = ['**CHASSIS Template Library** -- here\'s what I can build:\n'];
      for (const cat of TEMPLATE_CATEGORIES) {
        lines.push(`**${cat.label}** -- ${cat.description}`);
        for (const sub of cat.subcategories) {
          const tags = sub.tags?.slice(0, 3).join(', ') || '';
          lines.push(`  - **${sub.label}**: ${sub.description}${tags ? ' (' + tags + ')' : ''}`);
        }
      }
      lines.push('\nJust say **"build me a [type]"** and I\'ll walk you through it.');
      conversation.push({ role: 'assistant', content: lines.join('\n'), timestamp: Date.now() });
    } catch {
      conversation.push({ role: 'assistant', content: 'I have templates for **Websites**, **Games**, **Apps/Tools**, and **APIs/Backends**. Just say "build me a [type]" to start.', timestamp: Date.now() });
    }
    refresh(); return;
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
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root && chassis) {
      const { SetupProgressService } = await import('../../services/project/setupProgressService.js');
      const { showSetupProgressPanel } = await import('../../services/project/setupProgressPanel.js');
      const progressService = new SetupProgressService(chassis, root);
      const progress = await progressService.getProgress();
      showSetupProgressPanel(progress, () => progressService.getProgress());
      conversation.push({ role: 'assistant', content: `I've opened the setup progress panel. You're **${progress.percentage}% complete** (${progress.completedCount} of ${progress.totalCount} steps done).`, timestamp: Date.now() });
      refresh(); return;
    }
  }

  // List projects
  if (/list.*project|show.*project|available.*project|my.*project/i.test(lowerText)) {
    const projects = _scanChassisProjects();
    const reply = projects.length ? `Found **${projects.length} CHASSIS project${projects.length === 1 ? '' : 's'}** -- opening the picker now.` : 'No CHASSIS projects found.';
    conversation.push({ role: 'assistant', content: reply, timestamp: Date.now() });
    refresh();
    if (projects.length) { panel.webview.postMessage({ type: 'show-projects-modal', projects }); }
    return;
  }

  // VS Code command intercept — 3 layers: dictionary, fuzzy (typo-tolerant), AI classify
  const vsCodeLabel = await tryRouteToVSCodeCommand(userText, routing);
  if (vsCodeLabel) { conversation.push({ role: 'assistant', content: `Done -- **${vsCodeLabel}**`, timestamp: Date.now() }); refresh(); return; }

  // Offtopic pre-screen
  if (OFFTOPIC_KEYWORDS.test(userText) && !DEV_OVERRIDE.test(userText)) {
    conversation.push({ role: 'assistant', content: "I'm a coding assistant -- I can help you build, fix, explain, or review code. What are you building today?", timestamp: Date.now() });
    refresh(); return;
  }

  // Open project by name
  const openProjectMatch = userText.match(/\b(?:open|switch\s+to|load|go\s+to)\s+(?:the\s+)?(\w[\w-]*)\s+project\b/i);
  if (openProjectMatch) {
    const projectName = openProjectMatch[1];
    conversation.push({ role: 'assistant', content: `Opening project: ${projectName}...`, timestamp: Date.now() });
    refresh();
    const opened = await projectOps.openProject(projectName);
    if (!opened) {
      const projects = _scanChassisProjects();
      conversation.push({ role: 'assistant', content: `Project "${projectName}" not found. Here are your available CHASSIS projects:`, timestamp: Date.now() });
      refresh();
      panel.webview.postMessage({ type: 'show-projects-modal', projects });
    }
    return;
  }

  // Architecture map
  if (/\b(?:show|open|view|display)\s+(?:me\s+)?(?:the\s+)?(?:architecture\s+|dependency\s+|project\s+)?map\b/i.test(userText) ||
      /\barchitecture\s+(?:map|view|diagram)\b/i.test(userText)) {
    if (!vscode.workspace.workspaceFolders?.[0]) {
      conversation.push({ role: 'assistant', content: 'No project is open -- open a project first, then I can show you the architecture map.', timestamp: Date.now() });
    } else {
      conversation.push({ role: 'assistant', content: 'Opening architecture map...', timestamp: Date.now() });
      try { await vscode.commands.executeCommand('chassis.showMap'); } catch { /* ignore */ }
    }
    refresh(); return;
  }

  // Project info from blueprint
  const currentProjectName = chassis?.loadConfig?.()?.projectName || vscode.workspace.workspaceFolders?.[0]?.name || '';
  if (currentProjectName && (
    new RegExp(`\\b(?:what\\s+is|tell\\s+me\\s+(?:what|about)|what\\s+does|describe|explain)\\s+(?:the\\s+)?${currentProjectName}\\b`, 'i').test(userText) ||
    /\b(?:what\s+is\s+this\s+project|tell\s+me\s+about\s+this\s+(?:project|app|program)|what\s+does\s+this\s+(?:project|app|program)\s+do)\b/i.test(userText)
  )) {
    const config = chassis?.loadConfig?.();
    const bp = config?.blueprint;
    if (!bp || !(bp.who || bp.what || bp.where || bp.why)) {
      conversation.push({ role: 'assistant', content: `CHASSIS hasn't analyzed **${currentProjectName}** yet.\n\n__ACTION_CARD__chassis.openBlueprint|||Run Blueprint Interview|||END__`, timestamp: Date.now() });
      refresh(); return;
    }
    let bpContext = `Project name: ${currentProjectName}\n`;
    if (bp.who) { bpContext += `Who it's for: ${bp.who}\n`; }
    if (bp.what) { bpContext += `What it does: ${bp.what}\n`; }
    if (bp.where) { bpContext += `Where it runs: ${bp.where}\n`; }
    if (bp.why) { bpContext += `Why it exists: ${bp.why}\n`; }
    try {
      const aiResponse = await routing.prompt(`You are CHASSIS AI. Answer using ONLY this blueprint:\n\n${bpContext}\nAnswer in 3-5 sentences max.`);
      conversation.push({ role: 'assistant', content: aiResponse.text || '', timestamp: Date.now() });
    } catch {
      conversation.push({ role: 'assistant', content: `Based on the blueprint: ${bpContext}`, timestamp: Date.now() });
    }
    refresh(); return;
  }

  // Intent routing
  const intent = BUILD_TRIGGER_RE.test(userText) ? { type: 'build' as const } : { type: 'question' as const };

  if (intent.type === 'build') {
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
    require('fs').appendFileSync(require('os').homedir() + '/chassis_debug.log', `[handleBuildRequest] calling with task=${userText.slice(0, 60)}\n`);
    await deps.handleBuildRequest(userText);
    return;
  }

  require('fs').appendFileSync(require('os').homedir() + '/chassis_debug.log', `[intent] type=${intent.type} -- not build, going to AI path\n`);
  await handleAIChat(msg, userText, deps, conversation, refresh);
}

