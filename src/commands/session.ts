// [SCOPE] CHASSIS Session commands — start/end workflow with exit interview

import * as vscode from 'vscode';
import type { ChassisService } from '../services/chassisService.js';
import type { SessionService } from '../services/sessionService.js';
import { ChatPanel } from '../ui/panels/chat/chatPanel';

export function registerSessionCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  sessions: SessionService,
  refreshAll: () => void
): void {
  // Register callbacks so ChatPanel can call startSession without circular imports
  ChatPanel.onStartSession = async (goal: string, ai: string) => {
    await sessions.startSession(goal, ai);
    refreshAll();
  };
  // [CHASSIS] Auto-session: silently start on first message without user prompts
  (ChatPanel as any).startSessionSilent = (goal: string, ai?: string) => {
    sessions.startSessionSilent(goal, ai || 'CHASSIS');
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

  // [CHASSIS] Auto-save-point: create git commit after successful builds
  ChatPanel.onBuildFinished = async (task: string, files: string[], buildRoot?: string) => {
    const root = buildRoot || chassis.getWorkspaceRoot();
    if (!root) { return; }
    const { SavePointService } = await import('../services/savePointService.js');
    const svc = new SavePointService(root);
    const description = `CHASSIS build: ${task.slice(0, 60)} (${files.length} file${files.length !== 1 ? 's' : ''})`;
    try {
      const result = await svc.create(description);
      if (result.success) {
        vscode.window.showInformationMessage(`Save point created: ${description}`);
      }
    } catch { /* non-blocking */ }
    // Also record in session
    if (sessions.isActive) {
      sessions.recordChange(files.join(', '), task.slice(0, 80), 'worked', '');
    }
  };
}