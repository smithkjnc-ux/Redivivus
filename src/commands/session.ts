// [SCOPE] CHASSIS Session commands — start/end workflow with exit interview

import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { SessionService } from '../services/sessionService.js';

export function registerSessionCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  sessions: SessionService,
  refreshAll: () => void
): void {
  // Start Session
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.startSession', async () => {
      if (!chassis.isInitialized()) {
        vscode.window.showErrorMessage('Run "CHASSIS: Initialize Project" first.');
        return;
      }
      await sessions.startSession();
      refreshAll();
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