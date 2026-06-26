// [SCOPE] Usage HTML template — full webview HTML for Redivivus usage report
// CSS extracted to usageHtmlStyles.ts. Imported by usageCommands.ts.

import type { UsageReport, UsageEntry } from '../../../services/usageTracker.js';
import { getUsageCss } from './usageHtmlStyles.js';

export function getUsageHtml(report: UsageReport, roster?: Array<{ ai: string; label: string; role: string; emoji: string }>, history?: UsageEntry[]): string {
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', deepseek: 'DeepSeek' };

  const formatPeriod = (p: { tokens: number; cost: number; messages: number }) => ({
    tokens: p.tokens.toLocaleString(),
    cost: `$${p.cost.toFixed(4)}`,
    messages: p.messages.toLocaleString(),
  });

  const formatAIBreakdown = (byAI: { aiProvider: string; tokens: number; cost: number; messages: number; byRole?: { role: string; tokens: number; cost: number; messages: number }[] }[], periodRoster?: typeof roster) => {
    const displayRoster = periodRoster || roster;
    const roleEmoji: Record<string, string> = { supervisor: '&#x1F50D; Supervisor', worker: '&#x2699;&#xFE0F; Worker', guardian: '&#x1F6E1;&#xFE0F; Guardian', qa: '&#x1F4AC; Q&amp;A', solo: '&#x1F3AF; Solo', unknown: '&#x2753; Unknown' };
    
    if (!displayRoster || displayRoster.length === 0) {
      if (!byAI || byAI.length === 0) {return '';}
      const lines = byAI.map(ai => {
        const roleLines = ai.byRole ? ai.byRole.map(r => `
          <div class="ai-role-breakdown" style="display:flex;justify-content:space-between;font-size:0.9em;opacity:0.8;margin-left:15px;margin-top:2px;">
            <span>${roleEmoji[r.role] || r.role}</span>
            <span>${r.tokens.toLocaleString()} tokens ($${r.cost.toFixed(4)})</span>
          </div>
        `).join('') : '';
        return `        <div class="ai-breakdown-wrapper" style="margin-bottom:8px;">
          <div class="ai-breakdown">
            <span class="ai-name">&#x21B3; ${aiLabels[ai.aiProvider] || ai.aiProvider}</span>
            <span class="ai-stats">${ai.tokens.toLocaleString()} tokens ($${ai.cost.toFixed(4)})</span>
          </div>
          ${roleLines}
        </div>`;
      }).join('');
      return `<div class="ai-breakdown-container">${lines}</div>`;
    }
    const usageMap = new Map(byAI?.map(u => [u.aiProvider, u]) || []);
    const lines = displayRoster.map(member => {
      const usage = usageMap.get(member.ai);
      const tokens = usage?.tokens ?? 0;
      const cost = usage?.cost ?? 0;
      const roleLines = usage?.byRole ? usage.byRole.map(r => `
        <div class="ai-role-breakdown" style="display:flex;justify-content:space-between;font-size:0.9em;opacity:0.8;margin-left:15px;margin-top:2px;">
          <span>${roleEmoji[r.role] || r.role}</span>
          <span>${r.tokens.toLocaleString()} tokens ($${r.cost.toFixed(4)})</span>
        </div>
      `).join('') : '';
      return `        <div class="ai-breakdown-wrapper" style="margin-bottom:8px;">
        <div class="ai-breakdown">
          <span class="ai-name">${member.emoji} ${member.label} <small style="opacity:0.7">(${member.role})</small></span>
          <span class="ai-stats">${tokens.toLocaleString()} tokens ($${cost.toFixed(4)})</span>
        </div>
        ${roleLines}
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
  <h1>&#x1F4CA; Redivivus Usage Report</h1>
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
  ${history && history.length > 0 ? `
  <h2 style="margin:32px 0 12px;font-size:16px;font-weight:700;">Activity Log <span style="font-size:12px;font-weight:400;opacity:0.6;">(most recent first)</span></h2>
  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="text-align:left;border-bottom:2px solid #333;">
      <th style="padding:6px 10px;">Time</th><th style="padding:6px 10px;">AI</th>
      <th style="padding:6px 10px;">Role</th><th style="padding:6px 10px;">Project</th>
      <th style="padding:6px 10px;text-align:right;">In</th><th style="padding:6px 10px;text-align:right;">Out</th>
      <th style="padding:6px 10px;text-align:right;">Cost</th>
    </tr></thead>
    <tbody>${[...history].reverse().slice(0, 200).map(e => {
      const aiLabels2: Record<string,string> = { gemini:'Gemini', claude:'Claude', openai:'GPT-4o', groq:'Groq', xai:'Grok', kimi:'Kimi', deepseek:'DeepSeek' };
      const roleEmoji: Record<string,string> = { supervisor:'&#x1F50D; Supervisor', worker:'&#x2699;&#xFE0F; Worker', guardian:'&#x1F6E1;&#xFE0F; Guardian', qa:'&#x1F4AC; Q&amp;A', solo:'&#x1F3AF; Solo' };
      const d = new Date(e.timestamp);
      const t = d.toLocaleDateString() + ' ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      return `<tr style="border-bottom:1px solid #222;"><td style="padding:5px 10px;opacity:0.8;">${t}</td><td style="padding:5px 10px;">${aiLabels2[e.aiProvider]||e.aiProvider}</td><td style="padding:5px 10px;">${roleEmoji[e.role||'']||e.role||'&#x2014;'}</td><td style="padding:5px 10px;opacity:0.8;">${e.project||'&#x2014;'}</td><td style="padding:5px 10px;text-align:right;">${(e.inputTokens||0).toLocaleString()}</td><td style="padding:5px 10px;text-align:right;">${(e.outputTokens||0).toLocaleString()}</td><td style="padding:5px 10px;text-align:right;">$${e.cost.toFixed(4)}</td></tr>`;
    }).join('')}</tbody>
  </table>` : '<p style="opacity:0.5;font-size:13px;margin-top:32px;">No activity logged yet.</p>'}
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
