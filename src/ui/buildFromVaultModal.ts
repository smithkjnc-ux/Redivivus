// [SCOPE] Build from Vault Modal — standalone WebView modal for task input

import * as vscode from 'vscode';
import { getNonce } from './getNonce.js';

export class BuildFromVaultModal {
  private static currentPanel: BuildFromVaultModal | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _resolve: ((result: { task: string; targetFile: string }) => void) | null = null;
  private _reject: ((reason?: any) => void) | null = null;

  public static async show(prefill?: { task?: string; targetFile?: string }): Promise<{ task: string; targetFile: string }> {
    if (this.currentPanel) {
      this.currentPanel._panel.reveal(vscode.ViewColumn.One);
      // Update prefill on existing panel
      if (prefill) {
        this.currentPanel._panel.webview.postMessage({ type: 'prefill', task: prefill.task || '', targetFile: prefill.targetFile || '' });
      }
      return new Promise((resolve, reject) => {
        this.currentPanel!._resolve = resolve;
        this.currentPanel!._reject = reject;
      });
    }

    const panel = vscode.window.createWebviewPanel(
      'buildFromVaultModal',
      'Build from Vault',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );

    const modal = new BuildFromVaultModal(panel, prefill);
    this.currentPanel = modal;

    return new Promise((resolve, reject) => {
      modal._resolve = resolve;
      modal._reject = reject;
    });
  }

  private constructor(panel: vscode.WebviewPanel, private prefill?: { task?: string; targetFile?: string }) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => this.dispose());
    this._panel.webview.onDidReceiveMessage(message => this._onMessage(message));
  }

  private _getHtml(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 24px;
      color: #e6edf3;
      background: #0d1117;
      margin: 0;
    }
    h1 { margin: 0 0 16px 0; font-size: 18px; font-weight: 600; }
    p { margin: 0 0 16px 0; font-size: 13px; color: #8b949e; }
    label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500; }
    input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #e6edf3;
      font-size: 13px;
      margin-bottom: 16px;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: #58a6ff;
    }
    input[type="text"]::placeholder { color: #6e7681; }
    .buttons { display: flex; gap: 8px; justify-content: flex-end; }
    button {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: none;
    }
    .btn-cancel { background: #21262d; color: #e6edf3; }
    .btn-cancel:hover { background: #30363d; }
    .btn-build { background: #238636; color: #fff; }
    .btn-build:hover { background: #2ea043; }
  </style>
</head>
<body>
  <h1>🏗️ Build from Vault</h1>
  <p>Describe what you want to build. CHASSIS will search your vault for reusable code and fill in any gaps.</p>
  
  <label for="task">Task description *</label>
  <input type="text" id="task" placeholder="e.g. add push notifications when a new listing is posted" autofocus value="${this.prefill?.task ? this.prefill.task.replace(/"/g, '&quot;') : ''}">
  
  <label for="targetFile">Target file (optional)</label>
  <input type="text" id="targetFile" placeholder="e.g. src/features/listings/notificationService.ts" value="${this.prefill?.targetFile ? this.prefill.targetFile.replace(/"/g, '&quot;') : ''}">
  
  <div class="buttons">
    <button class="btn-cancel" id="cancel">Cancel</button>
    <button class="btn-build" id="build">Build</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Handle prefill from postMessage (when panel already exists)
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'prefill') {
        if (msg.task) document.getElementById('task').value = msg.task;
        if (msg.targetFile) document.getElementById('targetFile').value = msg.targetFile;
      }
    });
    
    document.getElementById('cancel').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });
    
    document.getElementById('build').addEventListener('click', () => {
      const task = document.getElementById('task').value.trim();
      const targetFile = document.getElementById('targetFile').value.trim();
      if (!task) {
        document.getElementById('task').focus();
        document.getElementById('task').style.borderColor = '#f85149';
        return;
      }
      vscode.postMessage({ type: 'build', task, targetFile });
    });
    
    document.getElementById('task').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('build').click();
      }
    });

    // Focus end of task field if pre-filled
    const taskEl = document.getElementById('task');
    if (taskEl.value) {
      taskEl.focus();
      taskEl.setSelectionRange(taskEl.value.length, taskEl.value.length);
    }
  </script>
</body>
</html>`;
  }

  private _onMessage(message: any): void {
    if (message.type === 'cancel') {
      this._reject?.(new Error('Cancelled'));
      this.dispose();
    } else if (message.type === 'build') {
      this._resolve?.({ task: message.task, targetFile: message.targetFile });
      this.dispose();
    }
  }

  private dispose(): void {
    BuildFromVaultModal.currentPanel = undefined;
    this._panel.dispose();
  }
}
