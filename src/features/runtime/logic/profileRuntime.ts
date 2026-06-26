// [SCOPE] redivivus.profileRuntime command — runs the Project Runtime Profiler,
// posts plain-English summary to the chat panel with [Start] / [Not Now] buttons.

import * as vscode from 'vscode';
import { runRuntimeProfiler, buildProfileSummary } from '../data/runtimeProfiler.js';

import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import type { RoutingService } from '../../../features/ai/data/routingService.js';
import type { UsageTracker } from '../../telemetry/data/usageTracker.js';
import type { VaultService } from '../../vault/data/vaultService.js';

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

      const { ChatPanel } = await import('../../chat/ui/chatPanel.js');
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
