// [SCOPE] CHASSIS Setup Hub — HTML template for the setup webview panel
// Imported by setupHub.ts. statusBadge is a local helper, not exported.

function statusBadge(ok: boolean, okLabel: string, notLabel: string): string {
  return ok
    ? `<span style="background:#1a7a3a;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${okLabel}</span>`
    : `<span style="background:#b85c00;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${notLabel}</span>`;
}

export function getHubHtml(hasAI: boolean, geminiKey: string, openaiKey: string, anthropicKey: string, kimiKey: string, hasGitHub: boolean, githubUser: string, githubRepo: string, guardianActive = false, guardianAI = 'none', workerAI = 'none', guardianCfg = true): string {
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
    <h1>&#x2699;&#xFE0F; CHASSIS Setup</h1>
    <p class="subtitle">Configure your tools once -- everything works from here.</p>
    <div class="section">
      <div class="section-icon">&#x1F916;</div>
      <div class="section-body">
        <div class="section-title">AI Provider ${statusBadge(hasAI, 'Connected', 'Required')}</div>
        <div class="section-detail">${aiDetail}</div>
        <button class="btn ${hasAI ? 'btn-secondary' : 'btn-primary'}" onclick="send('open-api-setup')">${hasAI ? 'Manage Keys' : 'Set Up AI Keys'}</button>
      </div>
    </div>
    <div class="section">
      <div class="section-icon">&#x1F419;</div>
      <div class="section-body">
        <div class="section-title">GitHub Backup ${statusBadge(hasGitHub, 'Connected', 'Optional')}</div>
        <div class="section-detail">${githubDetail}</div>
        <button class="btn ${githubBtnClass}" onclick="openGitHubModal()">${githubBtnLabel}</button>
      </div>
    </div>
    <div class="section">
      <div class="section-icon">&#x1F6E1;&#xFE0F;</div>
      <div class="section-body">
        <div class="section-title">Guardian AI ${guardianActive && guardianCfg
          ? `${statusBadge(true, 'Active', '')} <span style="font-size:11px;color:#888;font-weight:400;margin-left:6px;">${guardianAI.charAt(0).toUpperCase()+guardianAI.slice(1)} watches ${workerAI.charAt(0).toUpperCase()+workerAI.slice(1)}</span>`
          : statusBadge(false, '', guardianActive ? 'Disabled' : 'Needs 2+ AI keys')}</div>
        <div class="section-detail">${guardianActive
          ? `<strong>${guardianAI.charAt(0).toUpperCase()+guardianAI.slice(1)}</strong> silently reviews every response from <strong>${workerAI.charAt(0).toUpperCase()+workerAI.slice(1)}</strong> -- catching hallucinations, wrong answers, and blueprint drift before you see them.`
          : 'Add a second AI key to enable Guardian mode. The higher-ranked AI becomes the reviewer of the other.'}</div>
        ${guardianActive ? `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;"><input type="checkbox" id="guardian-toggle" ${guardianCfg ? 'checked' : ''} onchange="send('toggle-guardian',{enabled:this.checked})" style="width:auto;" /> Enable Guardian review</label>` : `<button class="btn btn-secondary" onclick="send('open-api-setup')">Add a second AI key &#x2192;</button>`}
      </div>
    </div>
    <hr class="divider">
    <p style="font-size:13px;color:#888;margin-bottom:12px;">Per-project setup (run these after opening a project folder):</p>
    <div class="section">
      <div class="section-icon">&#x1F4CB;</div>
      <div class="section-body">
        <div class="section-title">Project Setup Checklist</div>
        <div class="section-detail">Blueprint, annotations, sessions -- 10-step checklist for each project.</div>
        <button class="btn btn-secondary" onclick="send('open-project-setup')">View Checklist</button>
      </div>
    </div>
    <div class="section">
      <div class="section-icon">&#x1F5FA;&#xFE0F;</div>
      <div class="section-body">
        <div class="section-title">Blueprint Interview (5 W's)</div>
        <div class="section-detail">Define WHO, WHAT, WHERE, WHEN, WHY for your current project.</div>
        <button class="btn btn-secondary" onclick="send('open-blueprint')">Start Blueprint</button>
      </div>
    </div>
    <hr class="divider">
    <div style="text-align:center;">
      <button class="btn btn-primary" style="padding:10px 32px;font-size:14px;" onclick="send('open-chat')">Open CHASSIS Chat &#x2192;</button>
    </div>
    <p class="footer">CHASSIS -- Your AI coding partner. Not just an extension -- a system.</p>
  </div>
  <div id="gh-overlay" onclick="if(event.target===this)closeGitHubModal()">
    <div id="gh-modal">
      <h2>&#x1F419; Connect GitHub Backup</h2>
      <p class="sub">Your code will auto-backup to a private GitHub repo after every build.</p>
      <div class="gh-field">
        <label>GitHub Personal Access Token <span style="color:#e05c5c">*</span></label>
        <input id="gh-token" type="password" placeholder="ghp_..." value="${hasGitHub ? '&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;' : ''}" />
        <div class="gh-hint">Needs <strong>repo</strong> scope. <a href="https://github.com/settings/tokens/new?scopes=repo" style="color:#4a9eff;">Create one here</a></div>
      </div>
      <div class="gh-field">
        <label>GitHub Username <span style="color:#e05c5c">*</span></label>
        <input id="gh-user" type="text" placeholder="your-github-username" value="${githubUser || ''}" />
      </div>
      <div class="gh-field">
        <label>Repository Name <span style="color:#888;font-weight:400;">(optional -- uses project folder name if blank)</span></label>
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
        <button class="btn btn-primary" onclick="saveGitHub()">Save &amp; Connect</button>
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
      if (!token || token.includes('•')) { err.textContent = 'Token is required.'; err.style.display='block'; return; }
      if (!username) { err.textContent = 'Username is required.'; err.style.display='block'; return; }
      err.style.display = 'none';
      send('save-github', { token, username, repoName: document.getElementById('gh-repo').value.trim(), interval: document.getElementById('gh-interval').value, isPrivate: document.getElementById('gh-private').checked });
      closeGitHubModal();
    }
  <\/script>
  </body></html>`;
}
