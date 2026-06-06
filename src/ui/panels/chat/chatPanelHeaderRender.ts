// [SCOPE] Renders the project-dependent header-right buttons and input-left pills as inner-HTML strings.
// Shared by the full HTML builder (chatPanelHtml.ts) AND the surgical postMessage update (panelRefresh)
// so the header can start showing project pills (Preview, Blueprint, Map, History, Run) AFTER a build
// recognizes the project — WITHOUT replacing the whole webview.html, which risks a duplicate tab.
// All buttons use document-level [data-cmd]/[data-action] delegation, so innerHTML replacement is safe.

import type { ChatHeaderInfo } from './chatPanelHtml';

/** Inner HTML for the .header-right container (the top-right pill row). */
export function renderHeaderRightInner(header?: ChatHeaderInfo): string {
  return `${header && header.hasProjectOpen ? `
      <button class="header-btn" data-cmd="redivivus.blueprintInterview" title="Edit Blueprint" style="${header.blueprintStatus === 'complete' ? 'border-color:#4caf50;color:#4caf50;' : header.blueprintStatus === 'incomplete' ? 'border-color:#ff9800;color:#ff9800;' : 'border-color:#f44336;color:#f44336;'}">&#x1F4CB; Blueprint</button>
      <button class="header-btn" data-cmd="redivivus.showMap" title="Map">🗺️ Map</button>
      <button class="header-btn" data-cmd="redivivus.showBuildHistory" title="Build History">&#x1F4CB; History</button>
      <button class="header-btn header-btn--preview" ${header.primaryAction?.actionAttr}="${header.primaryAction?.actionValue}" title="${header.primaryAction?.tooltip}">${header.primaryAction?.icon} ${header.primaryAction?.label}</button>
      ` : ''}
      ${header && header.projectTokens ? `<button class="header-btn" data-cmd="redivivus.viewProjectUsage" title="Project: ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tokens -- $${header.projectTokens.cost.toFixed(3)} spent -- click for AI breakdown">&#x1F4CA; ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tok</button>` : `<button class="header-btn" data-cmd="${header && header.hasProjectOpen ? 'redivivus.viewProjectUsage' : 'redivivus.viewUsage'}" title="Token Usage &amp; Cost">&#x1F4CA; Usage</button>`}
      <button class="header-btn" id="clear-btn" title="Clear Chat">&#x1F5D1;&#xFE0F;</button>
      <button class="header-btn" data-cmd="redivivus.showSystemHealth" title="Network, AI keys, account status, and build log stats" style="${header?.healthStatus === 'green' ? 'border-color:#4caf50;color:#4caf50;' : header?.healthStatus === 'yellow' ? 'border-color:#ff9800;color:#ff9800;' : header?.healthStatus === 'red' ? 'border-color:#f44336;color:#f44336;' : ''}">${header?.healthStatus ? '&#x25CF;' : '&#x25CE;'} Health</button>
      <button class="header-btn" data-cmd="${header && header.hasProjectOpen ? 'redivivus.showChatGettingStarted' : 'redivivus.showCapabilities'}" title="${header && header.hasProjectOpen ? 'How to use Redivivus with your project' : 'What is Redivivus?'}">? Help</button>
      <button class="header-btn" data-cmd="redivivus.reportIssue" title="Report a bug or request a feature">&#x1F41B; Report</button>`;
}

/** Inner HTML for the #input-left container (the bottom-left pill row). */
export function renderInputLeftInner(header?: ChatHeaderInfo): string {
  return `<button class="input-pill" data-cmd="redivivus.openVault" title="Browse Vault">&#x229E; Vault</button>
          ${header && header.hasProjectOpen ? `<button class="input-pill input-pill--run" data-cmd="redivivus.runProject" title="Run your project in the terminal">&#x25B6; Run</button>` : ''}
          ${header ? (header.rosterDisplay && header.rosterDisplay.length > 0
            ? `<span class="input-pill input-pill--ai" data-cmd="redivivus.openSettings" title="AI Team: ${header.rosterDisplay.map(r => r.emoji + ' ' + r.label + ' (' + r.role + ')').join(', ')}">${header.rosterDisplay[0].emoji} ${header.rosterDisplay[0].label}${header.rosterDisplay.length > 1 ? ' +' + (header.rosterDisplay.length - 1) : ''}</span>`
            : `<span class="input-pill input-pill--ai" data-cmd="redivivus.openSettings" title="Click to configure AI model">${!header.hasKey ? '⚠️ No AI key' : '🧠 ' + header.aiLabel}</span>`
          ) : ''}
          <span class="input-pill input-pill--adaptive" data-action="show-agent-info" title="Adaptive Mode: Supervisor auto-routes each prompt to the optimal AI. Click for info.">&#x1F500; Adaptive</span>`;
}
