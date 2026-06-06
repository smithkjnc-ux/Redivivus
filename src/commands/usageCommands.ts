// [SCOPE] Redivivus Usage Commands — provides commands for viewing and resetting AI usage statistics
// Commands: view usage report, reset session/day/week/month/all with lifetime preservation

import * as vscode from 'vscode';
import type { UsageTracker} from '../services/usageTracker.js';
import { UsageReport, AIBreakdown, UsagePeriodWithBreakdown } from '../services/usageTracker.js';
import type { RoutingService } from '../services/ai/routingService.js';
import { showInChatPanel } from '../services/chatPanelContent.js';
import { getActiveProjectRoot } from '../services/project/activeProjectRoot.js';

export function registerUsageCommands(context: vscode.ExtensionContext, usageTracker: UsageTracker, routing?: RoutingService): void {
  // View Usage Report (in separate panel)
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.viewUsage', async () => {
      const report = usageTracker.getReport();
      const roster = routing?.getRosterDisplay?.();
      const history = usageTracker.getHistory();
      const panel = vscode.window.createWebviewPanel(
        'redivivusUsage',
        'Redivivus Usage Report',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      panel.webview.html = getUsageHtml(report, roster, history);
      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'reset') {
          const map: Record<string, Parameters<typeof usageTracker.reset>[0]> = { session: 'session', day: 'day', week: 'week', month: 'month', all: 'all-resettable' };
          if (map[msg.period]) { await usageTracker.reset(map[msg.period]); panel.webview.html = getUsageHtml(usageTracker.getReport(), roster, usageTracker.getHistory()); }
        }
      });
    })
  );

  // View Project Usage Report (in separate panel)
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.viewProjectUsage', async () => {
      const _projRoot = getActiveProjectRoot();
      const projectName = _projRoot ? require('path').basename(_projRoot) : undefined;
      if (!projectName) {
        vscode.commands.executeCommand('redivivus.viewUsage');
        return;
      }
      const report = usageTracker.getReport(projectName);
      const roster = routing?.getRosterDisplay?.();
      const history = usageTracker.getHistory().filter((e) => e.project === projectName);
      const panel = vscode.window.createWebviewPanel(
        'redivivusUsage',
        `Redivivus Usage: ${projectName}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      // Change title inside HTML
      let html = getUsageHtml(report, roster, history);
      html = html.replace('<h1>&#x1F4CA; Redivivus Usage Report</h1>', `<h1>&#x1F4CA; Project Usage: ${projectName}</h1>`);
      html = html.replace('<div class="subtitle">AI token usage and cost breakdown</div>', `<div class="subtitle">AI token usage and cost breakdown specifically for project: <strong>${projectName}</strong></div>`);
      panel.webview.html = html;
      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'reset') {
          const map: Record<string, Parameters<typeof usageTracker.reset>[0]> = { session: 'session', day: 'day', week: 'week', month: 'month', all: 'all-resettable' };
          if (map[msg.period]) { 
            await usageTracker.reset(map[msg.period]); 
            let refreshedHtml = getUsageHtml(usageTracker.getReport(projectName), roster, usageTracker.getHistory().filter((e) => e.project === projectName));
            refreshedHtml = refreshedHtml.replace('<h1>&#x1F4CA; Redivivus Usage Report</h1>', `<h1>&#x1F4CA; Project Usage: ${projectName}</h1>`);
            refreshedHtml = refreshedHtml.replace('<div class="subtitle">AI token usage and cost breakdown</div>', `<div class="subtitle">AI token usage and cost breakdown specifically for project: <strong>${projectName}</strong></div>`);
            panel.webview.html = refreshedHtml;
          }
        }
      });
    })
  );

  // View Usage Report (in chat panel)
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.viewUsageInChat', async () => {
      const report = usageTracker.getReport();
      const roster = routing?.getRosterDisplay?.();
      const content = formatUsageForChat(report, roster);
      showInChatPanel({ title: '📊 Usage Report', content, type: 'html' });
    })
  );

  // Reset Session
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.resetSessionUsage', async () => {
      await usageTracker.reset('session');
      vscode.window.showInformationMessage('✅ Session usage reset. Lifetime total preserved.');
    })
  );

  // Reset Day
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.resetDayUsage', async () => {
      await usageTracker.reset('day');
      vscode.window.showInformationMessage('✅ Today\'s usage reset. Lifetime total preserved.');
    })
  );

  // Reset Week
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.resetWeekUsage', async () => {
      await usageTracker.reset('week');
      vscode.window.showInformationMessage('✅ This week\'s usage reset. Lifetime total preserved.');
    })
  );

  // Reset Month
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.resetMonthUsage', async () => {
      await usageTracker.reset('month');
      vscode.window.showInformationMessage('✅ This month\'s usage reset. Lifetime total preserved.');
    })
  );

  // Reset All (except lifetime)
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.resetAllUsage', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Reset all tracked usage? Lifetime total will be preserved.',
        { modal: true },
        'Reset All'
      );
      if (confirm === 'Reset All') {
        await usageTracker.reset('all-resettable');
        vscode.window.showInformationMessage('✅ All usage history reset. Lifetime total preserved.');
      }
    })
  );
}
import { getUsageHtml } from './usageHtmlTemplate.js';
import { formatUsageForChat } from './usageFormatters.js';
