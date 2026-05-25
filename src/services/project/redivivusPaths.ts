// [SCOPE] Redivivus path helpers and state checks — workspace root, .redivivus/ directory paths, initialization status
// Used by redivivusInit, redivivusConfig, redivivusLogging, redivivusRules. No file system operations here.

import * as vscode from 'vscode';
import * as path from 'path';

export class RedivivusPaths {
  private workspaceRoot: string | undefined;

  constructor(root?: string) {
    this.workspaceRoot = root || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  get redivivusDir(): string {
    return path.join(this.workspaceRoot || '', '.redivivus');
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
    return path.join(this.workspaceRoot || '', 'REDIVIVUS_ROADMAP.md');
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot;
  }
}

export function isInitialized(paths: RedivivusPaths): boolean {
  return require('fs').existsSync(paths.redivivusDir) && require('fs').existsSync(paths.configPath);
}

export function hasWorkspace(paths: RedivivusPaths): boolean {
  return paths.getWorkspaceRoot() !== undefined;
}
