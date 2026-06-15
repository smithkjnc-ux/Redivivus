// [SCOPE] Redivivus API Setup — webview panel AND chat panel for configuring AI API keys.
// Keys written to VS Code SecretStorage (encrypted). HTML template -> apiSetupHtml.ts.
// [WARN] Keys are no longer stored in settings.json — they live in SecretStorage only.

import * as vscode from 'vscode';
import { ChatPanel } from '../ui/panels/chat/chatPanel';
import { getApiSetupHtml } from './apiSetupHtml.js';
import { checkProviderReachable } from '../core/diagnostics/selfDiagnosticChecks';

// [FIX] After keys change, refresh the chat panel so its pill + "No AI" banner update without a reload. No-op if closed.
async function refreshChatPanelForKeyChange(): Promise<void> {
  try {
    const { invalidateRosterCache } = await import('../services/ai/routingServiceRoster.js');
    invalidateRosterCache();
    const p = ChatPanel.currentPanel as { refresh?: () => void } | undefined;
    if (p && typeof p.refresh === 'function') { p.refresh(); }
  } catch { /* chat panel may not be open — nothing to refresh */ }
}

export function registerApiSetupCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.openSettings', async (providerHint?: string) => {
      ApiSetupPanel.createOrShow(context, providerHint);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.openSettingsInChat', async () => {
      if (!ChatPanel.currentPanel) {
        await vscode.commands.executeCommand('redivivus.openChatPanel');
        setTimeout(() => showApiStatusInChat(), 300);
      } else {
        showApiStatusInChat();
      }
    })
  );
}

function showApiStatusInChat(): void {
  const { getKeyCached } = require('../services/ai/secretKeyStore.js') as typeof import('../services/ai/secretKeyStore.js');
  const config = vscode.workspace.getConfiguration('redivivus');
  const disabled = config.get<string[]>('disabledProviders') || [];
  const providers = [
    { id: 'gemini', name: 'Gemini',  key: getKeyCached('gemini'), icon: '&#x1F916;' },
    { id: 'claude', name: 'Claude',  key: getKeyCached('claude'), icon: '&#x1F9E0;' },
    { id: 'openai', name: 'OpenAI',  key: getKeyCached('openai'), icon: '&#x26A1;' },
    { id: 'groq',   name: 'Groq',    key: getKeyCached('groq'),   icon: '&#x1F525;' },
    { id: 'xai',    name: 'xAI',     key: getKeyCached('xai'),    icon: '&#x1F680;' },
    { id: 'kimi',   name: 'Kimi',    key: getKeyCached('kimi'),   icon: '&#x1F52E;' },
    { id: 'deepseek', name: 'DeepSeek', key: getKeyCached('deepseek'), icon: '&#x1F40B;' },
  ];
  const providerHtml = providers.map(p => {
    const isSet = p.key && p.key.length > 0;
    const isDisabled = disabled.includes(p.id);
    let status = '&#x274C; Not set';
    let bg = 'rgba(255,83,79,0.1)';
    let border = '#ff534f';
    let toggleBtn = '';
    
    if (isSet) {
      if (isDisabled) {
        status = '&#x26A0;&#xFE0F; Disabled';
        bg = 'rgba(255,255,255,0.05)';
        border = '#888';
        toggleBtn = `<button data-message='{"type":"toggle-provider","providerId":"${p.id}"}' style="margin-left:10px;padding:2px 8px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-button-border, transparent);border-radius:2px;cursor:pointer;font-size:11px;">🔓 Enable</button>`;
      } else {
        status = '&#x2705; Active';
        bg = 'rgba(78,201,89,0.1)';
        border = '#4ec959';
        toggleBtn = `<button data-message='{"type":"toggle-provider","providerId":"${p.id}"}' style="margin-left:10px;padding:2px 8px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-button-border, transparent);border-radius:2px;cursor:pointer;font-size:11px;">🔒 Disable</button>`;
      }
    }
    
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:8px;background:${bg};border-left:3px solid ${border};border-radius:0 4px 4px 0;"><span><strong>${p.icon} ${p.name}</strong></span><div style="display:flex;align-items:center;"><span style="font-size:12px;">${status}</span>${toggleBtn}</div></div>`;
  }).join('');
  const content = `<div style="font-size:13px;"><p style="margin-bottom:16px;">Configure your AI provider API keys to use Redivivus with different AI models:</p>${providerHtml}<div style="margin-top:16px;padding:12px;background:var(--vscode-input-background);border-radius:6px;font-size:12px;"><strong>&#x1F4A1; How to configure:</strong><br>Click "Open Full Settings" below to enter your API keys, or use VS Code settings directly.</div><button data-cmd="redivivus.openSettings" style="margin-top:12px;padding:8px 16px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;cursor:pointer;">&#x2699;&#xFE0F; Open Full Settings</button></div>`;
  ChatPanel.currentPanel?.showPanel('api-status', '&#x1F510; API Setup', content);
}

class ApiSetupPanel {
  public static currentPanel: ApiSetupPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
    this._panel = panel;
    this._panel.webview.html = getApiSetupHtml();
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'save-keys') {
        const { storeKey, deleteKey } = await import('../services/ai/secretKeyStore.js');
        const toCheck: { id: string, name: string, key: string }[] = [];
        const pairs: [string, string, string][] = [
          ['gemini', 'geminiKey', 'Gemini'], ['claude', 'claudeKey', 'Claude'],
          ['openai', 'openaiKey', 'OpenAI'], ['groq', 'groqKey', 'Groq'],
          ['xai', 'xaiKey', 'xAI'], ['kimi', 'kimiKey', 'Kimi'],
          ['deepseek', 'deepseekKey', 'DeepSeek'],
        ];
        for (const [id, msgKey, name] of pairs) {
          if (msg[msgKey] !== undefined) {
            if (msg[msgKey]) { await storeKey(id, msg[msgKey]); toCheck.push({ id, name, key: msg[msgKey] }); }
            else { await deleteKey(id); }
          }
        }
        
        // Actively verify keys via network ping
        const errors: { id: string, msg: string }[] = [];
        if (toCheck.length > 0) {
            const results = await Promise.all(toCheck.map(async (provider) => {
                const res = await checkProviderReachable(provider.name);
                return { id: provider.id, res };
            }));

            for (const { id, res } of results) {
                if (res.status === 'fail' || res.status === 'warn') {
                    // warn happens on timeout/offline, fail on 401/403. We report both.
                    errors.push({ id, msg: res.message });
                }
            }
        }

        // Refresh HTML after saving so thatConfigured/Not Set labels update in real-time
        this._panel.webview.html = getApiSetupHtml();
        await refreshChatPanelForKeyChange(); // [FIX] update chat pill + "No AI" banner without a reload

        this._panel.webview.postMessage({ type: 'saved', timestamp: new Date().toLocaleTimeString(), errors });
        
        if (errors.length > 0) {
            vscode.window.showWarningMessage('Redivivus API keys saved, but some failed verification. Please check the setup panel.');
        } else {
            vscode.window.showInformationMessage('Redivivus API keys applied and verified successfully!');
        }
      } else if (msg.type === 'toggle-provider') {
        const config = vscode.workspace.getConfiguration('redivivus');
        const disabled = config.get<string[]>('disabledProviders') || [];
        const index = disabled.indexOf(msg.providerId);
        const newDisabled = [...disabled];
        if (index > -1) {
          newDisabled.splice(index, 1);
        } else {
          newDisabled.push(msg.providerId);
        }
        await config.update('disabledProviders', newDisabled, true);
        
        // Refresh HTML to update disabled labels and team roles dynamically
        this._panel.webview.html = getApiSetupHtml();
        await refreshChatPanelForKeyChange(); // [FIX] enabling/disabling a provider changes the active AI set
        vscode.window.showInformationMessage(`Redivivus: ${msg.providerId.toUpperCase()} has been ${index > -1 ? 'enabled' : 'disabled'}!`);
      } else if (msg.type === 'test-all-keys') {
        await this.testAllKeys();
      } else if (msg.type === 'open-vscode-settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'redivivus');
      } else if (msg.type === 'export-all-keys') {
        // [FIX] Export is now an encrypted, passphrase-protected .rdvkeys file (was plaintext .env).
        const { exportKeysEncrypted } = await import('../services/security/keyBackup.js');
        await exportKeysEncrypted();
      } else if (msg.type === 'import-keys') {
        // Restore keys from an encrypted backup (after reload or on a new device).
        const { importKeysEncrypted } = await import('../services/security/keyBackup.js');
        const imported = await importKeysEncrypted();
        if (imported > 0) {
          this._panel.webview.html = getApiSetupHtml();
          await refreshChatPanelForKeyChange();
        }
      }
    }, null, this._disposables);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static createOrShow(context: vscode.ExtensionContext, providerHint?: string): void {
    if (ApiSetupPanel.currentPanel) {
      ApiSetupPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      if (providerHint) { setTimeout(() => ApiSetupPanel.currentPanel?._panel.webview.postMessage({ type: 'highlight-provider', provider: providerHint }), 300); }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'redivivusApiSetup', 'Redivivus API Setup', vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    ApiSetupPanel.currentPanel = new ApiSetupPanel(panel, context);
    if (providerHint) { setTimeout(() => panel.webview.postMessage({ type: 'highlight-provider', provider: providerHint }), 600); }
  }

  private async testAllKeys(): Promise<void> {
    const { getKeyCached } = require('../services/ai/secretKeyStore.js') as typeof import('../services/ai/secretKeyStore.js');
    const providers = [
      { id: 'gemini', name: 'Gemini' },
      { id: 'claude', name: 'Claude' },
      { id: 'openai', name: 'OpenAI' },
      { id: 'groq', name: 'Groq' },
      { id: 'xai', name: 'xAI' },
      { id: 'kimi', name: 'Kimi' },
      { id: 'deepseek', name: 'DeepSeek' }
    ];

    // Test each provider independently and send results as they complete
    for (const provider of providers) {
      try {
        const key = getKeyCached(provider.id);
        if (!key || key.length < 8) {
          this._panel.webview.postMessage({
            type: 'test-result',
            result: {
              provider: provider.id,
              success: false,
              error: 'No API key configured'
            }
          });
          continue;
        }

        const result = await checkProviderReachable(provider.name);
        this._panel.webview.postMessage({
          type: 'test-result',
          result: {
            provider: provider.id,
            success: result.status === 'pass',
            message: result.message,
            error: result.status === 'fail' || result.status === 'warn' ? result.message : undefined
          }
        });
      } catch (error: any) {
        this._panel.webview.postMessage({
          type: 'test-result',
          result: {
            provider: provider.id,
            success: false,
            error: error.message || 'Test failed'
          }
        });
      }
    }
  }

  public dispose(): void {
    ApiSetupPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) { this._disposables.pop()?.dispose(); }
  }
}
