// [SCOPE] Active-project detection. When the user opens a file inside a subfolder of the projects home,
// that subfolder becomes the ACTIVE Redivivus project — the chat header/dashboard follows it. The workspace
// stays the projects home (no reload); only the active project changes (via ProjectFilesProvider, which the
// header reads under Model A / W2). PROTECTED folders (Redivivus's own source) are skipped so Redivivus can
// never point its build/fix pipeline at itself — the "working on its own self" paradox PapaJoe flagged.

import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Default protected = Redivivus's own source repos. User-extendable via redivivus.protectedFolders, and any
// folder can be protected by dropping a `.redivivusignore` marker file in it.
const DEFAULT_PROTECTED = ['redivivus', 'redivivus-backend', 'redivivus-web', 'redivivus-build', 'redivivus-templates'];

function projectsDir(): string {
  return vscode.workspace.getConfiguration('redivivus')
    .get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());
}

/** A folder is protected (never auto-activated as a build/fix target) if it's in the list or has the marker. */
export function isProtectedProject(projectDir: string): boolean {
  const name = path.basename(projectDir);
  const list = vscode.workspace.getConfiguration('redivivus').get<string[]>('protectedFolders', DEFAULT_PROTECTED);
  if (list.includes(name)) { return true; }
  try { if (fs.existsSync(path.join(projectDir, '.redivivusignore'))) { return true; } } catch {}
  return false;
}

/** Maps a file path to the immediate project subfolder of the projects home, or undefined if not applicable. */
export function projectForFile(filePath: string): string | undefined {
  const container = projectsDir();
  const rel = path.relative(container, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) { return undefined; } // not under the home
  const seg = rel.split(path.sep)[0];
  if (!seg || seg.startsWith('.')) { return undefined; } // a dotfolder, or a file directly in home
  return path.join(container, seg);
}

/** Sets the active project (no-op if unchanged or protected) and refreshes the chat header to follow it. */
function activateProjectForFile(filePath?: string): void {
  if (!filePath) { return; }
  const projectDir = projectForFile(filePath);
  if (!projectDir) { return; }
  if (isProtectedProject(projectDir)) { return; } // Redivivus's own source — never auto-target it
  try {
    const PFP = require('../../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider;
    if (PFP.instance?.getRoot() === projectDir) { return; } // already the active project
    PFP.instance?.setRoot(projectDir);
    require('../../ui/panels/chat/chatPanel.js').ChatPanel.currentPanel?.refresh();
  } catch { /* non-fatal — active-project switching is a convenience, never block */ }
}

export function registerActiveProjectWatcher(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(e => activateProjectForFile(e?.document.uri.fsPath))
  );
  // Activate for whatever is already open at startup.
  activateProjectForFile(vscode.window.activeTextEditor?.document.uri.fsPath);
}
