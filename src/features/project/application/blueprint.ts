// [SCOPE] Defines and registers VSCode commands for Redivivus Blueprint operations, including running the interview process and opening the blueprint file.
import * as vscode from 'vscode';
import type { RedivivusService } from '../../../services/redivivusService.js';
import type { BlueprintService } from '../../../services/blueprint/blueprintService.js';
import { syncBlueprintMd } from '../../../services/blueprint/blueprintWriter.js';

export function registerBlueprintCommands(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  blueprintService: BlueprintService,
  refreshAll: () => void
): void {
  // Blueprint Interview
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.blueprint', async () => {
      // [WARN] Fragile: This command relies on `redivivus.isInitialized()`. If not initialized, it shows an error message.
      if (!redivivus.isInitialized()) {
        vscode.window.showErrorMessage('Run "Redivivus: Initialize Project" first.');
        return;
      }
      // [WARN] Fragile: `blueprintService.runInterview()` could be cancelled or encounter an error.
      const bp = await blueprintService.runInterview();
      if (bp) {
        // [WARN] Fragile: `refreshAll()` is an external callback. Its success and side effects depend on the caller's implementation.
        refreshAll();
        // [WARN] Fragile: `vscode.workspace.openTextDocument` and `vscode.window.showTextDocument` could fail if `redivivus.blueprintPath` is invalid or inaccessible.
        const doc = await vscode.workspace.openTextDocument(redivivus.blueprintPath);
        vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      }
    })
  );

  // Open Blueprint
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.openBlueprint', async () => {
      // [WARN] Fragile: This command relies on `redivivus.isInitialized()` but fails silently if not initialized, providing no user feedback.
      if (!redivivus.isInitialized()) { return; }
      // [WARN] Fragile: `vscode.workspace.openTextDocument` and `vscode.window.showTextDocument` could fail if `redivivus.blueprintPath` is invalid or inaccessible.
      const doc = await vscode.workspace.openTextDocument(redivivus.blueprintPath);
      vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    })
  );

  // Lock Blueprint
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.lockBlueprint', async () => {
      if (!redivivus.isInitialized()) { return; }
      
      const config = redivivus.loadConfig();
      if (!config || !config.blueprint) {
        vscode.window.showErrorMessage('No blueprint found. Run the blueprint interview first.');
        return;
      }

      if (config.blueprint.locked) {
        vscode.window.showInformationMessage('Blueprint is already locked.');
        return;
      }

      // Open the blueprint file so the user can verify it
      const doc = await vscode.workspace.openTextDocument(redivivus.blueprintPath);
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
        redivivus.saveConfig(config);
        syncBlueprintMd(redivivus, config);
        vscode.window.showInformationMessage('Blueprint successfully locked.');
        try { refreshAll(); } catch { /* never block the lock on a refresh error */ }
      }
    })
  );
}