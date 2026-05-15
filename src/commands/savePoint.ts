// [SCOPE] Save Point command — opens the Build History panel (two-tab: Save Points + Build History)
// [DONE] Previously ran git commit directly. Now opens panel so user can create save points AND
//        browse/undo build history from one place.
import * as vscode from 'vscode';
import { showBuildHistoryPanel } from '../ui/views/buildHistoryPanel.js';

export function registerSavePointCommand(context: vscode.ExtensionContext) {
  // chassis.savePoint — toolbar button; opens the panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.savePoint', () => {
      showBuildHistoryPanel(context);
    })
  );
  // chassis.showBuildHistory — alias, same panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.showBuildHistory', () => {
      showBuildHistoryPanel(context);
    })
  );
}

