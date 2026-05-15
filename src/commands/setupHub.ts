// [SCOPE] CHASSIS Setup Hub — single entry point showing all global setup status. Shown on first install and accessible via command.

import * as vscode from 'vscode';
import { GitHubBackupService } from '../services/githubBackupService.js';

let _panel: vscode.WebviewPanel | undefined;

export function registerSetupHubCommand(context: vscode.ExtensionContext, githubBackupService: GitHubBackupService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openSetupHub', () => {
      showSetupHub(context, githubBackupService);
    })
  );

  // Show hub on first install (only once ever)
  const shown = context.globalState.get<boolean>('chassis.setupHubShown');
  if (!shown) {
    context.globalState.update('chassis.setupHubShown', true);
    setTimeout(() => showSetupHub(context, githubBackupService), 1500);
  }
}

async function showSetupHub(context: vscode.ExtensionContext, githubBackupService: GitHubBackupService): Promise<void> {
  if (_panel) { _panel.reveal(); return; }

  _panel = vscode.window.createWebviewPanel(
    'chassisSetupHub', 'CHASSIS Setup', vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  _panel.onDidDispose(() => { _panel = undefined; });

  const cfg = vscode.workspace.getConfiguration('chassis');
  const geminiKey = cfg.get<string>('geminiApiKey') || '';
  const openaiKey = cfg.get<string>('openaiApiKey') || '';
  const anthropicKey = cfg.get<string>('anthropicApiKey') || '';
  const kimiKey = cfg.get<string>('kimiApiKey') || '';
  const githubCfg = githubBackupService.getConfig();

  const hasAI = !!(geminiKey || openaiKey || anthropicKey || kimiKey);
  const hasGitHub = !!(githubCfg.enabled && githubCfg.token);

  // Guardian status
  const { RoutingService } = await import('../services/ai/routingService.js');
  const tmpRouting = new RoutingService();
  const guardianActive = tmpRouting.isGuardianActive();
  const workerAI = tmpRouting.getAvailableAI().ai;
  const guardianAI = guardianActive ? (tmpRouting.getGuardianFor(workerAI) || 'none') : 'none';
  const guardianCfg = cfg.get<boolean>('guardianEnabled') !== false;

  _panel.webview.html = getHubHtml(hasAI, geminiKey, openaiKey, anthropicKey, kimiKey, hasGitHub, githubCfg.username, githubCfg.repoName, guardianActive, guardianAI, workerAI, guardianCfg);

  _panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'open-api-setup') {
      // chassis.openSettings is the correct registered command for the API key panel
      vscode.commands.executeCommand('chassis.openSettings');
    } else if (msg.type === 'save-github') {
      // Save GitHub config from in-panel modal form — no top-bar input boxes
      const { token, username, repoName, isPrivate, interval } = msg;
      const intervalMap: Record<string, number> = { '0': 0, '15': 15, '30': 30, '60': 60 };
      await githubBackupService.saveConfig({
        enabled: !!(token && username),
        token: token || '',
        username: username || '',
        repoName: repoName || '',
        autoBackupOnBuild: true,
        autoBackupInterval: intervalMap[String(interval)] ?? 0,
        private: isPrivate !== false,
      });
      if (token && username) {
        githubBackupService.startTimer();
        const setup = await vscode.window.showInformationMessage(
          `GitHub backup saved for ${username}. Set up the remote repository now?`,
          { modal: true }, 'Yes, create & push', 'Later'
        );
        if (setup === 'Yes, create & push') {
          vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Setting up GitHub backup...', cancellable: false }, async () => {
            const result = await githubBackupService.setupRepo();
            vscode.window.showInformationMessage(result.message);
          });
        }
      }
      // Refresh hub with updated state
      const updatedCfg = githubBackupService.getConfig();
      const cfg2 = vscode.workspace.getConfiguration('chassis');
      const g = cfg2.get<string>('geminiApiKey') || '';
      const o = cfg2.get<string>('openaiApiKey') || '';
      const a = cfg2.get<string>('anthropicApiKey') || '';
      const k = cfg2.get<string>('kimiApiKey') || '';
      if (_panel) {
        _panel.webview.html = getHubHtml(!!(g||o||a||k), g, o, a, k, !!(updatedCfg.enabled && updatedCfg.token), updatedCfg.username, updatedCfg.repoName);
      }
    } else if (msg.type === 'toggle-guardian') {
      await vscode.workspace.getConfiguration('chassis').update('guardianEnabled', !!msg.enabled, true);
    } else if (msg.type === 'open-project-setup') {
      vscode.commands.executeCommand('chassis.showSetupProgress');
    } else if (msg.type === 'open-chat') {
      vscode.commands.executeCommand('chassis.openChatPanel');
    } else if (msg.type === 'open-blueprint') {
      vscode.commands.executeCommand('chassis.wizardRetrofit');
    }
  });
}

function statusBadge(ok: boolean, okLabel: string, notLabel: string): string {
  return ok
    ? `<span style="background:#1a7a3a;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${okLabel}</span>`
    : `<span style="background:#b85c00;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${notLabel}</span>`;
}

function getHubHtml(hasAI: boolean, geminiKey: string, openaiKey: string, anthropicKey: string, kimiKey: string, hasGitHub: boolean, githubUser: string, githubRepo: string, guardianActive = false, guardianAI = 'none', workerAI = 'none', guardianCfg = true): string {
  const aiDetail = hasAI
    ? [geminiKey && 'Gemini', openaiKey && 'OpenAI', anthropicKey && 'Anthropic', kimiKey && 'Kimi'].filter(Boolean).join(', ')
    : 'No API key set';
  const githubDetail = hasGitHub ? `${githubUser}/${githubRepo || 'auto-named'}` : 'Not connected';

  const githubBtnLabel = hasGitHub ? 'Manage Backup' : 'Connect GitHub';
  const githubBtnClass = hasGitHub ? 'btn-secondary' : 'btn-primary';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; color: #d4d4d4; margin: 0; padding: 0; }
    .hub { max-width: 680px; margin: 48px auto; padding: 0 24px; }
    h1 { font-size: 26px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 36px; }
    .section { background: #252526; border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; display: flex; align-items: center; gap: 16px; }
    .section-icon { font-size: 28px; min-width: 36px; text-align: center; }
    .section-body { flex: 1; }
    .section-title { font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 4px; }
    .section-detail { font-size: 12px; color: #888; margin-bottom: 8px; }
    .btn { display: inline-block; padding: 7px 18px; border-radius: 5px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-primary { background: #0078d4; color: #fff; }
    .btn-secondary { background: #3a3a3a; color: #ccc; }
    .btn:hover { opacity: 0.85; }
    .divider { border: none; border-top: 1px solid #333; margin: 8px 0 20px; }
    .footer { text-align: center; color: #555; font-size: 12px; margin-top: 32px; }
    /* GitHub modal overlay */
    #gh-overlay { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:999; align-items:center; justify-content:center; }
    #gh-overlay.open { display:flex; }
    #gh-modal { background:#252526; border:1px solid #444; border-radius:12px; padding:28px 32px; width:460px; max-width:90vw; box-shadow:0 8px 32px rgba(0,0,0,0.5); }
    #gh-modal h2 { font-size:17px; font-weight:700; color:#fff; margin:0 0 4px; }
    #gh-modal .sub { font-size:12px; color:#888; margin-bottom:20px; }
    .gh-field { margin-bottom:14px; }
    .gh-field label { display:block; font-size:12px; color:#aaa; margin-bottom:5px; font-weight:600; }
    .gh-field input, .gh-field select { width:100%; box-sizing:border-box; padding:8px 10px; background:#1e1e1e; border:1px solid #555; border-radius:6px; color:#d4d4d4; font-size:13px; font-family:inherit; }
    .gh-field input:focus, .gh-field select:focus { outline:none; border-color:#0078d4; }
    .gh-hint { font-size:11px; color:#666; margin-top:3px; }
    .gh-btns { display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }
  </style>
  </head><body>
  <div class="hub">
    <h1>⚙️ CHASSIS Setup</h1>
    <p class="subtitle">Configure your tools once — everything works from here.</p>

    <div class="section">
      <div class="section-icon">🤖</div>
      <div class="section-body">
        <div class="section-title">AI Provider ${statusBadge(hasAI, '✓ Connected', '! Required')}</div>
        <div class="section-detail">${aiDetail}</div>
        <button class="btn ${hasAI ? 'btn-secondary' : 'btn-primary'}" onclick="send('open-api-setup')">${hasAI ? 'Manage Keys' : 'Set Up AI Keys'}</button>
      </div>
    </div>

    <div class="section">
      <div class="section-icon">🐙</div>
      <div class="section-body">
        <div class="section-title">GitHub Backup ${statusBadge(hasGitHub, '✓ Connected', '○ Optional')}</div>
        <div class="section-detail">${githubDetail}</div>
        <button class="btn ${githubBtnClass}" onclick="openGitHubModal()">${githubBtnLabel}</button>
      </div>
    </div>

    <div class="section">
      <div class="section-icon">🛡️</div>
      <div class="section-body">
        <div class="section-title">Guardian AI ${guardianActive && guardianCfg
          ? `${statusBadge(true, '✓ Active', '')} <span style="font-size:11px;color:#888;font-weight:400;margin-left:6px;">${guardianAI.charAt(0).toUpperCase()+guardianAI.slice(1)} watches ${workerAI.charAt(0).toUpperCase()+workerAI.slice(1)}</span>`
          : statusBadge(false, '', guardianActive ? '○ Disabled' : '○ Needs 2+ AI keys')}</div>
        <div class="section-detail">${guardianActive
          ? `<strong>${guardianAI.charAt(0).toUpperCase()+guardianAI.slice(1)}</strong> silently reviews every response from <strong>${workerAI.charAt(0).toUpperCase()+workerAI.slice(1)}</strong> — catching hallucinations, wrong answers, and blueprint drift before you see them.`
          : 'Add a second AI key to enable Guardian mode. The higher-ranked AI becomes the reviewer of the other.'}</div>
        ${guardianActive ? `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;"><input type="checkbox" id="guardian-toggle" ${guardianCfg ? 'checked' : ''} onchange="send('toggle-guardian',{enabled:this.checked})" style="width:auto;" /> Enable Guardian review</label>` : `<button class="btn btn-secondary" onclick="send('open-api-setup')">Add a second AI key →</button>`}
      </div>
    </div>

    <hr class="divider">
    <p style="font-size:13px;color:#888;margin-bottom:12px;">Per-project setup (run these after opening a project folder):</p>

    <div class="section">
      <div class="section-icon">📋</div>
      <div class="section-body">
        <div class="section-title">Project Setup Checklist</div>
        <div class="section-detail">Blueprint, annotations, sessions — 10-step checklist for each project.</div>
        <button class="btn btn-secondary" onclick="send('open-project-setup')">View Checklist</button>
      </div>
    </div>

    <div class="section">
      <div class="section-icon">🗺️</div>
      <div class="section-body">
        <div class="section-title">Blueprint Interview (5 W's)</div>
        <div class="section-detail">Define WHO, WHAT, WHERE, WHEN, WHY for your current project.</div>
        <button class="btn btn-secondary" onclick="send('open-blueprint')">Start Blueprint</button>
      </div>
    </div>

    <hr class="divider">
    <div style="text-align:center;">
      <button class="btn btn-primary" style="padding:10px 32px;font-size:14px;" onclick="send('open-chat')">Open CHASSIS Chat →</button>
    </div>

    <p class="footer">CHASSIS — Your AI coding partner. Not just an extension — a system.</p>
  </div>

  <!-- GitHub setup modal (centered, in-page) -->
  <div id="gh-overlay" onclick="if(event.target===this)closeGitHubModal()">
    <div id="gh-modal">
      <h2>🐙 Connect GitHub Backup</h2>
      <p class="sub">Your code will auto-backup to a private GitHub repo after every build.</p>
      <div class="gh-field">
        <label>GitHub Personal Access Token <span style="color:#e05c5c">*</span></label>
        <input id="gh-token" type="password" placeholder="ghp_..." value="${hasGitHub ? '••••••••••••••••' : ''}" />
        <div class="gh-hint">Needs <strong>repo</strong> scope. <a href="https://github.com/settings/tokens/new?scopes=repo" style="color:#4a9eff;">Create one here ↗</a></div>
      </div>
      <div class="gh-field">
        <label>GitHub Username <span style="color:#e05c5c">*</span></label>
        <input id="gh-user" type="text" placeholder="your-github-username" value="${githubUser || ''}" />
      </div>
      <div class="gh-field">
        <label>Repository Name <span style="color:#888;font-weight:400;">(optional — uses project folder name if blank)</span></label>
        <input id="gh-repo" type="text" placeholder="auto-named from project" value="${githubRepo || ''}" />
      </div>
      <div class="gh-field">
        <label>Auto-backup frequency</label>
        <select id="gh-interval">
          <option value="0">After every build only</option>
          <option value="15">Every 15 minutes</option>
          <option value="30">Every 30 minutes</option>
          <option value="60">Every hour</option>
        </select>
      </div>
      <div class="gh-field" style="display:flex;align-items:center;gap:8px;">
        <input id="gh-private" type="checkbox" checked style="width:auto;margin:0;" />
        <label for="gh-private" style="margin:0;cursor:pointer;">Make repository private (recommended)</label>
      </div>
      <div id="gh-err" style="color:#e05c5c;font-size:12px;margin-top:8px;display:none;"></div>
      <div class="gh-btns">
        <button class="btn btn-secondary" onclick="closeGitHubModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveGitHub()">Save & Connect</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(type, extra) { vscode.postMessage(Object.assign({ type }, extra || {})); }
    function openGitHubModal() { document.getElementById('gh-overlay').classList.add('open'); }
    function closeGitHubModal() { document.getElementById('gh-overlay').classList.remove('open'); }
    function saveGitHub() {
      const token = document.getElementById('gh-token').value.trim();
      const username = document.getElementById('gh-user').value.trim();
      const err = document.getElementById('gh-err');
      if (!token || token === '••••••••••••••••') { err.textContent = 'Token is required.'; err.style.display='block'; return; }
      if (!username) { err.textContent = 'Username is required.'; err.style.display='block'; return; }
      err.style.display = 'none';
      send('save-github', {
        token,
        username,
        repoName: document.getElementById('gh-repo').value.trim(),
        interval: document.getElementById('gh-interval').value,
        isPrivate: document.getElementById('gh-private').checked,
      });
      closeGitHubModal();
    }
  </script>
  </body></html>`;
}
