// [SCOPE] Redivivus Chat Panel HTML builder — slim shell. Assembles webview HTML from extracted modules.
// Split complete: renderer → chatPanelRenderer.ts, CSS → chatPanelStyles.ts, script → chatPanelScript.ts
import type { SetupProgress } from '../../../services/project/setupProgressService';
import { getNonce } from '../../getNonce';
import { renderMessages, escapeHtml } from './chatPanelRenderer';
import { buildChatCss } from './chatPanelStyles';
import { buildChatScript } from './chatPanelScript';
import type { DashboardData } from './chatPanelDashboard';
import { buildProjectDashboard } from './chatPanelDashboard';
import { buildEmptyStateHtml } from './chatPanelEmptyState';

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
  usageReport?: import('../../../services/usageTracker').UsageReport;
  lastModel?: string;
  hasProjectOpen: boolean;
  workspaceHasRedivivus: boolean;
  workspaceFolderIsOpen: boolean; workspaceIsAssistMode: boolean; assistMode?: boolean;
  recentProjects: Array<{ path: string; name: string; timestamp?: number }>;
  vaultItemCount?: number;
  shouldAutoOpenLastProject?: boolean;
  blueprintStatus?: 'complete' | 'incomplete' | 'missing';
  // [Redivivus] AI roster for multi-badge display — all active AIs with roles
  rosterDisplay?: Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }>;
  buildMode?: 'plan' | 'direct'; dashData?: DashboardData;
  projectTokens?: { tokens: number; cost: number };
  buildStamp?: string;
  isSignedIn?: boolean;
  healthStatus?: 'green' | 'yellow' | 'red';
}

export function buildChatHtml(conversation: ChatMessage[], header?: ChatHeaderInfo, progress?: SetupProgress): string {
  const nonce = getNonce();
  const messagesHtml = renderMessages(conversation);

  const badges: string[] = [];
  if (header) {
    if (!header.hasKey) {
      badges.push(`<span class="badge ai red clickable" data-cmd="redivivus.openSettings" title="Click to configure AI">⚠️ No AI key</span>`);
    }
    if (header.sessionActive) {
      badges.push(`<span class="badge session">🟢 Session</span>`);
    }
    // [Redivivus] Mode indicator pill — clickable to switch modes mid-session
    if (header.buildMode) {
      const modeLabel = header.buildMode === 'plan' ? 'Guided' : 'Auto';
      const modeTooltip = header.buildMode === 'plan' ? 'Guided Mode: full interview before building. Click to switch to Auto.' : 'Auto Mode: AI builds immediately, no questions. Click to switch to Guided.';
      badges.push(`<span class="badge mode mode-${header.buildMode}" data-action="switch-mode" title="${modeTooltip}">${modeLabel}</span>`);
    }
    if (header.assistMode || header.workspaceIsAssistMode) { badges.push(`<span class="badge mode" style="background:#1e3a5f;color:#60a5fa;border-color:#2563eb;" title="Assist Mode: Redivivus runs silently. No code annotations or roadmap. Click to upgrade." data-action="retrofit-project">&#x26A1; Assist Mode</span>`); }
    else if (header.workspaceHasRedivivus) { badges.push(`<span class="badge mode" style="background:#14291a;color:#4ade80;border-color:#16a34a;" title="Full Redivivus Mode: code annotations, roadmap, and blueprint active">&#x1F9E9; Redivivus</span>`); }
    
  }
  const headerHtml = header ? `<div class="header-badges">${badges.join('')}</div>` : '';

  const emptyState = buildEmptyStateHtml(header, progress);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; frame-src http://localhost:* http://127.0.0.1:*; img-src http://localhost:* http://127.0.0.1:* data:;" />
  <style nonce="${nonce}">${buildChatCss()}</style></head><body>
  <div class="header">
    <div class="header-left">
      <span id="redivivus-status" style="font-size: 11px; color: var(--vscode-descriptionForeground);">${header && header.sessionActive ? '&#x25cf; working' : '&#x25cf; ready'}</span>
      ${header?.buildStamp ? `<span title="Compiled: ${header.buildStamp}" style="font-size:10px;color:var(--vscode-descriptionForeground);opacity:0.6;margin-left:6px;font-family:monospace;user-select:none;">${header.buildStamp}</span>` : ''}<span style="font-size:9px;font-weight:700;letter-spacing:0.08em;color:#f59e0b;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:4px;padding:1px 5px;margin-left:6px;user-select:none;">BETA</span>
    </div>
    <div class="header-right">
      ${header && header.hasProjectOpen ? `
      <button class="header-btn" data-cmd="redivivus.blueprintInterview" title="Edit Blueprint" style="${header.blueprintStatus === 'complete' ? 'border-color:#4caf50;color:#4caf50;' : header.blueprintStatus === 'incomplete' ? 'border-color:#ff9800;color:#ff9800;' : 'border-color:#f44336;color:#f44336;'}">&#x1F4CB; Blueprint</button>
      <button class="header-btn" data-cmd="redivivus.showMap" title="Map">🗺️ Map</button>
      <button class="header-btn" data-cmd="redivivus.showBuildHistory" title="Build History">&#x1F4CB; History</button>
      <button class="header-btn header-btn--preview" data-action="preview-show" title="Live preview of your project">&#x25B6; Preview</button>
      ` : ''}
      ${header && header.projectTokens ? `<button class="header-btn" data-cmd="redivivus.viewProjectUsage" title="Project: ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tokens -- $${header.projectTokens.cost.toFixed(3)} spent -- click for AI breakdown">&#x1F4CA; ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tok</button>` : `<button class="header-btn" data-cmd="${header && header.hasProjectOpen ? 'redivivus.viewProjectUsage' : 'redivivus.viewUsage'}" title="Token Usage &amp; Cost">&#x1F4CA; Usage</button>`}
      <button class="header-btn" id="clear-btn" title="Clear Chat">&#x1F5D1;&#xFE0F;</button>
      <button class="header-btn" data-cmd="redivivus.showSystemHealth" title="Network, AI keys, account status, and build log stats" style="${header?.healthStatus === 'green' ? 'border-color:#4caf50;color:#4caf50;' : header?.healthStatus === 'yellow' ? 'border-color:#ff9800;color:#ff9800;' : header?.healthStatus === 'red' ? 'border-color:#f44336;color:#f44336;' : ''}">${header?.healthStatus ? '&#x25CF;' : '&#x25CE;'} Health</button>
      <button class="header-btn" data-cmd="${header && header.hasProjectOpen ? 'redivivus.showChatGettingStarted' : 'redivivus.showCapabilities'}" title="${header && header.hasProjectOpen ? 'How to use Redivivus with your project' : 'What is Redivivus?'}">? Help</button>
      <button class="header-btn" data-cmd="redivivus.reportIssue" title="Report a bug or request a feature">&#x1F41B; Report</button>
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
          <button class="input-pill" data-cmd="redivivus.openVault" title="Browse Vault">&#x229E; Vault</button>
          ${header && header.hasProjectOpen ? `<button class="input-pill input-pill--run" data-cmd="redivivus.runProject" title="Run your project in the terminal">&#x25B6; Run</button>` : ''}
          ${header ? (header.rosterDisplay && header.rosterDisplay.length > 0
            ? `<span class="input-pill input-pill--ai" data-cmd="redivivus.openSettings" title="AI Team: ${header.rosterDisplay.map(r => r.emoji + ' ' + r.label + ' (' + r.role + ')').join(', ')}">${header.rosterDisplay[0].emoji} ${header.rosterDisplay[0].label}${header.rosterDisplay.length > 1 ? ' +' + (header.rosterDisplay.length - 1) : ''}</span>`
            : `<span class="input-pill input-pill--ai" data-cmd="redivivus.openSettings" title="Click to configure AI model">${!header.hasKey ? '⚠️ No AI key' : '🧠 ' + header.aiLabel}</span>`
          ) : ''}
          <span class="input-pill input-pill--adaptive" data-action="show-agent-info" title="Adaptive Mode: Supervisor auto-routes each prompt to the optimal AI. Click for info.">&#x1F500; Adaptive</span>
        </div>
        <div id="input-right">
          <button id="send-btn" title="Send (Enter)">↑</button>
        </div>
      </div>
    </div>
  </div>
  <div id="preview-view">
    <div class="preview-toolbar">
      <button class="preview-back" data-action="preview-hide">&#x2190; Chat</button>
      <div class="preview-device-group">
        <button class="preview-device-btn" data-w="390" title="Mobile (390px)">&#x1F4F1;</button>
        <button class="preview-device-btn" data-w="768" title="Tablet (768px)">&#x1F4BB;</button>
        <button class="preview-device-btn active" data-w="0" title="Desktop (full width)">&#x1F5A5;</button>
      </div>
      <button class="preview-back" data-action="preview-refresh" title="Refresh preview">&#x21BA;</button>
      <button id="preview-inspect-btn" class="preview-back" data-action="preview-inspect" title="Click an element to select it, then describe changes to Redivivus">&#x270F;&#xFE0F; Inspect</button>
      <button id="preview-reveal-btn" class="preview-back" data-action="preview-reveal" title="Show hidden elements (display:none) so they can be selected">&#x1F441; Hidden</button>
      <button id="preview-move-btn" class="preview-back" data-action="rearrange-toggle" title="Drag elements to reorder within the same container">&#x21D5; Move</button>
      <input id="preview-url" class="preview-url-bar" type="text" placeholder="http://localhost:..." spellcheck="false" />
      <span id="preview-status" class="preview-status"></span>
      <button class="preview-popout" data-action="ve-toggle" title="Open Visual Editor — edit colors, text and layout inline">&#x270F;&#xFE0F; Edit</button>
      <button class="preview-popout" data-action="preview-browser" title="Open in your default browser">&#x1F310; Browser</button>
      <button class="preview-popout" data-action="preview-popout" title="Open in VS Code side panel — great for large monitors">&#x229E; Pop Out</button>
    </div>
    <div id="preview-content">
      <div id="preview-main">
        <div id="preview-frame-wrap" class="preview-frame-wrap">
          <div id="preview-loading" class="preview-loading">
            <div class="preview-spinner"></div>
            <span>Starting dev server&hellip;</span>
          </div>
          <iframe id="preview-frame" src="about:blank" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" style="border:none;width:100%;height:100%;flex-shrink:0;transition:width 0.2s;"></iframe>
          <div id="inspector-overlay">
            <span id="inspector-el-tag"></span>
            <textarea id="inspector-input" rows="2" placeholder="Describe what you want to change about this element…"></textarea>
            <div class="inspector-actions">
              <button class="inspector-send-btn" data-action="inspector-send">&#x2192; Tell Redivivus</button>
              <button class="inspector-cancel-btn" data-action="inspector-cancel">&#x2715; Cancel</button>
            </div>
          </div>
        </div>
        <div id="preview-chat-strip">
          <div id="preview-chat-last"></div>
          <div id="preview-chat-input-row">
            <textarea id="preview-chat-input" rows="2" placeholder="Tell Redivivus what to change…"></textarea>
            <button id="preview-chat-send-btn" data-action="preview-chat-send" title="Send (Enter)">&#x2191;</button>
          </div>
        </div>
      </div>
      <div id="ve-drawer">
        <div class="ve-hdr">
          <span style="font-size:11px;font-weight:600;color:#cdd6f4;">✏️ Editor</span>
          <span id="ve-status" class="ve-status"></span>
          <div class="ve-mtoggle">
            <button id="ve-plain" class="active">Plain</button>
            <button id="ve-pro">Pro</button>
          </div>
          <button id="ve-apply" disabled>Apply</button>
          <button id="ve-close" title="Close">✕</button>
        </div>
        <div class="ve-tabs" id="ve-tabs"></div>
        <div class="ve-canvas" id="ve-canvas"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">${buildChatScript()}<\/script>
</body></html>`;
}
