// [SCOPE] Explorer visual emphasis for the ACTIVE project. When a project is active, every OTHER immediate
// subfolder of the projects home is dimmed (greyed) and the active one gets a green dot badge — so it's
// instantly obvious which project you're working in. No active project (home/launcher) => nothing dimmed.
// Uses VS Code's FileDecorationProvider (the only API that tints/badges Explorer items).

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { isProjectsContainer } from '../../services/project/redivivusPaths.js';

function projectsDir(): string {
  return vscode.workspace.getConfiguration('redivivus')
    .get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());
}

function activeProjectRoot(): string | undefined {
  try { return require('../../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider.instance?.getRoot(); }
  catch { return undefined; }
}

class ProjectFolderDecorations implements vscode.FileDecorationProvider {
  static instance: ProjectFolderDecorations | undefined;
  private _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  /** Re-paint all decorations (call when the active project changes). */
  refresh(): void { this._onDidChange.fire(undefined); }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const container = projectsDir();
    const rel = path.relative(container, uri.fsPath);
    // Only IMMEDIATE subfolders of the projects home (no nested files, no dotfolders, not the home itself).
    if (!rel || rel.startsWith('..') || rel.includes(path.sep) || rel.startsWith('.')) { return undefined; }

    const active = activeProjectRoot();
    // No active project (sitting at home/launcher) -> don't dim anything.
    if (!active || isProjectsContainer(active)) { return undefined; }

    if (path.resolve(uri.fsPath) === path.resolve(active)) {
      return { badge: '●', color: new vscode.ThemeColor('charts.green'), tooltip: 'Active Redivivus project' };
    }
    return { color: new vscode.ThemeColor('disabledForeground'), tooltip: 'Inactive — open a file or right-click → Open as Redivivus Project' };
  }
}

export function registerProjectFolderDecorations(context: vscode.ExtensionContext): void {
  const provider = new ProjectFolderDecorations();
  ProjectFolderDecorations.instance = provider;
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));
}

/** Called when the active project changes so the Explorer re-paints the dim/highlight. */
export function refreshProjectFolderDecorations(): void {
  ProjectFolderDecorations.instance?.refresh();
}
