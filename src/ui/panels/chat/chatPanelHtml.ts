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
import { renderHeaderRightInner, renderInputLeftInner } from './chatPanelHeaderRender';

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
  workspaceIsProjectsContainer?: boolean; // [Model A] root is ~/projects (HOME) -> always the launcher
  workspaceFolderIsOpen: boolean; workspaceIsAssistMode: boolean; assistMode?: boolean;
  recentProjects: Array<{ path: string; name: string; timestamp?: number }>;
  vaultItemCount?: number;  // user-built items only (excludes seeded starters)
  vaultStarterCount?: number; // seeded starter patterns (redivivus-starter / redivivus-seeded)
  shouldAutoOpenLastProject?: boolean;
  blueprintStatus?: 'complete' | 'incomplete' | 'missing';
  // [Redivivus] AI roster for multi-badge display — all active AIs with roles
  rosterDisplay?: Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }>;
  buildMode?: 'plan' | 'direct'; dashData?: DashboardData;
  projectTokens?: { tokens: number; cost: number };
  buildStamp?: string;
  isSignedIn?: boolean;
  healthStatus?: 'green' | 'yellow' | 'red';
  primaryAction?: { label: string; actionAttr: string; actionValue: string; tooltip: string; icon: string };
}

export function buildChatHtml(conversation: ChatMessage[], header?: ChatHeaderInfo, progress?: SetupProgress): string {
  const nonce = getNonce();
  const messagesHtml = renderMessages(conversation);

  const badges: string[] = [];
  if (header) {
    // [DEAD] Removed the header "No AI key" badge — it duplicated the input-bar AI pill
    // (renderInputLeftInner in chatPanelHeaderRender.ts, which shows the real roster or "No AI key")
    // and could go stale (show "No AI key" while the input pill correctly showed the configured roster).
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src http://localhost:* http://127.0.0.1:*; img-src http://localhost:* http://127.0.0.1:* data:;" />
  <style nonce="${nonce}">${buildChatCss()}</style></head><body>
  <div class="header">
    <div class="header-left">
      <span id="redivivus-status" style="font-size: 11px; color: var(--vscode-descriptionForeground);">${header && header.sessionActive ? '&#x25cf; working' : '&#x25cf; ready'}</span>
      <div style="text-align:right;line-height:1.35;">
        <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#f59e0b;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:4px;padding:2px 6px;user-select:none;">BETA</span>
        ${header?.buildStamp ? `<br><span style="font-size:13px;color:var(--vscode-descriptionForeground);opacity:0.75;font-family:monospace;user-select:none;">${header.buildStamp.split(' · ')[0]}</span><br><span title="Compiled: ${header.buildStamp}" style="font-size:11px;color:var(--vscode-descriptionForeground);opacity:0.6;font-family:monospace;user-select:none;">${header.buildStamp.split(' · ').slice(1).join(' · ')}</span>` : ''}
      </div>
    </div>
    <div class="header-right">
      ${renderHeaderRightInner(header)}
    </div>
  </div>
  ${headerHtml}
  <div id="conversation">${messagesHtml || emptyState}</div>
  <div id="input-area">
    <div id="input-card">
      <div id="input-top">
        <textarea id="message-input" placeholder="What do you want to build or fix?" rows="1"></textarea>
      </div>
      <div id="input-bottom">
        <div id="input-left">
          ${renderInputLeftInner(header)}
        </div>
        <div id="input-right">
          <button id="tier-badge" style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;border:1px solid #555;background:transparent;cursor:pointer;white-space:nowrap;transition:all 0.15s;font-family:inherit;" title="Model tier — click to change"></button>
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
