// [SCOPE] Redivivus Chat Panel Empty State rendering — onboarding launcher, templates, and dashboard selection
// Split from chatPanelHtml.ts to comply with the 200-line limit (Rule 9).

import type { SetupProgress } from '../../../services/project/setupProgressService';
import type { ChatHeaderInfo } from './chatPanelHtml';
import { escapeHtml } from './chatPanelRenderer';
import { buildProjectDashboard } from './chatPanelDashboard';

export function buildEmptyStateHtml(header?: ChatHeaderInfo, progress?: SetupProgress): string {
  if (!header) {return '';}
  
  // If workspace has a .redivivus folder, show the project-ready screen
  if (header.workspaceHasRedivivus && !header.workspaceIsAssistMode && !header.assistMode) {
    return buildProjectDashboard(header, progress, header.dashData);
  }

  const _featureTable = `<table style="width:100%;max-width:440px;margin:0 auto 18px;border-collapse:collapse;font-size:12px;text-align:left;"><thead><tr><th style="padding:5px 8px;border-bottom:1px solid #444;"></th><th style="padding:5px 8px;border-bottom:1px solid #444;text-align:center;">&#x26A1; Assist</th><th style="padding:5px 8px;border-bottom:1px solid #444;text-align:center;">&#x1F9E9; Full Redivivus</th></tr></thead><tbody>${[['AI quality (Supervisor+Worker+Guardian)','&#x2705;','&#x2705;'],['Vault &mdash; reuse code across projects','&#x2705;','&#x2705;'],['Undo / snapshots before every change','&#x2705;','&#x2705;'],['Token tracking &amp; cost breakdown','&#x2705;','&#x2705;'],['Dead-end memory &mdash; never repeats a failed fix','&#x2705;','&#x2705;'],['Code annotations ([SCOPE]/[WARN]/[DEAD])','&#x274C;','&#x2705;'],['REDIVIVUS_ROADMAP.md &mdash; full change log','&#x274C;','&#x2705;'],['Blueprint &mdash; AI always knows your project','&#x274C;','&#x2705;'],['Auto-commits after every build/fix','&#x274C;','&#x2705;']].map(([f,a,c])=>`<tr><td style="padding:4px 8px;opacity:0.85;">${f}</td><td style="padding:4px 8px;text-align:center;">${a}</td><td style="padding:4px 8px;text-align:center;">${c}</td></tr>`).join('')}</tbody></table>`;
  
  if (header.workspaceIsAssistMode) {
    const n = escapeHtml(header.projectName || 'your project');
    return `<div class="empty-state" style="padding:24px 30px;"><div class="icon" style="font-size:36px;">&#x26A1;</div><div class="onboarding-title" style="font-size:19px;font-weight:700;margin:8px 0 4px;">${n} &mdash; Assist Mode</div><div style="font-size:13px;color:var(--vscode-descriptionForeground);margin-bottom:16px;">Your code stays exactly as-is. Redivivus runs silently in the background.</div>${_featureTable}<button data-action="retrofit-project" style="display:block;margin:0 auto;padding:8px 18px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">&#x1F9E9; Switch to Full Redivivus &mdash; add tracking now</button><div class="onboarding-hint" style="margin-top:14px;font-size:12px;">Or just type your request below</div></div>`;
  }
  
  if (header.workspaceFolderIsOpen && !header.workspaceHasRedivivus && !header.workspaceIsProjectsContainer) {
    const n = escapeHtml(header.projectName || 'your project');
    return `<div class="empty-state" style="padding:24px 30px;"><div class="icon" style="font-size:40px;">&#x1F4C2;</div><div class="onboarding-title" style="font-size:20px;font-weight:700;margin:8px 0 4px;">Project detected: ${n}</div><div style="font-size:13px;color:var(--vscode-descriptionForeground);margin-bottom:16px;">Choose how Redivivus works with this project. You can switch at any time.</div>${_featureTable}<div style="display:flex;gap:10px;max-width:440px;margin:0 auto;"><button class="launcher-btn" data-action="start-new-project" data-mode="direct" data-assist="true" style="flex:1;padding:12px 14px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:8px;cursor:pointer;text-align:center;font-size:14px;font-weight:600;">&#x26A1; Assist Mode<div style="font-size:11px;font-weight:400;opacity:0.85;margin-top:3px;">Code stays as-is</div></button><button class="launcher-btn" data-action="retrofit-project" style="flex:1;padding:12px 14px;background:var(--vscode-editor-inactiveSelectionBackground);color:var(--vscode-foreground);border:1px solid var(--vscode-input-border);border-radius:8px;cursor:pointer;text-align:center;font-size:14px;font-weight:600;">&#x1F9E9; Full Redivivus<div style="font-size:11px;font-weight:400;opacity:0.85;margin-top:3px;">Full tracking added</div></button></div><div class="onboarding-hint" style="margin-top:14px;font-size:12px;">Or just type below &mdash; Redivivus will ask which mode to use</div></div>`;
  }

  // LAUNCHER SCREEN: No folder open — polished welcome with actions, templates, vault, onboarding
  const _fmtAgo = (ts?: number) => {
    if (!ts) {return '';}
    const d = Date.now() - ts;
    if (d < 60000) {return 'just now';}
    if (d < 3600000) {return Math.floor(d/60000) + 'm ago';}
    if (d < 86400000) {return Math.floor(d/3600000) + 'h ago';}
    if (d < 604800000) {return Math.floor(d/86400000) + 'd ago';}
    return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  };

  const recentProjectsHtml = header.recentProjects && header.recentProjects.length > 0
    ? header.recentProjects.map(p =>
        `<div class="launcher-recent-item" data-recent-path="${escapeHtml(p.path)}" title="Open ${escapeHtml(p.path)}">` +
        `<span class="lri-icon">&#x1F4C1;</span>` +
        `<span class="lri-name">${escapeHtml(p.name)}</span>` +
        `<span class="lri-time">${_fmtAgo(p.timestamp)}</span>` +
        `</div>`
      ).join('')
    : `<div class="launcher-empty-recent">No recent projects</div>`;

  const vaultCount = header.vaultItemCount || 0;
  const starterCount = header.vaultStarterCount || 0;
  // [FIX] Show user-built items separately from seeded starters.
  // "33 items" was misleading — 27 were starters, not user-built code.
  const vaultLine = (() => {
    if (vaultCount > 0 && starterCount > 0) {
      return `<div class="launcher-vault-status" data-cmd="redivivus.openVault" title="Open Vault browser -- browse and manage your reusable code library"><span class="lvs-icon">&#x229E;</span>${vaultCount} from your builds &middot; ${starterCount} starter patterns</div>`;
    }
    if (vaultCount > 0) {
      return `<div class="launcher-vault-status" data-cmd="redivivus.openVault" title="Open Vault browser"><span class="lvs-icon">&#x229E;</span>${vaultCount} item${vaultCount !== 1 ? 's' : ''} from your builds</div>`;
    }
    if (starterCount > 0) {
      return `<div class="launcher-vault-status" data-cmd="redivivus.openVault" title="Your Vault has starter patterns ready -- builds will add your own code"><span class="lvs-icon">&#x229E;</span>${starterCount} starter patterns ready &mdash; builds add yours</div>`;
    }
    return `<div class="launcher-vault-status launcher-vault-empty" title="Your Vault stores reusable code snippets. It fills automatically as you build."><span class="lvs-icon">&#x229E;</span>Vault empty &mdash; builds will populate it</div>`;
  })();

  const signInBanner = header.isSignedIn ? '' :
    `<div style="margin-bottom:16px;padding:12px 16px;background:rgba(20,184,166,0.07);border:1px solid rgba(20,184,166,0.25);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <span style="font-size:13px;color:#c0c0d8;">Connect your Redivivus account to activate your license.</span>
      <button data-cmd="redivivus.signIn" style="flex-shrink:0;padding:6px 14px;background:#14B8A6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Sign In</button>
    </div>`;

  // [FIX] No AI key configured -> Redivivus cannot build or fix anything. Show a prominent
  // call-to-action so the user knows the very first step is to set up at least one AI provider.
  // [FIX][CRY-WOLF] Suppress the "No AI is set up" alarm during the brief pre-load window (keyStoreReady
  // === false). The panel renders before keys load from SecretStorage, so hasKey is momentarily false even
  // when keys exist. Only alarm once we actually KNOW there's no key.
  const noAiBanner = (header.hasKey || header.keyStoreReady === false) ? '' :
    `<div style="margin-bottom:16px;padding:14px 16px;background:rgba(245,166,35,0.10);border:1px solid rgba(245,166,35,0.40);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <span style="font-size:13px;color:#f5d9a8;"><strong>&#x26A0;&#xFE0F; No AI is set up yet.</strong> Redivivus needs at least one AI provider to build or fix code. Add a free key to get started.</span>
      <button data-cmd="redivivus.openSettings" style="flex-shrink:0;padding:7px 16px;background:#f5a623;color:#1a1a1a;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">Set up an AI</button>
    </div>`;

  return `<div class="empty-state launcher-root">
    ${noAiBanner}
    ${signInBanner}
    <div class="launcher-hero" style="text-align:center;margin-bottom:16px;">
      <div class="onboarding-sub" style="font-size:16px;font-weight:600;margin:0;color:var(--vscode-foreground);">Tell me what you want to build.</div>
    </div>
    <div style="text-align:right;margin-bottom:10px;">
      <button data-action="open-existing-project" style="background:none;border:none;color:inherit;opacity:0.55;cursor:pointer;font-size:12px;padding:0;text-decoration:underline;text-underline-offset:2px;">or open an existing project &#x2192;</button>
    </div>
    <div class="launcher-grid">
      <div class="launcher-section">
        <div class="launcher-section-label">Start from a template</div>
        <div class="launcher-templates">
          <button class="launcher-tpl-pill" data-action="scaffold-quickstart" data-template="react" title="Scaffold a React 19 + Vite + TypeScript project with starter files"><span class="tpl-dot" style="background:#61dafb;"></span>React</button>
          <button class="launcher-tpl-pill" data-action="scaffold-quickstart" data-template="flask" title="Scaffold a Python Flask API with routes, requirements, and .env"><span class="tpl-dot" style="background:#3b82f6;"></span>Flask</button>
          <button class="launcher-tpl-pill" data-action="scaffold-quickstart" data-template="go" title="Scaffold a Go HTTP API with go.mod, main.go, and handler structure"><span class="tpl-dot" style="background:#00add8;"></span>Go API</button>
          <button class="launcher-tpl-pill" data-action="scaffold-quickstart" data-template="express" title="Scaffold a Node.js Express API with package.json, routes, and middleware"><span class="tpl-dot" style="background:#68a063;"></span>Express</button>
        </div>
      </div>
      <div class="launcher-section">
        <div class="launcher-section-label">&#x1F553; Recent Projects</div>
        <div class="launcher-recent-list">${recentProjectsHtml}</div>
      </div>
    </div>
    <div class="launcher-bottom-bar">
      ${vaultLine}
      <button class="launcher-settings-gear" data-action="toggle-auto-open-popover" title="Startup settings">&#x2699;</button>
    </div>
    <div class="launcher-auto-popover" id="launcher-auto-popover" style="display:none;">
      <label class="launcher-autostart"><input type="checkbox" id="auto-open-last-project" data-action="toggle-auto-open"><span>Always open my last project on startup</span></label>
    </div>
  </div>`;
}
