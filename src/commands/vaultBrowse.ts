// [SCOPE] Vault Browse command — opens in chat panel showing all vault items
// Works globally, no project initialization required.

import * as vscode from 'vscode';
import { VaultService } from '../services/vaultService.js';
import { ChatPanel } from '../ui/chatPanel.js';
import { renderVaultBrowser } from '../ui/vaultBrowserRenderer.js';

export function registerVaultBrowseCommand(
  context: vscode.ExtensionContext,
  vaultService: VaultService
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openVault', () => {
      // If chat panel not open, open it first
      if (!ChatPanel.currentPanel) {
        vscode.commands.executeCommand('chassis.openChatPanel');
        // Wait for panel to initialize then show vault
        setTimeout(() => {
          if (ChatPanel.currentPanel) {
            showVaultInChatPanel(vaultService);
          }
        }, 300);
      } else {
        showVaultInChatPanel(vaultService);
      }
    })
  );
}

function showVaultInChatPanel(vaultService: VaultService): void {
  const items = vaultService.listItems();
  const content = renderVaultBrowser(items);
  ChatPanel.currentPanel?.showPanel('vault', '💾 Vault Browser', content);
}
