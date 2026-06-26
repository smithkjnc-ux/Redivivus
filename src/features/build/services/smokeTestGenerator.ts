// [SCOPE] Smoke test generator — when a newly built project has no existing test suite,
// asks the AI to write a minimal smoke test, writes it to disk, runs it via the normal
// testRunner, then feeds failures back to the existing testAutoFix loop.
// Only fires when detectTestCommand() returns null (i.e. fresh project, no tests yet).

import * as fs from 'fs';
import * as path from 'path';
import { detectProjectLanguage, collectSourceContext, runSync, SMOKE_TIMEOUT_MS } from './smokeTestHelpers.js';
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
