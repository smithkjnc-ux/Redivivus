// [SCOPE] CHASSIS Sidebar View — displays CHASSIS function buttons in activity bar panel
// Provides quick access to all CHASSIS features from the sidebar.

import * as vscode from 'vscode';

export function getSidebarHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 12px; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
    .btn { 
      display: block; width: 100%; padding: 8px 10px; margin-bottom: 6px;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
      text-align: left; display: flex; align-items: center; gap: 6px;
    }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn.secondary { 
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
    }
    .btn.secondary:hover { background: var(--vscode-list-hoverBackground); }
    .icon { font-size: 14px; }
    .header { padding: 0 0 12px 0; border-bottom: 1px solid var(--vscode-editorGroup-border); margin-bottom: 12px; }
    .header-title { font-size: 14px; font-weight: 600; letter-spacing: 1px; }
    .header-sub { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">C H A S S I S</div>
    <div class="header-sub">Your AI coding organizer</div>
  </div>

  <div class="section">
    <div class="section-title">Core</div>
    <button class="btn" data-cmd="chassis.blueprint"><span class="icon">📋</span>Blueprint</button>
    <button class="btn" data-cmd="chassis.startSession"><span class="icon">▶️</span>Start Session</button>
    <button class="btn" data-cmd="chassis.endSession"><span class="icon">⏹️</span>End Session</button>
    <button class="btn" data-cmd="chassis.switchAI"><span class="icon">🤖</span>Switch AI</button>
    <button class="btn secondary" data-cmd="chassis.viewUsageInChat"><span class="icon">📊</span>View Usage</button>
    <button class="btn secondary" data-cmd="chassis.openSettingsInChat"><span class="icon">⚙️</span>AI API Setup</button>
    <button class="btn secondary" data-cmd="chassis.openChatPanel"><span class="icon">💬</span>Open Chat</button>
  </div>

  <div class="section">
    <div class="section-title">Project</div>
    <button class="btn secondary" data-cmd="chassis.init"><span class="icon">🆕</span>New Project</button>
    <button class="btn secondary" data-cmd="chassis.wizardRetrofit"><span class="icon">📂</span>Open Project</button>
    <button class="btn secondary" data-cmd="chassis.retrofit"><span class="icon">🔧</span>Retrofit</button>
    <button class="btn secondary" data-cmd="chassis.generateRules"><span class="icon">📜</span>Generate Rules</button>
  </div>

  <div class="section">
    <div class="section-title">Analyze & Review</div>
    <button class="btn secondary" data-cmd="chassis.analyze"><span class="icon">🔍</span>Scan Project</button>
    <button class="btn secondary" data-cmd="chassis.analyzeFile"><span class="icon">📄</span>Check File</button>
    <button class="btn secondary" data-cmd="chassis.reviewFile"><span class="icon">👁️</span>AI Review</button>
    <button class="btn secondary" data-cmd="chassis.restructureFile"><span class="icon">🏗️</span>Clean File</button>
  </div>

  <div class="section">
    <div class="section-title">Vault</div>
    <button class="btn" data-cmd="chassis.openVault"><span class="icon">💾</span>Open Vault</button>
    <button class="btn secondary" data-cmd="chassis.validateVault"><span class="icon">✅</span>Validate Vault</button>
    <button class="btn secondary" data-cmd="chassis.log"><span class="icon">📜</span>Work Log</button>
    <button class="btn secondary" data-cmd="chassis.deadends"><span class="icon">💀</span>Dead Ends</button>
    <button class="btn secondary" data-cmd="chassis.showChatGettingStarted"><span class="icon">❓</span>Getting Started</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd');
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
