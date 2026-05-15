// [SCOPE] Build From Vault command — assembles features from vault + AI gap fill

import * as vscode from 'vscode';
import { BuildFromVaultService } from '../services/vault/buildFromVaultService.js';

export function registerBuildFromVaultCommand(
  context: vscode.ExtensionContext,
  buildFromVaultService: BuildFromVaultService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.buildFromVault', async (prefill?: { task?: string; targetFile?: string }) => {
      await buildFromVaultService.run(prefill);
    })
  );
}