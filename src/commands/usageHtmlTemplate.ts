// [SCOPE] Usage HTML template — full webview HTML for CHASSIS usage report
// [WARN] 280 lines — pure HTML string template. Acceptable exception to 200-line rule.
// Extracted from usageCommands.ts
// [WARN] 280 lines — pure HTML template literal, not logic. Acceptable exception to 200-line rule.

import { UsageReport, AIBreakdown, UsagePeriodWithBreakdown } from '../services/usageTracker.js';

export function getUsageHtml(report: UsageReport, roster?: Array<{ ai: string; label: string; role: string; emoji: string }>): string {
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };

  const formatPeriod = (p: { tokens: number; cost: number; messages: number }) => {
    return {
      tokens: p.tokens.toLocaleString(),
      cost: `$${p.cost.toFixed(4)}`,
      messages: p.messages.toLocaleString(),
    };
  };

  // Format AI breakdown lines for a period — includes all roster members even with 0 tokens
  const formatAIBreakdown = (byAI: { aiProvider: string; tokens: number; cost: number; messages: number }[], periodRoster?: typeof roster) => {
    const displayRoster = periodRoster || roster;
    if (!displayRoster || displayRoster.length === 0) {
      if (!byAI || byAI.length === 0) return '';
      const lines = byAI.map(ai =>
        `        <div class="ai-breakdown">
          <span class="ai-name">↳ ${aiLabels[ai.aiProvider] || ai.aiProvider}</span>
          <span class="ai-stats">${ai.tokens.toLocaleString()} tokens (${`$${ai.cost.toFixed(4)}`})</span>
        </div>`
      ).join('');
      return `<div class="ai-breakdown-container">${lines}</div>`;
    }
    // Build from roster to include all AIs even with 0 usage
    const usageMap = new Map(byAI?.map(u => [u.aiProvider, u]) || []);
    const lines = displayRoster.map(member => {
      const usage = usageMap.get(member.ai);
      const tokens = usage?.tokens ?? 0;
      const cost = usage?.cost ?? 0;
      return `        <div class="ai-breakdown">
          <span class="ai-name">${member.emoji} ${member.label} <small style="opacity:0.7">(${member.role})</small></span>
          <span class="ai-stats">${tokens.toLocaleString()} tokens (${`$${cost.toFixed(4)}`})</span>
        </div>`;
    }).join('');
    return `<div class="ai-breakdown-container">${lines}</div>`;
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
    .ai-breakdown-container {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-input-border);
      font-size: 12px;
    }
    .ai-breakdown {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      padding: 2px 0;
    }
    .ai-name {
      color: var(--vscode-descriptionForeground);
    }
    .ai-stats {
      color: var(--vscode-editor-foreground);
      font-family: monospace;
    }
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
      ${formatAIBreakdown(report.session.byAI)}
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
      ${formatAIBreakdown(report.day.byAI)}
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
      ${formatAIBreakdown(report.week.byAI)}
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
      ${formatAIBreakdown(report.month.byAI)}
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
      ${formatAIBreakdown(report.lifetimeUnresettable.byAI)}
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

