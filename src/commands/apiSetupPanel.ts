// [SCOPE] ApiSetupPanel webview class — create/show, message handling, key testing, dispose.
// Extracted from apiSetup.ts (Rule 9 split — was 241 lines).
// Parent: apiSetup.ts (registers commands and exports registerApiSetupCommand).

import * as vscode from 'vscode';
import { getApiSetupHtml } from './apiSetupHtml.js';
import { checkProviderReachable } from '../core/diagnostics/selfDiagnosticChecks';

export async function refreshChatPanelForKeyChange(): Promise<void> {
  try {
    const { invalidateRosterCache } = await import('../services/ai/routingServiceRoster.js');
    invalidateRosterCache();
    const { ChatPanel } = await import('../ui/panels/chat/chatPanel.js');
    const p = ChatPanel.currentPanel as { refresh?: () => void } | undefined;
    if (p && typeof p.refresh === 'function') { p.refresh(); }
  } catch { /* chat panel may not be open — nothing to refresh */ }
}

export class ApiSetupPanel {
  public static currentPanel: ApiSetupPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
    this._panel = panel;
    const html = getApiSetupHtml();
    this._panel.webview.html = html.replace('<head>', '<head>\n<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n<meta http-equiv="Pragma" content="no-cache">\n<meta http-equiv="Expires" content="0">');
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
        const errors: { id: string, msg: string }[] = [];
        if (toCheck.length > 0) {
          const results = await Promise.all(toCheck.map(async (provider) => {
            const res = await checkProviderReachable(provider.name);
            return { id: provider.id, res };
          }));
          for (const { id, res } of results) {
            if (res.status === 'fail' || res.status === 'warn') { errors.push({ id, msg: res.message }); }
          }
        }
        this._panel.webview.html = getApiSetupHtml();
        await refreshChatPanelForKeyChange();
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
        if (index > -1) { newDisabled.splice(index, 1); } else { newDisabled.push(msg.providerId); }
        await config.update('disabledProviders', newDisabled, true);
        this._panel.webview.html = getApiSetupHtml();
        await refreshChatPanelForKeyChange();
        vscode.window.showInformationMessage(`Redivivus: ${msg.providerId.toUpperCase()} has been ${index > -1 ? 'enabled' : 'disabled'}!`);
      } else if (msg.type === 'test-all-keys') {
        await this.testAllKeys();
      } else if (msg.type === 'open-vscode-settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'redivivus');
      } else if (msg.type === 'export-all-keys') {
        const { exportKeysEncrypted } = await import('../services/security/keyBackup.js');
        await exportKeysEncrypted();
      } else if (msg.type === 'import-keys') {
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
      { id: 'gemini', name: 'Gemini' }, { id: 'claude', name: 'Claude' },
      { id: 'openai', name: 'OpenAI' }, { id: 'groq', name: 'Groq' },
      { id: 'xai', name: 'xAI' }, { id: 'kimi', name: 'Kimi' },
      { id: 'deepseek', name: 'DeepSeek' }
    ];
    for (const provider of providers) {
      try {
        const key = getKeyCached(provider.id);
        if (!key || key.length < 8) {
          this._panel.webview.postMessage({ type: 'test-result', result: { provider: provider.id, success: false, error: 'No API key configured' } });
          continue;
        }
        const result = await checkProviderReachable(provider.name);
        this._panel.webview.postMessage({
          type: 'test-result',
          result: { provider: provider.id, success: result.status === 'pass', message: result.message, error: result.status === 'fail' || result.status === 'warn' ? result.message : undefined }
        });
      } catch (error: any) {
        this._panel.webview.postMessage({ type: 'test-result', result: { provider: provider.id, success: false, error: error.message || 'Test failed' } });
      }
    }
  }

  public dispose(): void {
    ApiSetupPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) { this._disposables.pop()?.dispose(); }
  }
}
