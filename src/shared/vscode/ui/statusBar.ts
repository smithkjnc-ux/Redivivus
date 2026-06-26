// [SCOPE] Manages and updates the VS Code status bar items for Redivivus — blueprint, session, tokens, save status
import * as vscode from 'vscode';
import type { RedivivusService } from '../application/redivivusService.js';
import type { SessionService } from '../../../features/project/application/sessionService.js';
import type { UsageTracker } from '../../../features/telemetry/infrastructure/usageTracker.js';
import { getDuration } from '../../../features/project/application/sessionStorage.js';

export class StatusBar {
  private blueprintItem: vscode.StatusBarItem;
  private sessionItem: vscode.StatusBarItem;
  private tokenItem: vscode.StatusBarItem;
  private saveItem: vscode.StatusBarItem;
  private connectionItem: vscode.StatusBarItem;
  private updateItem: vscode.StatusBarItem;
  private versionItem: vscode.StatusBarItem;
  private _isConnected = false;

  constructor(
    private redivivus: RedivivusService,
    private sessions: SessionService,
    private usageTracker?: UsageTracker
  ) {
    this.blueprintItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.sessionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.tokenItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    this.saveItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
    this.connectionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    this.updateItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999);
    this.versionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 998);
  }

  activate(context: vscode.ExtensionContext): void {
    this.update();
    this.blueprintItem.show();
    this.sessionItem.show();
    this.tokenItem.show();
    this.saveItem.show();
    this.connectionItem.show();
    this.updateConnectionItem();
    try {
      const v = (require('../../../../package.json') as { version: string }).version; // [WARN] 3-level path; a throw here aborts ALL activation
      Object.assign(this.versionItem, { text: 'v' + v, tooltip: `Redivivus v${v} — click to check for updates`, command: 'redivivus.checkForUpdates' });
      this.versionItem.show();
    } catch { /* version badge non-critical — never abort activation */ }
    context.subscriptions.push(this.blueprintItem, this.sessionItem, this.tokenItem, this.saveItem, this.connectionItem, this.updateItem, this.versionItem);

    // [WARN] This interval continuously updates the status bar. Ensure 'update' is performant to avoid UI lag.
    // [WARN] Proper disposal of this interval is crucial to prevent resource leaks upon deactivation.
    const interval = setInterval(() => this.update(), 5000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });

    // Async connection check on activate + every 30s
    this.refreshConnection();
    const connInterval = setInterval(() => this.refreshConnection(), 30_000);
    context.subscriptions.push({ dispose: () => clearInterval(connInterval) });
  }

  async refreshConnection(): Promise<void> {
    try {
      const { getAccountToken, getApiBase, clearAccountToken } = await import('../../api/infrastructure/apiClient.js');
      const token = await getAccountToken();
      if (!token) {
        this._isConnected = false;
        this.updateConnectionItem();
        return;
      }
      
      // Token exists locally. Assume valid unless an actual AI request returns 401.
      this._isConnected = true;
    } catch {
      // Ignore transient failures
    }
    this.updateConnectionItem();
  }

  setConnected(value: boolean): void {
    this._isConnected = value;
    this.updateConnectionItem();
  }

  showUpdateAvailable(version: string): void {
    this.updateItem.text = `$(cloud-download) Update v${version}`;
    this.updateItem.tooltip = `Redivivus v${version} is available — click to update now`;
    this.updateItem.color = new vscode.ThemeColor('terminal.ansiYellow');
    this.updateItem.command = 'redivivus.checkForUpdates';
    this.updateItem.show();
  }

  private updateConnectionItem(): void {
    if (this._isConnected) {
      this.connectionItem.text = '$(account) Connected';
      this.connectionItem.color = new vscode.ThemeColor('terminal.ansiGreen');
      this.connectionItem.tooltip = 'Redivivus: Account connected — click to manage';
      this.connectionItem.command = 'redivivus.signIn';
    } else {
      this.connectionItem.text = '$(account) Sign In';
      this.connectionItem.color = new vscode.ThemeColor('disabledForeground');
      this.connectionItem.tooltip = 'Redivivus: Not signed in — click to connect your account';
      this.connectionItem.command = 'redivivus.signIn';
    }
  }

  update(): void {
    this.updateBlueprintItem();
    this.updateSessionItem();
    this.updateTokenItem();
    this.updateSaveItem();
  }

  private updateBlueprintItem(): void {
    if (!this.redivivus.isInitialized()) {
      this.blueprintItem.text = '🏗️ Redivivus: Getting started';
      this.blueprintItem.tooltip = 'Click here to set up your project with Redivivus';
      this.blueprintItem.command = 'redivivus.init';
      this.blueprintItem.color = '#888';
      return;
    }

    const config = this.redivivus.loadConfig();
    const bp = config?.blueprint;

    const name = config?.projectName || 'Project';
    if (bp && bp.locked) {
      this.blueprintItem.text = `\u{1F3D7}\uFE0F Redivivus: ${name}`;
      this.blueprintItem.tooltip = `${name} — Blueprint ready\nClick to open blueprint`;
      this.blueprintItem.command = 'redivivus.openBlueprint';
      this.blueprintItem.color = '#3b9dff';
    } else if (bp && bp.who) {
      this.blueprintItem.text = `\u{1F3D7}\uFE0F Redivivus: ${name} (draft)`;
      this.blueprintItem.tooltip = `${name} — Blueprint in progress\nClick to open blueprint`;
      this.blueprintItem.command = 'redivivus.openBlueprint';
      this.blueprintItem.color = '#f5a623';
    } else {
      this.blueprintItem.text = `\u{1F3D7}\uFE0F Redivivus: ${name}`;
      this.blueprintItem.tooltip = `${name} — Click to finish setting up your project`;
      this.blueprintItem.command = 'redivivus.blueprint';
      this.blueprintItem.color = '#f5a623';
    }
  }

  private updateSessionItem(): void {
    if (!this.redivivus.isInitialized() || !this.sessions.isActive) {
      this.sessionItem.hide();
      return;
    }

    const session = this.sessions.session;
    const duration = session ? getDuration(session) : '0m';
    this.sessionItem.text = `🟢 Session: ${duration}`;
    this.sessionItem.tooltip = `Session: ${session?.goal || 'In progress'}\nClick to end session`;
    this.sessionItem.command = 'redivivus.endSession';
    this.sessionItem.color = '#4ec959';
    this.sessionItem.show();
  }

  private updateTokenItem(): void {
    if (!this.redivivus.isInitialized() || !this.usageTracker) {
      this.tokenItem.hide();
      return;
    }

    const report = this.usageTracker.getReport();
    const tokens = report.session.tokens;
    const cost = report.session.cost.toFixed(4);
    this.tokenItem.text = `\u26a1 ${tokens.toLocaleString()} tokens ($${cost})`;
    // Build per-AI session breakdown for tooltip
    const history = this.usageTracker.getHistory();
    const sessionStart = this.usageTracker.getSessionStart();
    const aiTotals = new Map<string, { tokens: number; cost: number }>();
    for (const entry of history) {
      if (entry.timestamp >= sessionStart) {
        const existing = aiTotals.get(entry.aiProvider);
        if (existing) { existing.tokens += entry.tokens; existing.cost += entry.cost; }
        else { aiTotals.set(entry.aiProvider, { tokens: entry.tokens, cost: entry.cost }); }
      }
    }
    const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', deepseek: 'DeepSeek' };
    const aiLines = [...aiTotals.entries()]
      .map(([ai, d]) => `  ${aiLabels[ai] || ai}: ${d.tokens.toLocaleString()} tokens ($${d.cost.toFixed(4)})`)
      .join('\n');
    const breakdownSection = aiLines ? `\nBy AI this session:\n${aiLines}\n` : '';
    this.tokenItem.tooltip = `Session: ${report.session.tokens.toLocaleString()} tokens · $${report.session.cost.toFixed(4)}${breakdownSection}\nToday: ${report.day.tokens.toLocaleString()} tokens\nThis week: ${report.week.tokens.toLocaleString()} tokens\n\nClick for detailed breakdown`;
    this.tokenItem.command = 'redivivus.viewUsageInChat';
    this.tokenItem.show();
  }

  private updateSaveItem(): void {
    if (!this.redivivus.isInitialized()) {
      this.saveItem.hide();
      return;
    }

    this.saveItem.text = '💾 Save Point';
    this.saveItem.tooltip = 'Click to create a manual save point (Ctrl+Shift+S)';
    this.saveItem.command = 'redivivus.savePoint';
    this.saveItem.show();
  }
}