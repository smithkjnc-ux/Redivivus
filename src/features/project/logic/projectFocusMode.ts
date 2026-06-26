// [SCOPE] Focus mode — while a project is active, HIDE every other project folder from the Explorer so the
// user can't wander into a different project. VS Code has no "lock a visible folder" API, so we use
// files.exclude (the only mechanism): hide the siblings, show them again on close. Operates ONLY when the
// workspace is the projects home, only touches workspace-level files.exclude, and only manages keys that are
// project-folder names — the user's own files.exclude entries are preserved. Self-heals on startup.
// Also manages files.watcherExclude so the Model-A container workspace doesn't exhaust the OS inotify
// watcher limit ("Unable to watch for file changes") across every sibling project — see applyWatcherExcludes.

import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { isProjectsContainer } from './redivivusPaths.js';

const EXCLUDE_KEY = 'files.exclude';
const WATCHER_KEY = 'files.watcherExclude';

// [INOTIFY] Heavy/derived directories that should never be file-watched. VS Code's defaults cover
// node_modules/.git only partially and miss build outputs, virtualenvs, and our snapshots — multiplied
// across every sibling project in the ~/projects container, that blows the OS inotify limit. These globs
// are recursive (**/) so they match at any depth under the workspace.
const MANAGED_WATCHER_GLOBS = [
  '**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/out/**',
  '**/.redivivus/snapshots/**', '**/.redivivus/logs/**', '**/__pycache__/**',
  '**/.venv/**', '**/venv/**', '**/.next/**', '**/target/**', '**/coverage/**',
];

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
  // [CATEGORY] Keep the active project's TOP-LEVEL folder visible — for a nested project that's its category
  // (e.g. games/tetris → keep "games"), for a flat project it's the project itself. Keying off basename would
  // hide the active project's own category folder.
  const activeTop = path.relative(projectsDir(), activeDir).split(path.sep)[0] || path.basename(activeDir);
  const next = baseWorkspaceExclude();
  for (const name of projectFolderNames()) { if (name !== activeTop) { next[name] = true; } }
  await writeExclude(next);
}

/** Show all project folders again (remove our managed excludes). */
export async function clearFocus(): Promise<void> {
  if (!workspaceIsHome()) { return; }
  await writeExclude(baseWorkspaceExclude());
}

/** Ensure VS Code does not file-watch the heavy/derived directories under the projects home. Without this
 *  the Model-A container workspace tries to watch every sibling project's node_modules/build/snapshot
 *  files and exhausts the OS inotify limit ("Unable to watch for file changes") — a fresh-install problem
 *  for EVERY user, not just one machine. Merges our managed globs into the workspace files.watcherExclude,
 *  preserving the user's own entries, and only writes when something is actually missing (idempotent — no
 *  settings.json churn on every startup). No-op unless the workspace is the projects home. */
export async function applyWatcherExcludes(): Promise<void> {
  if (!workspaceIsHome()) { return; }
  const insp = vscode.workspace.getConfiguration().inspect<Record<string, boolean>>(WATCHER_KEY);
  const next: Record<string, boolean> = { ...(insp?.workspaceValue || {}) };
  let changed = false;
  for (const glob of MANAGED_WATCHER_GLOBS) { if (next[glob] !== true) { next[glob] = true; changed = true; } }
  if (!changed) { return; } // already in place
  try { await vscode.workspace.getConfiguration().update(WATCHER_KEY, next, vscode.ConfigurationTarget.Workspace); } catch { /* never block on a settings write */ }
}
