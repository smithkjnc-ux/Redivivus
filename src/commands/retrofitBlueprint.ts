// [SCOPE] CHASSIS Retrofit Blueprint Command — scan project, auto-generate 5 W's, save to config

import * as vscode from 'vscode';
import { RetrofitBlueprintService } from '../services/retrofitBlueprint.js';
import { RoutingService } from '../services/ai/routingService.js';
import { ChassisService } from '../services/chassisService.js';
import { openBlueprintPanel } from '../ui/views/blueprintInterviewPanel.js';
import { Blueprint5W } from '../services/retrofitBlueprint.js';

export function registerRetrofitBlueprintCommand(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  routing: RoutingService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.retrofitBlueprint', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('Open a project folder first.'); return; }

      const confirm = await vscode.window.showInformationMessage(
        'CHASSIS will look at your project and figure out what it does, who it\'s for, and why it exists. Takes about 30 seconds.',
        'Scan my project',
        'Cancel'
      );
      if (confirm !== 'Scan my project') { return; }

      const service = new RetrofitBlueprintService(root, routing);
      const ref: { blueprint: Blueprint5W | null } = { blueprint: null };

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'CHASSIS is reading your project...', cancellable: false },
        async () => { ref.blueprint = await service.generateBlueprint(); }
      );

      const blueprint = ref.blueprint;
      if (!blueprint) {
        vscode.window.showErrorMessage('Couldn\'t read your project — check your AI key and try again.');
        return;
      }

      service.saveToConfig(blueprint);

      const detail = [
        `What it does: ${blueprint.what}`,
        `Who it's for: ${blueprint.who}`,
        `Where it runs: ${blueprint.where}`,
        `Why it exists: ${blueprint.why}`,
      ].join('\n');

      const next = await vscode.window.showInformationMessage(
        'Got it — here\'s what CHASSIS found about your project:',
        { modal: true, detail: detail + '\n\nThis is now saved. You can edit it anytime.' },
        'Looks right',
        'Edit it now'
      );

      if (next === 'Edit it now') {
        openBlueprintPanel(context, chassis, routing);
      }
    })
  );
}
