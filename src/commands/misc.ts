// [SCOPE] CHASSIS Misc commands — status display, guides, AI switching, file viewers, panel refresh

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ChassisService } from '../services/chassisService.js';
import { SessionService } from '../services/sessionService.js';
import { GuideService } from '../services/guideService.js';
import { RulesService } from '../services/rulesService.js';
import { ChassisWebviewProvider } from '../ui/chassisWebviewProvider.js';
import { ChatPanel } from '../ui/chatPanel.js';

export function registerMiscCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  sessions: SessionService,
  guideService: GuideService,
  rulesService: RulesService,
  provider: ChassisWebviewProvider,
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

  // Open Work Log — show inside chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.log', async () => {
      if (!chassis.isInitialized()) { return; }
      const raw = fs.existsSync(chassis.worklogPath)
        ? fs.readFileSync(chassis.worklogPath, 'utf-8')
        : '*(No work log entries yet.)*';
      const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<div style="padding:12px 0;"><h2 style="margin:0 0 10px;font-size:15px;">📋 Work Log</h2><pre style="white-space:pre-wrap;font-size:12px;line-height:1.6;background:var(--vscode-editor-background);padding:12px;border-radius:6px;border:1px solid var(--vscode-input-border);overflow-y:auto;max-height:480px;">${escaped}</pre></div>`;
      if (!ChatPanel.currentPanel) {
        vscode.commands.executeCommand('chassis.openChatPanel');
        setTimeout(() => ChatPanel.currentPanel?.showPanel('worklog', '📋 Work Log', html), 300);
      } else {
        ChatPanel.currentPanel.showPanel('worklog', '📋 Work Log', html);
      }
    })
  );

  // Open Dead Ends — show inside chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.deadends', async () => {
      if (!chassis.isInitialized()) { return; }
      const raw = fs.existsSync(chassis.deadendsPath)
        ? fs.readFileSync(chassis.deadendsPath, 'utf-8')
        : '*(No dead ends logged yet.)*';
      const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<div style="padding:12px 0;"><h2 style="margin:0 0 10px;font-size:15px;">💀 Dead Ends</h2><pre style="white-space:pre-wrap;font-size:12px;line-height:1.6;background:var(--vscode-editor-background);padding:12px;border-radius:6px;border:1px solid var(--vscode-input-border);overflow-y:auto;max-height:480px;">${escaped}</pre></div>`;
      if (!ChatPanel.currentPanel) {
        vscode.commands.executeCommand('chassis.openChatPanel');
        setTimeout(() => ChatPanel.currentPanel?.showPanel('deadends', '💀 Dead Ends', html), 300);
      } else {
        ChatPanel.currentPanel.showPanel('deadends', '💀 Dead Ends', html);
      }
    })
  );

  // Refresh Panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.refreshPanel', () => {
      refreshAll();
    })
  );

  // Getting Started Guide
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.guide', async () => {
      await guideService.showGuide();
    })
  );

  // Show Getting Started in Chat Panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.showChatGettingStarted', async () => {
      ChatPanel.show(undefined as any, undefined as any);
      setTimeout(() => {
        if (ChatPanel.currentPanel) {
          ChatPanel.currentPanel.showGettingStarted();
        }
      }, 100);
    })
  );

  // Switch AI — show selector inside chat panel
  ChatPanel.onSwitchAI = async (ai: string) => {
    const config = vscode.workspace.getConfiguration('chassis');
    await config.update('defaultAI', ai, true);
    vscode.window.showInformationMessage('CHASSIS now using ' + ai.toUpperCase());
    refreshAll();
  };

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
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
      const config = chassis.loadConfig();
      const name = config?.projectName || 'Project';
      const created = rulesService.generateAll(root, name);
      vscode.window.showInformationMessage(
        'CHASSIS rules generated: ' + created.join(', ')
      );
    })
  );

  // Wizard Panel — focus the sidebar webview
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.wizard', async () => {
      await vscode.commands.executeCommand('chassisSidebar.focus');
    })
  );

  // Auto-commit on successful build
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.autoCommit', async () => {
      const config = chassis.loadConfig();
      if (!config) {
        vscode.window.showErrorMessage('CHASSIS not initialized');
        return;
      }
      const mode = config.autoCommit || 'prompt';
      if (mode === 'off') {
        vscode.window.showInformationMessage('Auto-commit is off. Commit manually.');
        return;
      }

      // [WARN] Using synchronous child_process.execSync which can block the event loop and has security implications.
      // Check if there are changes to commit
      const { execSync } = require('child_process');
      try {
        // [WARN] Using synchronous child_process.execSync.
        const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
        if (!status.trim()) {
          vscode.window.showInformationMessage('No changes to commit.');
          return;
        }
      } catch (e) {
        vscode.window.showErrorMessage('Git check failed: ' + (e as Error).message);
        return;
      }

      // Generate commit message
      const timestamp = new Date().toISOString();
      const sessionService = new SessionService(chassis);
      const sessionGoal = sessionService.isActive ? sessionService.session?.goal || 'no session' : 'no session';
      const commitMessage = `CHASSIS checkpoint: ${timestamp} — ${sessionGoal}`;

      if (mode === 'auto') {
        try {
          // [WARN] Using synchronous child_process.execSync.
          execSync(`git add -A`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
          // [WARN] Using synchronous child_process.execSync.
          execSync(`git commit -m "${commitMessage}"`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
          vscode.window.showInformationMessage('Auto-committed successfully.');
        } catch (e) {
          vscode.window.showErrorMessage('Auto-commit failed: ' + (e as Error).message);
        }
      } else if (mode === 'prompt') {
        const result = await vscode.window.showInputBox({
          prompt: 'Commit message (CHASSIS checkpoint)',
          value: commitMessage,
          ignoreFocusOut: true,
        });
        if (result) {
          try {
            // [WARN] Using synchronous child_process.execSync.
            execSync(`git add -A`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
            // [WARN] Using synchronous child_process.execSync.
            execSync(`git commit -m "${result}"`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
            vscode.window.showInformationMessage('Committed successfully.');
          } catch (e) {
            vscode.window.showErrorMessage('Commit failed: ' + (e as Error).message);
          }
        }
      }
    })
  );
}