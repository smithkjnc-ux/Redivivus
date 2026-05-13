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

    const mask = (k: string) => k ? '•'.repeat(Math.min(k.length, 20)) : '';
    const st = (k: string) => k ? 'status-ok">✅ Configured' : 'status-missing">❌ Not set';

    const providers = [
      { id: 'gemini', icon: '🤖', name: 'Gemini (Google)', badge: 'FREE tier available', badgeColor: '#1a7a3a', desc: 'Fast, free tier available. Recommended for most users — great starting point.', link: 'https://aistudio.google.com/apikey', linkLabel: 'Get free key ↗', val: geminiKey },
      { id: 'claude', icon: '🧠', name: 'Claude (Anthropic)', badge: 'Paid', badgeColor: '#b85c00', desc: 'Best for complex reasoning, long documents, and nuanced code review.', link: 'https://console.anthropic.com/settings/keys', linkLabel: 'Get API key ↗', val: claudeKey },
      { id: 'openai', icon: '⚡', name: 'OpenAI (GPT-4o)', badge: 'Paid', badgeColor: '#b85c00', desc: 'GPT-4o — strong all-rounder for code, chat, and analysis.', link: 'https://platform.openai.com/api-keys', linkLabel: 'Get API key ↗', val: openaiKey },
      { id: 'groq',   icon: '🔥', name: 'Groq (Llama / Mixtral)', badge: 'FREE tier available', badgeColor: '#1a7a3a', desc: 'Extremely fast inference. Free tier available. Great for quick tasks.', link: 'https://console.groq.com/keys', linkLabel: 'Get free key ↗', val: groqKey },
      { id: 'xai',    icon: '🚀', name: 'xAI Grok', badge: 'Paid', badgeColor: '#b85c00', desc: "Elon Musk's Grok model — strong reasoning, real-time data awareness.", link: 'https://console.x.ai/', linkLabel: 'Get API key ↗', val: xaiKey },
      { id: 'kimi',   icon: '🔮', name: 'Kimi (Moonshot AI)', badge: 'Paid', badgeColor: '#b85c00', desc: 'Moonshot AI — very large context window, good for big codebases.', link: 'https://platform.moonshot.cn/', linkLabel: 'Get API key ↗', val: kimiKey },
    ];

    const providerCards = providers.map(p => `
  <div class="provider">
    <div class="provider-header">
      <span class="provider-name">${p.icon} ${p.name} <span style="font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px;background:${p.badgeColor}30;color:${p.badgeColor};vertical-align:middle;">${p.badge}</span></span>
      <span class="provider-status ${st(p.val)}</span>
    </div>
    <div class="provider-desc">${p.desc} <a href="${p.link}" style="color:#4a9eff;font-size:11px;">${p.linkLabel}</a></div>
    <input type="password" id="${p.id}-key" placeholder="Enter ${p.name} API key" value="${mask(p.val)}" data-original="${p.val ? 'set' : ''}">
  </div>`).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; max-width: 640px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 8px; font-size:13px; }
    .free-tip { background: rgba(26,122,58,0.12); border:1px solid #1a7a3a50; border-radius:8px; padding:10px 14px; margin-bottom:18px; font-size:12px; color:var(--vscode-foreground); }
    .free-tip strong { color:#4ec959; }
    .provider { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; }
    .provider-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap:wrap; gap:6px; }
    .provider-name { font-weight: 600; font-size: 13px; }
    .provider-status { font-size: 12px; padding: 2px 8px; border-radius: 12px; white-space:nowrap; }
    .status-ok { background: rgba(78,201,89,0.2); color: #4ec959; }
    .status-missing { background: rgba(255,83,79,0.2); color: #ff534f; }
    .provider-desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; line-height:1.5; }
    input { width: 100%; box-sizing:border-box; padding: 7px 10px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; color: var(--vscode-input-foreground); font-family: monospace; font-size: 12px; }
    input:focus { outline: none; border-color: var(--vscode-focusBorder); }
    .actions { margin-top: 20px; display: flex; gap: 12px; justify-content: center; }
    button { padding: 9px 22px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; }
    button:hover { opacity:0.85; }
    button.secondary { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .apply-feedback { margin-top:14px; padding:10px 14px; background:rgba(78,201,89,0.1); border-left:3px solid #4ec959; border-radius:0 4px 4px 0; display:none; font-size:13px; }
    .apply-feedback.show { display:block; }
    .tip { margin-top:20px; padding:10px 14px; background:var(--vscode-input-background); border-radius:6px; font-size:11px; color:var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h1>🔐 CHASSIS API Setup</h1>
  <div class="subtitle">Configure your AI provider API keys — you only need ONE to get started.</div>

  <div class="free-tip">💡 <strong>Free options:</strong> Gemini (Google) and Groq both have free tiers — no credit card needed. Start with either one and add others later.</div>

  ${providerCards}

  <div class="actions">
    <button id="apply-btn">✅ Apply Changes</button>
    <button id="vscode-settings-btn" class="secondary">⚙️ Open VS Code Settings</button>
  </div>

  <div id="apply-feedback" class="apply-feedback">
    ✅ <strong>Keys applied!</strong> CHASSIS will use your configured provider automatically.<br>
    <span id="apply-time" style="font-size:11px;opacity:0.7;"></span>
  </div>

  <div class="tip">
    💡 You can also set keys via environment variables: <code>GEMINI_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>GROQ_API_KEY</code>, <code>XAI_API_KEY</code>, <code>MOONSHOT_API_KEY</code>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('apply-btn').addEventListener('click', () => {
      const ids = ['gemini','claude','openai','groq','xai','kimi'];
      const payload = { type: 'save-keys' };
      ids.forEach(id => {
        const el = document.getElementById(id + '-key');
        const v = el.value;
        payload[id + 'Key'] = (v.includes('\u2022') && el.dataset.original === 'set') ? undefined : v;
      });
      vscode.postMessage(payload);
    });
    document.getElementById('vscode-settings-btn').addEventListener('click', () => {
      vscode.postMessage({ type: 'open-vscode-settings' });
    });
    window.addEventListener('message', e => {
      if (e.data.type === 'saved') {
        const fb = document.getElementById('apply-feedback');
        document.getElementById('apply-time').textContent = 'Applied at ' + e.data.timestamp;
        fb.classList.add('show');
        setTimeout(() => fb.classList.remove('show'), 5000);
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
