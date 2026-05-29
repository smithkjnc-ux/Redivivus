// [SCOPE] Redivivus API Setup — webview panel AND chat panel for configuring AI API keys
// Chat panel shows read-only status, webview panel allows editing with Apply button.
// HTML template -> apiSetupHtml.ts

import * as vscode from 'vscode';
import { ChatPanel } from '../ui/panels/chat/chatPanel';
import { getApiSetupHtml } from './apiSetupHtml.js';
import { checkProviderReachable } from '../core/diagnostics/selfDiagnosticChecks';

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
  const config = vscode.workspace.getConfiguration('redivivus');
  const providers = [
    { name: 'Gemini',  key: config.get<string>('geminiApiKey'),   icon: '&#x1F916;' },
    { name: 'Claude',  key: config.get<string>('claudeApiKey'),    icon: '&#x1F9E0;' },
    { name: 'OpenAI',  key: config.get<string>('openaiApiKey'),   icon: '&#x26A1;' },
    { name: 'Groq',    key: config.get<string>('groqApiKey'),      icon: '&#x1F525;' },
    { name: 'xAI',     key: config.get<string>('xaiApiKey'),       icon: '&#x1F680;' },
    { name: 'Kimi',    key: config.get<string>('kimiApiKey'),      icon: '&#x1F52E;' },
  ];
  const providerHtml = providers.map(p => {
    const isSet = p.key && p.key.length > 0;
    const status = isSet ? '&#x2705; Configured' : '&#x274C; Not set';
    const bg = isSet ? 'rgba(78,201,89,0.1)' : 'rgba(255,83,79,0.1)';
    const border = isSet ? '#4ec959' : '#ff534f';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:8px;background:${bg};border-left:3px solid ${border};border-radius:0 4px 4px 0;"><span><strong>${p.icon} ${p.name}</strong></span><span style="font-size:12px;">${status}</span></div>`;
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
        const config = vscode.workspace.getConfiguration('redivivus');
        const toCheck: { id: string, name: string, key: string }[] = [];

        if (msg.geminiKey !== undefined) { await config.update('geminiApiKey', msg.geminiKey || undefined, true); if (msg.geminiKey) {toCheck.push({id: 'gemini', name: 'Gemini', key: msg.geminiKey});} }
        if (msg.claudeKey !== undefined) { await config.update('claudeApiKey', msg.claudeKey || undefined, true); if (msg.claudeKey) {toCheck.push({id: 'claude', name: 'Claude', key: msg.claudeKey});} }
        if (msg.openaiKey !== undefined) { await config.update('openaiApiKey', msg.openaiKey || undefined, true); if (msg.openaiKey) {toCheck.push({id: 'openai', name: 'OpenAI', key: msg.openaiKey});} }
        if (msg.groqKey !== undefined)   { await config.update('groqApiKey',   msg.groqKey   || undefined, true); if (msg.groqKey) {toCheck.push({id: 'groq', name: 'Groq', key: msg.groqKey});} }
        if (msg.xaiKey !== undefined)    { await config.update('xaiApiKey',    msg.xaiKey    || undefined, true); if (msg.xaiKey) {toCheck.push({id: 'xai', name: 'xAI', key: msg.xaiKey});} }
        if (msg.kimiKey !== undefined)   { await config.update('kimiApiKey',   msg.kimiKey   || undefined, true); if (msg.kimiKey) {toCheck.push({id: 'kimi', name: 'Kimi', key: msg.kimiKey});} }
        
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
        vscode.window.showInformationMessage(`Redivivus: ${msg.providerId.toUpperCase()} has been ${index > -1 ? 'enabled' : 'disabled'}!`);
      } else if (msg.type === 'open-vscode-settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'redivivus');
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

  public dispose(): void {
    ApiSetupPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) { this._disposables.pop()?.dispose(); }
  }
}
