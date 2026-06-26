// [SCOPE] Redivivus Misc commands — core status, guides, AI switching, rules

import * as vscode from 'vscode';
import type { RedivivusService } from './redivivusService.js';
import type { SessionService } from '../../project/logic/sessionService.js';
import type { GuideService } from './guideService.js';
import type { RulesService } from './rules/rulesService.js';
import type { RedivivusWebviewProvider } from '../ui/redivivusWebviewProvider.js';
import { ChatPanel } from '../../chat/ui/chatPanel.js';
import { registerConfigureEditorRules } from '../../settings/logic/configureEditorRules.js';

export function registerMiscCommands(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  sessions: SessionService,
  guideService: GuideService,
  rulesService: RulesService,
  provider: RedivivusWebviewProvider,
  refreshAll: () => void
): void {
  registerCoreCommands(context, redivivus, guideService, rulesService, refreshAll);
  registerConfigureEditorRules(context, redivivus, rulesService, refreshAll);
  registerGitCommands(context, redivivus);
  registerUndoCommands(context);
  registerBrowserCommands(context);
}

function registerCoreCommands(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  guideService: GuideService,
  rulesService: RulesService,
  refreshAll: () => void
): void {
  // Show Progress
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.progress', async () => {
      if (!redivivus.isInitialized()) {
        vscode.window.showErrorMessage('Run "Redivivus: Initialize Project" first.');
        return;
      }
      const config = redivivus.loadConfig();
      if (!config) { return; }
      const bp = config.blueprint;
      const healthLine = `✅ ${bp.health.confirmed} Confirmed · 🔶 ${bp.health.assumed} Assumed · ❓ ${bp.health.unknown} Unknown`;
      const statusLine = bp.locked ? '🔒 Blueprint LOCKED' : '🔶 Blueprint DRAFT';
      const sessionsLine = `📊 ${config.sessions.length} sessions logged`;
      vscode.window.showInformationMessage(
        `${config.projectName} — ${statusLine}\n${healthLine}\n${sessionsLine}`
      );
    })
  );

  // Getting Started panel
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.showChatGettingStarted', async () => {
      ChatPanel.show(undefined as any, undefined as any);
      setTimeout(() => { if (ChatPanel.currentPanel) { ChatPanel.currentPanel.showGettingStarted(); } }, 100);
    })
  );

  // Guide
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.guide', async () => { await guideService.showGuide(); })
  );

  // Switch AI
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.switchAI', async () => {
      const config = vscode.workspace.getConfiguration('redivivus');
      const current = config.get<string>('defaultAI') || '';
      const ais = [
        { id: 'gemini', label: 'Gemini', desc: 'Free tier — fast, good for most tasks', icon: '✨' },
        { id: 'claude', label: 'Claude', desc: 'Paid — deep reasoning, best for complex files', icon: '🤖' },
        { id: 'kimi', label: 'Kimi', desc: 'Fast — great for bulk annotations', icon: '⚡' },
        { id: 'openai', label: 'GPT-4o', desc: 'OpenAI — versatile and widely supported', icon: '🧠' },
        { id: 'groq', label: 'Groq', desc: 'Ultra-fast inference', icon: '🚀' },
        { id: 'xai', label: 'Grok', desc: 'xAI — experimental, web-aware', icon: '🌐' },
      ];
      const cardsHtml = ais.map(a => {
        const isActive = a.id === current;
        const border = isActive ? 'var(--vscode-focusBorder)' : 'var(--vscode-input-border)';
        const badge = isActive ? '<span style="float:right;font-size:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);padding:2px 6px;border-radius:10px;">Active</span>' : '';
        return `<button data-ai="${a.id}" style="display:block;width:100%;text-align:left;margin-bottom:8px;padding:10px 12px;background:var(--vscode-editor-background);border:1px solid ${border};border-radius:6px;cursor:pointer;color:var(--vscode-editor-foreground);">${badge}<span style="font-size:16px;margin-right:8px;">${a.icon}</span><strong>${a.label}</strong><br><span style="font-size:11px;color:var(--vscode-descriptionForeground);margin-left:28px;">${a.desc}</span></button>`;
      }).join('');
      const html = `<div id="ai-switch-panel" style="padding:4px 0">${cardsHtml}</div>`;
      if (!ChatPanel.currentPanel) {
        vscode.commands.executeCommand('redivivus.openChatPanel');
        setTimeout(() => ChatPanel.currentPanel?.showPanel('switch-ai', '🤖 Switch AI', html), 300);
      } else {
        ChatPanel.currentPanel.showPanel('switch-ai', '🤖 Switch AI', html);
      }
    })
  );

  // Generate AI Editor Rules
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.generateRules', async () => {
      try {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
        const config = redivivus.loadConfig();
        const name = config?.projectName || 'Project';
        const created = rulesService.generateAll(root, name);
        vscode.window.showInformationMessage('Redivivus rules generated: ' + created.join(', '));
        refreshAll();
      } catch (err) {
        vscode.window.showErrorMessage('Generate Rules failed: ' + (err instanceof Error ? err.message : String(err)));
        throw err;
      }
    })
  );

  // New Project — open chat panel and show the new project screen
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.wizard', async () => {
      await vscode.commands.executeCommand('redivivus.openChat');
      await new Promise(r => setTimeout(r, 400));
      if (ChatPanel.currentPanel) {
        ChatPanel.currentPanel.showNewProject();
      }
    })
  );

  // Show Redivivus capabilities
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.showCapabilities', async () => {
      vscode.window.showInformationMessage(
        'Redivivus Capabilities: Build code, Blueprint, Map, Vault, AI Review, Tests, Undo Phase, VS Code commands',
        'Got it'
      );
    })
  );
}

import { registerGitCommands } from './miscGit.js';
import { registerUndoCommands } from './miscUndo.js';
import { registerBrowserCommands } from './miscBrowser.js';
