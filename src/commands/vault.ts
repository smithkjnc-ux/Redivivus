// [SCOPE] CHASSIS Vault commands — save reusable code blocks + scan entire codebase

import * as vscode from 'vscode';
import * as path from 'path';
import { ChassisService } from '../services/chassisService.js';
import { VaultService, VAULT_CATEGORIES } from '../services/vaultService.js';
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
      const blocks = vaultService.extractBlocks(filePath, content);
      if (blocks.length === 0) {
        vscode.window.showInformationMessage('No extractable functions or classes found in this file.');
        return;
      }
      for (const block of blocks) {
        const keep = await vscode.window.showQuickPick(
          ['Save to Vault', 'Skip', 'Stop Review'],
          { placeHolder: `${block.name} (${block.type}) — ${block.lines[0]}-${block.lines[1]}` }
        );
        if (keep === 'Stop Review') break;
        if (keep === 'Save to Vault') {
          const cat = vaultService.suggestCategory(block);
          const catPick = await vscode.window.showQuickPick<{ label: string; detail: string }>(
            VAULT_CATEGORIES.map((c: { icon: string; label: string; key: string }) => ({ label: `${c.icon} ${c.label}`, detail: c.key })),
            { placeHolder: `Category: ${cat} (auto-detected). Change if needed.` }
          );
          if (!catPick) continue;
          const name = await vscode.window.showInputBox({
            prompt: 'Name this vault item',
            value: block.name,
            ignoreFocusOut: true,
          });
          if (!name) continue;
          const desc = await vscode.window.showInputBox({
            prompt: 'Short description (what does this do?)',
            value: `${block.type} from ${path.basename(filePath)}`,
            ignoreFocusOut: true,
          });
          if (desc === undefined) continue;
          const projName = chassis.loadConfig()?.projectName || path.basename(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'Project');
          const id = `vault_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          const item = {
            id, name, category: catPick.detail as VaultCategory,
            description: desc,
            code: block.code, language: block.language,
            source: { projectName: projName, filePath, extractedAt: new Date().toISOString() },
            tags: vaultService.generateTags(block),
            provenance: { createdAt: new Date().toISOString(), tested: false, timesImported: 0, notes: '' },
          };
          vaultService.saveItem(item, true);
        }
      }
      vscode.window.showInformationMessage('Vault save complete.');
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
        const scanned = await vaultService.scanCodebase(root, (msg: string) => {
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
      panel.setVaultScanResults(result.items, result.fileCount, result.filteredCount ?? 0);
    })
  );
}
