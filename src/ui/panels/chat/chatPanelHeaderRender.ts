// [SCOPE] Renders the project-dependent header-right buttons and input-left pills as inner-HTML strings.
// Shared by the full HTML builder (chatPanelHtml.ts) AND the surgical postMessage update (panelRefresh)
// so the header can start showing project pills (Preview, Blueprint, Map, History, Run) AFTER a build
// recognizes the project — WITHOUT replacing the whole webview.html, which risks a duplicate tab.
// All buttons use document-level [data-cmd]/[data-action] delegation, so innerHTML replacement is safe.

import * as vscode from 'vscode';
import type { ChatHeaderInfo } from './chatPanelHtml';

/** Inner HTML for the .header-right container (the top-right pill row).
 *  Pills are filtered by panelContext so each screen only shows relevant actions.
 *  Universal pills (Usage, Clear, Memory, Health, Help, Report) always appear. */
export function renderHeaderRightInner(header?: ChatHeaderInfo): string {
  const ctx = header?.panelContext || 'chat';

  // Context pills — only show when relevant to the current panel mode
  const showBlueprint = ctx === 'chat' || ctx === 'architect' || ctx === 'map';
  const showMap       = ctx === 'chat' || ctx === 'architect';
  const showHistory   = ctx === 'chat' || ctx === 'architect' || ctx === 'history';
  const showActivity  = ctx === 'chat';
  const showPreview   = ctx === 'chat';
  const showRun       = ctx === 'chat';
  const showPWA       = ctx === 'chat';

  let pills = '';
  if (header && header.hasProjectOpen) {
    if (showBlueprint) {
      pills += `<button class="header-btn" data-cmd="redivivus.blueprintInterview" title="Edit Blueprint" style="${header.blueprintStatus === 'complete' ? 'border-color:#4caf50;color:#4caf50;' : header.blueprintStatus === 'incomplete' ? 'border-color:#ff9800;color:#ff9800;' : 'border-color:#f44336;color:#f44336;'}">&#x1F4CB; Blueprint</button>`;
    }
    if (showMap) {
      pills += `<button class="header-btn" data-cmd="redivivus.showMap" title="Map">🗺️ Map</button>`;
    }
    if (showHistory) {
      pills += `<button class="header-btn" data-cmd="redivivus.showBuildHistory" title="Project History">&#x1F4CB; History</button>`;
    }
    if (showActivity) {
      pills += `<button class="header-btn" data-cmd="redivivus.showBuildActivity" title="Build Activity — watch or replay the AI pipeline (Supervisor plans &rarr; Worker writes &rarr; Guardian validates), with each step's actual work expandable">&#x1F6E0;&#xFE0F; Activity</button>`;
    }
    if (showPreview && header.primaryAction) {
      pills += `<button class="header-btn header-btn--preview" ${header.primaryAction.actionAttr}="${header.primaryAction.actionValue}" title="${header.primaryAction.tooltip}">${header.primaryAction.icon} ${header.primaryAction.label}</button>`;
    }
    if (showRun) {
      pills += `<button class="header-btn header-btn--run" data-cmd="redivivus.runProject" title="Run your project standalone — opens it the way it really runs (web in your browser, scripts in a terminal)">&#x25B6; Run</button>`;
    }
    if (showPWA) {
      pills += `<button class="header-btn header-btn--phone" data-cmd="redivivus.addToPhone" title="Convert to PWA — make this project an installable app on any device (phone, tablet, or computer); get a QR + link to install">&#128230; Convert to PWA</button>`;
    }
  }

  // Universal pills — always show regardless of context
  pills += header && header.projectTokens
    ? `<button class="header-btn" data-cmd="redivivus.viewProjectUsage" title="Project: ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tokens -- $${header.projectTokens.cost.toFixed(3)} spent -- click for AI breakdown">&#x1F4CA; ${header.projectTokens.tokens >= 1000 ? (header.projectTokens.tokens/1000).toFixed(0)+'K' : header.projectTokens.tokens} tok</button>`
    : `<button class="header-btn" data-cmd="${header && header.hasProjectOpen ? 'redivivus.viewProjectUsage' : 'redivivus.viewUsage'}" title="Token Usage &amp; Cost">&#x1F4CA; Usage</button>`;
  pills += `<button class="header-btn" id="clear-btn" title="Clear Chat">&#x1F5D1;&#xFE0F;</button>`;
  pills += `<button class="header-btn" data-cmd="redivivus.showMemory" title="Memory — what Redivivus has learned about you and this project">&#x1F9E0; Memory</button>`;
  pills += `<button class="header-btn" data-cmd="redivivus.showSystemHealth" title="Network, AI keys, account status, and build log stats" style="${header?.healthStatus === 'green' ? 'border-color:#4caf50;color:#4caf50;' : header?.healthStatus === 'yellow' ? 'border-color:#ff9800;color:#ff9800;' : header?.healthStatus === 'red' ? 'border-color:#f44336;color:#f44336;' : ''}">${header?.healthStatus ? '&#x25CF;' : '&#x25CE;'} Health</button>`;
  pills += `<button class="header-btn" data-cmd="${header && header.hasProjectOpen ? 'redivivus.showChatGettingStarted' : 'redivivus.showCapabilities'}" title="${header && header.hasProjectOpen ? 'How to use Redivivus with your project' : 'What is Redivivus?'}">? Help</button>`;
  pills += `<button class="header-btn" data-cmd="redivivus.reportIssue" title="Report a bug or request a feature">&#x1F41B; Report</button>`;

  return pills;
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

  const currentStyle = vscode.workspace.getConfiguration('redivivus').get<string>('progressStyle', 'plain');
  const isPlain = currentStyle === 'plain';
  const progressBtn = `<button id="progress-style-btn"
    data-current-style="${currentStyle}"
    title="${isPlain ? 'Showing plain English progress. Click for technical (Supervisor/Worker/Guardian) mode.' : 'Showing technical progress. Click for plain English mode.'}"
    style="font-size:10px;padding:3px 9px;border-radius:99px;border:1px solid #3d3d3d;background:transparent;cursor:pointer;white-space:nowrap;transition:all 0.2s;font-family:inherit;color:#a6adc8;letter-spacing:0.01em;margin-left:6px;"
  >${isPlain ? '&#x1F4AC; Plain' : '&#x2699;&#xFE0F; Technical'}</button>`;

  // Adaptive pill — starts neutral, JS in chatPanelScriptTier.ts drives all live updates.
  return `<button id="adaptive-pill"
    data-providers="${providersJson}"
    title="Adaptive: picks the right AI as you type. Click to lock a specific provider."
    style="font-size:11px;font-weight:600;padding:3px 10px 3px 10px;border-radius:99px;border:1px solid #4caf5055;background:transparent;cursor:pointer;white-space:nowrap;transition:all 0.2s;font-family:inherit;color:#4caf50;letter-spacing:0.01em;"
  ><span style="font-size:10px;font-weight:700;letter-spacing:0.04em;opacity:0.7;">Adaptive</span></button>${progressBtn}`;
}
