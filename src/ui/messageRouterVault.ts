// [SCOPE] Vault navigation and item operation handlers — view navigation, open/import/delete/save
// Called by messageRouter orchestrator. No scan or recategorize logic here.

import * as vscode from 'vscode';
import { VaultService, VaultCategory } from '../services/vault/vaultService.js';
import { WizardPanelState } from './messageRouterTypes.js';

export async function handleVaultMessage(
  msg: any,
  vaultService: VaultService,
  state: WizardPanelState,
  refresh: () => void
): Promise<boolean> {
  switch (msg.type) {
    case 'vaultSetView':
      state.vaultView = msg.view || 'categories';
      state.vaultCategory = msg.category || null;
      state.vaultSubcategory = msg.subcategory || null;
      state.vaultGlobal = msg.global !== undefined ? msg.global : state.vaultGlobal;
      // Always re-read from disk — never use stale cached state
      if (state.vaultView === 'items' && state.vaultCategory) {
        if (state.vaultSubcategory) {
          state.vaultItems = vaultService.listBySubcategory(
            state.vaultCategory as VaultCategory, state.vaultSubcategory, state.vaultGlobal
          );
        } else {
          state.vaultItems = vaultService.listByCategory(state.vaultCategory as VaultCategory, state.vaultGlobal);
        }
      } else {
        state.vaultItems = [];
      }
      state.activeTab = 'vault';
      refresh();
      return true;
    case 'vaultScanCancel':
      state.vaultScanMode = false;
      state.vaultScanItems = [];
      state.vaultScanDuplicates = [];
      state.vaultScanFileCount = 0;
      state.vaultScanFilteredCount = 0;
      state.vaultScanTotalFound = 0;
      refresh();
      return true;
    case 'vaultOpenItem': {
      try {
        const openItem = vaultService.getItem(msg.itemId, msg.global);
        if (openItem) {
          const d = await vscode.workspace.openTextDocument({ content: openItem.code, language: openItem.language });
          await vscode.window.showTextDocument(d, vscode.ViewColumn.Beside);
        } else {
          vscode.window.showErrorMessage(`Vault item not found: ${msg.itemId}`);
        }
      } catch (err) {
        vscode.window.showErrorMessage('Failed to open vault item: ' + (err as Error).message);
      }
      return true;
    }
    case 'vaultImportItem': {
      const vItem = vaultService.getItem(msg.itemId, msg.global);
      if (vItem) {
        const result = await vaultService.importItems(JSON.stringify([vItem]), msg.global);
        vscode.window.showInformationMessage(`Imported ${result} item(s)`);
      }
      return true;
    }
    case 'vaultDeleteItem':
      vaultService.deleteItem(msg.itemId);
      if (state.vaultCategory) {
        if (state.vaultSubcategory) {
          state.vaultItems = vaultService.listBySubcategory(state.vaultCategory as VaultCategory, state.vaultSubcategory, state.vaultGlobal);
        } else {
          state.vaultItems = vaultService.listByCategory(state.vaultCategory as VaultCategory, state.vaultGlobal);
        }
      }
      refresh();
      return true;
    case 'vaultSaveFromProject':
      await vscode.commands.executeCommand('chassis.saveToVault');
      refresh();
      return true;
    default:
      return false;
  }
}
