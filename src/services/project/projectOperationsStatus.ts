// [SCOPE] Project status helpers — getProjectsDir, getProjectStatus, getCurrentProjectInfo
// Extracted from projectOperations.ts to keep it under 200 lines.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

export interface ProjectInfo {
  name: string;
  path: string;
  isRedivivus: boolean;
  version?: string;
  blueprintStatus?: string;
  lastSession?: string;
  fileCount?: number;
  todoCount?: number;
  category?: string; // '' when uncategorised (project sits directly at the projects root)
}

export function getProjectsDir(): string {
  const config = vscode.workspace.getConfiguration('redivivus');
  const projectsDir = config.get<string>('projectsDirectory') || '~/projects';
  return projectsDir.replace('~', homedir());
}

/** Get status of a specific project without opening it */
export async function getProjectStatus(projectName: string): Promise<string | null> {
  const projectsDir = getProjectsDir();
  const projectPath = path.join(projectsDir, projectName);

  if (!fs.existsSync(projectPath)) {
    return `Project not found: ${projectName}`;
  }

  const configPath = path.join(projectPath, '.redivivus', 'config.json');
  if (!fs.existsSync(configPath)) {
    return `${projectName} is not a Redivivus project`;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    let status = `**${config.projectName || projectName}**\n\n`;
    status += `**Version:** ${config.version || 'v0.1.0'}\n`;

    if (config.blueprint) {
      const bp = config.blueprint;
      status += `**Blueprint:** ${bp.locked ? 'Locked' : 'Draft'}\n`;
      status += `**Who:** ${bp.who || '?'}\n`;
      status += `**What:** ${bp.what || '?'}\n`;
      status += `**Where:** ${bp.where || '?'}\n`;
    }

    if (config.sessions && config.sessions.length > 0) {
      const lastSession = config.sessions[config.sessions.length - 1];
      status += `**Last Session:** ${lastSession.startTime || 'Never'}\n`;
      if (lastSession.goal) { status += `**Goal:** ${lastSession.goal}\n`; }
    }

    const workLogPath = path.join(projectPath, '.redivivus', 'work_log.md');
    if (fs.existsSync(workLogPath)) {
      const workLog = fs.readFileSync(workLogPath, 'utf-8');
      const lines = workLog.split('\n').filter(l => l.trim());
      if (lines.length > 0) { status += `\n**Recent Work Log:**\n${lines.slice(-5).join('\n')}\n`; }
    }

    return status;
  } catch (e) {
    return `Error reading project status: ${(e as Error).message}`;
  }
}

/** Get current workspace project info */
export function getCurrentProjectInfo(): string | null {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return 'No project open'; }

  const configPath = path.join(root, '.redivivus', 'config.json');
  if (!fs.existsSync(configPath)) { return 'Current workspace is not a Redivivus project'; }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    let info = `**${config.projectName || path.basename(root)}**\n\n`;
    info += `**Version:** ${config.version || 'v0.1.0'}\n`;

    if (config.blueprint) {
      const bp = config.blueprint;
      info += `**Blueprint:** ${bp.locked ? 'Locked' : 'Draft'}\n`;
      info += `**Who:** ${bp.who || '?'}\n`;
      info += `**What:** ${bp.what || '?'}\n`;
      info += `**Where:** ${bp.where || '?'}\n`;
    }

    if (config.sessions && config.sessions.length > 0) {
      const lastSession = config.sessions[config.sessions.length - 1];
      info += `**Last Session:** ${lastSession.startTime || 'Never'}\n`;
      if (lastSession.goal) { info += `**Goal:** ${lastSession.goal}\n`; }
      info += `**Total Sessions:** ${config.sessions.length}\n`;
    }

    return info;
  } catch (e) {
    return `Error reading project info: ${(e as Error).message}`;
  }
}
