// [SCOPE] Defines and registers VSCode commands for CHASSIS Blueprint operations, including running the interview process and opening the blueprint file.
import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { BlueprintService } from '../services/blueprint/blueprintService.js';

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

  // Lock Blueprint
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.lockBlueprint', async () => {
      if (!chassis.isInitialized()) { return; }
      
      const config = chassis.loadConfig();
      if (!config || !config.blueprint) {
        vscode.window.showErrorMessage('No blueprint found. Run the blueprint interview first.');
        return;
      }

      if (config.blueprint.locked) {
        vscode.window.showInformationMessage('Blueprint is already locked.');
        return;
      }

      // Open the blueprint file so the user can verify it
      const doc = await vscode.workspace.openTextDocument(chassis.blueprintPath);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

      // Ask for confirmation to lock
      const lockOption = 'Lock Blueprint';
      const cancelOption = 'Not Yet';
      const choice = await vscode.window.showInformationMessage(
        'Please verify your blueprint. Are you ready to lock it in?',
        { modal: false },
        lockOption,
        cancelOption
      );

      if (choice === lockOption) {
        config.blueprint.locked = true;
        chassis.saveConfig(config);
        vscode.window.showInformationMessage('Blueprint successfully locked.');
        refreshAll();
      }
    })
  );
}