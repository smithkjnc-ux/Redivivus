// [SCOPE] CHASSIS Project Operations — local project listing, opening, status checking without AI

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

export interface ProjectInfo {
  name: string;
  path: string;
  isChassis: boolean;
  version?: string;
  blueprintStatus?: string;
  lastSession?: string;
  fileCount?: number;
  todoCount?: number;
}

export class ProjectOperations {
  private getProjectsDir(): string {
    const config = vscode.workspace.getConfiguration('chassis');
    const projectsDir = config.get<string>('projectsDirectory') || '~/projects';
    return projectsDir.replace('~', homedir());
  }

  /** List all projects in the projects directory */
  async listProjects(): Promise<{ chassis: ProjectInfo[]; other: string[] }> {
    const projectsDir = this.getProjectsDir();
    const chassisProjects: ProjectInfo[] = [];
    const otherProjects: string[] = [];

    if (!fs.existsSync(projectsDir)) {
      return { chassis: [], other: [] };
    }

    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectPath = path.join(projectsDir, entry.name);
      const chassisPath = path.join(projectPath, '.chassis', 'config.json');

      if (fs.existsSync(chassisPath)) {
        const info = await this.getProjectInfo(projectPath, entry.name);
        chassisProjects.push(info);
      } else {
        otherProjects.push(entry.name);
      }
    }

    return { chassis: chassisProjects, other: otherProjects };
  }

  /** Get detailed info about a specific project */
  private async getProjectInfo(projectPath: string, name: string): Promise<ProjectInfo> {
    const configPath = path.join(projectPath, '.chassis', 'config.json');
    const info: ProjectInfo = {
      name,
      path: projectPath,
      isChassis: true,
    };

    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        info.version = config.version || 'v0.1.0';
        
        if (config.blueprint) {
          if (config.blueprint.locked) {
            info.blueprintStatus = 'Locked ✅';
          } else if (config.blueprint.who && config.blueprint.what) {
            info.blueprintStatus = 'Draft';
          } else {
            info.blueprintStatus = 'Empty';
          }
        }

        if (config.sessions && config.sessions.length > 0) {
          const lastSession = config.sessions[config.sessions.length - 1];
          info.lastSession = lastSession.startTime || 'Never';
        }
      } catch (e) {
        // Config parse error, keep defaults
      }
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

    // [WARN] Use openWorkspace with the .code-workspace file to open as a NAMED workspace.
    // openFolder creates an "Untitled (Workspace)" which looks unprofessional and skips activation.
    const wsFile = path.join(projectPath, `${projectName}.code-workspace`);
    if (!fs.existsSync(wsFile)) {
      try {
        fs.writeFileSync(wsFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2));
      } catch { /* best-effort */ }
    }
    const wsUri = vscode.Uri.file(wsFile);
    // openWorkspace requires the workspace file URI, not the folder URI
    await vscode.commands.executeCommand('vscode.openWorkspace', wsUri, false);
    return true;
  }

  /** Get status of a specific project without opening it */
  async getProjectStatus(projectName: string): Promise<string | null> {
    const projectsDir = this.getProjectsDir();
    const projectPath = path.join(projectsDir, projectName);

    if (!fs.existsSync(projectPath)) {
      return `Project not found: ${projectName}`;
    }

    const configPath = path.join(projectPath, '.chassis', 'config.json');
    if (!fs.existsSync(configPath)) {
      return `${projectName} is not a CHASSIS project`;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      let status = `**${config.projectName || projectName}**\n\n`;
      
      status += `**Version:** ${config.version || 'v0.1.0'}\n`;
      
      if (config.blueprint) {
        const bp = config.blueprint;
        status += `**Blueprint:** ${bp.locked ? '🔒 Locked' : '🔶 Draft'}\n`;
        status += `**Who:** ${bp.who || '?'}\n`;
        status += `**What:** ${bp.what || '?'}\n`;
        status += `**Where:** ${bp.where || '?'}\n`;
      }

      if (config.sessions && config.sessions.length > 0) {
        const lastSession = config.sessions[config.sessions.length - 1];
        status += `**Last Session:** ${lastSession.startTime || 'Never'}\n`;
        if (lastSession.goal) {
          status += `**Goal:** ${lastSession.goal}\n`;
        }
      }

      const workLogPath = path.join(projectPath, '.chassis', 'work_log.md');
      if (fs.existsSync(workLogPath)) {
        const workLog = fs.readFileSync(workLogPath, 'utf-8');
        const lines = workLog.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          status += `\n**Recent Work Log:**\n${lines.slice(-5).join('\n')}\n`;
        }
      }

      return status;
    } catch (e) {
      return `Error reading project status: ${(e as Error).message}`;
    }
  }

  /** Get current project info */
  getCurrentProjectInfo(): string | null {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return 'No project open';
    }

    const configPath = path.join(root, '.chassis', 'config.json');
    if (!fs.existsSync(configPath)) {
      return 'Current workspace is not a CHASSIS project';
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      let info = `**${config.projectName || path.basename(root)}**\n\n`;
      
      info += `**Version:** ${config.version || 'v0.1.0'}\n`;
      
      if (config.blueprint) {
        const bp = config.blueprint;
        info += `**Blueprint:** ${bp.locked ? '🔒 Locked' : '🔶 Draft'}\n`;
        info += `**Who:** ${bp.who || '?'}\n`;
        info += `**What:** ${bp.what || '?'}\n`;
        info += `**Where:** ${bp.where || '?'}\n`;
      }

      if (config.sessions && config.sessions.length > 0) {
        const lastSession = config.sessions[config.sessions.length - 1];
        info += `**Last Session:** ${lastSession.startTime || 'Never'}\n`;
        if (lastSession.goal) {
          info += `**Goal:** ${lastSession.goal}\n`;
        }
        info += `**Total Sessions:** ${config.sessions.length}\n`;
      }

      return info;
    } catch (e) {
      return `Error reading project info: ${(e as Error).message}`;
    }
  }
}
