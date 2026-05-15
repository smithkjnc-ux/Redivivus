// [SCOPE] Runtime Profiler — file system scanning helpers
// Extracted from runtimeProfiler.ts

import * as fs from 'fs';
import * as path from 'path';

// [WARN] Rule 3 exact exclusion set — checked before recursing into any subdirectory.
const SKIP_EXACT_DIRS = new Set([
  '__pycache__', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '.cache', 'coverage', '.pytest_cache', '.mypy_cache',
  'eggs', '.eggs', '.tox', 'htmlcov',
]);

export function walkDir(
  dir: string,
  projectRoot: string,
  depth: number,
  visited: Set<string>,
): string[] {
  // Rule 6 — max depth guard
  if (depth > 15) {
    console.warn('[Profiler] Max depth reached at ' + dir);
    return [];
  }

  // Symlink cycle protection — resolve real path and skip if already visited
  let realDir: string;
  try { realDir = fs.realpathSync(dir); } catch { return []; }
  if (visited.has(realDir)) { return []; }
  visited.add(realDir);

  // Rule 5 — skip recursing INTO .chassis of the current project (write ops are separate)
  if (dir === path.join(projectRoot, '.chassis')) { return []; }

  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }

  let results: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);

    if (e.isDirectory()) {
      // Rule 1 — virtual environment: presence of pyvenv.cfg inside the dir
      if (fs.existsSync(path.join(full, 'pyvenv.cfg'))) {
        console.warn('[Profiler] Skipping virtual environment: ' + full);
        continue;
      }
      // Rule 2 — node_modules at any depth
      if (e.name === 'node_modules') { continue; }
      // Rule 3 — standard build/cache dirs
      if (SKIP_EXACT_DIRS.has(e.name)) { continue; }
      // Rule 4 — external project boundary: a .chassis dir whose parent is NOT projectRoot
      if (e.name === '.chassis' && dir !== projectRoot) {
        console.warn('[Profiler] Found external project boundary at ' + full + ' -- excluded from scan');
        continue;
      }
      results = results.concat(walkDir(full, projectRoot, depth + 1, visited));
    } else if (e.isFile()) {
      // Skip hidden files
      if (e.name.startsWith('.')) { continue; }
      results.push(full);
    }
  }
  return results;
}

export function readSafe(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}
