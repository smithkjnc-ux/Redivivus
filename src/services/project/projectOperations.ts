// [SCOPE] Redivivus Project Operations — local project listing, opening, status checking without AI
// Status helpers (getProjectStatus, getCurrentProjectInfo) -> projectOperationsStatus.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  getProjectsDir,
  getProjectStatus as getProjectStatusFn,
  getCurrentProjectInfo as getCurrentProjectInfoFn,
} from './projectOperationsStatus.js';

export type { ProjectInfo } from './projectOperationsStatus.js';
import type { ProjectInfo } from './projectOperationsStatus.js';

export class ProjectOperations {
  private getProjectsDir(): string { return getProjectsDir(); }

  /** List all projects in the projects directory */
  async listProjects(): Promise<{ redivivus: ProjectInfo[]; other: string[] }> {
    const projectsDir = this.getProjectsDir();
    const redivivusProjects: ProjectInfo[] = [];
    const otherProjects: string[] = [];

    if (!fs.existsSync(projectsDir)) { return { redivivus: [], other: [] }; }

    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) { continue; }
      const projectPath = path.join(projectsDir, entry.name);
      const redivivusPath = path.join(projectPath, '.redivivus', 'config.json');

      if (fs.existsSync(redivivusPath)) {
        const info = await this.getProjectInfo(projectPath, entry.name);
        redivivusProjects.push(info);
      } else {
        otherProjects.push(entry.name);
      }
    }

    return { redivivus: redivivusProjects, other: otherProjects };
  }

  private async getProjectInfo(projectPath: string, name: string): Promise<ProjectInfo> {
    const configPath = path.join(projectPath, '.redivivus', 'config.json');
    const info: ProjectInfo = { name, path: projectPath, isRedivivus: true };

    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        info.version = config.version || 'v0.1.0';
        if (config.blueprint) {
          if (config.blueprint.locked) { info.blueprintStatus = 'Locked'; }
          else if (config.blueprint.who && config.blueprint.what) { info.blueprintStatus = 'Draft'; }
          else { info.blueprintStatus = 'Empty'; }
        }
        if (config.sessions && config.sessions.length > 0) {
          info.lastSession = config.sessions[config.sessions.length - 1].startTime || 'Never';
        }
      } catch { /* Config parse error, keep defaults */ }
    }

    return info;
  }

  /** Open a project folder in VS Code */
  async openProject(projectName: string): Promise<boolean> {
    const projectsDir = this.getProjectsDir();
    const projectPath = path.join(projectsDir, projectName);

    if (!fs.existsSync(projectPath)) {
      vscode.window.showErrorMessage(`Project not found: ${projectName}`);
      return false;
    }

    // [WARN] Use openWorkspace with the .code-workspace file — openFolder creates "Untitled (Workspace)" and skips activation.
    const wsFile = path.join(projectPath, `${projectName}.code-workspace`);
    if (!fs.existsSync(wsFile)) {
      try { fs.writeFileSync(wsFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2)); }
      catch { /* best-effort */ }
    }
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(wsFile), false);
    return true;
  }

  async getProjectStatus(projectName: string): Promise<string | null> {
    return getProjectStatusFn(projectName);
  }

  getCurrentProjectInfo(): string | null {
    return getCurrentProjectInfoFn();
  }
}
