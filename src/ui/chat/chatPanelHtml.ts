// [SCOPE] CHASSIS Chat Panel HTML builder — slim shell. Assembles webview HTML from extracted modules.
// Split complete: renderer → chatPanelRenderer.ts, CSS → chatPanelStyles.ts, script → chatPanelScript.ts
import { SetupProgress } from '../../services/project/setupProgressService.js';
import { getNonce } from '../getNonce.js';
import { renderMessages, escapeHtml } from './chatPanelRenderer.js';
import { buildChatCss } from './chatPanelStyles.js';
import { buildChatScript } from './chatPanelScript.js';
import { buildProjectDashboard, DashboardData } from './chatPanelDashboard.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokens?: number;
  cost?: number;
}

export interface ChatHeaderInfo {
  projectName?: string;
  aiName: string;
  aiLabel: string;
  isFallback: boolean;
  hasKey: boolean;
  blueprintLocked: boolean;
  hasBlueprint: boolean;
  sessionActive: boolean;
  sessionGoal?: string;
  currentTime: string;
  isInitialized: boolean;
  usageReport?: import('../../services/usageTracker.js').UsageReport;
  lastModel?: string;
  hasProjectOpen: boolean;
  workspaceHasChassis: boolean;
  workspaceFolderIsOpen: boolean; workspaceIsAssistMode: boolean; assistMode?: boolean;
  recentProjects: Array<{ path: string; name: string }>;
  shouldAutoOpenLastProject?: boolean;
  blueprintStatus?: 'complete' | 'incomplete' | 'missing';
  // [CHASSIS] AI roster for multi-badge display — all active AIs with roles
  rosterDisplay?: Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }>;
  buildMode?: 'plan' | 'direct'; dashData?: DashboardData;
  projectTokens?: { tokens: number; cost: number };
}

export function buildChatHtml(conversation: ChatMessage[], header?: ChatHeaderInfo, progress?: SetupProgress): string {
  const nonce = getNonce();
  const messagesHtml = renderMessages(conversation);

  const badges: string[] = [];
  if (header) {
    // Build roster badges — one pill per AI with role-based colors (project name is shown in toolbar row above)
    if (header.rosterDisplay && header.rosterDisplay.length > 0) {
      for (const member of header.rosterDisplay) {
        const roleColor = member.role === 'Supervisor' ? 'supervisor' : member.role === 'Guardian' ? 'guardian' : 'worker';
        const tooltip = `${member.role}: ${member.label}`;
        badges.push(`<span class="badge roster ${roleColor}" data-cmd="chassis.openSettings" title="${tooltip}">${member.emoji} ${member.label}</span>`);
      }
    } else if (!header.hasKey) {
      badges.push(`<span class="badge ai red clickable" data-cmd="chassis.openSettings" title="Click to configure AI">⚠️ No AI key</span>`);
    }
    if (header.sessionActive) {
      badges.push(`<span class="badge session">🟢 Session</span>`);
    }
    // [CHASSIS] Mode indicator pill — clickable to switch modes mid-session
    if (header.buildMode) {
      const modeLabel = header.buildMode === 'plan' ? '📋 Plan' : '⚡ Direct';
      const modeTooltip = header.buildMode === 'plan' ? 'Plan Mode: full blueprint interview before building. Click to switch.' : 'Direct Build: skip interview, execute immediately. Click to switch.';
      badges.push(`<span class="badge mode mode-${header.buildMode}" data-action="switch-mode" title="${modeTooltip}">${modeLabel}</span>`);
    }
    if (header.assistMode || header.workspaceIsAssistMode) { badges.push(`<span class="badge mode" style="background:#1e3a5f;color:#60a5fa;border-color:#2563eb;" title="Assist Mode: CHASSIS runs silently. No code annotations or roadmap. Click to upgrade." data-action="retrofit-project">&#x26A1; Assist Mode</span>`); }
    else if (header.workspaceHasChassis) { badges.push(`<span class="badge mode" style="background:#14291a;color:#4ade80;border-color:#16a34a;" title="Full CHASSIS Mode: code annotations, roadmap, and blueprint active">&#x1F9E9; CHASSIS</span>`); }
  }
  const headerHtml = header ? `<div class="header-badges">${badges.join('')}</div>` : '';

  const emptyState = (() => {
    // If workspace has a .chassis folder, show the project-ready screen
    if (header && header.workspaceHasChassis && !header.workspaceIsAssistMode && !header.assistMode) {
      return buildProjectDashboard(header, progress, header.dashData);
    }

    const _featureTable = `<table style="width:100%;max-width:440px;margin:0 auto 18px;border-collapse:collapse;font-size:12px;text-align:left;"><thead><tr><th style="padding:5px 8px;border-bottom:1px solid #444;"></th><th style="padding:5px 8px;border-bottom:1px solid #444;text-align:center;">&#x26A1; Assist</th><th style="padding:5px 8px;border-bottom:1px solid #444;text-align:center;">&#x1F9E9; Full CHASSIS</th></tr></thead><tbody>${[['AI quality (Supervisor+Worker+Guardian)','&#x2705;','&#x2705;'],['Vault &mdash; reuse code across projects','&#x2705;','&#x2705;'],['Undo / snapshots before every change','&#x2705;','&#x2705;'],['Token tracking &amp; cost breakdown','&#x2705;','&#x2705;'],['Dead-end memory &mdash; never repeats a failed fix','&#x2705;','&#x2705;'],['Code annotations ([SCOPE]/[WARN]/[DEAD])','&#x274C;','&#x2705;'],['CHASSIS_ROADMAP.md &mdash; full change log','&#x274C;','&#x2705;'],['Blueprint &mdash; AI always knows your project','&#x274C;','&#x2705;'],['Auto-commits after every build/fix','&#x274C;','&#x2705;']].map(([f,a,c])=>`<tr><td style="padding:4px 8px;opacity:0.85;">${f}</td><td style="padding:4px 8px;text-align:center;">${a}</td><td style="padding:4px 8px;text-align:center;">${c}</td></tr>`).join('')}</tbody></table>`;
    if (header?.workspaceIsAssistMode) { const n = escapeHtml(header.projectName || 'your project'); return `<div class="empty-state" style="padding:24px 30px;"><div class="icon" style="font-size:36px;">&#x26A1;</div><div class="onboarding-title" style="font-size:19px;font-weight:700;margin:8px 0 4px;">${n} &mdash; Assist Mode</div><div style="font-size:13px;color:var(--vscode-descriptionForeground);margin-bottom:16px;">Your code stays exactly as-is. CHASSIS runs silently in the background.</div>${_featureTable}<button data-action="retrofit-project" style="display:block;margin:0 auto;padding:8px 18px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">&#x1F9E9; Switch to Full CHASSIS &mdash; add tracking now</button><div class="onboarding-hint" style="margin-top:14px;font-size:12px;">Or just type your request below</div></div>`; }
    if (header?.workspaceFolderIsOpen && !header.workspaceHasChassis) { const n = escapeHtml(header.projectName || 'your project'); return `<div class="empty-state" style="padding:24px 30px;"><div class="icon" style="font-size:40px;">&#x1F4C2;</div><div class="onboarding-title" style="font-size:20px;font-weight:700;margin:8px 0 4px;">Project detected: ${n}</div><div style="font-size:13px;color:var(--vscode-descriptionForeground);margin-bottom:16px;">Choose how CHASSIS works with this project. You can switch at any time.</div>${_featureTable}<div style="display:flex;gap:10px;max-width:440px;margin:0 auto;"><button class="launcher-btn" data-action="start-new-project" data-mode="direct" data-assist="true" style="flex:1;padding:12px 14px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:8px;cursor:pointer;text-align:center;font-size:14px;font-weight:600;">&#x26A1; Assist Mode<div style="font-size:11px;font-weight:400;opacity:0.85;margin-top:3px;">Code stays as-is</div></button><button class="launcher-btn" data-action="retrofit-project" style="flex:1;padding:12px 14px;background:var(--vscode-editor-inactiveSelectionBackground);color:var(--vscode-foreground);border:1px solid var(--vscode-input-border);border-radius:8px;cursor:pointer;text-align:center;font-size:14px;font-weight:600;">&#x1F9E9; Full CHASSIS<div style="font-size:11px;font-weight:400;opacity:0.85;margin-top:3px;">Full tracking added</div></button></div><div class="onboarding-hint" style="margin-top:14px;font-size:12px;">Or just type below &mdash; CHASSIS will ask which mode to use</div></div>`; }

    // LAUNCHER SCREEN: No folder open — show the three options
    const recentProjectsHtml = header && header.recentProjects.length > 0
      ? header.recentProjects.map(p =>
          `<div class="launcher-recent-item" data-recent-path="${escapeHtml(p.path)}" style="padding:8px 12px;margin:4px 0;background:var(--vscode-editor-inactiveSelectionBackground);border-radius:4px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;">` +
          `<span>📁</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</span>` +
          `</div>`
        ).join('')
      : `<div style="padding:12px;color:var(--vscode-descriptionForeground);font-size:13px;font-style:italic;">No recent projects</div>`;

    return `<div class="empty-state" style="padding:30px;">
      <div class="icon" style="font-size:48px;margin-bottom:16px;">🏗️</div>
      <div class="onboarding-title" style="font-size:22px;font-weight:700;margin-bottom:8px;">Welcome to CHASSIS</div>
      <div class="onboarding-sub" style="font-size:15px;color:var(--vscode-descriptionForeground);margin-bottom:28px;">What would you like to build today?</div>

      <div class="onboarding-examples" style="margin-bottom:4px;">
        <button class="onboarding-pill" data-action="start-new-project" data-mode="plan">&#x1F680; Start New Project</button>
        <button class="onboarding-pill" data-action="start-new-project" data-mode="direct">&#x26A1; Just Build</button>
        <button class="onboarding-pill" data-action="open-existing-project">&#x1F4C2; Open Project</button>
      </div>

      <div class="launcher-recent" style="margin-top:28px;max-width:400px;margin-left:auto;margin-right:auto;">
        <div style="font-size:13px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:12px;padding-left:4px;">🕐 Recent Projects</div>
        <div class="launcher-recent-list" style="max-height:200px;overflow-y:auto;">
          ${recentProjectsHtml}
        </div>
      </div>

      <div class="onboarding-hint" style="margin-top:24px;font-size:13px;">Or just type what you want to build and hit Enter</div>

      <div class="launcher-footer" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--vscode-input-border);max-width:400px;margin-left:auto;margin-right:auto;">
        <label class="launcher-autostart" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--vscode-descriptionForeground);padding:4px;">
          <input type="checkbox" id="auto-open-last-project" data-action="toggle-auto-open" style="cursor:pointer;">
          <span>Always open my last project on startup</span>
        </label>
      </div>
    </div>`;
  })();

  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <style nonce="${nonce}">${buildChatCss()}</style>
</head><body>
  <div class="header">
    <div class="header-left">
      <strong style="font-size: 15px; letter-spacing: 2px; font-weight: 700;"><span style="color:#a78bfa;-webkit-text-fill-color:#a78bfa;">C</span><span style="color:#4d9eff;-webkit-text-fill-color:#4d9eff;"> H A S S I S</span></strong>
      <span id="chassis-status" style="font-size: 11px; color: var(--vscode-descriptionForeground);">${header && header.sessionActive ? '&#x25cf; working' : '&#x25cf; ready'}</span>
    </div>
    <div class="header-right">
      ${header && header.hasProjectOpen ? `
      <button class="header-btn" data-cmd="chassis.blueprintInterview" title="Edit Blueprint" style="${header.blueprintStatus === 'complete' ? 'border-color:#4caf50;color:#4caf50;' : header.blueprintStatus === 'incomplete' ? 'border-color:#ff9800;color:#ff9800;' : 'border-color:#f44336;color:#f44336;'}">📋 ${header.projectName}</button>
      <button class="header-btn" data-cmd="chassis.showMap" title="Map">🗺️ Map</button>
      <button class="header-btn" data-cmd="chassis.showBuildHistory" title="Build History">&#x1F4CB; History</button>
      ` : ''}
      ${header && header.projectTokens ? `<button class="header-btn" data-cmd="chassis.viewUsage" title="Project: ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tokens -- $${header.projectTokens.cost.toFixed(3)} spent -- click for AI breakdown">&#x1F4CA; ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tok</button>` : `<button class="header-btn" data-cmd="chassis.viewUsage" title="Token Usage &amp; Cost">&#x1F4CA; Usage</button>`}
      <button class="header-btn" id="clear-btn" title="Clear Chat">🗑️</button>
      <button class="header-btn capabilities-btn" data-cmd="chassis.showCapabilities" title="CHASSIS Capabilities">⚡ Capabilities</button>
    </div>
  </div>
  ${headerHtml}
  <div id="conversation">${messagesHtml || emptyState}</div>
  <div id="input-area">
    <div id="input-card">
      <div id="input-top">
        <textarea id="message-input" placeholder="Ask about your code, the blueprint, or anything else…" rows="1"></textarea>
      </div>
      <div id="input-bottom">
        <div id="input-left">
          <button class="input-pill" data-cmd="chassis.openVault" title="Browse Vault">&#x229E; Vault</button>
          ${header && header.hasProjectOpen ? `<button class="input-pill input-pill--run" data-cmd="chassis.runProject" title="Run your project in the terminal">&#x25B6; Run</button>` : ''}
          ${header ? (header.rosterDisplay && header.rosterDisplay.length > 0
            ? `<span class="input-pill input-pill--ai" data-cmd="chassis.openSettings" title="AI Team: ${header.rosterDisplay.map(r => r.emoji + ' ' + r.label + ' (' + r.role + ')').join(', ')}">${header.rosterDisplay[0].emoji} ${header.rosterDisplay[0].label}${header.rosterDisplay.length > 1 ? ' +' + (header.rosterDisplay.length - 1) : ''}</span>`
            : `<span class="input-pill input-pill--ai" data-cmd="chassis.openSettings" title="Click to configure AI model">${!header.hasKey ? '⚠️ No AI key' : '🧠 ' + header.aiLabel}</span>`
          ) : ''}
        </div>
        <div id="input-right">
          <button id="send-btn" title="Send (Enter)">↑</button>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">${buildChatScript()}<\/script>
</body></html>`;
}

