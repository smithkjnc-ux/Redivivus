// [SCOPE] Workspace Context Service — file scanning and classification helpers
import * as fs from 'fs';
import * as path from 'path';
import type { FileInfo } from './workspaceContext.js';

export function scanWorkspaceFiles(root: string): { files: FileInfo[]; entryPoints: string[] } {
  const files: FileInfo[] = [];
  const entryPoints: string[] = [];
  walkDirectory(root, '', files, entryPoints);
  return { files, entryPoints };
}

function walkDirectory(root: string, relativeDir: string, files: FileInfo[], entryPoints: string[]): void {
  const fullDir = path.join(root, relativeDir);
  const skipDirs = ['node_modules', '.git', 'dist', 'build', '.redivivus', 'out', 'coverage', '.vscode'];
  if (skipDirs.some(skip => relativeDir.includes(skip))) {return;}
  try {
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);
      const fullPath = path.join(root, relativePath);
      if (entry.isDirectory()) {
        walkDirectory(root, relativePath, files, entryPoints);
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        const isEntryPoint = isEntryPointFile(entry.name, ext);
        const isConfig = isConfigFile(entry.name);
        const isTest = isTestFile(entry.name, relativePath);
        const isDocumentation = isDocumentationFile(entry.name);
        if (isEntryPoint) { entryPoints.push(relativePath); }
        files.push({
          relativePath, absolutePath: fullPath, size: stat.size,
          modified: stat.mtime, extension: ext,
          isEntryPoint, isConfig, isTest, isDocumentation,
        });
      }
    }
  } catch { /* skip unreadable directories */ }
}

function isEntryPointFile(filename: string, ext: string): boolean {
  const entryNames = ['index', 'main', 'app', 'server', 'start', 'bootstrap'];
  const base = path.basename(filename, ext).toLowerCase();
  return entryNames.includes(base);
}

function isConfigFile(filename: string): boolean {
  const configNames = ['package.json', 'tsconfig.json', 'webpack.config.js', '.env', 'dockerfile', 'docker-compose.yml'];
  return configNames.includes(filename.toLowerCase());
}

function isTestFile(filename: string, relativePath: string): boolean {
  return filename.includes('.test.') || filename.includes('.spec.') ||
         relativePath.includes('/tests/') || relativePath.includes('/test/') ||
         relativePath.includes('/__tests__/');
}

function isDocumentationFile(filename: string): boolean {
  const docExts = ['.md', '.txt', '.rst'];
  return docExts.includes(path.extname(filename).toLowerCase());
}
