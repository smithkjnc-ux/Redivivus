// [SCOPE] CHASSIS Misc commands — core status, guides, AI switching, rules

import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { SessionService } from '../services/sessionService.js';
import { GuideService } from '../services/guideService.js';
import { RulesService } from '../services/rulesService.js';
import { ChassisWebviewProvider } from '../ui/views/chassisWebviewProvider.js';
import { ChatPanel } from '../ui/chat/chatPanel.js';

export function registerMiscCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  sessions: SessionService,
  guideService: GuideService,
  rulesService: RulesService,
  provider: ChassisWebviewProvider,
  refreshAll: () => void
): void {
  registerCoreCommands(context, chassis, guideService, rulesService, refreshAll);
  registerGitCommands(context, chassis);
  registerUndoCommands(context);
  registerBrowserCommands(context);
}

function registerCoreCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  guideService: GuideService,
  rulesService: RulesService,
  refreshAll: () => void
): void {
  // Show Progress
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.progress', async () => {
      if (!chassis.isInitialized()) {
        vscode.window.showErrorMessage('Run "CHASSIS: Initialize Project" first.');
        return;
      }
      const config = chassis.loadConfig();
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
    vscode.commands.registerCommand('chassis.showChatGettingStarted', async () => {
      ChatPanel.show(undefined as any, undefined as any);
      setTimeout(() => { if (ChatPanel.currentPanel) { ChatPanel.currentPanel.showGettingStarted(); } }, 100);
    })
  );

  // Guide
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.guide', async () => { await guideService.showGuide(); })
  );

  // Switch AI
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.switchAI', async () => {
      const config = vscode.workspace.getConfiguration('chassis');
      const current = config.get<string>('defaultAI') || 'gemini';
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
        vscode.commands.executeCommand('chassis.openChatPanel');
        setTimeout(() => ChatPanel.currentPanel?.showPanel('switch-ai', '🤖 Switch AI', html), 300);
      } else {
        ChatPanel.currentPanel.showPanel('switch-ai', '🤖 Switch AI', html);
      }
    })
  );

  // Generate AI Editor Rules
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.generateRules', async () => {
      try {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
        const config = chassis.loadConfig();
        const name = config?.projectName || 'Project';
        const created = rulesService.generateAll(root, name);
        vscode.window.showInformationMessage('CHASSIS rules generated: ' + created.join(', '));
        refreshAll();
      } catch (err) {
        vscode.window.showErrorMessage('Generate Rules failed: ' + (err instanceof Error ? err.message : String(err)));
        throw err;
      }
    })
  );

  // Wizard Panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.wizard', async () => {
      await vscode.commands.executeCommand('chassisSidebar.focus');
    })
  );

  // Show CHASSIS capabilities
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.showCapabilities', async () => {
      vscode.window.showInformationMessage(
        'CHASSIS Capabilities: Build code, Blueprint, Map, Vault, AI Review, Tests, Undo Phase, VS Code commands',
        'Got it'
      );
    })
  );
}

import { registerGitCommands } from './miscGit.js';
import { registerUndoCommands } from './miscUndo.js';
import { registerBrowserCommands } from './miscBrowser.js';
