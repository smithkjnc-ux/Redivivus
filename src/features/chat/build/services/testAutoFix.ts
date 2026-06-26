// [SCOPE] Redivivus Test Auto-Fix — runs tests after every build, parses failures,
// calls AI to fix implementation files, re-runs. Up to 3 loops. Same pattern as compileAutoFix.ts.

import * as fs from 'fs';
import * as path from 'path';
import type { BuildContext} from '../chatPanelBuildHelpers.js';
import { updateLastMsg, appendMsg } from '../chatPanelBuildHelpers.js';
import { runTests, detectTestCommand } from './testRunner.js';
import { generateAndRunSmokeTest } from './smokeTestGenerator.js';

const MAX_RETRIES = 3;
// Matches file:line patterns in test output (Jest, pytest, Go, Rust all use this format)
const FILE_LINE_RE = /([^\s"'()\[\]]+\.[a-z]{1,4}):(\d+)/gm;

function parseFailedFiles(output: string, root: string, builtFiles: string[]): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(FILE_LINE_RE.source, 'gm');
  while ((m = re.exec(output)) !== null) {
    const abs = path.isAbsolute(m[1]) ? m[1] : path.join(root, m[1]);
    const rel = path.relative(root, abs);
    if (!rel.startsWith('..') && !rel.includes('node_modules') && fs.existsSync(abs)) { found.add(rel); }
  }
  // Fall back to the files that were just built
  if (found.size === 0) { for (const f of builtFiles) { if (fs.existsSync(path.join(root, f))) { found.add(f); } } }
  // Prefer implementation files over test files when both appear
  const impls = Array.from(found).filter(f => !f.includes('test') && !f.includes('spec') && !f.includes('__test__'));
  return (impls.length > 0 ? impls : Array.from(found)).slice(0, 4);
}

async function aiFixTestFailure(ctx: BuildContext, relPath: string, testOutput: string): Promise<string | null> {
  const absPath = path.join(ctx.root, relPath);
  let code: string;
  try { code = fs.readFileSync(absPath, 'utf8'); } catch { return null; }
  const prompt =
    `Fix the failing test output below. Return ONLY the corrected source — no fences, no explanation.\n\n` +
    `FILE: ${relPath}\n\nTEST OUTPUT:\n${testOutput.slice(0, 2000)}\n\nCURRENT FILE:\n${code.slice(0, 8000)}`;
  const res = await ctx.routing.prompt(prompt, 60_000);
  if (!res.success || !res.text || res.text.trim().length < 10) { return null; }
  return res.text.replace(/^```[a-z]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
}

/** Run test → fix → re-run loop after a build. Appends status to ctx.conversation. Never throws. */
export async function runTestAutoFix(ctx: BuildContext, builtFiles: string[]): Promise<void> {
  // [SMOKE] No existing test suite — generate and run a minimal smoke test first.
  // If it passes we're done. If it fails, feed the output into the normal fix loop below.
  if (!detectTestCommand(ctx.root)) {
    const smoke = await generateAndRunSmokeTest(ctx, builtFiles).catch(() => null);
    if (!smoke || smoke.passed || !smoke.testFile || !smoke.output) { return; }
    // Proceed into the fix loop using the smoke test output as the failure report.
    const preFixSnapshots = new Map<string, string>();
    for (const relPath of builtFiles) {
      const absPath = require('path').join(ctx.root, relPath);
      try { if (require('fs').existsSync(absPath)) { preFixSnapshots.set(relPath, require('fs').readFileSync(absPath, 'utf8')); } } catch { }
    }
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      updateLastMsg(ctx, `Smoke test fix attempt ${attempt}/${MAX_RETRIES}...`);
      const files = parseFailedFiles(smoke.output, ctx.root, builtFiles);
      let fixed = 0;
      for (const relPath of files) {
        const corrected = await aiFixTestFailure(ctx, relPath, smoke.output);
        if (corrected) {
          try { require('fs').writeFileSync(require('path').join(ctx.root, relPath), corrected, 'utf8'); fixed++; } catch { }
        }
      }
      if (fixed === 0) {
        for (const [relPath, content] of preFixSnapshots) {
          try { require('fs').writeFileSync(require('path').join(ctx.root, relPath), content, 'utf8'); } catch { }
        }
        updateLastMsg(ctx, `Could not auto-fix smoke test failures. Paste the error in chat and I will look deeper:\n\`\`\`\n${smoke.output.slice(0, 800)}\n\`\`\``);
        return;
      }
      // Re-run the smoke test
      const rerun = require('child_process').spawnSync(smoke.runCommand!, [], {
        cwd: ctx.root, shell: true, timeout: 60_000, encoding: 'utf8',
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: 'true' },
      });
      if (rerun.status === 0) {
        updateLastMsg(ctx, `✅ Smoke test passing after ${attempt} attempt${attempt > 1 ? 's' : ''}.`);
        return;
      }
      smoke.output = [(rerun.stdout || ''), (rerun.stderr || '')].join('\n').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
    }
    for (const [relPath, content] of preFixSnapshots) {
      try { require('fs').writeFileSync(require('path').join(ctx.root, relPath), content, 'utf8'); } catch { }
    }
    updateLastMsg(ctx, `After ${MAX_RETRIES} attempts, smoke test still failing. Paste the error in chat and I will dig deeper:\n\`\`\`\n${smoke.output.slice(0, 1200)}\n\`\`\``);
    return;
  }

  let result = runTests(ctx.root);
  if (result.success || !result.command) { return; }

  // Snapshot built files before any AI writes — restored if all retries fail
  const existingTestSnapshots = new Map<string, string>();
  for (const relPath of builtFiles) {
    const absPath = path.join(ctx.root, relPath);
    try { if (fs.existsSync(absPath)) { existingTestSnapshots.set(relPath, fs.readFileSync(absPath, 'utf8')); } } catch { }
  }

  const n = result.failureCount;
  appendMsg(ctx, `${n} test${n !== 1 ? 's' : ''} failed — auto-fixing (up to ${MAX_RETRIES} attempts)...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    updateLastMsg(ctx, `Test auto-fix attempt ${attempt}/${MAX_RETRIES} — ${result.failureCount} failing...`);
    const files = parseFailedFiles(result.output, ctx.root, builtFiles);
    let fixed = 0;
    for (const relPath of files) {
      const corrected = await aiFixTestFailure(ctx, relPath, result.output);
      if (corrected) {
        try { fs.writeFileSync(path.join(ctx.root, relPath), corrected, 'utf8'); fixed++; } catch { }
      }
    }
    if (fixed === 0) {
      // Roll back any partial fixes from prior attempts before giving up
      for (const [relPath, content] of existingTestSnapshots) {
        try { fs.writeFileSync(path.join(ctx.root, relPath), content, 'utf8'); } catch { }
      }
      updateLastMsg(ctx, `Could not auto-fix test failures. Paste the error in chat and I will look deeper:\n\`\`\`\n${result.output.slice(0, 800)}\n\`\`\``);
      return;
    }
    result = runTests(ctx.root);
    if (result.success) {
      updateLastMsg(ctx, `All tests passing after ${attempt} attempt${attempt > 1 ? 's' : ''}.`);
      return;
    }
  }

  // All retries exhausted — roll back to the original build output
  let restoredCount = 0;
  for (const [relPath, content] of existingTestSnapshots) {
    try { fs.writeFileSync(path.join(ctx.root, relPath), content, 'utf8'); restoredCount++; } catch { }
  }
  const rollbackNote = restoredCount > 0 ? ` Restored ${restoredCount} file${restoredCount !== 1 ? 's' : ''} to post-build state.` : '';
  updateLastMsg(ctx, `After ${MAX_RETRIES} attempts, tests still failing.${rollbackNote} Paste the output below and describe what it should do:\n\`\`\`\n${result.output.slice(0, 1200)}\n\`\`\``);
}
