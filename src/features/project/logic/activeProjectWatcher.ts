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

/** Maps a file path to the project it belongs to — the nearest ancestor folder marked as a project, stopping
 *  at the projects home. Supports both flat (~/projects/tetris) and category-nested (~/projects/games/tetris)
 *  layouts. Returns undefined for files in the home itself or in a category folder (not a project). */
export function projectForFile(filePath: string): string | undefined {
  const { nearestProjectRoot } = require('./projectResolver.js');
  return nearestProjectRoot(filePath, projectsDir());
}

/** Sets the active project and refreshes the chat header to follow it. No-op if it's already active. */
export function activateProject(projectDir: string): void {
  try {
    const PFP = require('../../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider;
    if (PFP.instance?.getRoot() === projectDir) { return; } // already the active project
    PFP.instance?.setRoot(projectDir);
    const chatPanel = require('../../ui/panels/chat/chatPanel.js').ChatPanel;
    chatPanel.currentPanel?.refresh();
    // [FIX] Update the webview panel tab title so the "projects" label tracks the active project.
    // The tab title is set once at creation time from the workspace folder name; since we never
    // reload the workspace in Model A, we must update it explicitly here on every activation.
    try { const _cp = chatPanel.currentPanel as any; if (_cp?._panel) { _cp._panel.title = require('path').basename(projectDir); } } catch {}
    // [FIX] Push the project name into the #project-name-label div above "● ready" in the chat panel.
    try { const _cp2 = chatPanel.currentPanel as any; if (_cp2?._panel) { _cp2._panel.webview.postMessage({ type: 'update-project-name', name: require('path').basename(projectDir) }); } } catch {}
    require('./projectFolderDecorations.js').refreshProjectFolderDecorations(); // dim others, badge the active
    import('./projectFocusMode.js').then(m => m.applyFocus(projectDir)).catch(() => {}); // hide the other projects
  } catch { /* non-fatal — active-project switching is a convenience, never block */ }
}

/** Auto-activate from an opened file — skips protected folders. Returns true if a project was activated. */
function activateProjectForFile(filePath?: string): boolean {
  if (!filePath) { return false; }
  const projectDir = projectForFile(filePath);
  if (!projectDir) { return false; }
  if (isProtectedProject(projectDir)) { return false; } // Redivivus's own source — never auto-target it
  activateProject(projectDir);
  return true;
}

export function registerActiveProjectWatcher(context: vscode.ExtensionContext): void {
  // Auto: opening a file in a project subfolder makes it active.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(e => activateProjectForFile(e?.document.uri.fsPath))
  );
  // Explicit: right-click a folder -> "Open as Redivivus Project" (VS Code has no folder-select event,
  // so selecting/expanding a folder can't auto-activate — this command is the reliable folder path).
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.openAsProject', (uri?: vscode.Uri) => {
      const dir = uri?.fsPath;
      if (!dir) { return; }
      activateProject(dir);
      vscode.commands.executeCommand('redivivus.openChatPanel'); // surface the chat so the switch is visible
    })
  );
  // [INOTIFY] Once at startup, make sure heavy dirs aren't watched so the container workspace doesn't blow
  // the OS inotify limit. Independent of the active project — these are static derived-dir globs.
  import('./projectFocusMode.js').then(m => m.applyWatcherExcludes()).catch(() => {});
  // Activate for whatever is already open at startup. If nothing activates (home/launcher), clear any
  // stale focus-mode excludes from a prior session so all project folders are visible.
  const activated = activateProjectForFile(vscode.window.activeTextEditor?.document.uri.fsPath);
  if (!activated) { import('./projectFocusMode.js').then(m => m.clearFocus()).catch(() => {}); }
}
