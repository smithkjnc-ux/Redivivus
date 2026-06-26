// [SCOPE] Analyzer file scanner — walks workspace directories and builds FileInfo + AnalysisResult
import * as fs from 'fs';
import * as path from 'path';
import { FileInfo, AnalysisResult } from './analyzerTypes.js';
import { getResolvedPaths } from '../../../services/resolvedItems.js';

export { FileInfo, AnalysisResult };

// directories to always skip
export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.redivivus', '__pycache__', '.vscode',
  'venv', '.venv', 'dist', 'out', 'build', '.next', '.cache',
  'venv_ryppel', 'LivePortrait', 'avatar', 'old files',
]);

export const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.mp3', '.mp4', '.wav', '.ogg', '.glb', '.obj', '.fbx',
  '.woff', '.woff2', '.ttf', '.eot', '.lock', '.map',
]);

// machine-generated and internal files — never flag for size or annotation
export const SKIP_FILES = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock',
  'poetry.lock', 'Cargo.lock', 'Gemfile.lock', 'packages.lock.json',
  'shrinkwrap.json', 'npm-shrinkwrap.json',
  'tsconfig.tsbuildinfo', '.eslintcache', '.stylelintcache',
  'REDIVIVUS_ROADMAP.md', 'CHANGELOG.md', 'REDIVIVUS-SPEC.md',
]);

// file extensions that should never be flagged as "too long" — docs/config are exempt
export const NO_SIZE_FLAG_EXTENSIONS = new Set(['.md', '.json', '.yaml', '.yml', '.toml', '.cfg', '.ini', '.env']);

export const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css',
  '.json', '.yaml', '.yml', '.md', '.sh', '.bash',
  '.sql', '.env', '.toml', '.cfg', '.ini',
]);

// [SCOPE] Recursively scan a directory and collect FileInfo for each code file
export function scanDirectory(
  dir: string,
  root: string,
  files: FileInfo[],
  extraSkipDirs = new Set<string>()
): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !extraSkipDirs.has(entry.name) && !entry.name.startsWith('.')) {
        scanDirectory(fullPath, root, files, extraSkipDirs);
      }
      continue;
    }
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXTENSIONS.has(ext)) { continue; }
      if (SKIP_FILES.has(entry.name)) { continue; }
      if (!CODE_EXTENSIONS.has(ext) && ext !== '') { continue; }
      try {
        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const relativePath = path.relative(root, fullPath);
        const todos: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Only flag bare legacy markers inside actual comments, not string literals or code
          const isComment = /^\s*(\/\/|\/\*|\*|#\s)/.test(line);
          const hasBareMarker = /\b(TODO|FIXME|HACK|XXX|BUG)\b/i.test(line);
          const hasRedivivusTag = /\[(TODO|WARN|NEXT|DEAD|DONE|SCOPE)\]/i.test(line);
          if (isComment && hasBareMarker && !hasRedivivusTag) {
            todos.push(`L${i + 1}: ${line.trim().substring(0, 100)}`);
          }
        }
        // hasComments = true only if file has a [SCOPE] tag OR ≥3% of lines are comments
        const commentLines = lines.filter(l => /^\s*(\/\/|\/\*|\*|#\s|<!--|"""|''')/.test(l)).length;
        const hasScope = /\[(SCOPE|TODO|WARN|NEXT|DEAD|DONE)\]/.test(content);
        const hasComments = hasScope || (lines.length > 0 && commentLines / lines.length >= 0.03);
        // [Redivivus] Check if [SCOPE] is correctly at line 1 with right syntax for the file type
        const line0 = lines[0]?.trim() || '';
        let missingScopeAtLine1 = false;
        if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
          missingScopeAtLine1 = !line0.startsWith('// [SCOPE]');
        } else if (ext === '.html') {
          missingScopeAtLine1 = !line0.startsWith('<!-- [SCOPE]');
        } else if (['.py', '.sh', '.bash'].includes(ext)) {
          missingScopeAtLine1 = !line0.startsWith('# [SCOPE]');
        }
        files.push({ relativePath, extension: ext || path.basename(entry.name), lines: lines.length, size: stat.size, todos, hasComments, missingScopeAtLine1 });
      } catch { /* skip unreadable */ }
    }
  }
}

// [SCOPE] Aggregate FileInfo array into an AnalysisResult
export function buildAnalysis(files: FileInfo[]): AnalysisResult {
  const filesByType: Record<string, number> = {};
  const largeFiles: FileInfo[] = [];
  const todoItems: { file: string; line: string }[] = [];
  const uncommentedFiles: FileInfo[] = [];
  let totalLines = 0;

  const missingScopeFiles: FileInfo[] = [];

  for (const f of files) {
    filesByType[f.extension] = (filesByType[f.extension] || 0) + 1;
    totalLines += f.lines;
    if (f.lines > 200 && !NO_SIZE_FLAG_EXTENSIONS.has(f.extension)) { largeFiles.push(f); }
    for (const t of f.todos) { todoItems.push({ file: f.relativePath, line: t }); }
    if (!f.hasComments && ['.ts', '.tsx', '.js', '.jsx', '.py'].includes(f.extension)) {
      uncommentedFiles.push(f);
    }
    // [Redivivus] Flag any code file missing proper [SCOPE] at line 1
    if (f.missingScopeAtLine1 && ['.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.sh', '.bash'].includes(f.extension)) {
      missingScopeFiles.push(f);
    }
  }
  largeFiles.sort((a, b) => b.lines - a.lines);

  // [Redivivus] Filter out items the user has already resolved — they persist in .redivivus/resolved.json
  const resolvedLarge = getResolvedPaths('largeFile');
  const resolvedTodo = getResolvedPaths('todo');
  const resolvedUncommented = getResolvedPaths('uncommented');
  const filteredLarge = largeFiles.filter(f => !resolvedLarge.has(f.relativePath));
  const filteredTodos = todoItems.filter(t => !resolvedTodo.has(t.file));
  const filteredUncommented = uncommentedFiles.filter(f => !resolvedUncommented.has(f.relativePath));

  const filteredMissingScope = missingScopeFiles.filter(f => !resolvedUncommented.has(f.relativePath));

  const dirs = new Set<string>();
  for (const f of files) {
    const dir = path.dirname(f.relativePath);
    if (dir !== '.') { dirs.add(dir); }
  }

  return { totalFiles: files.length, totalLines, filesByType, largeFiles: filteredLarge, todoItems: filteredTodos, uncommentedFiles: filteredUncommented, missingScopeFiles: filteredMissingScope, structure: Array.from(dirs).sort() };
}
