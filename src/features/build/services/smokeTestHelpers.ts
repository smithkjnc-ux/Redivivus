// [SCOPE] Shared constants and helper functions for generating smoke tests
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

// Maximum number of source characters sent to the AI for context.
export const MAX_SRC_CHARS = 6_000;
// Timeout for the generated smoke test run (ms).
export const SMOKE_TIMEOUT_MS = 60_000;

/**
 * Derive the language / test framework for a project based on its built files and root.
 * Returns enough info to prompt the AI and run the test.
 */
export function detectProjectLanguage(root: string, builtFiles: string[]): {
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
export function collectSourceContext(root: string, builtFiles: string[]): string {
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
export function runSync(command: string, root: string, timeoutMs: number): { success: boolean; output: string } {
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
