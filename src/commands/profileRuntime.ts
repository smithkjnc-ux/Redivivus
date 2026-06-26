// [SCOPE] redivivus.profileRuntime command — runs the Project Runtime Profiler,
// posts plain-English summary to the chat panel with [Start] / [Not Now] buttons.

import * as vscode from 'vscode';
import { runRuntimeProfiler, buildProfileSummary } from '../core/runtime/runtimeProfiler.js';

import type { RedivivusService } from '../services/redivivusService.js';
import type { RoutingService } from '../shared/ai/infrastructure/routingService.js';
import type { UsageTracker } from '../services/usageTracker.js';
import type { VaultService } from '../features/vault/infrastructure/vaultService.js';

export function registerProfileRuntimeCommand(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  routing: RoutingService,
  usageTracker?: UsageTracker,
  vault?: VaultService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.profileRuntime', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('Redivivus: No workspace folder open.');
        return;
      }

      const { ChatPanel } = await import('../features/chat/ui/chatPanel.js');
      ChatPanel.show(redivivus, routing, usageTracker, vault);
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
