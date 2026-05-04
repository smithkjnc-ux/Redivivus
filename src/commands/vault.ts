// [SCOPE] CHASSIS Vault commands — save reusable code blocks + scan entire codebase

import * as vscode from 'vscode';
import * as path from 'path';
import { ChassisService } from '../services/chassisService.js';
import { VaultService, VAULT_CATEGORIES, VaultItem, VaultCategory } from '../services/vaultService.js';
import { WizardPanel } from '../ui/wizardPanel.js';

export function registerVaultCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  vaultService: VaultService,
  refreshAll: () => void
): void {
  // Save to Vault — scan current file and offer to save extractable blocks
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.saveToVault', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        // [WARN] Requires an active text editor; will show error if none is open.
        vscode.window.showErrorMessage('Open a file first to save to vault.');
        return;
      }
      const content = editor.document.getText();
      const filePath = editor.document.uri.fsPath;
      // [WARN] `extractFromFile` involves parsing and potentially AI processing, which can be complex and error-prone.
      const result = vaultService.extractFromFile(filePath, content);
      if (result.items.length === 0) {
        vscode.window.showInformationMessage('No extractable blocks found in this file.');
        return;
      }
      // Show batch summary in wizard panel
      // [WARN] Relies on `WizardPanel.activePanel` being correctly set after `chassis.wizard` command execution.
      // This could introduce a race condition or state issue if the panel isn't ready immediately.
      if (!WizardPanel.activePanel) {
        await vscode.commands.executeCommand('chassis.wizard');
      }
      const panel = WizardPanel.activePanel!; // [WARN] Non-null assertion; assumes `activePanel` is set after the command.
      panel.setVaultScanResults(result.items, 1, result.filteredCount);
    })
  );

  // Scan Codebase to Vault — batch save with duplicate detection
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.scanVaultCodebase', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('No workspace open.');
        return;
      }
      // [WARN] `vscode.window.withProgress` operations can be cancelled by the user, requiring careful handling of `token.isCancellationRequested`.
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'CHASSIS Vault: Scanning codebase...',
        cancellable: true,
      }, async (progress, token) => {
        // [WARN] `vaultService.scanCodebase` can be a long-running, resource-intensive operation across the entire codebase.
        const scanned = await vaultService.scanCodebase(root, undefined, undefined, (msg: string) => {
          if (!token.isCancellationRequested) progress.report({ message: msg });
        });
        if (token.isCancellationRequested) return null;
        return scanned;
      });
      if (!result || result.items.length === 0) {
        vscode.window.showInformationMessage('No extractable blocks found.');
        return;
      }
      // Open wizard panel if needed and show batch summary
      // [WARN] Relies on `WizardPanel.activePanel` being correctly set after `chassis.wizard` command execution.
      // This could introduce a race condition or state issue if the panel isn't ready immediately.
      if (!WizardPanel.activePanel) {
        await vscode.commands.executeCommand('chassis.wizard');
      }
      const panel = WizardPanel.activePanel!; // [WARN] Non-null assertion; assumes `activePanel` is set after the command.
      panel.setVaultScanResults(result.items, result.fileCount, result.filteredCount);
    })
  );
}