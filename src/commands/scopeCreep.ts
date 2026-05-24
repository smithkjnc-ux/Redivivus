// [SCOPE] CHASSIS Scope Creep Detection Command — warn when project drifts from blueprint

import * as vscode from 'vscode';
import { ScopeCreepDetectionService } from '../services/code/scopeCreepDetection.js';
import type { ChassisService } from '../services/chassisService.js';
import type { RoutingService } from '../services/ai/routingService.js';
import { ChatPanel } from '../ui/panels/chat/chatPanel';

export function registerScopeCreepCommand(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  routing: RoutingService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.detectScopeCreep', async () => {
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

        const service = new ScopeCreepDetectionService(root, chassis, routing);
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
