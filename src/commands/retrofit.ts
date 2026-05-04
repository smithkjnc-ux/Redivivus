// [SCOPE] Registers VS Code commands related to CHASSIS retrofit operations, including initiating, confirming, and reverting project retrofits.
import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { RetrofitService } from '../services/retrofitService.js';

export function registerRetrofitCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  retrofitService: RetrofitService,
  refreshAll: () => void
): void {
  // Retrofit Project
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.retrofit', async () => {
      if (!chassis.isInitialized()) {
        vscode.window.showErrorMessage('Run "CHASSIS: Initialize Project" first.');
        return;
      }
      await retrofitService.runRetrofit();
      refreshAll();
    })
  );

  // Confirm Retrofit
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.confirmRetrofit', async () => {
      await retrofitService.confirmRetrofit();
      refreshAll();
    })
  );

  // Revert Retrofit
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.revertRetrofit', async () => {
      await retrofitService.revertRetrofit();
      refreshAll();
    })
  );
}