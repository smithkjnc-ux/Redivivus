// [SCOPE] CHASSIS Sidebar View — structured collapsible sections with action buttons
// [WARN] Rule 13: No non-ASCII chars in injected scripts. Emoji in HTML only, never in <script> blocks.

import * as vscode from 'vscode';

export function getSidebarHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 8px 10px; }
    .section { margin-bottom: 4px; border-radius: 4px; overflow: hidden; }
    .section-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 6px; cursor: pointer; user-select: none;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--vscode-descriptionForeground);
      border-radius: 3px;
    }
    .section-header:hover { background: var(--vscode-list-hoverBackground); }
    .section-header .chevron { font-size: 9px; transition: transform 0.15s; }
    .section-header.collapsed .chevron { transform: rotate(-90deg); }
    .section-body { padding: 2px 0 6px 0; }
    .section-body.hidden { display: none; }
    .item {
      display: flex; align-items: center; gap: 7px;
      padding: 5px 8px; border-radius: 3px; cursor: pointer;
      font-size: 12px; color: var(--vscode-foreground);
      border: none; background: none; width: 100%; text-align: left;
    }
    .item:hover { background: var(--vscode-list-hoverBackground); }
    .item.disabled { opacity: 0.4; cursor: default; }
    .item.primary { color: var(--vscode-terminal-ansiBlue); font-weight: 600; }
    .item .desc { margin-left: auto; font-size: 10px; opacity: 0.6; }
    .item .badge { font-size: 9px; padding: 1px 5px; border-radius: 8px; background: rgba(59,157,255,0.2); color: #3b9dff; margin-left: auto; }
  </style>
</head>
<body>

  <!-- [DONE] Profile section activated -->
  <div class="section">
    <div class="section-header collapsed" data-section="profile">
      <span>&#x2014; PROFILE</span><span class="chevron">&#9660;</span>
    </div>
    <div class="section-body hidden" id="body-profile">
      <button class="item" data-cmd="chassis.openProfile">&#128100; User Profile</button>
      <button class="item" data-cmd="chassis.webSearch">&#128269; Web Search</button>
    </div>
  </div>

  <div class="section">
    <div class="section-header collapsed" data-section="setup">
      <span>&#x2014; SETUP</span><span class="chevron">&#9660;</span>
    </div>
    <div class="section-body hidden" id="body-setup">
      <button class="item" data-cmd="chassis.guide">&#10067; Getting Started</button>
      <button class="item" data-cmd="chassis.openSettings">&#128273; AI API Setup</button>
      <button class="item" data-cmd="chassis.generateRules">&#128196; Generate Rules</button>
      <button class="item" data-cmd="chassis.retrofit">&#128296; Retrofit</button>
    </div>
  </div>

  <!-- SESSION -->
  <div class="section">
    <div class="section-header collapsed" data-section="session">
      <span>&#x2014; SESSION</span><span class="chevron">&#9660;</span>
    </div>
    <div class="section-body hidden" id="body-session">
      <button class="item" data-cmd="chassis.startSession">&#9654; Start Session</button>
      <button class="item" data-cmd="chassis.endSession">&#9899; End Session</button>
      <button class="item" data-cmd="chassis.switchAI">&#10024; Switch AI</button>
      <button class="item" data-cmd="chassis.viewUsage">&#128202; View Usage</button>
    </div>
  </div>

  <!-- PROJECT -->
  <div class="section">
    <div class="section-header collapsed" data-section="project">
      <span>&#x2014; PROJECT</span><span class="chevron">&#9660;</span>
    </div>
    <div class="section-body hidden" id="body-project">
      <button class="item" data-cmd="chassis.wizard">&#128196; New Project</button>
      <button class="item" data-cmd="chassis.openProject">&#128193; Open Project</button>
      <button class="item" data-cmd="chassis.blueprint">&#128218; Blueprint</button>
      <button class="item" data-cmd="chassis.showMap">&#128506; Architecture Map</button>
    </div>
  </div>

  <!-- BUILD & VAULT -->
  <div class="section">
    <div class="section-header collapsed" data-section="build">
      <span>&#x2014; BUILD &amp; VAULT</span><span class="chevron">&#9660;</span>
    </div>
    <div class="section-body hidden" id="body-build">
      <button class="item primary" data-cmd="chassis.openChat">&#128172; Open Chat <span class="badge">primary</span></button>
      <button class="item" data-cmd="chassis.openVault">&#128190; Open Vault</button>
      <button class="item" data-cmd="chassis.buildFromVault">&#128230; Build from Vault</button>
      <button class="item" data-cmd="chassis.validateVault">&#10003; Validate Vault</button>
      <button class="item" data-cmd="chassis.configureGitHubBackup">&#128279; GitHub Backup</button>
    </div>
  </div>

  <!-- REVIEW -->
  <div class="section">
    <div class="section-header collapsed" data-section="review">
      <span>&#x2014; REVIEW</span><span class="chevron">&#9660;</span>
    </div>
    <div class="section-body hidden" id="body-review">
      <button class="item" data-cmd="chassis.analyze">&#128269; Scan Project</button>
      <button class="item" data-cmd="chassis.profileRuntime">&#x26A1; Profile Runtime</button>
      <button class="item" data-cmd="chassis.checkFileHealth">&#128196; Check File</button>
      <button class="item" data-cmd="chassis.cleanUpFile">&#10024; Clean File</button>
    </div>
  </div>

  <!-- HISTORY -->
  <div class="section">
    <div class="section-header collapsed" data-section="history">
      <span>&#x2014; HISTORY</span><span class="chevron">&#9660;</span>
    </div>
    <div class="section-body hidden" id="body-history">
      <button class="item" data-cmd="chassis.savePoint">&#128336; Save Points</button>
      <button class="item" data-cmd="chassis.log">&#128218; Work Log</button>
      <button class="item" data-cmd="chassis.deadends">&#9888; Dead Ends</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('.section-header').forEach(function(hdr) {
      hdr.addEventListener('click', function() {
        var section = hdr.getAttribute('data-section');
        var body = document.getElementById('body-' + section);
        var collapsed = hdr.classList.contains('collapsed');
        if (collapsed) {
          hdr.classList.remove('collapsed');
          body.classList.remove('hidden');
        } else {
          hdr.classList.add('collapsed');
          body.classList.add('hidden');
        }
      });
    });

    document.querySelectorAll('.item[data-cmd]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cmd = btn.getAttribute('data-cmd');
        if (cmd) { vscode.postMessage({ type: 'run-command', command: cmd }); }
      });
    });
  </script>
</body>
</html>`;
}

export class ChassisSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'chassisSidebar';
  private _view?: vscode.WebviewView;

  refresh(): void {
    if (this._view) { this._view.webview.html = getSidebarHtml(); }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getSidebarHtml();
    
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'run-command') {
        const command = msg.command;
        if (command) {
          try {
            await vscode.commands.executeCommand(command);
          } catch (err) {
            vscode.window.showErrorMessage(`Command failed: ${err instanceof Error ? err.message : 'unknown'}`);
          }
        }
      }
    });
  }
}
