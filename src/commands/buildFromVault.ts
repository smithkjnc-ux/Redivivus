// [SCOPE] Build From Vault command — assembles features from vault + AI gap fill

import * as vscode from 'vscode';
import { BuildFromVaultService } from '../services/buildFromVaultService.js';

export function registerBuildFromVaultCommand(
  context: vscode.ExtensionContext,
  buildFromVaultService: BuildFromVaultService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.buildFromVault', async () => {
      await buildFromVaultService.run();
    })
  );
}
