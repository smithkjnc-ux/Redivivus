// [SCOPE] Workspace Context Service — public API and types
import * as vscode from 'vscode';
import * as path from 'path';
import { scanWorkspaceFiles } from './workspaceContextScan.js';
import { detectProjectStructure, findMainEntryPoint, generateSummary } from './workspaceContextDetect.js';
import { findBestTargetForModification } from './workspaceContextTarget.js';

export interface WorkspaceContext {
  rootPath: string;
  projectName: string;
  fileCount: number;
  files: FileInfo[];
  entryPoints: string[];
  recentlyModified: string[];
  structure: ProjectStructure;
  summary: string;
}

export interface FileInfo {
  relativePath: string;
  absolutePath: string;
  size: number;
  modified: Date;
  extension: string;
  isEntryPoint: boolean;
  isConfig: boolean;
  isTest: boolean;
  isDocumentation: boolean;
}

export interface ProjectStructure {
  hasSrc: boolean;
  hasTests: boolean;
  hasDocs: boolean;
  hasConfig: boolean;
  mainLanguage: string;
  framework: string;
  projectType: 'web' | 'node' | 'python' | 'rust' | 'go' | 'mixed' | 'unknown';
}

export class WorkspaceContextService {
  private cache: WorkspaceContext | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL = 30000;

  constructor() {}

  async getContext(): Promise<WorkspaceContext | null> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {return null;}
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) { return this.cache; }
    this.cache = await this.buildContext(root);
    this.cacheTime = Date.now();
    return this.cache;
  }

  async refresh(): Promise<WorkspaceContext | null> {
    this.cache = null;
    return this.getContext();
  }

  private async buildContext(root: string): Promise<WorkspaceContext> {
    const { files, entryPoints } = scanWorkspaceFiles(root);
    const recentlyModified = files
      .filter(f => !f.isConfig && !f.isDocumentation)
      .sort((a, b) => b.modified.getTime() - a.modified.getTime())
      .slice(0, 10)
      .map(f => f.relativePath);
    const structure = detectProjectStructure(files);
    const mainEntry = findMainEntryPoint(files, structure);
    const summary = generateSummary(files, structure, recentlyModified, mainEntry);
    return {
      rootPath: root,
      projectName: path.basename(root),
      fileCount: files.length,
      files,
      entryPoints,
      recentlyModified,
      structure,
      summary,
    };
  }

  findBestTargetForModification(
    context: WorkspaceContext,
    task: string
  ): { targetFile: string | null; reason: string } {
    return findBestTargetForModification(context, task);
  }
}

let workspaceContextService: WorkspaceContextService | null = null;

export function getWorkspaceContextService(): WorkspaceContextService {
  if (!workspaceContextService) { workspaceContextService = new WorkspaceContextService(); }
  return workspaceContextService;
}
