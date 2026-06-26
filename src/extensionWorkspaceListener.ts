// [SCOPE] Workspace folder change listener — extracted from extension.ts (Rule 9 split).

import * as vscode from 'vscode';
import { ChatPanel } from './features/chat/ui/chatPanel.js';
import { runAutoInit } from './commands/init.js';
import { finalizeRedivivusLogger, initRedivivusLogger, redivivusLog } from './shared/logging/infrastructure/redivivusLogger.js';
import { resetProjectContext, initProjectContextLogger } from './shared/logging/infrastructure/projectContextLogger.js';

export function registerWorkspaceFolderListener(
  context: vscode.ExtensionContext,
  redivivusService: any,
  statusBar: any,
): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      if (e.removed.length > 0 && e.added.length === 0) {
        if (ChatPanel.currentPanel) {
          (ChatPanel.currentPanel as any).state.conversation = [];
          (ChatPanel.currentPanel as any)._initialized = false;
          ChatPanel.currentPanel.refresh();
        }
        finalizeRedivivusLogger(true);
        resetProjectContext();
      } else if (e.added.length > 0) {
        const _cp = require('./features/chat/ui/chatPanel.js').ChatPanel;
        if (_cp?.suppressAutoOpen) {
          _cp.suppressAutoOpen = false;
          context.globalState.update('redivivus.suppressAutoOpen', undefined);
        } else {
          const suppressPath = context.globalState.get<string>('redivivus.suppressAutoOpen');
          if (!suppressPath) {
            setTimeout(() => runAutoInit(context, redivivusService, () => statusBar.update()), 300);
          } else {
            context.globalState.update('redivivus.suppressAutoOpen', undefined);
          }
        }
        const addedRoot = e.added[0]?.uri.fsPath;
        if (addedRoot) {
          const sessionId = initRedivivusLogger(addedRoot);
          redivivusLog({ operation: 'system', message: 'Workspace opened', data: { root: addedRoot, sessionId } });
          resetProjectContext();
          initProjectContextLogger(addedRoot);
        }
      }
    })
  );
}
