// [SCOPE] Focus mode — while a project is active, HIDE every other project folder from the Explorer so the
// user can't wander into a different project. VS Code has no "lock a visible folder" API, so we use
// files.exclude (the only mechanism): hide the siblings, show them again on close. Operates ONLY when the
// workspace is the projects home, only touches workspace-level files.exclude, and only manages keys that are
// project-folder names — the user's own files.exclude entries are preserved. Self-heals on startup.

import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { isProjectsContainer } from '../../services/project/redivivusPaths.js';

const EXCLUDE_KEY = 'files.exclude';

function projectsDir(): string {
  return vscode.workspace.getConfiguration('redivivus')
    .get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());
}

function workspaceIsHome(): boolean {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return !!root && isProjectsContainer(root);
}

/** Immediate (non-dot) subfolder names of the projects home — the keys we manage. */
function projectFolderNames(): string[] {
  try {
    return fs.readdirSync(projectsDir(), { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
  } catch { return []; }
}

/** The WORKSPACE-level files.exclude (not the merged defaults) with our managed keys stripped = user's base. */
function baseWorkspaceExclude(): Record<string, boolean> {
  const insp = vscode.workspace.getConfiguration().inspect<Record<string, boolean>>(EXCLUDE_KEY);
  const ws: Record<string, boolean> = { ...(insp?.workspaceValue || {}) };
  for (const name of projectFolderNames()) { delete ws[name]; }
  return ws;
}

async function writeExclude(next: Record<string, boolean>): Promise<void> {
  // undefined removes the workspace setting entirely (keeps ~/projects/.vscode/settings.json clean).
  const value = Object.keys(next).length ? next : undefined;
  try { await vscode.workspace.getConfiguration().update(EXCLUDE_KEY, value, vscode.ConfigurationTarget.Workspace); } catch { /* never block on a settings write */ }
}

/** Hide every project folder EXCEPT the active one. No-op unless the workspace is the projects home. */
export async function applyFocus(activeDir: string): Promise<void> {
  if (!workspaceIsHome()) { return; }
  if (!activeDir || isProjectsContainer(activeDir)) { return clearFocus(); }
  const activeName = path.basename(activeDir);
  const next = baseWorkspaceExclude();
  for (const name of projectFolderNames()) { if (name !== activeName) { next[name] = true; } }
  await writeExclude(next);
}

/** Show all project folders again (remove our managed excludes). */
export async function clearFocus(): Promise<void> {
  if (!workspaceIsHome()) { return; }
  await writeExclude(baseWorkspaceExclude());
}
