// [SCOPE] Wizard backup pending logic — handles options when a retrofit backup exists (confirm, revert, test)
// Called by wizardService. No other wizard logic here.

import * as vscode from 'vscode';

export async function handleBackupPendingWizard(): Promise<void> {
  const pick = await vscode.window.showQuickPick([
    {
      label: '$(check)  Everything works — keep the changes',
      description: 'Delete the backup and move forward',
      _command: 'chassis.confirmRetrofit',
    },
    {
      label: '$(discard)  Something broke — undo everything',
      description: 'Restore all original files from backup',
      _command: 'chassis.revertRetrofit',
    },
    {
      label: '$(folder-opened)  Let me test first',
      description: 'Close this and go check your project',
      _command: 'none',
    },
  ], {
    title: 'CHASSIS — You have a pending retrofit',
    placeHolder: 'Your files were restructured. Did everything work?',
  });
  if (pick && (pick as any)._command !== 'none') {
    await vscode.commands.executeCommand((pick as any)._command);
  }
}
