// [SCOPE] Explorer visual emphasis for the ACTIVE project + category counts. A CATEGORY folder (a subfolder
// of the projects home that holds projects) gets a count badge — "5" = five projects inside, the little
// number PapaJoe asked for (NOT a folder rename — just a badge). A PROJECT folder gets a green dot when it's
// the active one, dimmed otherwise. No active project (home/launcher) => nothing dimmed. Uses VS Code's
// FileDecorationProvider (the only API that tints/badges Explorer items).

import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { isProjectsContainer } from './redivivusPaths.js';
import { isProjectRoot } from './projectResolver.js';

/** Count the project subfolders directly inside `dir` (cheap — one readdir). >0 means `dir` is a category. */
function countProjectsIn(dir: string): number {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && isProjectRoot(path.join(dir, e.name))).length;
  } catch { return 0; }
}

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
    if (!rel || rel.startsWith('..') || rel.startsWith('.')) { return undefined; } // outside home / dotfolder
    const depth = rel.split(path.sep).length;
    if (depth > 2) { return undefined; } // only category folders (1) and projects (1 flat / 2 nested)

    // A category folder = an immediate subfolder that holds projects → count badge + a distinct accent color
    // so it reads as a GROUP, visually separate from project folders. (VS Code's decoration API only allows
    // badge/color/tooltip — no bold/underline/caps on native Explorer items — so colour is the lever.)
    if (depth === 1 && !isProjectRoot(uri.fsPath)) {
      const count = countProjectsIn(uri.fsPath);
      if (count > 0) {
        return {
          badge: count > 99 ? '99' : String(count),
          color: new vscode.ThemeColor('charts.blue'),
          tooltip: `📂 Category — ${count} project${count !== 1 ? 's' : ''}`,
        };
      }
      return undefined; // a plain non-project folder, not a category
    }

    // A project folder (flat or nested) → green dot when active, dimmed otherwise.
    if (isProjectRoot(uri.fsPath)) {
      const active = activeProjectRoot();
      if (!active || isProjectsContainer(active)) { return undefined; } // home/launcher → don't dim
      if (path.resolve(uri.fsPath) === path.resolve(active)) {
        return { badge: '●', color: new vscode.ThemeColor('charts.green'), tooltip: 'Active Redivivus project' };
      }
      return { color: new vscode.ThemeColor('disabledForeground'), tooltip: 'Inactive — open a file or right-click → Open as Redivivus Project' };
    }
    return undefined;
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
