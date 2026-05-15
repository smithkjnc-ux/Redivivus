// [SCOPE] CHASSIS Vault commands — save, scan, cleanup + panel helpers

import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { VaultService } from '../services/vault/vaultService.js';
import { RoutingService } from '../services/ai/routingService.js';
import { ChatPanel } from '../ui/chat/chatPanel.js';
import { registerVaultValidate } from './vaultValidate.js';
import { showVaultScanResults } from './vaultResults.js';

export let _pendingScanItems: any[] = [];

export function registerVaultCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  vaultService: VaultService,
  routing: RoutingService,
  refreshAll: () => void
): void {
  // Save to Vault
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.saveToVault', async () => {
      const itemsToSave = _pendingScanItems.length > 0 ? _pendingScanItems : null;
      if (itemsToSave) {
        const confirm = await vscode.window.showInformationMessage(
          `Save ${itemsToSave.length} scanned items to your Vault?`, { modal: true }, 'Save All'
        );
        if (confirm !== 'Save All') { return; }
        let savedCount = 0; let dupCount = 0;
        for (const item of itemsToSave) {
          if (!vaultService.isDuplicate(item.contentHash)) { vaultService.saveItem(item); savedCount++; }
          else { dupCount++; }
        }
        _pendingScanItems = [];
        await ensureChatPanelOpen();
        showVaultScanResults(itemsToSave, itemsToSave.length, 0, savedCount, dupCount);
        vscode.window.showInformationMessage(`Vault: Saved ${savedCount} items (${dupCount} duplicates skipped).`);
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) { vscode.window.showErrorMessage('Open a file first to save to vault.'); return; }
      const content = editor.document.getText();
      const filePath = editor.document.uri.fsPath;
      const result = vaultService.extractFromFile(filePath, content);
      if (result.items.length === 0) { vscode.window.showInformationMessage('No extractable blocks found in this file.'); return; }
      let savedCount = 0; let dupCount = 0;
      for (const item of result.items) {
        if (!vaultService.isDuplicate(item.contentHash)) { vaultService.saveItem(item); savedCount++; }
        else { dupCount++; }
      }
      await ensureChatPanelOpen();
      showVaultScanResults(result.items, 1, result.filteredCount, savedCount, dupCount);
    })
  );

  // Scan Codebase to Vault
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.scanVaultCodebase', async () => {
      const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file(require('os').homedir() + '/projects');
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
        defaultUri, openLabel: 'Scan This Project', title: 'Select a project folder to scan into your Vault',
      });
      if (!picked || picked.length === 0) { return; }
      const root = picked[0].fsPath;
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, title: 'CHASSIS Vault: Scanning codebase...', cancellable: true,
      }, async (progress, token) => {
        const scanned = await vaultService.scanCodebase(root, undefined, undefined, (msg: string) => {
          if (!token.isCancellationRequested) progress.report({ message: msg });
        });
        if (token.isCancellationRequested) return null;
        return scanned;
      });
      if (!result || result.items.length === 0) { vscode.window.showInformationMessage('No extractable blocks found.'); return; }
      _pendingScanItems = result.items;
      await ensureChatPanelOpen();
      showVaultScanResults(result.items, result.fileCount, result.filteredCount, 0, 0);
    })
  );

  // Vault Cleanup
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.vaultCleanupSystemPaths', async () => {
      const SYSTEM_PATH_SIGNALS = [
        'site-packages', 'dist-packages', '__pycache__', '.venv', '/venv/',
        'lib/python', 'lib64/python', '.tox', '.eggs', 'sdist', 'wheels',
        '.mypy_cache', '.pytest_cache',
      ];
      const allItems = vaultService.listItems();
      const toRemove = allItems.filter(item => {
        const src = (item as any).sourceFile || (item as any).filePath || '';
        return SYSTEM_PATH_SIGNALS.some(sig => src.includes(sig));
      });
      if (toRemove.length === 0) { vscode.window.showInformationMessage('CHASSIS Vault: No system/pip path items found. Vault is already clean.'); return; }
      const confirm = await vscode.window.showWarningMessage(
        `CHASSIS Vault: Found ${toRemove.length} item(s) sourced from Python pip/env paths. Remove them?`, { modal: true }, 'Remove All'
      );
      if (confirm !== 'Remove All') { return; }
      for (const item of toRemove) { vaultService.deleteItem(item.id); }
      vscode.window.showInformationMessage(`CHASSIS Vault: Removed ${toRemove.length} system path item(s).`);
    })
  );

  registerVaultValidate(context, vaultService, routing);
}

export async function ensureChatPanelOpen(): Promise<void> {
  if (!ChatPanel.currentPanel) {
    await vscode.commands.executeCommand('chassis.openChatPanel');
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}
