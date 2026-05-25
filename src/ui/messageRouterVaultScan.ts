// [SCOPE] Vault scan handlers — scan codebase, save scan results, AI categorization during scan
// Called by messageRouter orchestrator. No vault navigation or recategorize logic here.

import * as vscode from 'vscode';
import type { VaultService } from '../services/vault/vaultService.js';
import type { RoutingService } from '../services/ai/routingService.js';
import type { WizardPanelState } from './messageRouterTypes.js';

export async function handleVaultScanMessage(
  msg: any,
  vaultService: VaultService,
  routingService: RoutingService | undefined,
  state: WizardPanelState,
  refresh: () => void
): Promise<boolean> {
  switch (msg.type) {
    case 'vaultScanCodebase':
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Redivivus Vault: Scanning codebase...',
        cancellable: true,
      }, async (progress, token) => {
        const scanRoot = msg.root || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!scanRoot) { vscode.window.showErrorMessage('No workspace to scan.'); return; }
        const result = await vaultService.scanCodebase(scanRoot, undefined, undefined, (m: string) => {
          if (!token.isCancellationRequested) {progress.report({ message: m });}
        });
        if (token.isCancellationRequested) {return;}

        const newItems: any[] = [];
        const duplicates: any[] = [];
        for (const item of result.items) {
          if (vaultService.isDuplicate(item.contentHash)) { duplicates.push(item); }
          else { newItems.push(item); }
        }

        // AI categorize new items — replaces 'other' tags with AI-suggested categories
        let categorized = newItems;
        const aiAvailable = routingService?.getAvailableAI();
        // [WARN] This block involves external AI API calls, which can be flaky.
        if (routingService && aiAvailable?.ai !== 'none' && newItems.length > 0) {
          progress.report({ message: `AI categorizing ${newItems.length} blocks via ${aiAvailable?.label}...` });
          try {
            categorized = await vaultService.aiCategorize(newItems, routingService);
          } catch (e) {
            console.warn('[Redivivus] AI categorization failed:', e);
          }
        } else if (newItems.length > 0) {
          vscode.window.showWarningMessage(
            `Redivivus found ${newItems.length} vault items but no AI key is set — all saved as "other". Add an API key in Files & AI → API Keys, then use Fix Categories.`
          );
        }

        state.vaultScanMode = true;
        state.vaultScanItems = categorized;
        state.vaultScanDuplicates = duplicates;
        state.vaultScanFileCount = result.fileCount;
        state.vaultScanFilteredCount = result.filteredCount;
        state.vaultScanTotalFound = result.items.length;
        state.activeTab = 'vault';
        refresh();
      });
      return true;
    case 'vaultScanSaveAll': {
      const ids: string[] = msg.itemIds || [];
      let saved = 0;
      for (const id of ids) {
        const item = state.vaultScanItems.find((i: any) => i.id === id);
        if (item) { vaultService.saveItem(item); saved++; }
      }
      const dupCount = state.vaultScanDuplicates.length;
      const totalNew = state.vaultScanItems.length;
      const unchecked = totalNew - saved;
      vscode.window.showInformationMessage(`Saved ${saved} new blocks. Skipped ${dupCount} duplicates.`);
      state.vaultScanMode = false;
      state.vaultScanItems = [];
      state.vaultScanDuplicates = [];
      state.vaultScanFileCount = 0;
      state.vaultScanFilteredCount = 0;
      state.vaultScanTotalFound = 0;
      state.vaultView = 'categories';
      refresh();
      return true;
    }
    default:
      return false;
  }
}
