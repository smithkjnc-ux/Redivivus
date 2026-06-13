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
      <button class="header-btn header-btn--run" data-cmd="redivivus.runProject" title="Run your project standalone — opens it the way it really runs (web in your browser, scripts in a terminal)">&#x25B6; Run</button>
      ` : ''}
      ${header && header.projectTokens ? `<button class="header-btn" data-cmd="redivivus.viewProjectUsage" title="Project: ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tokens -- $${header.projectTokens.cost.toFixed(3)} spent -- click for AI breakdown">&#x1F4CA; ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tok</button>` : `<button class="header-btn" data-cmd="${header && header.hasProjectOpen ? 'redivivus.viewProjectUsage' : 'redivivus.viewUsage'}" title="Token Usage &amp; Cost">&#x1F4CA; Usage</button>`}
      <button class="header-btn" id="clear-btn" title="Clear Chat">&#x1F5D1;&#xFE0F;</button>
      <button class="header-btn" data-cmd="redivivus.showSystemHealth" title="Network, AI keys, account status, and build log stats" style="${header?.healthStatus === 'green' ? 'border-color:#4caf50;color:#4caf50;' : header?.healthStatus === 'yellow' ? 'border-color:#ff9800;color:#ff9800;' : header?.healthStatus === 'red' ? 'border-color:#f44336;color:#f44336;' : ''}">${header?.healthStatus ? '&#x25CF;' : '&#x25CE;'} Health</button>
      <button class="header-btn" data-cmd="${header && header.hasProjectOpen ? 'redivivus.showChatGettingStarted' : 'redivivus.showCapabilities'}" title="${header && header.hasProjectOpen ? 'How to use Redivivus with your project' : 'What is Redivivus?'}">? Help</button>
      <button class="header-btn" data-cmd="redivivus.reportIssue" title="Report a bug or request a feature">&#x1F41B; Report</button>`;
}

/** Inner HTML for the #input-left container (the bottom-left pill row).
 *  [ADAPTIVE-PILL] Removed: Vault pill (use header or command palette), AI roster pill.
 *  Added: single adaptive AI pill — neutral/faded until user types, then updates live to show
 *  the cheapest available provider for the assessed prompt tier.
 *  Clicking opens a manual-picker popover listing all configured providers.
 *  data-providers carries the serialised provider list so the webview needs no round-trip.
 */
export function renderInputLeftInner(header?: ChatHeaderInfo): string {
  // Key store not yet initialised — show a loading placeholder, never the "No AI" alarm.
  if (header && header.keyStoreReady === false) {
    return `<span id="adaptive-pill" style="font-size:11px;padding:3px 10px;border-radius:99px;border:1px solid #3d3d3d;color:#555;font-family:inherit;user-select:none;">&#x1F9E0; &hellip;</span>`;
  }
  // No keys at all — nudge the user to configure.
  if (header && !header.hasKey) {
    return `<span id="adaptive-pill" class="input-pill input-pill--ai" data-cmd="redivivus.openSettings" title="Click to configure AI provider" style="cursor:pointer;">&#x26A0; No AI key</span>`;
  }

  // [WARN] data-providers must be valid JSON in a double-quoted HTML attribute.
  // We serialise the array and escape internal quotes with &quot; so innerHTML assignment is safe.
  const providersJson = (header?.configuredProviders && header.configuredProviders.length > 0)
    ? JSON.stringify(header.configuredProviders).replace(/"/g, '&quot;')
    : '[]';

  // Adaptive pill — starts neutral, JS in chatPanelScriptTier.ts drives all live updates.
  return `<button id="adaptive-pill"
    data-providers="${providersJson}"
    title="Adaptive: picks the right AI as you type. Click to lock a specific provider."
  >&#x26A1; AI</button>`;
}
