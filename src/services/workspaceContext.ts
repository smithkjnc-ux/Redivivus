// [SCOPE] Workspace Context Service — builds a "map" of the open project for AI awareness
// The AI should know: what files exist, what's the structure, what was recently modified, what's the entry point

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceContext {
  rootPath: string;
  projectName: string;
  fileCount: number;
  files: FileInfo[];
  entryPoints: string[];
  recentlyModified: string[];
  structure: ProjectStructure;
  summary: string; // For AI prompt injection
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
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor() {}

  // Get or build workspace context
  async getContext(): Promise<WorkspaceContext | null> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return null;

    // Return cached if fresh
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cache;
    }

    // Build fresh context
    this.cache = await this.buildContext(root);
    this.cacheTime = Date.now();
    return this.cache;
  }

  // Force refresh
  async refresh(): Promise<WorkspaceContext | null> {
    this.cache = null;
    return this.getContext();
  }

  private async buildContext(root: string): Promise<WorkspaceContext> {
    const files: FileInfo[] = [];
    const entryPoints: string[] = [];

    // Walk the directory (excluding common non-code paths)
    this.walkDirectory(root, '', files, entryPoints);

    // Sort by modified date for "recently modified"
    const recentlyModified = files
      .filter(f => !f.isConfig && !f.isDocumentation) // Skip config/docs
      .sort((a, b) => b.modified.getTime() - a.modified.getTime())
      .slice(0, 10)
      .map(f => f.relativePath);

    // Detect project structure
    const structure = this.detectStructure(files);

    // Find main entry point
    const mainEntry = this.findMainEntryPoint(files, structure);

    // Generate summary for AI
    const summary = this.generateSummary(files, structure, recentlyModified, mainEntry);

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

  private walkDirectory(
    root: string,
    relativeDir: string,
    files: FileInfo[],
    entryPoints: string[]
  ): void {
    const fullDir = path.join(root, relativeDir);
    
    // Skip non-code directories
    const skipDirs = ['node_modules', '.git', 'dist', 'build', '.chassis', 'out', 'coverage', '.vscode'];
    if (skipDirs.some(skip => relativeDir.includes(skip))) return;

    try {
      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const relativePath = path.join(relativeDir, entry.name);
        const fullPath = path.join(root, relativePath);

        if (entry.isDirectory()) {
          // Recurse
          this.walkDirectory(root, relativePath, files, entryPoints);
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          const ext = path.extname(entry.name).toLowerCase();
          
          // Determine file role
          const isEntryPoint = this.isEntryPointFile(entry.name, ext);
          const isConfig = this.isConfigFile(entry.name);
          const isTest = this.isTestFile(entry.name, relativePath);
          const isDocumentation = this.isDocumentationFile(entry.name);

          if (isEntryPoint) {
            entryPoints.push(relativePath);
          }

          files.push({
            relativePath,
            absolutePath: fullPath,
            size: stat.size,
            modified: stat.mtime,
            extension: ext,
            isEntryPoint,
            isConfig,
            isTest,
            isDocumentation,
          });
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  private isEntryPointFile(filename: string, ext: string): boolean {
    const entryNames = ['index', 'main', 'app', 'server', 'start', 'bootstrap'];
    const base = path.basename(filename, ext).toLowerCase();
    return entryNames.includes(base);
  }

  private isConfigFile(filename: string): boolean {
    const configNames = ['package.json', 'tsconfig.json', 'webpack.config.js', '.env', 'dockerfile', 'docker-compose.yml'];
    return configNames.includes(filename.toLowerCase());
  }

  private isTestFile(filename: string, relativePath: string): boolean {
    return filename.includes('.test.') || 
           filename.includes('.spec.') ||
           relativePath.includes('/tests/') ||
           relativePath.includes('/test/') ||
           relativePath.includes('/__tests__/');
  }

  private isDocumentationFile(filename: string): boolean {
    const docExts = ['.md', '.txt', '.rst'];
    return docExts.includes(path.extname(filename).toLowerCase());
  }

  private detectStructure(files: FileInfo[]): ProjectStructure {
    const hasSrc = files.some(f => f.relativePath.startsWith('src/'));
    const hasTests = files.some(f => f.isTest);
    const hasDocs = files.some(f => f.isDocumentation);
    const hasConfig = files.some(f => f.isConfig);

    // Detect main language
    const extensions: Record<string, number> = {};
    for (const f of files) {
      if (!f.isConfig && !f.isDocumentation) {
        extensions[f.extension] = (extensions[f.extension] || 0) + 1;
      }
    }
    const mainExt = Object.entries(extensions)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    const languageMap: Record<string, string> = {
      '.ts': 'TypeScript', '.tsx': 'TypeScript (React)',
      '.js': 'JavaScript', '.jsx': 'JavaScript (React)',
      '.py': 'Python', '.rs': 'Rust', '.go': 'Go',
      '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS',
    };
    const mainLanguage = languageMap[mainExt] || mainExt || 'Unknown';

    // Detect framework
    const hasReact = files.some(f => f.extension === '.tsx' || f.extension === '.jsx');
    const hasVue = files.some(f => f.extension === '.vue');
    const hasAngular = files.some(f => f.relativePath.includes('.component.ts'));
    const framework = hasReact ? 'React' : hasVue ? 'Vue' : hasAngular ? 'Angular' : 'None/Vanilla';

    // Detect project type
    let projectType: ProjectStructure['projectType'] = 'unknown';
    if (files.some(f => f.extension === '.html')) projectType = 'web';
    if (files.some(f => f.relativePath === 'package.json')) projectType = 'node';
    if (files.some(f => f.extension === '.py')) projectType = 'python';
    if (files.some(f => f.extension === '.rs')) projectType = 'rust';
    if (files.some(f => f.extension === '.go')) projectType = 'go';
    if (new Set(files.map(f => f.extension)).size > 3) projectType = 'mixed';

    return {
      hasSrc,
      hasTests,
      hasDocs,
      hasConfig,
      mainLanguage,
      framework,
      projectType,
    };
  }

  private findMainEntryPoint(files: FileInfo[], structure: ProjectStructure): string | null {
    // Priority order for entry points
    const candidates = [
      'index.html',
      'src/index.html',
      'src/index.ts',
      'src/index.tsx',
      'src/main.ts',
      'src/main.tsx',
      'src/App.tsx',
      'src/app.ts',
      'main.py',
      'app.py',
      'src/main.rs',
      'main.go',
    ];

    for (const candidate of candidates) {
      const found = files.find(f => f.relativePath === candidate);
      if (found) return found.relativePath;
    }

    // Fallback: first entry point found
    return files.find(f => f.isEntryPoint)?.relativePath || null;
  }

  private generateSummary(
    files: FileInfo[],
    structure: ProjectStructure,
    recentlyModified: string[],
    mainEntry: string | null
  ): string {
    const codeFiles = files.filter(f => !f.isConfig && !f.isDocumentation && !f.isTest);
    
    let summary = `WORKSPACE: ${structure.projectType} project with ${codeFiles.length} code files (${structure.mainLanguage})`;
    
    if (structure.framework !== 'None/Vanilla') {
      summary += ` using ${structure.framework}`;
    }
    
    summary += `. Structure: ${structure.hasSrc ? 'src/' : 'flat'} ${structure.hasTests ? '+ tests' : ''} ${structure.hasDocs ? '+ docs' : ''}.`;
    
    if (mainEntry) {
      summary += ` Entry point: ${mainEntry}.`;
    }
    
    if (recentlyModified.length > 0) {
      summary += ` Recently active: ${recentlyModified.slice(0, 3).join(', ')}.`;
    }

    return summary;
  }

  // Find the best target file for a modification request
  findBestTargetForModification(
    context: WorkspaceContext,
    task: string
  ): { targetFile: string | null; reason: string } {
    const taskLower = task.toLowerCase();

    // 1. Check if user mentions a specific file
    const fileMention = task.match(/\b([\w\-]+)\.(html|ts|tsx|js|jsx|py|rs|go|css|scss)\b/i);
    if (fileMention) {
      const mentionedFile = fileMention[0];
      const mentionedFileLower = mentionedFile.toLowerCase();
      const found = context.files.find(f => 
        f.relativePath.toLowerCase().endsWith(mentionedFileLower) || 
        f.relativePath.toLowerCase() === mentionedFileLower
      );
      if (found) {
        return { targetFile: found.relativePath, reason: `User mentioned "${mentionedFile}"` };
      }
    }

    // 2. Look for recently modified files that match the task type
    for (const recent of context.recentlyModified) {
      const recentExt = path.extname(recent).toLowerCase();
      
      // If task mentions HTML and recent file is HTML
      if (taskLower.includes('html') && recentExt === '.html') {
        return { targetFile: recent, reason: 'Recently modified HTML file matching task' };
      }
      
      // If task mentions styles and recent file is CSS/SCSS
      if ((taskLower.includes('style') || taskLower.includes('css')) && 
          (recentExt === '.css' || recentExt === '.scss')) {
        return { targetFile: recent, reason: 'Recently modified stylesheet' };
      }
      
      // If task mentions a component and recent file is TSX/JSX
      if (taskLower.includes('component') && (recentExt === '.tsx' || recentExt === '.jsx')) {
        return { targetFile: recent, reason: 'Recently modified component file' };
      }
    }

    // 3. Default to main entry point
    if (context.entryPoints.length > 0) {
      return { 
        targetFile: context.entryPoints[0], 
        reason: 'Main entry point of project' 
      };
    }

    // 4. Fallback to first recently modified
    if (context.recentlyModified.length > 0) {
      return { 
        targetFile: context.recentlyModified[0], 
        reason: 'Most recently modified file' 
      };
    }

    return { targetFile: null, reason: 'No suitable target found' };
  }
}

// Singleton instance
let workspaceContextService: WorkspaceContextService | null = null;

export function getWorkspaceContextService(): WorkspaceContextService {
  if (!workspaceContextService) {
    workspaceContextService = new WorkspaceContextService();
  }
  return workspaceContextService;
}
