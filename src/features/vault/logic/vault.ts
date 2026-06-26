// [SCOPE] Redivivus Vault commands — save, scan, cleanup + panel helpers

import * as vscode from 'vscode';
import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import type { VaultService } from '../data/vaultService.js';
import type { RoutingService } from '../../../features/ai/data/routingService.js';
import { ChatPanel } from '../../chat/ui/chatPanel.js';
import { registerVaultValidate } from './vaultValidate.js';
import { showVaultScanResults } from './vaultResults.js';
import { enrichVaultDescriptions } from '../data/vaultEnrich.js';
import { evaluateQuality } from '../data/vaultQualityGate.js';

export let _pendingScanItems: any[] = [];

export function registerVaultCommands(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  vaultService: VaultService,
  routing: RoutingService,
  refreshAll: () => void
): void {
  // Save to Vault
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.saveToVault', async () => {
      const itemsToSave = _pendingScanItems.length > 0 ? _pendingScanItems : null;
      if (itemsToSave) {
        const confirm = await vscode.window.showInformationMessage(
          `Save ${itemsToSave.length} scanned items to your Vault?`, { modal: true }, 'Save All'
        );
        if (confirm !== 'Save All') { return; }
        let savedCount = 0; let dupCount = 0;
        const callAI = (p: string) => routing.prompt(p, 12_000);
        for (const item of itemsToSave) {
          if (vaultService.isDuplicate(item.contentHash)) { dupCount++; continue; }
          const verdict = await evaluateQuality(item.name, item.code, item.language, callAI).catch(() => null);
          if (verdict) { item.description = verdict.description; (item as any).useCase = verdict.useCase; (item as any).qualityScore = verdict.qualityScore; item.tags = [...new Set([...item.tags, ...verdict.tags])]; }
          vaultService.saveItem(item); savedCount++;
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
      const callAI2 = (p: string) => routing.prompt(p, 12_000);
      for (const item of result.items) {
        if (vaultService.isDuplicate(item.contentHash)) { dupCount++; continue; }
        const v = await evaluateQuality(item.name, item.code, item.language, callAI2).catch(() => null);
        if (v) { item.description = v.description; (item as any).useCase = v.useCase; (item as any).qualityScore = v.qualityScore; item.tags = [...new Set([...item.tags, ...v.tags])]; }
        vaultService.saveItem(item); savedCount++;
      }
      await ensureChatPanelOpen();
      showVaultScanResults(result.items, 1, result.filteredCount, savedCount, dupCount);
    })
  );

  // Scan Codebase to Vault
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.scanVaultCodebase', async () => {
      const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file(require('os').homedir() + '/projects');
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
        defaultUri, openLabel: 'Scan This Project', title: 'Select a project folder to scan into your Vault',
      });
      if (!picked || picked.length === 0) { return; }
      const root = picked[0].fsPath;
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, title: 'Redivivus Vault: Scanning codebase...', cancellable: true,
      }, async (progress, token) => {
        const scanned = await vaultService.scanCodebase(root, undefined, undefined, (msg: string) => {
          if (!token.isCancellationRequested) {progress.report({ message: msg });}
        });
        if (token.isCancellationRequested) {return null;}
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
    vscode.commands.registerCommand('redivivus.vaultCleanupSystemPaths', async () => {
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
      if (toRemove.length === 0) { vscode.window.showInformationMessage('Redivivus Vault: No system/pip path items found. Vault is already clean.'); return; }
      const confirm = await vscode.window.showWarningMessage(
        `Redivivus Vault: Found ${toRemove.length} item(s) sourced from Python pip/env paths. Remove them?`, { modal: true }, 'Remove All'
      );
      if (confirm !== 'Remove All') { return; }
      for (const item of toRemove) { vaultService.deleteItem(item.id); }
      vscode.window.showInformationMessage(`Redivivus Vault: Removed ${toRemove.length} system path item(s).`);
    })
  );

  registerVaultValidate(context, vaultService, routing);

  // Sync local vault to cloud (push) and fetch community items (pull)
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.syncVaultToCloud', async () => {
      const { syncVaultToCloud, fetchCommunityVault, mergeCloudIntoLocal } = await import('../data/vaultCloudSync.js');
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Redivivus Vault: Syncing...', cancellable: false },
        async (progress) => {
          progress.report({ message: 'Pushing local items to cloud...' });
          const push = await syncVaultToCloud(vaultService);
          if (push.error) { vscode.window.showWarningMessage(`Vault push: ${push.error}`); return; }

          progress.report({ message: 'Fetching community items...' });
          const pull = await fetchCommunityVault();
          if (!pull.error && pull.items.length > 0) {
            const merge = mergeCloudIntoLocal(vaultService, pull.items);
            vscode.window.showInformationMessage(`Vault synced — pushed ${push.synced}, pulled ${merge.added} new community items.`);
          } else {
            vscode.window.showInformationMessage(`Vault synced — pushed ${push.synced} items to cloud.`);
          }
        }
      );
    })
  );

  // Enrich existing vault items with AI descriptions and quality scores
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.vault.enrich', async () => {
      const items = vaultService.listItems();
      const needsEnrich = items.filter((i: any) => !i.description || !i.qualityScore);
      if (needsEnrich.length === 0) {
        vscode.window.showInformationMessage('Redivivus Vault: All items already have AI descriptions.');
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        `Redivivus Vault: ${needsEnrich.length} item(s) need AI descriptions. This will make ${needsEnrich.length} AI calls. Continue?`,
        { modal: true }, 'Enrich Now', 'Cancel'
      );
      if (choice !== 'Enrich Now') { return; }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Redivivus Vault: Enriching...', cancellable: false },
        async (progress) => {
          const callAI = (p: string) => routing.prompt(p, 12_000);
          const result = await enrichVaultDescriptions(vaultService, callAI, (done, total, name) => {
            progress.report({ message: `${done + 1}/${total}: ${name}`, increment: (1 / total) * 100 });
          });
          vscode.window.showInformationMessage(`Redivivus Vault: Enriched ${result.enriched} items, removed ${result.skipped} low-quality, ${result.failed} failed.`);
        }
      );
    })
  );
}

export async function ensureChatPanelOpen(): Promise<void> {
  if (!ChatPanel.currentPanel) {
    await vscode.commands.executeCommand('redivivus.openChatPanel');
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}
