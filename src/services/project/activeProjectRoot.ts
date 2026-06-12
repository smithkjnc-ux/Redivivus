// [SCOPE] Resolves the "active project root" for UI features (Preview, Run, History, Visual Editor).
// In the no-reload build flow the project is shown via the Redivivus Project Files tree and is NOT a
// VS Code workspace folder, so workspaceFolders is empty. Fall back to the Project Files tree root,
// then the chat panel's redivivus service root, so those features still find the project on disk.

import * as vscode from 'vscode';
import { isProjectsContainer } from './redivivusPaths.js';

export function getActiveProjectRoot(panel?: any): string | undefined {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  // [Model A][W2 follow-up] If the workspace folder is a REAL project, use it. But under Model A the
  // workspace is the projects CONTAINER (~/projects) — the active project is the built/opened SUBFOLDER
  // (tracked by the Project Files tree), not the container. Returning the container made Run report "no
  // entry point" and Preview serve a random sibling (asteroids) via findHtmlRoot. Prefer the active subfolder.
  if (ws && !isProjectsContainer(ws)) { return ws; }
  try {
    const r = require('../../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider.instance?.getRoot();
    if (r && !isProjectsContainer(r)) { return r; }
  } catch { /* provider not available */ }
  try {
    const r = panel?.redivivus?.getWorkspaceRoot?.();
    if (r && !isProjectsContainer(r)) { return r; }
  } catch { /* no service root */ }
  return ws; // last resort: the workspace root (even if it's the container) rather than undefined
}
