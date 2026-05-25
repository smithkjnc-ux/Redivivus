// [SCOPE] Redivivus Scope Creep Detection Command — warn when project drifts from blueprint

import * as vscode from 'vscode';
import { ScopeCreepDetectionService } from '../services/code/scopeCreepDetection.js';
import type { RedivivusService } from '../services/redivivusService.js';
import type { RoutingService } from '../services/ai/routingService.js';
import { ChatPanel } from '../ui/panels/chat/chatPanel';

export function registerScopeCreepCommand(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  routing: RoutingService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.detectScopeCreep', async () => {
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
          content: '🔍 Detecting scope creep...',
          timestamp: Date.now(),
        });
        (panel as any).refresh();

        const service = new ScopeCreepDetectionService(root, redivivus, routing);
        const issues = await service.detectScopeCreep();
        const markdown = service.formatMarkdown(issues);

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
