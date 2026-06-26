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

    // [CATEGORY] enumerateProjects finds projects both at the root AND one level inside category folders,
    // and tags each with its derived category. "other" = top-level folders that are neither projects nor
    // categories (no projects inside) — i.e. plain non-Redivivus folders.
    const { enumerateProjects, isProjectRoot } = require('./projectResolver.js');
    const projects = enumerateProjects(projectsDir) as Array<{ path: string; name: string; category: string }>;
    const categoryNames = new Set(projects.map(p => p.category).filter(Boolean));
    for (const p of projects) {
      const info = await this.getProjectInfo(p.path, p.name);
      info.category = p.category;
      redivivusProjects.push(info);
    }
    for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) { continue; }
      const full = path.join(projectsDir, entry.name);
      if (!isProjectRoot(full) && !categoryNames.has(entry.name)) { otherProjects.push(entry.name); }
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

    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath), { forceNewWindow: false });
    return true;
  }

  async getProjectStatus(projectName: string): Promise<string | null> {
    return getProjectStatusFn(projectName);
  }

  getCurrentProjectInfo(): string | null {
    return getCurrentProjectInfoFn();
  }
}
