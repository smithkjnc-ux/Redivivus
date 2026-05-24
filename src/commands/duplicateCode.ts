// [SCOPE] CHASSIS Duplicate Code Detection Command — find repeated patterns

import * as vscode from 'vscode';
import { DuplicateCodeDetectionService } from '../services/code/duplicateCodeDetection.js';
import type { RoutingService } from '../services/ai/routingService.js';
import { ChatPanel } from '../ui/panels/chat/chatPanel';

export function registerDuplicateCodeCommand(
  context: vscode.ExtensionContext,
  routing: RoutingService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.detectDuplicates', async () => {
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
          content: '🔍 Scanning for duplicate code patterns...',
          timestamp: Date.now(),
        });
        (panel as any).refresh();

        const service = new DuplicateCodeDetectionService(root, routing);
        const duplicates = await service.detectDuplicates();
        const markdown = service.formatMarkdown(duplicates);

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
