// [SCOPE] Usage HTML template — full webview HTML for CHASSIS usage report
// CSS extracted to usageHtmlStyles.ts. Imported by usageCommands.ts.

import { UsageReport } from '../services/usageTracker.js';
import { getUsageCss } from './usageHtmlStyles.js';

export function getUsageHtml(report: UsageReport, roster?: Array<{ ai: string; label: string; role: string; emoji: string }>): string {
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };

  const formatPeriod = (p: { tokens: number; cost: number; messages: number }) => ({
    tokens: p.tokens.toLocaleString(),
    cost: `$${p.cost.toFixed(4)}`,
    messages: p.messages.toLocaleString(),
  });

  const formatAIBreakdown = (byAI: { aiProvider: string; tokens: number; cost: number; messages: number }[], periodRoster?: typeof roster) => {
    const displayRoster = periodRoster || roster;
    if (!displayRoster || displayRoster.length === 0) {
      if (!byAI || byAI.length === 0) return '';
      const lines = byAI.map(ai =>
        `        <div class="ai-breakdown">
          <span class="ai-name">&#x21B3; ${aiLabels[ai.aiProvider] || ai.aiProvider}</span>
          <span class="ai-stats">${ai.tokens.toLocaleString()} tokens ($${ai.cost.toFixed(4)})</span>
        </div>`
      ).join('');
      return `<div class="ai-breakdown-container">${lines}</div>`;
    }
    const usageMap = new Map(byAI?.map(u => [u.aiProvider, u]) || []);
    const lines = displayRoster.map(member => {
      const usage = usageMap.get(member.ai);
      const tokens = usage?.tokens ?? 0;
      const cost = usage?.cost ?? 0;
      return `        <div class="ai-breakdown">
          <span class="ai-name">${member.emoji} ${member.label} <small style="opacity:0.7">(${member.role})</small></span>
          <span class="ai-stats">${tokens.toLocaleString()} tokens ($${cost.toFixed(4)})</span>
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
  <style>${getUsageCss()}</style>
</head>
<body>
  <h1>&#x1F4CA; CHASSIS Usage Report</h1>
  <div class="subtitle">AI token usage and cost breakdown</div>
  <div class="period-grid">
    <div class="period-card">
      <div class="period-title">&#x23F1;&#xFE0F; Current Session</div>
      <div class="period-stat"><span class="period-stat-label">Messages:</span><span class="period-stat-value">${session.messages}</span></div>
      <div class="period-stat"><span class="period-stat-label">Tokens:</span><span class="period-stat-value">${session.tokens}</span></div>
      <div class="period-stat"><span class="period-stat-label">Cost:</span><span class="period-stat-value cost">${session.cost}</span></div>
      ${formatAIBreakdown(report.session.byAI)}
    </div>
    <div class="period-card">
      <div class="period-title">&#x1F4C5; Today</div>
      <div class="period-stat"><span class="period-stat-label">Messages:</span><span class="period-stat-value">${day.messages}</span></div>
      <div class="period-stat"><span class="period-stat-label">Tokens:</span><span class="period-stat-value">${day.tokens}</span></div>
      <div class="period-stat"><span class="period-stat-label">Cost:</span><span class="period-stat-value cost">${day.cost}</span></div>
      ${formatAIBreakdown(report.day.byAI)}
    </div>
    <div class="period-card">
      <div class="period-title">&#x1F4C6; This Week</div>
      <div class="period-stat"><span class="period-stat-label">Messages:</span><span class="period-stat-value">${week.messages}</span></div>
      <div class="period-stat"><span class="period-stat-label">Tokens:</span><span class="period-stat-value">${week.tokens}</span></div>
      <div class="period-stat"><span class="period-stat-label">Cost:</span><span class="period-stat-value cost">${week.cost}</span></div>
      ${formatAIBreakdown(report.week.byAI)}
    </div>
    <div class="period-card">
      <div class="period-title">&#x1F4C8; This Month</div>
      <div class="period-stat"><span class="period-stat-label">Messages:</span><span class="period-stat-value">${month.messages}</span></div>
      <div class="period-stat"><span class="period-stat-label">Tokens:</span><span class="period-stat-value">${month.tokens}</span></div>
      <div class="period-stat"><span class="period-stat-label">Cost:</span><span class="period-stat-value cost">${month.cost}</span></div>
      ${formatAIBreakdown(report.month.byAI)}
    </div>
    <div class="period-card lifetime">
      <div class="period-title">&#x1F48E; Lifetime Total (Unresettable)</div>
      <div class="period-stat"><span class="period-stat-label">Messages:</span><span class="period-stat-value">${lifetime.messages}</span></div>
      <div class="period-stat"><span class="period-stat-label">Tokens:</span><span class="period-stat-value">${lifetime.tokens}</span></div>
      <div class="period-stat"><span class="period-stat-label">Cost:</span><span class="period-stat-value cost">${lifetime.cost}</span></div>
      ${formatAIBreakdown(report.lifetimeUnresettable.byAI)}
    </div>
  </div>
  <div class="lifetime-notice">
    <strong>&#x2139;&#xFE0F; Lifetime Total:</strong> This represents your complete usage history across all time.
    It cannot be reset and serves as your permanent record. All other periods can be reset to track specific timeframes.
  </div>
  <div class="actions">
    <button onclick="resetSession()">&#x1F504; Reset Session</button>
    <button onclick="resetDay()">&#x1F4C5; Reset Day</button>
    <button onclick="resetWeek()">&#x1F4C6; Reset Week</button>
    <button onclick="resetMonth()">&#x1F4C8; Reset Month</button>
    <button class="danger" onclick="resetAll()">&#x26A0;&#xFE0F; Reset All (Keep Lifetime)</button>
  </div>
  <div class="tip">
    &#x1F4A1; <strong>Tip:</strong> Use the reset buttons to track specific project costs or billing periods.
    Your lifetime total is always preserved and serves as your complete usage audit trail.
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function resetSession() { vscode.postMessage({ type: 'reset', period: 'session' }); }
    function resetDay() { vscode.postMessage({ type: 'reset', period: 'day' }); }
    function resetWeek() { vscode.postMessage({ type: 'reset', period: 'week' }); }
    function resetMonth() { vscode.postMessage({ type: 'reset', period: 'month' }); }
    function resetAll() { vscode.postMessage({ type: 'reset', period: 'all' }); }
    window.addEventListener('message', (e) => { if (e.data.type === 'refresh') { location.reload(); } });
  <\/script>
</body>
</html>`;
}
