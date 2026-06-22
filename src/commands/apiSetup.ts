// [SCOPE] Redivivus API Setup — command registration shell.
// ApiSetupPanel class extracted to apiSetupPanel.ts (Rule 9 split — was 241 lines).
// showApiStatusInChat stays here as it is the wiring between commands and the chat panel.

import * as vscode from 'vscode';
import { ChatPanel } from '../ui/panels/chat/chatPanel';
import { ApiSetupPanel, refreshChatPanelForKeyChange } from './apiSetupPanel.js';
export { ApiSetupPanel } from './apiSetupPanel.js';

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

