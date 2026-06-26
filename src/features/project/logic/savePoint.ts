// [SCOPE] Save Point command — opens the Build History panel (two-tab: Save Points + Build History)
// [DONE] Previously ran git commit directly. Now opens panel so user can create save points AND
//        browse/undo build history from one place.
import * as vscode from 'vscode';
import { showBuildHistoryPanel } from '../../chat/ui/buildHistoryPanel.js';

export function registerSavePointCommand(context: vscode.ExtensionContext) {
  // redivivus.savePoint — toolbar button; opens the panel
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.savePoint', () => {
      showBuildHistoryPanel(context);
    })
  );
  // redivivus.showBuildHistory — alias, same panel
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.showBuildHistory', () => {
      showBuildHistoryPanel(context);
    })
  );
  // [BUILD RECORD] redivivus.showBuildRecord — reassemble the full build/fix timeline from saved data into
  // docs/REDIVIVUS_RECORD.md and open it. No new data stored; it stitches revisions + logs + build_log.
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.showBuildRecord', async () => {
      try {
        const { getActiveProjectRoot } = await import('./activeProjectRoot.js');
        const root = getActiveProjectRoot();
        if (!root) { vscode.window.showWarningMessage('Open a Redivivus project to see its build record.'); return; }
        const { writeBuildRecord } = await import('../../build/services/buildRecordService.js');
        const out = writeBuildRecord(root);
        const doc = await vscode.workspace.openTextDocument(out);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (e) {
        vscode.window.showErrorMessage('Could not reassemble the build record: ' + (e instanceof Error ? e.message : String(e)));
      }
    })
  );
}

