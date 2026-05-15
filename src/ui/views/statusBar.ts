// [SCOPE] Manages and updates the VS Code status bar items for CHASSIS — blueprint, session, tokens, save status
import * as vscode from 'vscode';
import { ChassisService } from '../../services/chassisService.js';
import { SessionService } from '../../services/sessionService.js';
import { UsageTracker } from '../../services/usageTracker.js';
import { getDuration } from '../../services/sessionStorage.js';

export class StatusBar {
  private blueprintItem: vscode.StatusBarItem;
  private sessionItem: vscode.StatusBarItem;
  private tokenItem: vscode.StatusBarItem;
  private saveItem: vscode.StatusBarItem;

  constructor(
    private chassis: ChassisService,
    private sessions: SessionService,
    private usageTracker?: UsageTracker
  ) {
    this.blueprintItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.sessionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.tokenItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    this.saveItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
  }

  activate(context: vscode.ExtensionContext): void {
    this.update();
    this.blueprintItem.show();
    this.sessionItem.show();
    this.tokenItem.show();
    this.saveItem.show();
    context.subscriptions.push(this.blueprintItem, this.sessionItem, this.tokenItem, this.saveItem);

    // [WARN] This interval continuously updates the status bar. Ensure 'update' is performant to avoid UI lag.
    // [WARN] Proper disposal of this interval is crucial to prevent resource leaks upon deactivation.
    const interval = setInterval(() => this.update(), 5000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
  }

  update(): void {
    this.updateBlueprintItem();
    this.updateSessionItem();
    this.updateTokenItem();
    this.updateSaveItem();
  }

  private updateBlueprintItem(): void {
    if (!this.chassis.isInitialized()) {
      this.blueprintItem.text = '🏗️ CHASSIS: Not initialized';
      this.blueprintItem.tooltip = 'Run "CHASSIS: Initialize Project" to get started';
      this.blueprintItem.command = 'chassis.init';
      this.blueprintItem.color = '#888';
      return;
    }

    const config = this.chassis.loadConfig();
    const bp = config?.blueprint;

    const name = config?.projectName || 'Project';
    if (bp && bp.locked) {
      this.blueprintItem.text = `\u{1F3D7}\uFE0F CHASSIS: ${name}`;
      this.blueprintItem.tooltip = `${name} — Blueprint ready\nClick to open blueprint`;
      this.blueprintItem.command = 'chassis.openBlueprint';
      this.blueprintItem.color = '#3b9dff';
    } else if (bp && bp.who) {
      this.blueprintItem.text = `\u{1F3D7}\uFE0F CHASSIS: ${name} (draft)`;
      this.blueprintItem.tooltip = `${name} — Blueprint in progress\nClick to open blueprint`;
      this.blueprintItem.command = 'chassis.openBlueprint';
      this.blueprintItem.color = '#f5a623';
    } else {
      this.blueprintItem.text = `\u{1F3D7}\uFE0F CHASSIS: ${name}`;
      this.blueprintItem.tooltip = `${name} — Blueprint not yet filled in. Click to run the setup interview.`;
      this.blueprintItem.command = 'chassis.blueprint';
      this.blueprintItem.color = '#f5a623';
    }
  }

  private updateSessionItem(): void {
    if (!this.chassis.isInitialized() || !this.sessions.isActive) {
      this.sessionItem.hide();
      return;
    }

    const session = this.sessions.session;
    const duration = session ? getDuration(session) : '0m';
    this.sessionItem.text = `🟢 Session: ${duration}`;
    this.sessionItem.tooltip = `Session: ${session?.goal || 'In progress'}\nClick to end session`;
    this.sessionItem.command = 'chassis.endSession';
    this.sessionItem.color = '#4ec959';
    this.sessionItem.show();
  }

  private updateTokenItem(): void {
    if (!this.chassis.isInitialized() || !this.usageTracker) {
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
    const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };
    const aiLines = [...aiTotals.entries()]
      .map(([ai, d]) => `  ${aiLabels[ai] || ai}: ${d.tokens.toLocaleString()} tokens ($${d.cost.toFixed(4)})`)
      .join('\n');
    const breakdownSection = aiLines ? `\nBy AI this session:\n${aiLines}\n` : '';
    this.tokenItem.tooltip = `Session: ${report.session.tokens.toLocaleString()} tokens · $${report.session.cost.toFixed(4)}${breakdownSection}\nToday: ${report.day.tokens.toLocaleString()} tokens\nThis week: ${report.week.tokens.toLocaleString()} tokens\n\nClick for detailed breakdown`;
    this.tokenItem.command = 'chassis.viewUsageInChat';
    this.tokenItem.show();
  }

  private updateSaveItem(): void {
    if (!this.chassis.isInitialized()) {
      this.saveItem.hide();
      return;
    }

    this.saveItem.text = '💾 Save Point';
    this.saveItem.tooltip = 'Click to create a manual save point (Ctrl+Shift+S)';
    this.saveItem.command = 'chassis.savePoint';
    this.saveItem.show();
  }
}