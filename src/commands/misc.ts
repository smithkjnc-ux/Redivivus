// [SCOPE] CHASSIS Misc commands — status display, guides, AI switching, file viewers, panel refresh

import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { SessionService } from '../services/sessionService.js';
import { GuideService } from '../services/guideService.js';
import { RulesService } from '../services/rulesService.js';
import { WizardPanel } from '../ui/wizardPanel.js';

export function registerMiscCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  sessions: SessionService,
  guideService: GuideService,
  rulesService: RulesService,
  wizardPanel: WizardPanel,
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

  // Open Work Log
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.log', async () => {
      if (!chassis.isInitialized()) { return; }
      const doc = await vscode.workspace.openTextDocument(chassis.worklogPath);
      vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    })
  );

  // Open Dead Ends
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.deadends', async () => {
      if (!chassis.isInitialized()) { return; }
      const doc = await vscode.workspace.openTextDocument(chassis.deadendsPath);
      vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
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

  // Switch AI
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.switchAI', async () => {
      const config = vscode.workspace.getConfiguration('chassis');
      const current = config.get<string>('defaultAI') || 'gemini';
      const pick = await vscode.window.showQuickPick([
        { label: '$(sparkle)  Gemini', description: 'Free tier — fast, good for most files', detail: current === 'gemini' ? '✅ Currently active' : '', _value: 'gemini' },
        { label: '$(hubot)  Claude', description: 'Paid — deep reasoning, complex files', detail: current === 'claude' ? '✅ Currently active' : '', _value: 'claude' },
        { label: '$(zap)  Kimi', description: 'Fast — good for bulk annotations', detail: current === 'kimi' ? '✅ Currently active' : '', _value: 'kimi' },
      ], {
        title: 'CHASSIS — Switch AI (currently: ' + current.toUpperCase() + ')',
        placeHolder: 'Pick your AI engine',
      });
      if (pick) {
        await config.update('defaultAI', (pick as any)._value, true);
        vscode.window.showInformationMessage('CHASSIS now using ' + (pick as any)._value.toUpperCase());
        refreshAll();
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

  // Wizard Panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.wizard', async () => {
      wizardPanel.show();
    })
  );
}
