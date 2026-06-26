// [SCOPE] Build context helper functions — file reads, project map, git summary, build history.
// Split from buildContextCollector.ts (Rule 9). Pure I/O, no AI calls, no logic.

import * as fs from 'fs';
import * as path from 'path';

/** Read a file safely. No hard cap by default — send the full file and let the budget trimmer decide. */
export function readFileSafe(p: string, maxBytes = Infinity): string {
  try {
    const content = fs.readFileSync(p, 'utf8');
    return maxBytes !== Infinity && content.length > maxBytes
      ? content.slice(0, maxBytes) + '\n[truncated]'
      : content;
  } catch { return ''; }
}

/** Walk the project tree and return a file map. No line cap — full structure. */
export function buildProjectMap(root: string): string {
  const lines: string[] = [];
  const walk = (dir: string, depth = 0) => {
    if (depth > 4) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (/^(node_modules|\.git|\.redivivus|out|dist|build|__pycache__)$/.test(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full);
        if (entry.isDirectory()) { lines.push(rel + '/'); walk(full, depth + 1); }
        else { lines.push(rel); }
      }
    } catch {}
  };
  walk(root);
  return lines.join('\n');
}

/** Recent git activity — no character cap, send the real state. */
export function buildGitContext(root: string): string {
  try {
    const { execSync } = require('child_process');
    const opts = { cwd: root, encoding: 'utf8' as const, stdio: ['pipe', 'pipe', 'pipe'] as const };
    const log    = execSync('git log --oneline -10 2>/dev/null', opts) as string || '';
    const status = execSync('git status --short 2>/dev/null', opts) as string || '';
    const diff   = execSync('git diff --stat HEAD 2>/dev/null', opts) as string || '';
    return [log && `RECENT COMMITS:\n${log}`, status && `STATUS:\n${status}`, diff && `CHANGES:\n${diff}`]
      .filter(Boolean).join('\n');
  } catch { return ''; }
}

/** Last 10 build tasks — enough history to see patterns. */
export function getRecentBuilds(root: string): string[] {
  try {
    const p = path.join(root, '.redivivus', 'build_history.json');
    const history = JSON.parse(fs.readFileSync(p, 'utf8')) as Array<{ task?: string }>;
    return history.slice(-10).map(h => h.task || '').filter(Boolean);
  } catch { return []; }
}
