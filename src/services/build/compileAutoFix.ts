// [SCOPE] Redivivus Compile Auto-Fix — runs compile check after every build, parses errors,
// calls AI to fix them, rewrites files, and retries. Up to 3 loops per build.
// This is what closes the "write code → compile → error → fix → recompile" gap vs Claude Code.

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import type { BuildContext} from '../../core/build/chatPanelBuildHelpers';
import { updateLastMsg, appendMsg } from '../../core/build/chatPanelBuildHelpers';
import { runCompileCheck, CompileResult } from './compileRunner.js';
import { appendProjectDeadEnd } from '../../core/routing/chatPanelMsgFixUtils.js';

const MAX_RETRIES = 3;
const MISSING_NODE_PKG_RE = /Cannot find module '([^'./@][^']*)'/;
const MISSING_PY_PKG_RE   = /No module named '([^']+)'/;

/** Auto-install a missing package when the compile error is purely a dep problem. Returns true if install succeeded. */
function tryAutoInstall(root: string, errorOutput: string, ctx: BuildContext): boolean {
  const nodeMatch = errorOutput.match(MISSING_NODE_PKG_RE);
  if (nodeMatch) {
    const pkg = nodeMatch[1].split('/')[0]; // strip sub-path for scoped packages
    updateLastMsg(ctx, `Missing package detected: \`${pkg}\` — running \`npm install ${pkg}\`...`);
    const r = cp.spawnSync('npm', ['install', pkg], { cwd: root, timeout: 60_000, encoding: 'utf8' });
    return r.status === 0;
  }
  const pyMatch = errorOutput.match(MISSING_PY_PKG_RE);
  if (pyMatch) {
    const pkg = pyMatch[1].split('.')[0]; // top-level package name only
    updateLastMsg(ctx, `Missing package detected: \`${pkg}\` — running \`pip install ${pkg}\`...`);
    const r = cp.spawnSync('pip', ['install', pkg], { cwd: root, timeout: 60_000, encoding: 'utf8' });
    return r.status === 0;
  }
  return false;
}

// [RULE 18] Regex only for pattern extraction — AI does the fix reasoning
const TS_ERROR_RE = /^([^(]+)\((\d+),\d+\):\s+error\s+TS\d+:/gm;
const NODE_ERROR_RE = /^\s{0,4}at\s.+\((.+):(\d+):\d+\)/gm;
const PY_ERROR_RE = /File "([^"]+)", line (\d+)/gm;

/** Extract unique relative file paths mentioned in compiler error output. */
function parseErrorFiles(output: string, root: string, builtFiles: string[]): string[] {
  const found = new Set<string>();

  function tryAdd(filePath: string): void {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    const rel = path.relative(root, abs);
    if (!rel.startsWith('..') && fs.existsSync(abs)) { found.add(rel); }
  }

  let m: RegExpExecArray | null;
  const tsRe = new RegExp(TS_ERROR_RE.source, 'gm');
  while ((m = tsRe.exec(output)) !== null) { tryAdd(m[1].trim()); }
  const nodeRe = new RegExp(NODE_ERROR_RE.source, 'gm');
  while ((m = nodeRe.exec(output)) !== null) { tryAdd(m[1].trim()); }
  const pyRe = new RegExp(PY_ERROR_RE.source, 'gm');
  while ((m = pyRe.exec(output)) !== null) { tryAdd(m[1].trim()); }

  if (found.size === 0) { for (const f of builtFiles) { found.add(f); } }
  return Array.from(found).slice(0, 5);
}

/** Ask AI to fix compile errors in a specific file. Returns corrected source or null. */
async function aiFixCompileError(ctx: BuildContext, relPath: string, errorOutput: string): Promise<string | null> {
  const absPath = path.join(ctx.root, relPath);
  let currentCode: string;
  try { currentCode = fs.readFileSync(absPath, 'utf8'); } catch { return null; }

  const prompt =
    `Fix the compile error below. Return ONLY the corrected source — no fences, no explanation.\n\n` +
    `FILE: ${relPath}\n\n` +
    `COMPILE ERROR:\n${errorOutput.slice(0, 2000)}\n\n` +
    `CURRENT FILE:\n${currentCode.slice(0, 8000)}`;

  const res = await ctx.routing.prompt(prompt, 60_000);
  if (!res.success || !res.text || res.text.trim().length < 10) { return null; }
  const fixed = res.text.replace(/^```[a-z]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  // Reject AI explanations masquerading as code — must contain actual code syntax
  const hasCodeSyntax = /[{};()=<>]/.test(fixed) || /\b(function|class|const|let|var|def|import|export|return|if|for)\b/.test(fixed);
  const isExplanation = /^(to (address|fix|resolve)|i (can't|cannot|will|would)|the (issue|problem|error|code|file)|please note|unfortunately|here is)/i.test(fixed);
  if (!hasCodeSyntax || isExplanation) { return null; }
  return fixed;
}

/**
 * Run compile → fix → recompile loop after a build.
 * Appends status messages to ctx.conversation. Never throws.
 */
export async function runCompileAutoFix(ctx: BuildContext, builtFiles: string[]): Promise<void> {
  let result = runCompileCheck(ctx.root);
  if (result.success || !result.command) { return; }

  // Check for missing packages first — install beats AI-rewriting code that just needs a dep
  if (tryAutoInstall(ctx.root, result.output, ctx)) {
    result = runCompileCheck(ctx.root);
    if (result.success) { updateLastMsg(ctx, 'Package installed — compiled successfully.'); return; }
  }

  // Snapshot built files AND error files before any AI writes — restored if all retries fail
  const preFixSnapshots = new Map<string, string>();
  const allCandidates = [...new Set([...builtFiles, ...parseErrorFiles(result.output, ctx.root, builtFiles)])];
  for (const relPath of allCandidates) {
    const absPath = path.join(ctx.root, relPath);
    try { if (fs.existsSync(absPath)) { preFixSnapshots.set(relPath, fs.readFileSync(absPath, 'utf8')); } } catch { }
  }

  appendMsg(ctx, `Compile failed after build — auto-fixing (up to ${MAX_RETRIES} attempts)...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    updateLastMsg(ctx, `Compile auto-fix attempt ${attempt}/${MAX_RETRIES}...`);

    const errorFiles = parseErrorFiles(result.output, ctx.root, builtFiles);
    let fixedCount = 0;

    for (const relPath of errorFiles) {
      const fixed = await aiFixCompileError(ctx, relPath, result.output);
      if (fixed) {
        try {
          fs.writeFileSync(path.join(ctx.root, relPath), fixed, 'utf8');
          fixedCount++;
        } catch { /* unwritable — skip */ }
      }
    }

    if (fixedCount === 0) {
      // Roll back any partial fixes from prior attempts before giving up
      for (const [relPath, content] of preFixSnapshots) {
        try { fs.writeFileSync(path.join(ctx.root, relPath), content, 'utf8'); } catch { }
      }
      updateLastMsg(ctx,
        `Could not auto-fix compile errors after ${attempt} attempt${attempt > 1 ? 's' : ''}.\n\n` +
        `Paste the error below and I will fix it:\n\`\`\`\n${result.output.slice(0, 800)}\n\`\`\``);
      return;
    }

    result = runCompileCheck(ctx.root);
    if (result.success) {
      updateLastMsg(ctx, `Compile errors fixed — compiled successfully after ${attempt} attempt${attempt > 1 ? 's' : ''}.`);
      return;
    }
  }

  // All retries exhausted — roll back to the original build output so bad fix attempts don't persist
  let restoredCount = 0;
  for (const [relPath, content] of preFixSnapshots) {
    try { fs.writeFileSync(path.join(ctx.root, relPath), content, 'utf8'); restoredCount++; } catch { }
  }
  // Log the persistent error as a dead end so future fix attempts know this pattern resists AI repair
  const errorSig = result.output.slice(0, 120).replace(/\s+/g, ' ').trim();
  appendProjectDeadEnd(ctx.root, `compile-fail: ${errorSig}`, `AI attempted ${MAX_RETRIES} auto-fix passes`, `Compile error persisted after all retries: ${result.output.slice(0, 400)}`, 'Provide the full error text to the AI and describe the intended behavior explicitly');
  const rollbackNote = restoredCount > 0 ? ` Restored ${restoredCount} file${restoredCount !== 1 ? 's' : ''} to post-build state.` : '';
  updateLastMsg(ctx,
    `After ${MAX_RETRIES} attempts, compile still fails.${rollbackNote} Paste the error below and describe what you're trying to build:\n\n` +
    `\`\`\`\n${result.output.slice(0, 1200)}\n\`\`\``);
}
