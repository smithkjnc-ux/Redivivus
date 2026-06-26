// [SCOPE] Smoke test generator — when a newly built project has no existing test suite,
// asks the AI to write a minimal smoke test, writes it to disk, runs it via the normal
// testRunner, then feeds failures back to the existing testAutoFix loop.
// Only fires when detectTestCommand() returns null (i.e. fresh project, no tests yet).

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import type { BuildContext } from '../chatPanelBuildHelpers.js';
import { appendMsg, updateLastMsg } from '../chatPanelBuildHelpers.js';

export interface SmokeTestResult {
  /** Absolute path of the generated test file, or null if generation was skipped/failed. */
  testFile: string | null;
  /** True when the smoke test was generated AND passed on the first run. */
  passed: boolean;
  /** Raw test runner output — forwarded to testAutoFix if it fails. */
  output: string;
  /** The command that was used to run the smoke test, if any. */
  runCommand: string | null;
}

// Maximum number of source characters sent to the AI for context.
const MAX_SRC_CHARS = 6_000;
// Timeout for the generated smoke test run (ms).
const SMOKE_TIMEOUT_MS = 60_000;

/**
 * Derive the language / test framework for a project based on its built files and root.
 * Returns enough info to prompt the AI and run the test.
 */
function detectProjectLanguage(root: string, builtFiles: string[]): {
  lang: 'js' | 'ts' | 'python' | 'go' | 'rust' | 'html' | 'unknown';
  testFilename: string;
  runCommand: string;
  installCommand: string | null;
} {
  const lower = builtFiles.map(f => f.toLowerCase());

  // HTML-only — no runnable smoke test possible via CLI
  const hasHtml = lower.some(f => f.endsWith('.html'));
  const hasJs   = lower.some(f => f.endsWith('.js') || f.endsWith('.ts'));
  if (hasHtml && !hasJs) {
    return { lang: 'html', testFilename: '', runCommand: '', installCommand: null };
  }

  // Node / TypeScript — use Node's built-in test runner (v18+) with no extra deps
  if (fs.existsSync(path.join(root, 'package.json'))) {
    const isTs = lower.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));
    if (isTs) {
      return {
        lang: 'ts',
        testFilename: 'smoke.test.ts',
        runCommand: 'npx ts-node smoke.test.ts 2>&1',
        installCommand: null,
      };
    }
    return {
      lang: 'js',
      testFilename: 'smoke.test.js',
      runCommand: 'node --test smoke.test.js 2>&1',
      installCommand: null,
    };
  }

  // Python
  const hasPy = lower.some(f => f.endsWith('.py'));
  if (hasPy) {
    return {
      lang: 'python',
      testFilename: 'test_smoke.py',
      runCommand: 'python -m pytest test_smoke.py --tb=short -q 2>&1',
      installCommand: null,
    };
  }

  // Go
  if (fs.existsSync(path.join(root, 'go.mod'))) {
    return {
      lang: 'go',
      testFilename: 'smoke_test.go',
      runCommand: 'go test -run TestSmoke ./... 2>&1',
      installCommand: null,
    };
  }

  // Rust
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) {
    return {
      lang: 'rust',
      testFilename: '',   // Rust tests live inside source files — skip for now
      runCommand: '',
      installCommand: null,
    };
  }

  return { lang: 'unknown', testFilename: '', runCommand: '', installCommand: null };
}

/** Collect up to MAX_SRC_CHARS of the most relevant source for the AI prompt. */
function collectSourceContext(root: string, builtFiles: string[]): string {
  let collected = '';
  for (const rel of builtFiles) {
    if (collected.length >= MAX_SRC_CHARS) { break; }
    try {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) { continue; }
      const content = fs.readFileSync(abs, 'utf8');
      const budget = MAX_SRC_CHARS - collected.length;
      collected += `\n\n// FILE: ${rel}\n${content.slice(0, budget)}`;
    } catch { /* skip unreadable files */ }
  }
  return collected.trim();
}

/** Run a command synchronously in root. Returns { success, output }. Never throws. */
function runSync(command: string, root: string, timeoutMs: number): { success: boolean; output: string } {
  try {
    const result = cp.spawnSync(command, [], {
      cwd: root, shell: true, timeout: timeoutMs, encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: 'true' },
    });
    const output = [(result.stdout || ''), (result.stderr || '')].join('\n')
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
    return { success: result.status === 0, output };
  } catch (e) {
    return { success: false, output: String(e) };
  }
}

/**
 * Generate a minimal smoke test for the freshly built project, write it to disk,
 * run it, and report the result. The caller (testAutoFix) feeds failures into the
 * normal AI fix loop using the returned output and testFile path.
 *
 * Never throws — all errors are surfaced via the returned SmokeTestResult.
 */
export async function generateAndRunSmokeTest(
  ctx: BuildContext,
  builtFiles: string[],
): Promise<SmokeTestResult> {
  const { root } = ctx;
  const NOOP: SmokeTestResult = { testFile: null, passed: false, output: '', runCommand: null };

  try {
    const { lang, testFilename, runCommand, installCommand } = detectProjectLanguage(root, builtFiles);

    // HTML-only, Rust (inline tests), or unknown — skip gracefully
    if (!testFilename || !runCommand) { return NOOP; }

    appendMsg(ctx, '🔬 No tests found — generating smoke test...');

    const srcContext = collectSourceContext(root, builtFiles);
    if (!srcContext) { updateLastMsg(ctx, '🔬 Skipping smoke test — no readable source files.'); return NOOP; }

    const prompt = [
      `You are generating a minimal smoke test for a freshly built ${lang} project.`,
      `The test must:`,
      `  1. Import or require the main module(s) shown below`,
      `  2. Assert that the primary exported functions/classes exist and return sane values`,
      `  3. Use ONLY the standard library or modules already in the project — add NO new dependencies`,
      `  4. Be runnable with: ${runCommand}`,
      `  5. Complete in under 10 seconds`,
      ``,
      `Return ONLY the complete test file content — no markdown fences, no explanation.`,
      ``,
      `SOURCE:`,
      srcContext,
    ].join('\n');

    const res = await ctx.routing.promptCheap(prompt, 30_000);
    if (!res.success || !res.text || res.text.trim().length < 20) {
      updateLastMsg(ctx, '🔬 Smoke test generation skipped — AI unavailable.');
      return NOOP;
    }

    // Strip any accidental markdown fences the AI added despite instructions
    const testCode = res.text
      .replace(/^```[a-z]*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();

    const testFilePath = path.join(root, testFilename);
    fs.writeFileSync(testFilePath, testCode, 'utf8');

    updateLastMsg(ctx, `🔬 Running smoke test (\`${testFilename}\`)...`);

    if (installCommand) { runSync(installCommand, root, 60_000); }

    const { success, output } = runSync(runCommand, root, SMOKE_TIMEOUT_MS);

    if (success) {
      updateLastMsg(ctx, `✅ Smoke test passed — project is runnable.`);
      return { testFile: testFilePath, passed: true, output, runCommand };
    }

    // Failed — leave the test file on disk so testAutoFix can target it
    updateLastMsg(ctx, `⚠️ Smoke test failed — attempting auto-fix...`);
    return { testFile: testFilePath, passed: false, output, runCommand };

  } catch (e) {
    // Never surface smoke test errors to the user as a hard failure
    return NOOP;
  }
}
