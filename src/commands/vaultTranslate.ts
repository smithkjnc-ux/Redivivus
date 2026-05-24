// [SCOPE] Vault Translate Command — QuickPick item + target language, AI translates, saves as new vault entry

import * as vscode from 'vscode';
import type { VaultService } from '../services/vault/vaultService.js';
import type { RoutingService } from '../services/ai/routingService.js';
import { translateVaultItem, TRANSLATE_LANGS } from '../services/vault/vaultTranslator.js';

export function registerVaultTranslateCommand(
  context: vscode.ExtensionContext,
  vaultService: VaultService,
  routing: RoutingService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.vaultTranslate', async (preselectedId?: string) => {
      const items = vaultService.listItems();
      if (items.length === 0) {
        vscode.window.showInformationMessage('Your vault is empty — scan a project first to populate it.');
        return;
      }

      // Step 1: pick vault item (or use preselected)
      let source = preselectedId ? items.find(i => i.id === preselectedId) : undefined;
      if (!source) {
        const picks = items.map(i => ({
          label: i.name,
          description: `${i.language} · ${i.category}`,
          detail: i.description,
          item: i,
        }));
        const picked = await vscode.window.showQuickPick(picks, {
          placeHolder: 'Pick a vault item to translate',
          matchOnDescription: true,
          matchOnDetail: true,
        });
        if (!picked) { return; }
        source = picked.item;
      }

      // Step 2: pick target language (exclude current language)
      const sourceLang = source.language;
      const langPicks = Object.entries(TRANSLATE_LANGS)
        .filter(([, ext]) => ext !== sourceLang)
        .map(([label, ext]) => ({ label, description: `.${ext}`, ext }));

      const langPick = await vscode.window.showQuickPick(langPicks, {
        placeHolder: `Translate \`${source.name}\` (${sourceLang}) to...`,
      });
      if (!langPick) { return; }

      // Step 3: translate
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Translating ${source.name} to ${langPick.label}...`, cancellable: false },
        async () => {
          const callAI = (p: string) => routing.prompt(p, 60_000);
          const result = await translateVaultItem(source!, langPick.label, langPick.ext, callAI);

          if (!result) {
            vscode.window.showErrorMessage('Translation failed — check your AI key and try again.');
            return;
          }

          // Save translated item only if not a duplicate
          if (vaultService.isDuplicate(result.item.contentHash)) {
            vscode.window.showInformationMessage(`A ${langPick.label} translation of \`${source!.name}\` already exists in your vault.`);
            return;
          }
          vaultService.saveItem(result.item);

          const action = await vscode.window.showInformationMessage(
            result.notes,
            'View in Vault', 'Dismiss'
          );
          if (action === 'View in Vault') {
            vscode.commands.executeCommand('chassis.vaultBrowse');
          }
        }
      );
    })
  );
}
