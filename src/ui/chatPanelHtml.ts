// [SCOPE] CHASSIS Chat Panel HTML builder — slim shell. Assembles webview HTML from extracted modules.
// Split complete: renderer → chatPanelRenderer.ts, CSS → chatPanelStyles.ts, script → chatPanelScript.ts
import { SetupProgress } from "../services/setupProgressService.js";
import { getNonce } from './getNonce.js';
import { renderMessages, escapeHtml } from './chatPanelRenderer.js';
import { buildChatCss } from './chatPanelStyles.js';
import { buildChatScript } from './chatPanelScript.js';

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
  usageReport?: import('../services/usageTracker.js').UsageReport;
  lastModel?: string;
  hasProjectOpen: boolean;
  workspaceHasChassis: boolean;
  recentProjects: Array<{ path: string; name: string }>;
  shouldAutoOpenLastProject?: boolean;
  blueprintStatus?: 'complete' | 'incomplete' | 'missing';
  // [CHASSIS] AI roster for multi-badge display — all active AIs with roles
  rosterDisplay?: Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }>;
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
    // [DEAD] Static time badge removed — showed panel open time, never updated. Message timestamps show time per message.
  }
  const headerHtml = header ? `<div class="header-badges">${badges.join('')}</div>` : '';

  const emptyState = (() => {
    // If workspace has a .chassis folder, show the project-ready screen
    if (header && header.workspaceHasChassis) {
      return `<div class="empty-state">
      <div class="icon">🚀</div>
      <div class="onboarding-title">Ready to Build: ${escapeHtml(header.projectName || '')}</div>
      ${progress ? `<div style="margin:15px auto;width:100%;max-width:400px;text-align:left;padding:15px;background:var(--vscode-editor-inactiveSelectionBackground);border-radius:6px;border:1px solid var(--vscode-panel-border);">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><strong>Setup Progress</strong><span style="color:var(--vscode-descriptionForeground);font-size:0.9em;">${progress.percentage}%</span></div>
        <div style="width:100%;height:6px;background:var(--vscode-editorWidget-background);border-radius:3px;overflow:hidden;margin-bottom:12px;"><div style="height:100%;width:${progress.percentage}%;background:${progress.percentage === 100 ? '#4ec959' : '#3b9dff'};"></div></div>
        <div style="font-size:0.85em;color:var(--vscode-descriptionForeground);text-align:center;margin-bottom:10px;">${progress.completedCount} of ${progress.totalCount} steps completed</div>
        <div style="text-align:center;"><button class="onboarding-pill" data-cmd="chassis.showSetupProgress" style="display:inline-block;padding:6px 12px;margin:0;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer;border-radius:4px;font-size:0.9em;">📊 View Full Checklist</button></div>
      </div>` : ''}
      <div class="onboarding-examples">
        <div class="onboarding-pill" data-cmd="chassis.startSession">▶️ Start Session</div>
        <div class="onboarding-pill" data-cmd="chassis.buildFromVault">🏗️ Build from Vault</div>
      </div>
      <div class="onboarding-hint">Or just type your request and hit Enter.</div>
    </div>`;
    }

    // LAUNCHER SCREEN: No .chassis folder — show the three options
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

      <div class="launcher-grid" style="display:flex;flex-direction:column;gap:12px;max-width:400px;margin:0 auto;">
        <button class="launcher-btn launcher-btn-primary" data-action="start-new-project" style="padding:16px 20px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;display:flex;align-items:center;gap:12px;transition:all 0.2s;">
          <span style="font-size:24px;">🚀</span>
          <div style="text-align:left;">
            <div>Start New Project</div>
            <div style="font-size:12px;font-weight:400;opacity:0.8;">Create a new project with the setup wizard</div>
          </div>
        </button>

        <button class="launcher-btn launcher-btn-secondary" data-action="open-existing-project" style="padding:16px 20px;background:var(--vscode-editor-inactiveSelectionBackground);color:var(--vscode-foreground);border:1px solid var(--vscode-input-border);border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;display:flex;align-items:center;gap:12px;transition:all 0.2s;">
          <span style="font-size:24px;">📂</span>
          <div style="text-align:left;">
            <div>Open Existing Project</div>
            <div style="font-size:12px;font-weight:400;opacity:0.7;">Browse for a project folder to open</div>
          </div>
        </button>
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
      <strong style="font-size: 15px; letter-spacing: 0.5px;">C H A S S I S</strong>
      <span id="chassis-status" style="font-size: 11px; color: var(--vscode-descriptionForeground);">${header && header.sessionActive ? '&#x25cf; working' : '&#x25cf; ready'}</span>
    </div>
    <div class="header-right">
      ${header && header.hasProjectOpen ? `
      <button class="header-btn" data-cmd="chassis.blueprintInterview" title="Edit Blueprint" style="${header.blueprintStatus === 'complete' ? 'border-color:#4caf50;color:#4caf50;' : header.blueprintStatus === 'incomplete' ? 'border-color:#ff9800;color:#ff9800;' : 'border-color:#f44336;color:#f44336;'}">📋 ${header.projectName}</button>
      <button class="header-btn" data-cmd="chassis.showMap" title="Map">🗺️ Map</button>
      <button class="header-btn" data-cmd="chassis.savePoint" title="Save Point">💾 Save Point</button>
      ` : ''}
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
          <button class="input-pill" data-cmd="chassis.openVault" title="Browse Vault">⊞ Vault</button>
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

