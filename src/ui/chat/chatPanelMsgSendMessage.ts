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

  // [FIX] Just Build (direct) mode: everything the user types is a build request.
  // Skip VS Code command intercept, offtopic pre-screen, and intent classifier entirely.
  if (deps.buildMode === 'direct') {
    await deps.handleBuildRequest(userText);
    return;
  }

  // [RULE 18] AI intent classification — never use regex to simulate language understanding.
  // classifyIntent makes a ~50-token AI call: build / command / question / offtopic.
  const intent = deps.classifyIntent ? await deps.classifyIntent(userText) : { type: 'question' as const };

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

  if (intent.type === 'run') {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      conversation.push({ role: 'assistant', content: 'No project is open — open a project folder first.', timestamp: Date.now() });
      refresh(); return;
    }
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');

    // Install deps subtype: detect package manager and run install in terminal
    if (intent.subtype === 'install') {
      const hasPkg = fs.existsSync(path.join(root, 'package.json'));
      const hasReqs = fs.existsSync(path.join(root, 'requirements.txt'));
      const hasCargo = fs.existsSync(path.join(root, 'Cargo.toml'));
      const hasGoMod = fs.existsSync(path.join(root, 'go.mod'));
      let installCmd = 'npm install';
      let depsLabel = 'Node.js';
      if (hasReqs && !hasPkg) { installCmd = 'pip install -r requirements.txt'; depsLabel = 'Python'; }
      else if (hasCargo) { installCmd = 'cargo build'; depsLabel = 'Rust'; }
      else if (hasGoMod) { installCmd = 'go mod download'; depsLabel = 'Go'; }
      else if (!hasPkg && !hasReqs) {
        conversation.push({ role: 'assistant', content: 'No package.json or requirements.txt found — nothing to install.', timestamp: Date.now() });
        refresh(); return;
      }
      const terminal = vscode.window.createTerminal(`CHASSIS: Install (${depsLabel})`);
      terminal.show();
      terminal.sendText(installCmd);
      conversation.push({ role: 'assistant', content: `&#x23F3; Running \`${installCmd}\` in terminal...`, timestamp: Date.now() });
      refresh(); return;
    }

    // Default run: open main entry file
    const candidates = ['index.html', 'main.html', 'index.js', 'main.js', 'app.js', 'main.py', 'app.py', 'index.py'];
    const main = candidates.find(f => fs.existsSync(path.join(root, f)));
    if (main) {
      await vscode.env.openExternal(vscode.Uri.file(path.join(root, main)));
      conversation.push({ role: 'assistant', content: `Opening \`${main}\` in your browser.`, timestamp: Date.now() });
    } else {
      conversation.push({ role: 'assistant', content: 'I couldn\'t find a main file to run (looked for index.html, main.js, etc.). Which file would you like to open?', timestamp: Date.now() });
    }
    refresh(); return;
  }

  if (intent.type === 'build') {
    // [RULE] If no mode chosen yet, send popover back to webview — don't ask here in chat.
    // The webview stores the pending text and resends it after the user picks a mode.
    if (!deps.buildMode) {
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
    await deps.handleBuildRequest(userText);
    return;
  }

  // Default: question / unknown → AI chat
  await handleAIChat(msg, userText, deps, conversation, refresh);
}
