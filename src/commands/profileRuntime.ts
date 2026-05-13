// [SCOPE] chassis.profileRuntime command — runs the Project Runtime Profiler,
// posts plain-English summary to the chat panel with [Start] / [Not Now] buttons.

import * as vscode from 'vscode';
import { runRuntimeProfiler, buildProfileSummary } from '../services/runtimeProfiler.js';
import { ChatPanel } from '../ui/chatPanel.js';
import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/routingService.js';
import { UsageTracker } from '../services/usageTracker.js';
import { VaultService } from '../services/vaultService.js';

export function registerProfileRuntimeCommand(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  routing: RoutingService,
  usageTracker?: UsageTracker,
  vault?: VaultService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.profileRuntime', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('CHASSIS: No workspace folder open.');
        return;
      }

      ChatPanel.show(chassis, routing, usageTracker, vault);
      await new Promise(r => setTimeout(r, 300));

      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({
          type: 'assistant-message',
          text: 'Scanning project runtime architecture...',
        });
      }

      let profile;
      try {
        profile = runRuntimeProfiler(root);
      } catch (err) {
        if (ChatPanel.currentPanel) {
          await ChatPanel.currentPanel.handleMessage({
            type: 'assistant-message',
            text: 'Runtime profile scan failed: ' + (err instanceof Error ? err.message : String(err)),
          });
        }
        return;
      }

      const summary = buildProfileSummary(profile);
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({
          type: 'assistant-message',
          text: summary,
        });
      }
    })
  );
}
