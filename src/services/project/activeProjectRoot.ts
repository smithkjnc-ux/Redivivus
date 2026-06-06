// [SCOPE] Resolves the "active project root" for UI features (Preview, Run, History, Visual Editor).
// In the no-reload build flow the project is shown via the Redivivus Project Files tree and is NOT a
// VS Code workspace folder, so workspaceFolders is empty. Fall back to the Project Files tree root,
// then the chat panel's redivivus service root, so those features still find the project on disk.

import * as vscode from 'vscode';

export function getActiveProjectRoot(panel?: any): string | undefined {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (ws) { return ws; }
  try {
    const r = require('../../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider.instance?.getRoot();
    if (r) { return r; }
  } catch { /* provider not available */ }
  try {
    const r = panel?.redivivus?.getWorkspaceRoot?.();
    if (r) { return r; }
  } catch { /* no service root */ }
  return undefined;
}
