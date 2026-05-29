// [SCOPE] Project export scanner — statically extracts exported names from source files
// Used by Worker prompt to show what already exists, preventing hallucinated imports.
// Rule 18: this is mechanical file scanning (code), not language understanding (AI).

import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set(['node_modules', 'out', '.redivivus', '.git', 'dist', 'build', '.next', 'coverage']);
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const MAX_FILES = 25;
const MAX_NAMES_PER_FILE = 15;

export interface FileExports { relPath: string; names: string[]; }

function extractExports(content: string): string[] {
  const names = new Set<string>();
  let m: RegExpExecArray | null;

  // export function/const/class/enum/let/var name
  const namedRe = /^export\s+(?:async\s+)?(?:function|const|let|var|class|enum)\s+(\w+)/gm;
  while ((m = namedRe.exec(content)) !== null) { names.add(m[1]); }

  // export { foo, bar as baz }
  const braceRe = /^export\s*\{([^}]+)\}/gm;
  while ((m = braceRe.exec(content)) !== null) {
    m[1].split(',').forEach(s => {
      const name = s.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^\w+$/.test(name) && name !== 'default') { names.add(name); }
    });
  }

  // export default function/class Name
  const defaultRe = /^export\s+default\s+(?:async\s+)?(?:function|class)\s+(\w+)/gm;
  while ((m = defaultRe.exec(content)) !== null) { names.add(m[1]); }

  return [...names].slice(0, MAX_NAMES_PER_FILE);
}

function scanDir(dir: string, root: string, results: FileExports[]): void {
  if (results.length >= MAX_FILES) { return; }
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (results.length >= MAX_FILES) { break; }
    if (SKIP_DIRS.has(entry)) { continue; }
    const abs = path.join(dir, entry);
    let stat: fs.Stats;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (stat.isDirectory()) {
      scanDir(abs, root, results);
    } else if (CODE_EXTS.has(path.extname(entry)) && !entry.endsWith('.d.ts')) {
      try {
        const content = fs.readFileSync(abs, 'utf8');
        const names = extractExports(content);
        if (names.length > 0) { results.push({ relPath: path.relative(root, abs), names }); }
      } catch { /* unreadable file — skip */ }
    }
  }
}

/** Scan project source files for exported names. Excludes the build target file. */
export function scanProjectExports(root: string, excludeRelPath?: string): FileExports[] {
  const results: FileExports[] = [];
  scanDir(root, root, results);
  return excludeRelPath ? results.filter(r => r.relPath !== excludeRelPath) : results;
}

/** Format export map as a compact prompt block */
export function formatExportsForPrompt(exports: FileExports[]): string {
  if (exports.length === 0) { return ''; }
  const lines = exports.map(f => `${f.relPath}: ${f.names.join(', ')}`);
  return `PROJECT EXPORTS (already exist in this codebase -- import these; do not reimplement):\n${lines.join('\n')}`;
}
