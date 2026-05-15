// [SCOPE] CHASSIS Retrofit Blueprint Command — scan codebase, auto-generate 5 W's

import * as vscode from 'vscode';
import { RetrofitBlueprintService } from '../services/retrofitBlueprint.js';
import { RoutingService } from '../services/ai/routingService.js';
import { ChassisService } from '../services/chassisService.js';
import * as path from 'path';
import * as fs from 'fs';

export function registerRetrofitBlueprintCommand(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  routing: RoutingService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.retrofitBlueprint', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('No workspace open.');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        'This will scan your codebase and generate a CHASSIS blueprint from the existing code. Continue?',
        { modal: true },
        'Generate'
      );

      if (confirm !== 'Generate') { return; }

      vscode.window.showInformationMessage('Scanning codebase... this may take a moment.');

      const service = new RetrofitBlueprintService(root, routing);
      const blueprint = await service.generateBlueprint();

      if (!blueprint) {
        vscode.window.showErrorMessage('Failed to generate blueprint. Check your AI key and try again.');
        return;
      }

      const blueprintPath = path.join(root, '.chassis', 'CHASSIS_BLUEPRINT.md');
      const markdown = service.formatMarkdown(blueprint);
      fs.writeFileSync(blueprintPath, markdown);

      const open = await vscode.window.showInformationMessage(
        'Blueprint generated and saved to .chassis/CHASSIS_BLUEPRINT.md',
        'Open Blueprint'
      );

      if (open === 'Open Blueprint') {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(blueprintPath));
        await vscode.window.showTextDocument(doc, { preview: false });
      }
    })
  );
}
