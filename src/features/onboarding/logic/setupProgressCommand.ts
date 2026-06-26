// [SCOPE] Redivivus Setup Progress Command — shows the 10-step setup checklist
import * as vscode from 'vscode';
import type { RedivivusService } from '../../../shared/vscode/application/redivivusService.js';
import { SetupProgressService } from '../../project/application/setupProgressService.js';
import { showSetupProgressPanel } from '../../project/application/setupProgressPanel.js';

export function registerSetupProgressCommand(context: vscode.ExtensionContext, redivivus: RedivivusService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.showSetupProgress', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showWarningMessage('⚠️ No workspace open — you need a project folder first.');
        return;
      }
      const progressService = new SetupProgressService(redivivus, root);
      const progress = await progressService.getProgress();
      // [Redivivus] Pass onRefresh so the panel can re-render in-place after actions complete
      showSetupProgressPanel(progress, () => progressService.getProgress());
    })
  );
}
