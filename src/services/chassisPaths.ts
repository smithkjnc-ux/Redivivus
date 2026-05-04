// [SCOPE] CHASSIS path helpers and state checks — workspace root, .chassis/ directory paths, initialization status
// Used by chassisInit, chassisConfig, chassisLogging, chassisRules. No file system operations here.

import * as vscode from 'vscode';
import * as path from 'path';

export class ChassisPaths {
  private workspaceRoot: string | undefined;

  constructor(root?: string) {
    this.workspaceRoot = root || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  get chassisDir(): string {
    return path.join(this.workspaceRoot || '', '.chassis');
  }

  get configPath(): string {
    return path.join(this.chassisDir, 'config.json');
  }

  get blueprintPath(): string {
    return path.join(this.chassisDir, 'blueprint.md');
  }

  get worklogPath(): string {
    return path.join(this.chassisDir, 'work_log.md');
  }

  get deadendsPath(): string {
    return path.join(this.chassisDir, 'dead_ends.md');
  }

  get sessionsDir(): string {
    return path.join(this.chassisDir, 'sessions');
  }

  get roadmapPath(): string {
    return path.join(this.workspaceRoot || '', 'CHASSIS_ROADMAP.md');
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot;
  }
}

export function isInitialized(paths: ChassisPaths): boolean {
  return require('fs').existsSync(paths.chassisDir) && require('fs').existsSync(paths.configPath);
}

export function hasWorkspace(paths: ChassisPaths): boolean {
  return paths.getWorkspaceRoot() !== undefined;
}
