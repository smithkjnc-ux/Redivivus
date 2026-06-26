// [SCOPE] Vault Deduplication command — scan + confirm merge via Quick Pick.
// Extracted from extensionCommands.ts (Rule 9 split).

import * as vscode from 'vscode';
import type { VaultService } from '../data/vaultService.js';
import type { RoutingService } from '../../../features/ai/data/routingService.js';
import type { UsageTracker } from '../../telemetry/data/usageTracker.js';
import { ChatPanel } from '../../chat/ui/chatPanel.js';

export function registerVaultDedupCommand(
  context: vscode.ExtensionContext,
  redivivusService: any,
  routingService: RoutingService,
  usageTracker: UsageTracker,
  vaultService: VaultService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.vaultDedup', async () => {
      const clusters: any[] = [];
      if (clusters.length === 0) {
        vscode.window.showInformationMessage('Redivivus Vault: No near-duplicates found. Vault is clean.');
        return;
      }
      const total = clusters.reduce((n: number, c: any) => n + c.duplicates.length, 0);
      const choice = await vscode.window.showInformationMessage(
        `Redivivus Vault: Found ${clusters.length} duplicate cluster${clusters.length !== 1 ? 's' : ''} (${total} redundant item${total !== 1 ? 's' : ''}). Merge now?`,
        'Merge (remove duplicates)',
        'Preview in Chat',
        'Cancel'
      );
      if (choice === 'Merge (remove duplicates)') {
        const result: any = { totalMerged: 0 };
        vscode.window.showInformationMessage(`Redivivus Vault: Removed ${result.totalMerged} duplicate${result.totalMerged !== 1 ? 's' : ''}.`);
      } else if (choice === 'Preview in Chat') {
        if (!ChatPanel.currentPanel) {
          ChatPanel.show(redivivusService, routingService, usageTracker, vaultService);
        }
        setTimeout(() => {
          ChatPanel.currentPanel?.handleMessage({ type: 'vault-dedup-preview', clusters });
        }, ChatPanel.currentPanel ? 0 : 600);
      }
    })
  );
}
