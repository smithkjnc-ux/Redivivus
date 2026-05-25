// [SCOPE] Redivivus Misc commands — undo phased build

import * as vscode from 'vscode';
import { getPhaseUndoService } from '../services/phaseUndoService.js';

export function registerUndoCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.undoPhase', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
      const phaseUndo = getPhaseUndoService(root);
      const builds = phaseUndo.listBuilds();
      if (builds.length === 0) { vscode.window.showInformationMessage('No phased builds to undo.'); return; }

      const buildItems = builds.map(b => ({
        label: `${new Date(parseInt(b.buildId)).toLocaleString()}`,
        description: `${b.phaseCount} phases — ${b.task.substring(0, 40)}${b.task.length > 40 ? '...' : ''}`,
        detail: b.buildId,
      }));
      const selectedBuild = await vscode.window.showQuickPick(buildItems, { placeHolder: 'Select a build to undo a phase from' });
      if (!selectedBuild) {return;}

      const buildId = selectedBuild.detail;
      const undoablePhases = phaseUndo.getUndoablePhases(buildId);
      if (undoablePhases.length === 0) { vscode.window.showInformationMessage('No undoable phases in this build.'); return; }

      const phaseItems = undoablePhases.map(p => ({
        label: `Phase ${p.phaseNumber}: ${p.phaseName}`,
        description: `${p.files.length} file(s)`,
        detail: p.phaseNumber.toString(),
      }));
      const selectedPhase = await vscode.window.showQuickPick(phaseItems, { placeHolder: 'Select phase to undo (newest first)' });
      if (!selectedPhase) {return;}

      const phaseNumber = parseInt(selectedPhase.detail!);
      const success = phaseUndo.undoPhase(buildId, phaseNumber);
      if (success) { vscode.window.showInformationMessage(`✅ Undid Phase ${phaseNumber}`); }
      else { vscode.window.showErrorMessage(`❌ Failed to undo Phase ${phaseNumber}`); }
    })
  );
}
