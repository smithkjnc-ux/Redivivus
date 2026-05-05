// [SCOPE] CHASSIS API Setup — provides webview panel AND chat panel for configuring AI API keys
// Chat panel shows read-only status, webview panel allows editing with Apply button.

import * as vscode from 'vscode';
import { ChatPanel } from '../ui/chatPanel.js';

export function registerApiSetupCommand(context: vscode.ExtensionContext): void {
  // Full settings webview panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openSettings', async () => {
      ApiSetupPanel.createOrShow(context);
    })
  );

  // Chat panel version - shows status only
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openSettingsInChat', async () => {
      if (!ChatPanel.currentPanel) {
        await vscode.commands.executeCommand('chassis.openChatPanel');
        setTimeout(() => showApiStatusInChat(), 300);
      } else {
        showApiStatusInChat();
      }
    })
  );
}

function showApiStatusInChat(): void {
  const config = vscode.workspace.getConfiguration('chassis');
  const providers = [
    { name: 'Gemini', key: config.get<string>('geminiApiKey'), icon: '🤖' },
    { name: 'Claude', key: config.get<string>('claudeApiKey'), icon: '🧠' },
    { name: 'OpenAI', key: config.get<string>('openaiApiKey'), icon: '⚡' },
    { name: 'Groq', key: config.get<string>('groqApiKey'), icon: '🔥' },
    { name: 'xAI', key: config.get<string>('xaiApiKey'), icon: '🚀' },
    { name: 'Kimi', key: config.get<string>('kimiApiKey'), icon: '🔮' },
  ];

  const providerHtml = providers.map(p => {
    const isSet = p.key && p.key.length > 0;
    const status = isSet ? '✅ Configured' : '❌ Not set';
    const bg = isSet ? 'rgba(78,201,89,0.1)' : 'rgba(255,83,79,0.1)';
    const border = isSet ? '#4ec959' : '#ff534f';
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:8px;background:${bg};border-left:3px solid ${border};border-radius:0 4px 4px 0;">
        <span><strong>${p.icon} ${p.name}</strong></span>
        <span style="font-size:12px;">${status}</span>
      </div>
    `;
  }).join('');

  const content = `
    <div style="font-size:13px;">
      <p style="margin-bottom:16px;">Configure your AI provider API keys to use CHASSIS with different AI models:</p>
      ${providerHtml}
      <div style="margin-top:16px;padding:12px;background:var(--vscode-input-background);border-radius:6px;font-size:12px;">
        <strong>💡 How to configure:</strong><br>
        Click "Open Full Settings" below to enter your API keys, or use VS Code settings directly.
      </div>
      <button data-cmd="chassis.openSettings" style="margin-top:12px;padding:8px 16px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;cursor:pointer;">
        ⚙️ Open Full Settings
      </button>
    </div>
  `;

  ChatPanel.currentPanel?.showPanel('api-status', '🔐 API Setup', content);
}

class ApiSetupPanel {
  public static currentPanel: ApiSetupPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    
    this._panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.type === 'save-keys') {
          const config = vscode.workspace.getConfiguration('chassis');
          
          if (msg.geminiKey !== undefined) {
            await config.update('geminiApiKey', msg.geminiKey || undefined, true);
          }
          if (msg.claudeKey !== undefined) {
            await config.update('claudeApiKey', msg.claudeKey || undefined, true);
          }
          if (msg.openaiKey !== undefined) {
            await config.update('openaiApiKey', msg.openaiKey || undefined, true);
          }
          if (msg.groqKey !== undefined) {
            await config.update('groqApiKey', msg.groqKey || undefined, true);
          }
          if (msg.xaiKey !== undefined) {
            await config.update('xaiApiKey', msg.xaiKey || undefined, true);
          }
          if (msg.kimiKey !== undefined) {
            await config.update('kimiApiKey', msg.kimiKey || undefined, true);
          }
          
          // Send confirmation back to webview
          this._panel.webview.postMessage({ type: 'saved', timestamp: new Date().toLocaleTimeString() });
          
          // Show success message
          vscode.window.showInformationMessage('✅ CHASSIS API keys applied successfully!');
        } else if (msg.type === 'open-vscode-settings') {
          await vscode.commands.executeCommand('workbench.action.openSettings', 'chassis');
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static createOrShow(context: vscode.ExtensionContext): void {
    if (ApiSetupPanel.currentPanel) {
      ApiSetupPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'chassisApiSetup',
      'CHASSIS API Setup',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    ApiSetupPanel.currentPanel = new ApiSetupPanel(panel, context);
  }

  private _getHtml(): string {
    const config = vscode.workspace.getConfiguration('chassis');
    const geminiKey = config.get<string>('geminiApiKey') || '';
    const claudeKey = config.get<string>('claudeApiKey') || '';
    const openaiKey = config.get<string>('openaiApiKey') || '';
    const groqKey = config.get<string>('groqApiKey') || '';
    const xaiKey = config.get<string>('xaiApiKey') || '';
    const kimiKey = config.get<string>('kimiApiKey') || '';

    const hasGemini = geminiKey.length > 0;
    const hasClaude = claudeKey.length > 0;
    const hasOpenAI = openaiKey.length > 0;

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
      padding: 20px; 
      max-width: 600px;
      margin: 0 auto;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 24px; }
    .provider { 
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .provider-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      margin-bottom: 8px;
    }
    .provider-name { font-weight: 600; font-size: 14px; }
    .provider-status { 
      font-size: 12px; 
      padding: 2px 8px; 
      border-radius: 12px;
    }
    .status-ok { background: rgba(78,201,89,0.2); color: #4ec959; }
    .status-missing { background: rgba(255,83,79,0.2); color: #ff534f; }
    .provider-desc { 
      font-size: 12px; 
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    input { 
      width: 100%;
      padding: 8px 12px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      color: var(--vscode-input-foreground);
      font-family: monospace;
      font-size: 13px;
    }
    input:focus { outline: none; border-color: var(--vscode-focusBorder); }
    .actions { 
      margin-top: 24px; 
      display: flex; 
      gap: 12px; 
      justify-content: center;
    }
    button { 
      padding: 10px 24px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { 
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
    }
    .apply-feedback {
      margin-top: 16px;
      padding: 12px;
      background: rgba(78,201,89,0.1);
      border-left: 3px solid #4ec959;
      border-radius: 0 4px 4px 0;
      display: none;
    }
    .apply-feedback.show { display: block; }
    .tip {
      margin-top: 24px;
      padding: 12px;
      background: var(--vscode-input-background);
      border-radius: 6px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .tip strong { color: var(--vscode-editor-foreground); }
  </style>
</head>
<body>
  <h1>🔐 CHASSIS API Setup</h1>
  <div class="subtitle">Configure your AI provider API keys</div>

  <div class="provider">
    <div class="provider-header">
      <span class="provider-name">🤖 Gemini (Google)</span>
      <span class="provider-status ${hasGemini ? 'status-ok' : 'status-missing'}">${hasGemini ? '✅ Configured' : '❌ Not set'}</span>
    </div>
    <div class="provider-desc">Free tier available. Fast responses. Recommended for most use cases.</div>
    <input type="password" id="gemini-key" placeholder="Enter Gemini API key" value="${geminiKey ? '•'.repeat(Math.min(geminiKey.length, 20)) : ''}" data-original="${geminiKey ? 'set' : ''}">
  </div>

  <div class="provider">
    <div class="provider-header">
      <span class="provider-name">🧠 Claude (Anthropic)</span>
      <span class="provider-status ${hasClaude ? 'status-ok' : 'status-missing'}">${hasClaude ? '✅ Configured' : '❌ Not set'}</span>
    </div>
    <div class="provider-desc">Paid API. Best for complex reasoning and long context.</div>
    <input type="password" id="claude-key" placeholder="Enter Claude API key" value="${claudeKey ? '•'.repeat(Math.min(claudeKey.length, 20)) : ''}" data-original="${claudeKey ? 'set' : ''}">
  </div>

  <div class="provider">
    <div class="provider-header">
      <span class="provider-name">⚡ OpenAI (GPT-4o)</span>
      <span class="provider-status ${hasOpenAI ? 'status-ok' : 'status-missing'}">${hasOpenAI ? '✅ Configured' : '❌ Not set'}</span>
    </div>
    <div class="provider-desc">Paid API. GPT-4o for high quality responses.</div>
    <input type="password" id="openai-key" placeholder="Enter OpenAI API key" value="${openaiKey ? '•'.repeat(Math.min(openaiKey.length, 20)) : ''}" data-original="${openaiKey ? 'set' : ''}">
  </div>

  <div class="actions">
    <button id="apply-btn">✅ Apply Changes</button>
    <button id="vscode-settings-btn" class="secondary">⚙️ Open VS Code Settings</button>
  </div>

  <div id="apply-feedback" class="apply-feedback">
    ✅ <strong>Keys applied successfully!</strong> You can now use CHASSIS with your configured AI providers.<br>
    <span id="apply-time"></span>
  </div>

  <div class="tip">
    <strong>💡 Tip:</strong> You can also set API keys via environment variables:
    <code>GEMINI_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>, etc.
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const applyBtn = document.getElementById('apply-btn');
    const feedback = document.getElementById('apply-feedback');
    const applyTime = document.getElementById('apply-time');
    const vscodeSettingsBtn = document.getElementById('vscode-settings-btn');

    applyBtn.addEventListener('click', () => {
      const geminiInput = document.getElementById('gemini-key');
      const claudeInput = document.getElementById('claude-key');
      const openaiInput = document.getElementById('openai-key');

      // Only send keys if they were actually entered (not the masked dots)
      const geminiValue = geminiInput.value.includes('•') && geminiInput.dataset.original === 'set' ? undefined : geminiInput.value;
      const claudeValue = claudeInput.value.includes('•') && claudeInput.dataset.original === 'set' ? undefined : claudeInput.value;
      const openaiValue = openaiInput.value.includes('•') && openaiInput.dataset.original === 'set' ? undefined : openaiInput.value;

      vscode.postMessage({
        type: 'save-keys',
        geminiKey: geminiValue,
        claudeKey: claudeValue,
        openaiKey: openaiValue
      });
    });

    vscodeSettingsBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'open-vscode-settings' });
    });

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'saved') {
        feedback.classList.add('show');
        applyTime.textContent = 'Applied at ' + msg.timestamp;
        setTimeout(() => {
          feedback.classList.remove('show');
        }, 5000);
      }
    });
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    ApiSetupPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}
