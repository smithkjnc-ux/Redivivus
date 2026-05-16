// [SCOPE] Fix pipeline helpers -- parseFixResponse, takeSnapshot, collectSourceFiles
// Extracted from chatPanelMsgFix.ts (200-line split).
// parseFixResponse filters to allowedRels only -- prevents Worker from creating phantom files.

import * as fs from 'fs';
import * as path from 'path';

const SOURCE_EXTS = new Set(['.html', '.js', '.ts', '.jsx', '.tsx', '.py', '.css', '.sh']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.chassis', '__pycache__', '.venv']);
const MAX_FILES = 10;
const MAX_FILE_BYTES = 20_000;

/** Parse Worker fix blocks. Only returns fixes whose paths are in allowedRels.
 *  Phantom files (paths not in the original source list) are collected in skipped[]. */
export function parseFixResponse(
  text: string,
  root: string,
  allowedRels: Set<string>,
): { fixes: { rel: string; abs: string; content: string }[]; skipped: string[] } {
  const all: { rel: string; abs: string; content: string }[] = [];
  const fixPattern = /^## Fix:\s*(.+?)\s*\n```[a-z]*\n([\s\S]*?)```/gm;
  let match: RegExpExecArray | null;
  while ((match = fixPattern.exec(text)) !== null) {
    const rel = match[1].trim().replace(/^\.?\//, '');
    const content = match[2].trimEnd();
    if (rel && content) { all.push({ rel, abs: path.join(root, rel), content }); }
  }
  if (all.length === 0) {
    const alt = /^## Fix:\s*(.+?)\s*\n([\s\S]*?)(?=^## Fix:|$)/gm;
    while ((match = alt.exec(text)) !== null) {
      const rel = match[1].trim().replace(/^\.?\//, '');
      const content = match[2].replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trimEnd();
      if (rel && content && content.length > 10) { all.push({ rel, abs: path.join(root, rel), content }); }
    }
  }
  const fixes = all.filter(f => allowedRels.has(f.rel));
  const skipped = all.filter(f => !allowedRels.has(f.rel)).map(f => f.rel);
  return { fixes, skipped };
}

export function takeSnapshot(root: string, relPaths: string[]): void {
  try {
    const snapDir = path.join(root, '.chassis', 'fix-snapshots', `fix-${Date.now()}`);
    fs.mkdirSync(snapDir, { recursive: true });
    for (const rel of relPaths) {
      const src = path.join(root, rel);
      if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(snapDir, rel.replace(/\//g, '__'))); }
    }
  } catch { /* best-effort */ }
}

export function collectSourceFiles(root: string): { rel: string; content: string }[] {
  const results: { rel: string; content: string }[] = [];
  function walk(dir: string, depth: number): void {
    if (results.length >= MAX_FILES || depth > 4) { return; }
    let entries: string[];
    try { entries = fs.readdirSync(dir).sort(); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) { continue; }
      const full = path.join(dir, entry); const rel = path.relative(root, full);
      let stat: fs.Stats; try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full, depth + 1); continue; }
      if (!SOURCE_EXTS.has(path.extname(entry).toLowerCase())) { continue; }
      try {
        let c = fs.readFileSync(full, 'utf-8');
        if (c.length > MAX_FILE_BYTES) { c = c.slice(0, MAX_FILE_BYTES) + '\n// ...'; }
        results.push({ rel, content: c });
      } catch { continue; }
      if (results.length >= MAX_FILES) { return; }
    }
  }
  walk(root, 0); return results;
}
