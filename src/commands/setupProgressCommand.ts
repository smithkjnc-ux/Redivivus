// [SCOPE] CHASSIS Setup Progress Command — shows the 10-step setup checklist
import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { SetupProgressService } from '../services/setupProgressService.js';
import { showSetupProgressPanel } from '../services/setupProgressPanel.js';

export function registerSetupProgressCommand(context: vscode.ExtensionContext, chassis: ChassisService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.showSetupProgress', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showWarningMessage('⚠️ No workspace open — you need a project folder first.');
        return;
      }
      const progressService = new SetupProgressService(chassis, root);
      const progress = await progressService.getProgress();
      // [CHASSIS] Pass onRefresh so the panel can re-render in-place after actions complete
      showSetupProgressPanel(progress, () => progressService.getProgress());
    })
  );
}
