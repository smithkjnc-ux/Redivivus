// [SCOPE] Build pipeline context reader — reads existing project files for supervisor context.
// Gap 1 fix: the build supervisor used to plan blind (blueprint only, no current file contents).
// This gives it the same situational awareness the fix pipeline has — it sees what IS there,
// not just what SHOULD be there. Without this, "improve the styles" leads to editing a CSS file
// that isn't even loaded by the HTML, because the supervisor never read the HTML to check.

import { listSourceFiles } from '../workspace/data/codebaseSearch.js';

// Token budget for existing source content in the supervisor's context.
// Blueprint + wiring context + dead ends already occupy ~2-4K tokens.
// 8K chars ≈ 2K tokens — enough to show current file state without overwhelming the supervisor.
const MAX_BYTES = 8_000;
const MAX_BYTES_PER_FILE = 3_000; // prevent one large file from crowding out all others

// Files that matter most for understanding how a project is wired — prioritized after phase outputs.
const ENTRY_PRIORITY = new Set([
  'index.html', 'public/index.html', 'src/index.html',
  'main.js', 'main.ts', 'src/main.js', 'src/main.ts',
  'App.js', 'App.ts', 'src/App.js', 'src/App.tsx',
  'index.js', 'index.ts', 'src/index.js', 'src/index.ts',
]);

/**
 * Returns the current contents of existing project source files, capped by token budget.
 * Phase output files come first (they're what the plan will touch), then entry points, then rest.
 * Empty string when the project has no source files yet (fresh build — nothing to read).
 */
export function buildExistingSourceContext(root: string, phaseOutputs: string[]): string {
  const all = listSourceFiles(root, true, 60);
  if (all.length === 0) { return ''; }

  const outputSet = new Set(phaseOutputs.map(p => p.replace(/^\.\//, '')));

  // Prioritize: phase outputs → known entry points → everything else
  const ordered = [
    ...all.filter(f => outputSet.has(f.rel)),
    ...all.filter(f => !outputSet.has(f.rel) && ENTRY_PRIORITY.has(f.rel)),
    ...all.filter(f => !outputSet.has(f.rel) && !ENTRY_PRIORITY.has(f.rel)),
  ];

  const blocks: string[] = [];
  let totalBytes = 0;
  for (const file of ordered) {
    if (!file.content) { continue; }
    const chunk = file.content.length > MAX_BYTES_PER_FILE
      ? file.content.slice(0, MAX_BYTES_PER_FILE) + '\n...[truncated]'
      : file.content;
    const block = `// === FILE: ${file.rel} ===\n${chunk}`;
    if (totalBytes + block.length > MAX_BYTES) { break; }
    blocks.push(block);
    totalBytes += block.length;
  }

  if (blocks.length === 0) { return ''; }
  return `EXISTING PROJECT FILES (current state on disk — read this BEFORE planning any changes to these files):\n${blocks.join('\n\n')}`;
}
