// [SCOPE] Build From Vault command — assembles features from vault + AI gap fill

import * as vscode from 'vscode';
import type { BuildFromVaultService } from '../features/vault/infrastructure/buildFromVaultService.js';

export function registerBuildFromVaultCommand(
  context: vscode.ExtensionContext,
  buildFromVaultService: BuildFromVaultService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.buildFromVault', async (prefill?: { task?: string; targetFile?: string }) => {
      await buildFromVaultService.run(prefill);
    })
  );
}