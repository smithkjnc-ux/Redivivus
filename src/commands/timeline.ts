// [SCOPE] Redivivus Timeline Command — view project history in chat panel

import * as vscode from 'vscode';
import type { RedivivusService } from '../services/redivivusService.js';
import { ChatPanel } from '../features/chat/ui/chatPanel.js';
import { TimelineService } from '../services/timelineService.js';

export function registerTimelineCommand(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.viewTimeline', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('No workspace open.');
        return;
      }
      ChatPanel.show(redivivus, null as any, null as any, null as any);
      setTimeout(() => {
        const panel = ChatPanel.currentPanel;
        if (panel) {
          const service = new TimelineService(root);
          const timeline = service.generateTimeline();
          (panel as any).state.conversation.push({ role: 'assistant', content: timeline, timestamp: Date.now() });
          (panel as any).refresh();
        }
      }, 500);
    })
  );
}
