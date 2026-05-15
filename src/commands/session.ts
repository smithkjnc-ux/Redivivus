// [SCOPE] CHASSIS Session commands — start/end workflow with exit interview

import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { SessionService } from '../services/sessionService.js';
import { ChatPanel } from '../ui/chat/chatPanel.js';

export function registerSessionCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  sessions: SessionService,
  refreshAll: () => void
): void {
  // Register callback so ChatPanel can call startSession without circular imports
  ChatPanel.onStartSession = async (goal: string, ai: string) => {
    await sessions.startSession(goal, ai);
    refreshAll();
  };

  // Start Session \u2014 show form inside chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.startSession', async () => {
      if (!chassis.isInitialized()) {
        vscode.window.showErrorMessage('Run "CHASSIS: Initialize Project" first.');
        return;
      }
      if (!ChatPanel.currentPanel) {
        vscode.commands.executeCommand('chassis.openChatPanel');
        setTimeout(() => ChatPanel.currentPanel?.showStartSession(), 300);
      } else {
        ChatPanel.currentPanel.showStartSession();
      }
    })
  );

  // End Session
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.endSession', async () => {
      // [WARN] This command directly calls endSession without checking if a session is currently active.
      // If endSession expects an active session, this could lead to unexpected behavior or errors.
      await sessions.endSession();
      refreshAll();
    })
  );
}