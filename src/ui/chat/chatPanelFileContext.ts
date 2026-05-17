// [SCOPE] File context helpers — extract file mentions from user message and read them from workspace.
// Used by chatPanelAI.ts to inject file content into Q&A prompts without user pasting.

import * as fs from 'fs';
import * as path from 'path';

/** Walk workspace to find a file by name, skipping build/vendor dirs. */
export function findFileByName(root: string, name: string): string | null {
  const skipDirs = new Set(['node_modules', '.git', 'out', 'dist', '.chassis']);
  function walk(dir: string): string | null {
    let entries: string[];
    try { entries = fs.readdirSync(dir); } catch { return null; }
    for (const e of entries) {
      const full = path.join(dir, e);
      if (e === name) { try { if (fs.statSync(full).isFile()) { return full; } } catch {} }
      if (!skipDirs.has(e)) { try { if (fs.statSync(full).isDirectory()) { const r = walk(full); if (r) { return r; } } } catch {} }
    }
    return null;
  }
  return walk(root);
}

/** Scan user message for backtick-quoted or bare filenames, read them from the workspace. */
export function extractFileMentions(userText: string, workspaceRoot: string): Array<{relPath: string; content: string}> {
  const results: Array<{relPath: string; content: string}> = [];
  const seen = new Set<string>();
  const backtickRe = /`([^`]+\.[a-zA-Z0-9]{1,6})`/g;
  const bareRe = /\b([a-zA-Z0-9_.-]+\.(html|js|ts|tsx|jsx|css|py|go|json|md|sh|yaml|yml|txt))\b/g;
  const candidates = new Set<string>();
  let m;
  while ((m = backtickRe.exec(userText)) !== null) { candidates.add(path.basename(m[1])); }
  while ((m = bareRe.exec(userText)) !== null) { candidates.add(m[1]); }
  for (const name of candidates) {
    try {
      const found = findFileByName(workspaceRoot, name);
      if (found && !seen.has(found)) {
        seen.add(found);
        const content = fs.readFileSync(found, 'utf-8');
        results.push({ relPath: path.relative(workspaceRoot, found), content });
      }
    } catch { /* skip */ }
  }
  return results.slice(0, 3);
}
