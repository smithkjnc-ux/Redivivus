// [SCOPE] Redivivus Codebase Search — lists source files and searches for patterns across
// the entire project tree. Used by build/fix pipelines for full-project AI context.
// Replaces the capped collectSourceFiles in chatPanelMsgFixUtils — no MAX_FILES hard cap.

import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set(['.redivivus', 'node_modules', '.git', 'dist', 'out', 'build', '.next', 'coverage', '__pycache__', '.venv', 'venv', '.cache']);
// [WARN] Schema/DDL files belong here. `.prisma` and `.sql` were MISSING, so for any database task the most
// important file (the Prisma schema / migration SQL) was invisible to the fix+build pipeline — the agent was
// handed a useless migration_lock.toml instead of schema.prisma and couldn't proceed. Keep schema formats in.
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.cs', '.java', '.rb', '.html', '.css', '.scss', '.sh', '.toml', '.yaml', '.yml', '.prisma', '.sql', '.graphql', '.proto']);
const MAX_FILE_BYTES = 60_000;

export interface SourceFile {
  rel: string;
  size: number;
  content?: string;
}

export interface SearchMatch {
  rel: string;
  line: number;
  text: string;
}

/** List all source files in the project tree. withContent loads file text. Never throws. */
export function listSourceFiles(root: string, withContent = false, maxFiles = 300): SourceFile[] {
  const results: SourceFile[] = [];
  function walk(dir: string, depth: number): void {
    if (results.length >= maxFiles || depth > 8) { return; }
    let entries: string[];
    try { entries = fs.readdirSync(dir).sort(); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) { continue; }
      const full = path.join(dir, entry);
      let stat: fs.Stats; try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full, depth + 1); continue; }
      if (!SOURCE_EXTS.has(path.extname(entry).toLowerCase())) { continue; }
      const rel = path.relative(root, full);
      const sf: SourceFile = { rel, size: stat.size };
      if (withContent && stat.size > 0 && stat.size <= MAX_FILE_BYTES) {
        try { sf.content = fs.readFileSync(full, 'utf8'); } catch { }
      }
      results.push(sf);
      if (results.length >= maxFiles) { return; }
    }
  }
  walk(root, 0);
  return results;
}

/** Search for a pattern across all source files. Returns up to maxMatches hits. */
export function searchCodebase(root: string, pattern: string | RegExp, maxMatches = 40): SearchMatch[] {
  const re = typeof pattern === 'string'
    ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    : pattern;
  const matches: SearchMatch[] = [];
  for (const file of listSourceFiles(root)) {
    if (matches.length >= maxMatches) { break; }
    let content: string;
    try { content = fs.readFileSync(path.join(root, file.rel), 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        matches.push({ rel: file.rel, line: i + 1, text: lines[i].trim().slice(0, 200) });
        if (matches.length >= maxMatches) { break; }
      }
    }
  }
  return matches;
}

/** Find where a function/class/symbol is defined. Returns file + line. */
export function findSymbol(root: string, symbol: string): SearchMatch[] {
  const defRe = new RegExp(
    `(?:^|\\s)(?:function|class|const|let|var|def|func|export)\\s+${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
    'im'
  );
  return searchCodebase(root, defRe, 10);
}

/** Build a full project context block for AI prompts. Caps at maxBytesTotal to stay within token limits. */
export function buildFullContextBlock(root: string, maxFiles = 30, maxBytesTotal = 100_000): string {
  const files = listSourceFiles(root, true, maxFiles);
  const blocks: string[] = [];
  let totalBytes = 0;
  for (const file of files) {
    if (!file.content) { continue; }
    const chunk = `// === FILE: ${file.rel} ===\n${file.content}`;
    if (totalBytes + chunk.length > maxBytesTotal) { break; }
    blocks.push(chunk);
    totalBytes += chunk.length;
  }
  return blocks.join('\n\n');
}

/** Returns a plain file tree string for AI orientation. */
export function buildFileTree(root: string): string {
  const files = listSourceFiles(root, false, 200);
  return files.map(f => f.rel).join('\n');
}
