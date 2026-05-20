// [SCOPE] CHASSIS Chat Panel HTML builder — slim shell. Assembles webview HTML from extracted modules.
// Split complete: renderer → chatPanelRenderer.ts, CSS → chatPanelStyles.ts, script → chatPanelScript.ts
import { SetupProgress } from '../../services/project/setupProgressService.js';
import { getNonce } from '../getNonce.js';
import { renderMessages, escapeHtml } from './chatPanelRenderer.js';
import { buildChatCss } from './chatPanelStyles.js';
import { buildChatScript } from './chatPanelScript.js';
import { buildProjectDashboard, DashboardData } from './chatPanelDashboard.js';
import { buildEmptyStateHtml } from './chatPanelEmptyState.js';

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
  recentProjects: Array<{ path: string; name: string; timestamp?: number }>;
  vaultItemCount?: number;
  shouldAutoOpenLastProject?: boolean;
  blueprintStatus?: 'complete' | 'incomplete' | 'missing';
  // [CHASSIS] AI roster for multi-badge display — all active AIs with roles
  rosterDisplay?: Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }>;
  buildMode?: 'plan' | 'direct'; dashData?: DashboardData;
  projectTokens?: { tokens: number; cost: number };
  buildStamp?: string;
  agentMode?: boolean;
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
    
    // [CHASSIS] Phase 2: Agent Mode — OBD1 = Pipeline, OBD2 = Agent. Click opens info+cost panel with toggle.
    if (header.agentMode) { badges.push(`<span class="badge mode" style="background:#4c1d95;color:#c4b5fd;border-color:#8b5cf6;cursor:pointer;" title="OBD2 Agent Mode: ON \u2014 autonomous ReAct loop, reads files &amp; runs commands. Click for cost info &amp; controls." data-action="show-agent-info">\uD83E\uDD16 OBD2</span>`); }
    else { badges.push(`<span class="badge mode" style="background:#1d3461;color:#60a5fa;border-color:#2563eb;cursor:pointer;" title="OBD1 Pipeline Mode: ON \u2014 structured intent classification, Supervisor + Worker + Guardian. Click to learn about OBD2 Agent Mode." data-action="show-agent-info">\uD83D\uDE87 OBD1</span>`); }
  }
  const headerHtml = header ? `<div class="header-badges">${badges.join('')}</div>` : '';

  const emptyState = buildEmptyStateHtml(header, progress);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <style nonce="${nonce}">${buildChatCss()}</style></head><body>
  <div class="header">
    <div class="header-left">
      <strong style="font-size: 15px; letter-spacing: 2px; font-weight: 700;"><span style="color:#a78bfa;-webkit-text-fill-color:#a78bfa;">C</span><span style="color:#4d9eff;-webkit-text-fill-color:#4d9eff;"> H A S S I S</span></strong>
      <span id="chassis-status" style="font-size: 11px; color: var(--vscode-descriptionForeground);">${header && header.sessionActive ? '&#x25cf; working' : '&#x25cf; ready'}</span>
      ${header?.buildStamp ? `<span title="Compiled: ${header.buildStamp}" style="font-size:10px;color:var(--vscode-descriptionForeground);opacity:0.6;margin-left:6px;font-family:monospace;user-select:none;">${header.buildStamp}</span>` : ''}
    </div>
    <div class="header-right">
      ${header && header.hasProjectOpen ? `
      <button class="header-btn" data-cmd="chassis.blueprintInterview" title="Edit Blueprint" style="${header.blueprintStatus === 'complete' ? 'border-color:#4caf50;color:#4caf50;' : header.blueprintStatus === 'incomplete' ? 'border-color:#ff9800;color:#ff9800;' : 'border-color:#f44336;color:#f44336;'}">📋 ${header.projectName}</button>
      <button class="header-btn" data-cmd="chassis.showMap" title="Map">🗺️ Map</button>
      <button class="header-btn" data-cmd="chassis.showBuildHistory" title="Build History">&#x1F4CB; History</button>
      ` : ''}
      ${header && header.projectTokens ? `<button class="header-btn" data-cmd="chassis.viewUsage" title="Project: ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tokens -- $${header.projectTokens.cost.toFixed(3)} spent -- click for AI breakdown">&#x1F4CA; ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tok</button>` : `<button class="header-btn" data-cmd="chassis.viewUsage" title="Token Usage &amp; Cost">&#x1F4CA; Usage</button>`}
      <button class="header-btn" id="clear-btn" title="Clear Chat">&#x1F5D1;&#xFE0F;</button>
      <button class="header-btn" data-cmd="${header && header.hasProjectOpen ? 'chassis.showChatGettingStarted' : 'chassis.showCapabilities'}" title="${header && header.hasProjectOpen ? 'How to use CHASSIS with your project' : 'What is CHASSIS?'}">? Help</button>
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
  <script nonce="${nonce}">window._agentMode=${header?.agentMode ? 'true' : 'false'};${buildChatScript()}<\/script>
</body></html>`;
}
