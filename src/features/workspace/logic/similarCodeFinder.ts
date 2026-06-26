// [SCOPE] Similar code finder — extracts function snippets from project files and AI-filters
// for relevance to the current build task. Prevents Worker reimplementing existing logic.
// Rule 18: code extracts snippets (mechanical), AI judges relevance (understanding).

import * as fs from 'fs';
import * as path from 'path';
import type { RoutingService } from '../../../features/ai/data/routingService.js';

const SKIP_DIRS = new Set(['node_modules', 'out', '.redivivus', '.git', 'dist', 'build', '.next', 'coverage']);
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const MAX_FILES = 30;
const MAX_FUNCS_PER_FILE = 6;
const SNIPPET_LINES = 8;

export interface FunctionSnippet { relPath: string; name: string; code: string; }

// Match exported function declarations and const arrow functions
const FUNC_RE = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/;

function extractSnippets(content: string, relPath: string): FunctionSnippet[] {
  const results: FunctionSnippet[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length && results.length < MAX_FUNCS_PER_FILE; i++) {
    const m = lines[i].match(FUNC_RE);
    if (!m) { continue; }
    const name = m[1] || m[2];
    if (!name || /^_|^on[A-Z]/.test(name)) { continue; } // skip private/event handlers
    const code = lines.slice(i, i + SNIPPET_LINES).join('\n');
    results.push({ relPath, name, code });
  }
  return results;
}

function scanDir(dir: string, root: string, results: FunctionSnippet[], fileCount: { n: number }): void {
  if (fileCount.n >= MAX_FILES) { return; }
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (fileCount.n >= MAX_FILES) { break; }
    if (SKIP_DIRS.has(entry)) { continue; }
    const abs = path.join(dir, entry);
    let stat: fs.Stats;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (stat.isDirectory()) {
      scanDir(abs, root, results, fileCount);
    } else if (CODE_EXTS.has(path.extname(entry)) && !entry.endsWith('.d.ts')) {
      try {
        const content = fs.readFileSync(abs, 'utf8');
        const snippets = extractSnippets(content, path.relative(root, abs));
        if (snippets.length > 0) { results.push(...snippets); fileCount.n++; }
      } catch { /* skip unreadable */ }
    }
  }
}

/** Main entry — scan project, AI-filter for task relevance, return formatted block or ''. */
export async function findSimilarCode(
  root: string,
  task: string,
  excludeRelPath: string,
  routing: RoutingService,
): Promise<string> {
  const all: FunctionSnippet[] = [];
  scanDir(root, root, all, { n: 0 });
  const snippets = all.filter(s => s.relPath !== excludeRelPath);
  if (snippets.length === 0) { return ''; }

  // AI picks relevant indices by name — bodies not sent to keep prompt tiny
  const numbered = snippets.map((s, i) => `${i + 1}. ${s.relPath}: ${s.name}`).join('\n');
  const prompt =
    `Coding task: "${task.slice(0, 200)}"\n\n` +
    `Existing functions in this project:\n${numbered}\n\n` +
    `Which functions might contain logic the Worker should reuse or check for duplication?\n` +
    `Reply with ONLY the numbers, comma-separated. Max 4. If none are relevant: NONE`;
  try {
    const result = await routing.promptCheap(prompt, 6_000);
    const raw = result.text.trim().toUpperCase();
    if (!raw || raw === 'NONE') { return ''; }
    const indices = raw.split(/[,\s]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 1 && n <= snippets.length);
    const relevant = indices.map(i => snippets[i - 1]).filter(Boolean).slice(0, 4);
    if (relevant.length === 0) { return ''; }
    const blocks = relevant.map(s => `// ${s.relPath}: ${s.name}\n${s.code}`).join('\n\n');
    return `EXISTING SIMILAR CODE (reuse or import — do not reimplement):\n${blocks}`;
  } catch {
    return ''; // no duplicate detection on AI failure — still build normally
  }
}
