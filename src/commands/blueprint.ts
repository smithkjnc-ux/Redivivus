// [SCOPE] CHASSIS Blueprint commands — interview + open blueprint file

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
      if (!chassis.isInitialized()) {
        vscode.window.showErrorMessage('Run "CHASSIS: Initialize Project" first.');
        return;
      }
      const bp = await blueprintService.runInterview();
      if (bp) {
        refreshAll();
        const doc = await vscode.workspace.openTextDocument(chassis.blueprintPath);
        vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      }
    })
  );

  // Open Blueprint
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openBlueprint', async () => {
      if (!chassis.isInitialized()) { return; }
      const doc = await vscode.workspace.openTextDocument(chassis.blueprintPath);
      vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    })
  );
}
