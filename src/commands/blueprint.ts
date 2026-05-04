// [SCOPE] Defines and registers VSCode commands for CHASSIS Blueprint operations, including running the interview process and opening the blueprint file.
import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { BlueprintService } from '../services/blueprintService.js';

export function registerBlueprintCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  blueprintService: BlueprintService,
  refreshAll: () => void
): void {
  // Blueprint Interview
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.blueprint', async () => {
      // [WARN] Fragile: This command relies on `chassis.isInitialized()`. If not initialized, it shows an error message.
      if (!chassis.isInitialized()) {
        vscode.window.showErrorMessage('Run "CHASSIS: Initialize Project" first.');
        return;
      }
      // [WARN] Fragile: `blueprintService.runInterview()` could be cancelled or encounter an error.
      const bp = await blueprintService.runInterview();
      if (bp) {
        // [WARN] Fragile: `refreshAll()` is an external callback. Its success and side effects depend on the caller's implementation.
        refreshAll();
        // [WARN] Fragile: `vscode.workspace.openTextDocument` and `vscode.window.showTextDocument` could fail if `chassis.blueprintPath` is invalid or inaccessible.
        const doc = await vscode.workspace.openTextDocument(chassis.blueprintPath);
        vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      }
    })
  );

  // Open Blueprint
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openBlueprint', async () => {
      // [WARN] Fragile: This command relies on `chassis.isInitialized()` but fails silently if not initialized, providing no user feedback.
      if (!chassis.isInitialized()) { return; }
      // [WARN] Fragile: `vscode.workspace.openTextDocument` and `vscode.window.showTextDocument` could fail if `chassis.blueprintPath` is invalid or inaccessible.
      const doc = await vscode.workspace.openTextDocument(chassis.blueprintPath);
      vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    })
  );
}