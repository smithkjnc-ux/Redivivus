// [SCOPE] ChatPanel constructor listener registrations — extracted from chatPanel.ts (Rule 9 split).
// Covers: onDidChangeWorkspaceFolders and onDidChangeConfiguration disposables.

import * as vscode from 'vscode';
import { ChatPanel } from './chatPanel.js';

export function registerChatPanelListeners(panel: any, disposables: vscode.Disposable[]): void {
  disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
    const suppressSync = ChatPanel.suppressAutoOpen;
    const suppress = ChatPanel.extensionContext?.globalState.get<boolean>('redivivus.suppressConversationClear');
    ChatPanel.extensionContext?.globalState.update('redivivus.suppressConversationClear', undefined);
    if (!suppressSync && !suppress) { panel.state.conversation = []; try {
      const newRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (newRoot && ChatPanel.extensionContext) { const { chatHistoryKey } = require('./chatPanelPublicAPI.js'); ChatPanel.extensionContext.globalState.update(chatHistoryKey(newRoot), undefined); }
    } catch {} }
    panel._initialized = false;
    panel.refresh();
  }));

  disposables.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('redivivus.geminiApiKey') ||
        e.affectsConfiguration('redivivus.claudeApiKey') ||
        e.affectsConfiguration('redivivus.openaiApiKey') ||
        e.affectsConfiguration('redivivus.groqApiKey') ||
        e.affectsConfiguration('redivivus.xaiApiKey') ||
        e.affectsConfiguration('redivivus.kimiApiKey')) {
      panel.refresh();
    }
  }));
}
