// [SCOPE] Chat Panel Project Context — builds compact annotation summary for AI project awareness
// Reads [SCOPE], [WARN], [TODO], [DEAD] from all files. ~200 tokens instead of 50,000 lines of raw code.
// Keep under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import { walk, extractScope, countPattern } from '../../../services/mapBuilderHelpers.js';

// [WARN] Cache the annotation context to avoid rescanning on every message.
// Invalidated after 30 seconds so new files are picked up reasonably fast.
let _cache: { context: string; timestamp: number; root: string } | null = null;
const CACHE_TTL_MS = 30_000;

/** Builds a compact project annotation context for the AI prompt */
export function buildProjectAnnotationContext(root: string): string {
  if (root === 'none') { return ''; }

  // Return cached if fresh
  if (_cache && _cache.root === root && Date.now() - _cache.timestamp < CACHE_TTL_MS) {
    return _cache.context;
  }

  try {
    const allFiles: string[] = [];
    // [WARN] Must scan BOTH src/ AND root. Previous bug: only scanned root when src/ was empty,
    // so index.html at the root was invisible in projects that also had a src/ folder.
    const srcDir = path.join(root, 'src');
    if (fs.existsSync(srcDir)) { walk(srcDir, allFiles); }
    // Also scan root for files not in src/ (HTML, config, etc.)
    const rootFiles: string[] = [];
    walk(root, rootFiles);
    const existingSet = new Set(allFiles);
    for (const f of rootFiles) { if (!existingSet.has(f)) { allFiles.push(f); } }

    if (allFiles.length === 0) { return ''; }

    const entries: string[] = [];
    let totalTodos = 0;
    let totalWarns = 0;
    let totalDeads = 0;
    let filesWithScope = 0;

    for (const full of allFiles) {
      try {
        const rel = path.relative(root, full).replace(/\\/g, '/');
        const content = fs.readFileSync(full, 'utf-8');
        const lines = content.split('\n').length;
        const scope = extractScope(content);
        const todos = countPattern(content, /\[TODO\]/g);
        const warns = countPattern(content, /\[WARN\]/g);
        const deads = countPattern(content, /\[DEAD\]/g);

        totalTodos += todos;
        totalWarns += warns;
        totalDeads += deads;
        if (scope) { filesWithScope++; }

        // Build compact entry: path (lines) — [SCOPE] description [annotations]
        let entry = `  ${rel} (${lines}L)`;
        if (scope) { entry += ` — ${scope}`; }
        const tags: string[] = [];
        if (warns > 0) { tags.push(`${warns} WARN`); }
        if (todos > 0) { tags.push(`${todos} TODO`); }
        if (deads > 0) { tags.push(`${deads} DEAD`); }
        if (tags.length > 0) { entry += ` [${tags.join(', ')}]`; }

        // [Redivivus] For small config/data files, include a content preview so the AI knows
        // what is ACTUALLY defined — not just what the original blueprint said.
        // Triggers for: files ≤ 80 lines whose name suggests configuration or data.
        const baseName = path.basename(rel).toLowerCase();
        const isDataFile = /config|data|types?|constants?|sounds?|animals?|registry|entries|items|list|map/.test(baseName);
        if (isDataFile && lines <= 80) {
          const preview = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).slice(0, 25).join('\n');
          if (preview.trim()) { entry += `\n    CONTENT:\n${preview.split('\n').map(l => '    ' + l).join('\n')}`; }
        }

        entries.push(entry);
      } catch { /* skip unreadable files */ }
    }

    // Build summary header
    const scopeRate = allFiles.length > 0 ? Math.round((filesWithScope / allFiles.length) * 100) : 0;
    const header = `PROJECT STRUCTURE (${allFiles.length} files, ${scopeRate}% annotated, ${totalTodos} TODOs, ${totalWarns} WARNs):`;

    const context = `\n--- ${header} ---\n${entries.join('\n')}\n`;

    // Cache it
    _cache = { context, timestamp: Date.now(), root };
    return context;

  } catch {
    return '';
  }
}
