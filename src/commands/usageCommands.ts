// [SCOPE] CHASSIS Usage Commands — provides commands for viewing and resetting AI usage statistics
// Commands: view usage report, reset session/day/week/month/all with lifetime preservation

import * as vscode from 'vscode';
import { UsageTracker, UsageReport } from '../services/usageTracker.js';
import { showInChatPanel } from '../services/chatPanelContent.js';

export function registerUsageCommands(context: vscode.ExtensionContext, usageTracker: UsageTracker): void {
  // View Usage Report (in separate panel)
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.viewUsage', async () => {
      const report = usageTracker.getReport();
      const panel = vscode.window.createWebviewPanel(
        'chassisUsage',
        'CHASSIS Usage Report',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      panel.webview.html = getUsageHtml(report);
    })
  );

  // View Usage Report (in chat panel)
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.viewUsageInChat', async () => {
      const report = usageTracker.getReport();
      const content = formatUsageForChat(report);
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

function getUsageHtml(report: UsageReport): string {
  const formatPeriod = (p: { tokens: number; cost: number; messages: number }) => {
    return {
      tokens: p.tokens.toLocaleString(),
      cost: `$${p.cost.toFixed(4)}`,
      messages: p.messages.toLocaleString(),
    };
  };

  const session = formatPeriod(report.session);
  const day = formatPeriod(report.day);
  const week = formatPeriod(report.week);
  const month = formatPeriod(report.month);
  const lifetime = formatPeriod(report.lifetimeUnresettable);

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
      padding: 20px; 
      max-width: 700px;
      margin: 0 auto;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 24px; }
    .period-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .period-card {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 8px;
      padding: 16px;
    }
    .period-card.lifetime {
      background: linear-gradient(135deg, rgba(78,201,89,0.1), rgba(59,130,246,0.1));
      border-color: #4ec959;
    }
    .period-title {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 12px;
      color: var(--vscode-editor-foreground);
    }
    .period-stat {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .period-stat-label { color: var(--vscode-descriptionForeground); }
    .period-stat-value { font-weight: 500; }
    .period-stat-value.cost { color: #4ec959; }
    .lifetime-notice {
      background: rgba(78,201,89,0.1);
      border-left: 3px solid #4ec959;
      padding: 12px;
      border-radius: 0 4px 4px 0;
      margin-top: 16px;
      font-size: 13px;
    }
    .lifetime-notice strong { color: #4ec959; }
    .actions {
      margin-top: 24px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
    }
    button.danger {
      background: rgba(255,83,79,0.2);
      color: #ff534f;
    }
    .tip {
      margin-top: 24px;
      padding: 12px;
      background: var(--vscode-input-background);
      border-radius: 6px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <h1>📊 CHASSIS Usage Report</h1>
  <div class="subtitle">AI token usage and cost breakdown</div>

  <div class="period-grid">
    <div class="period-card">
      <div class="period-title">⏱️ Current Session</div>
      <div class="period-stat">
        <span class="period-stat-label">Messages:</span>
        <span class="period-stat-value">${session.messages}</span>
      </div>
      <div class="period-stat">
        <span class="period-stat-label">Tokens:</span>
        <span class="period-stat-value">${session.tokens}</span>
      </div>
      <div class="period-stat">
        <span class="period-stat-label">Cost:</span>
        <span class="period-stat-value cost">${session.cost}</span>
      </div>
    </div>

    <div class="period-card">
      <div class="period-title">📅 Today</div>
      <div class="period-stat">
        <span class="period-stat-label">Messages:</span>
        <span class="period-stat-value">${day.messages}</span>
      </div>
      <div class="period-stat">
        <span class="period-stat-label">Tokens:</span>
        <span class="period-stat-value">${day.tokens}</span>
      </div>
      <div class="period-stat">
        <span class="period-stat-label">Cost:</span>
        <span class="period-stat-value cost">${day.cost}</span>
      </div>
    </div>

    <div class="period-card">
      <div class="period-title">📆 This Week</div>
      <div class="period-stat">
        <span class="period-stat-label">Messages:</span>
        <span class="period-stat-value">${week.messages}</span>
      </div>
      <div class="period-stat">
        <span class="period-stat-label">Tokens:</span>
        <span class="period-stat-value">${week.tokens}</span>
      </div>
      <div class="period-stat">
        <span class="period-stat-label">Cost:</span>
        <span class="period-stat-value cost">${week.cost}</span>
      </div>
    </div>

    <div class="period-card">
      <div class="period-title">📈 This Month</div>
      <div class="period-stat">
        <span class="period-stat-label">Messages:</span>
        <span class="period-stat-value">${month.messages}</span>
      </div>
      <div class="period-stat">
        <span class="period-stat-label">Tokens:</span>
        <span class="period-stat-value">${month.tokens}</span>
      </div>
      <div class="period-stat">
        <span class="period-stat-label">Cost:</span>
        <span class="period-stat-value cost">${month.cost}</span>
      </div>
    </div>

    <div class="period-card lifetime">
      <div class="period-title">💎 Lifetime Total (Unresettable)</div>
      <div class="period-stat">
        <span class="period-stat-label">Messages:</span>
        <span class="period-stat-value">${lifetime.messages}</span>
      </div>
      <div class="period-stat">
        <span class="period-stat-label">Tokens:</span>
        <span class="period-stat-value">${lifetime.tokens}</span>
      </div>
      <div class="period-stat">
        <span class="period-stat-label">Cost:</span>
        <span class="period-stat-value cost">${lifetime.cost}</span>
      </div>
    </div>
  </div>

  <div class="lifetime-notice">
    <strong>ℹ️ Lifetime Total:</strong> This represents your complete usage history across all time. 
    It cannot be reset and serves as your permanent record. All other periods can be reset to track specific timeframes.
  </div>

  <div class="actions">
    <button onclick="resetSession()">🔄 Reset Session</button>
    <button onclick="resetDay()">📅 Reset Day</button>
    <button onclick="resetWeek()">📆 Reset Week</button>
    <button onclick="resetMonth()">📈 Reset Month</button>
    <button class="danger" onclick="resetAll()">⚠️ Reset All (Keep Lifetime)</button>
  </div>

  <div class="tip">
    💡 <strong>Tip:</strong> Use the reset buttons to track specific project costs or billing periods. 
    Your lifetime total is always preserved and serves as your complete usage audit trail.
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function resetSession() { vscode.postMessage({ type: 'reset', period: 'session' }); }
    function resetDay() { vscode.postMessage({ type: 'reset', period: 'day' }); }
    function resetWeek() { vscode.postMessage({ type: 'reset', period: 'week' }); }
    function resetMonth() { vscode.postMessage({ type: 'reset', period: 'month' }); }
    function resetAll() { vscode.postMessage({ type: 'reset', period: 'all' }); }
    
    window.addEventListener('message', (e) => {
      if (e.data.type === 'refresh') { location.reload(); }
    });
  </script>
</body>
</html>`;
}

function formatUsageForChat(report: UsageReport): string {
  const formatPeriod = (p: { tokens: number; cost: number; messages: number }, label: string) => {
    return `<div style="margin:8px 0;padding:8px;background:var(--vscode-input-background);border-radius:6px;">
      <strong>${label}</strong><br>
      ${p.messages.toLocaleString()} messages · ${p.tokens.toLocaleString()} tokens · <span style="color:#4ec959;font-weight:500;">$${p.cost.toFixed(4)}</span>
    </div>`;
  };

  return `
    <div style="font-size:13px;">
      ${formatPeriod(report.session, '⏱️ Current Session')}
      ${formatPeriod(report.day, '📅 Today')}
      ${formatPeriod(report.week, '📆 This Week')}
      ${formatPeriod(report.month, '📈 This Month')}
      <div style="margin:12px 0;padding:12px;background:linear-gradient(135deg,rgba(78,201,89,0.1),rgba(59,130,246,0.1));border-radius:6px;border-left:3px solid #4ec959;">
        <strong>💎 Lifetime Total (Unresettable)</strong><br>
        ${report.lifetimeUnresettable.messages.toLocaleString()} messages · ${report.lifetimeUnresettable.tokens.toLocaleString()} tokens · <strong style="color:#4ec959;">$${report.lifetimeUnresettable.cost.toFixed(4)}</strong>
      </div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:12px;padding:8px;background:var(--vscode-input-background);border-radius:4px;">
        ℹ️ Use the sidebar buttons or command palette to reset specific periods. Lifetime total is always preserved.
      </div>
    </div>
  `;
}
