// [SCOPE] CHASSIS Usage Commands — provides commands for viewing and resetting AI usage statistics
// Commands: view usage report, reset session/day/week/month/all with lifetime preservation

import * as vscode from 'vscode';
import type { UsageTracker} from '../services/usageTracker.js';
import { UsageReport, AIBreakdown, UsagePeriodWithBreakdown } from '../services/usageTracker.js';
import type { RoutingService } from '../services/ai/routingService.js';
import { showInChatPanel } from '../services/chatPanelContent.js';

export function registerUsageCommands(context: vscode.ExtensionContext, usageTracker: UsageTracker, routing?: RoutingService): void {
  // View Usage Report (in separate panel)
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.viewUsage', async () => {
      const report = usageTracker.getReport();
      const roster = routing?.getRosterDisplay?.();
      const history = usageTracker.getHistory();
      const panel = vscode.window.createWebviewPanel(
        'chassisUsage',
        'CHASSIS Usage Report',
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

  // View Usage Report (in chat panel)
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.viewUsageInChat', async () => {
      const report = usageTracker.getReport();
      const roster = routing?.getRosterDisplay?.();
      const content = formatUsageForChat(report, roster);
      showInChatPanel({ title: '📊 Usage Report', content, type: 'html' });
    })
  );

  // Reset Session
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.resetSessionUsage', async () => {
      await usageTracker.reset('session');
      vscode.window.showInformationMessage('✅ Session usage reset. Lifetime total preserved.');
    })
  );

  // Reset Day
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.resetDayUsage', async () => {
      await usageTracker.reset('day');
      vscode.window.showInformationMessage('✅ Today\'s usage reset. Lifetime total preserved.');
    })
  );

  // Reset Week
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.resetWeekUsage', async () => {
      await usageTracker.reset('week');
      vscode.window.showInformationMessage('✅ This week\'s usage reset. Lifetime total preserved.');
    })
  );

  // Reset Month
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.resetMonthUsage', async () => {
      await usageTracker.reset('month');
      vscode.window.showInformationMessage('✅ This month\'s usage reset. Lifetime total preserved.');
    })
  );

  // Reset All (except lifetime)
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.resetAllUsage', async () => {
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
