// [SCOPE] CHASSIS File Split Assistant Command — scans and suggests file splits

import * as vscode from 'vscode';
import { FileSplitService } from '../services/fileSplitService.js';
import { RoutingService } from '../services/routingService.js';
import { ChatPanel } from '../ui/chatPanel.js';

export function registerFileSplitCommand(
  context: vscode.ExtensionContext,
  routing: RoutingService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.splitFiles', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('No workspace open.');
        return;
      }

      ChatPanel.show(undefined as any, undefined as any);
      setTimeout(async () => {
        const panel = ChatPanel.currentPanel;
        if (!panel) { return; }

        (panel as any).state.conversation.push({
          role: 'assistant',
          content: '🔍 Scanning for files over 200 lines...',
          timestamp: Date.now(),
        });
        (panel as any).refresh();

        const service = new FileSplitService(root, routing);
        const results = await service.analyzeAll();
        const markdown = service.formatMarkdown(results);

        (panel as any).state.conversation.push({
          role: 'assistant',
          content: markdown,
          timestamp: Date.now(),
        });
        (panel as any).refresh();
      }, 500);
    })
  );
}
