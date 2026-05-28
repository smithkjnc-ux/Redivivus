// [SCOPE] Usage chat formatters — formats usage report for chat panel display
// Extracted from usageCommands.ts

import type { UsageReport} from '../services/usageTracker.js';
import { AIBreakdown, UsagePeriodWithBreakdown } from '../services/usageTracker.js';

export function formatUsageForChat(report: UsageReport, roster?: Array<{ ai: string; label: string; role: string; emoji: string }>): string {
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };

  const formatAIBreakdownChat = (byAI: { aiProvider: string; tokens: number; cost: number; messages: number; byRole?: { role: string; tokens: number; cost: number; messages: number }[] }[], periodRoster?: typeof roster) => {
    const displayRoster = periodRoster || roster;
    const roleEmoji: Record<string, string> = { supervisor: '&#x1F50D; Supervisor', worker: '&#x2699;&#xFE0F; Worker', guardian: '&#x1F6E1;&#xFE0F; Guardian', qa: '&#x1F4AC; Q&amp;A', solo: '&#x1F3AF; Solo', unknown: '&#x2753; Unknown' };
    
    if (!displayRoster || displayRoster.length === 0) {
      if (!byAI || byAI.length === 0) {return '';}
      return byAI.map(ai => {
        const roleLines = ai.byRole ? ai.byRole.map(r => `
          <div style="margin-left:24px;font-size:11px;opacity:0.8;display:flex;justify-content:space-between;">
            <span>${roleEmoji[r.role] || r.role}</span>
            <span>${r.tokens.toLocaleString()} tkns ($${r.cost.toFixed(4)})</span>
          </div>
        `).join('') : '';
        return `<div style="margin-left:16px;font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:4px;">
          ↳ ${aiLabels[ai.aiProvider] || ai.aiProvider}: ${ai.tokens.toLocaleString()} tokens ($${ai.cost.toFixed(4)})
          ${roleLines}
        </div>`;
      }).join('');
    }
    // Build from roster to include all AIs even with 0 usage
    const usageMap = new Map(byAI?.map(u => [u.aiProvider, u]) || []);
    return displayRoster.map(member => {
      const usage = usageMap.get(member.ai);
      const tokens = usage?.tokens ?? 0;
      const cost = usage?.cost ?? 0;
      const roleLines = usage?.byRole ? usage.byRole.map(r => `
        <div style="margin-left:24px;font-size:11px;opacity:0.8;display:flex;justify-content:space-between;">
          <span>${roleEmoji[r.role] || r.role}</span>
          <span>${r.tokens.toLocaleString()} tkns ($${r.cost.toFixed(4)})</span>
        </div>
      `).join('') : '';
      return `<div style="margin-left:16px;font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:4px;">
        ${member.emoji} ${member.label} <small style="opacity:0.7">(${member.role})</small>: ${tokens.toLocaleString()} tokens ($${cost.toFixed(4)})
        ${roleLines}
      </div>`;
    }).join('');
  };

  const formatPeriod = (p: { tokens: number; cost: number; messages: number; byAI?: { aiProvider: string; tokens: number; cost: number; messages: number; byRole?: { role: string; tokens: number; cost: number; messages: number }[] }[] }, label: string) => {
    const breakdown = formatAIBreakdownChat(p.byAI || [], roster);
    return `<div style="margin:8px 0;padding:8px;background:var(--vscode-input-background);border-radius:6px;">
      <strong>${label}</strong><br>
      ${p.messages.toLocaleString()} messages · ${p.tokens.toLocaleString()} tokens · <span style="color:#4ec959;font-weight:500;">$${p.cost.toFixed(4)}</span>
      ${breakdown}
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
        ${formatAIBreakdownChat(report.lifetimeUnresettable.byAI || [])}
      </div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:12px;padding:8px;background:var(--vscode-input-background);border-radius:4px;">
        ℹ️ Use the sidebar buttons or command palette to reset specific periods. Lifetime total is always preserved.
      </div>
    </div>
  `;
}
