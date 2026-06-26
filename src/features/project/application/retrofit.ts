// [SCOPE] Registers VS Code commands related to Redivivus retrofit operations, including initiating, confirming, and reverting project retrofits.
import * as vscode from 'vscode';
import type { RedivivusService } from '../../../services/redivivusService.js';
import type { RetrofitService } from '../../../core/retrofit/retrofitService.js';

export function registerRetrofitCommands(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  retrofitService: RetrofitService,
  refreshAll: () => void
): void {
  // Retrofit Project
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.retrofit', async () => {
      if (!redivivus.isInitialized()) {
        vscode.window.showErrorMessage('Run "Redivivus: Initialize Project" first.');
        return;
      }
      await retrofitService.runRetrofit();
      refreshAll();
    })
  );

  // Confirm Retrofit
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.confirmRetrofit', async () => {
      await retrofitService.confirmRetrofit();
      refreshAll();
    })
  );

  // Revert Retrofit
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.revertRetrofit', async () => {
      await retrofitService.revertRetrofit();
      refreshAll();
    })
  );
}