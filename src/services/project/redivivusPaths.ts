// [SCOPE] Redivivus path helpers and state checks — workspace root, .redivivus/ directory paths, initialization status
// Used by redivivusInit, redivivusConfig, redivivusLogging, redivivusRules. No file system operations here.

import * as vscode from 'vscode';
import * as path from 'path';

export class RedivivusPaths {
  // [WARN] Do NOT cache workspaceRoot — read dynamically so the header rebuilds correctly
  // after a build auto-adds a new project folder to the workspace.
  // If an explicit root is provided at construction, always use it (scaffoldAt / one-off builds).
  private readonly _explicitRoot: string | undefined;

  constructor(root?: string) {
    this._explicitRoot = root;
  }

  getWorkspaceRoot(): string | undefined {
    return this._explicitRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  get redivivusDir(): string {
    return path.join(this.getWorkspaceRoot() || '', '.redivivus');
  }

  get configPath(): string {
    return path.join(this.redivivusDir, 'config.json');
  }

  get blueprintPath(): string {
    return path.join(this.redivivusDir, 'blueprint.md');
  }

  get worklogPath(): string {
    return path.join(this.redivivusDir, 'work_log.md');
  }

  get deadendsPath(): string {
    return path.join(this.redivivusDir, 'dead_ends.md');
  }

  get sessionsDir(): string {
    return path.join(this.redivivusDir, 'sessions');
  }

  get roadmapPath(): string {
    return path.join(this.getWorkspaceRoot() || '', 'REDIVIVUS_ROADMAP.md');
  }
}

// [Model A] The projects container (~/projects) is HOME, never a project — even if a stray .redivivus
// config sits there from the pre-Model-A era (when ~/projects itself got scaffolded as a project).
// Treating it as initialized would show a single-project dashboard instead of the launcher and route
// container builds as fixes. Home is never "initialized"; projects are its SUBFOLDERS.
export function isProjectsContainer(root: string | undefined): boolean {
  if (!root) { return false; }
  const os = require('os');
  const cfg = vscode.workspace.getConfiguration('redivivus')
    .get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());
  return path.resolve(root) === path.resolve(cfg);
}

export function isInitialized(paths: RedivivusPaths): boolean {
  if (isProjectsContainer(paths.getWorkspaceRoot())) { return false; }
  return require('fs').existsSync(paths.redivivusDir) && require('fs').existsSync(paths.configPath);
}

export function hasWorkspace(paths: RedivivusPaths): boolean {
  return paths.getWorkspaceRoot() !== undefined;
}
