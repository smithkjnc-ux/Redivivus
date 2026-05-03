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
        vscode.window.showErrorMessage('Open a file first to save to vault.');
        return;
      }
      const content = editor.document.getText();
      const filePath = editor.document.uri.fsPath;
      const result = vaultService.extractFromFile(filePath, content);
      if (result.items.length === 0) {
        vscode.window.showInformationMessage('No extractable blocks found in this file.');
        return;
      }
      // Show batch summary in wizard panel
      if (!WizardPanel.activePanel) {
        await vscode.commands.executeCommand('chassis.openWizard');
      }
      const panel = WizardPanel.activePanel!;
      panel.setVaultScanResults(result.items, 1, result.filteredCount);
    })
  );

  // Scan Codebase to Vault — batch save with duplicate detection
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.scanVaultCodebase', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'CHASSIS Vault: Scanning codebase...',
        cancellable: true,
      }, async (progress, token) => {
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
      if (!WizardPanel.activePanel) {
        await vscode.commands.executeCommand('chassis.openWizard');
      }
      const panel = WizardPanel.activePanel!;
      panel.setVaultScanResults(result.items, result.fileCount, result.filteredCount);
    })
  );
}
