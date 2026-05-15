// [SCOPE] CHASSIS Timeline Command — view project history in chat panel

import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { ChatPanel } from '../ui/chat/chatPanel.js';
import { TimelineService } from '../services/timelineService.js';

export function registerTimelineCommand(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.viewTimeline', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('No workspace open.');
        return;
      }
      ChatPanel.show(chassis, null as any, null as any, null as any);
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
