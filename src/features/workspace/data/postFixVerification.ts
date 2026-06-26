// [SCOPE] Post-fix verification — re-runs the command that originally failed after the fix is
// applied, to get real evidence of whether the fix worked. Result is fed to Guardian as context.

import * as cp from 'child_process';
import * as path from 'path';
import { fixLog } from '../../../shared/logging/infrastructure/fixPipelineLogger.js';

export interface PostFixResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  passed: boolean;    // true if exit code 0
  summary: string;   // human-readable one-liner for Guardian context
}

const MAX_OUTPUT = 3000; // chars — enough for Guardian to read without token bloat
const TIMEOUT_MS = 30_000; // 30s max — don't block the pipeline on slow builds

/** Re-runs a shell command in the project root and returns the result.
 *  Safe: only runs commands that came from the user's own terminal history. */
export async function runPostFixVerification(command: string, root: string): Promise<PostFixResult> {
  fixLog(`[POST-FIX] Re-running: ${command} in ${root}`);

  return new Promise((resolve) => {
    const proc = cp.spawn(command, [], {
      cwd: root,
      shell: true,
      timeout: TIMEOUT_MS,
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' }, // CI=1 suppresses interactive prompts
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      const exitCode = code ?? 1;
      const passed = exitCode === 0;
      const combined = [stderr, stdout].filter(Boolean).join('\n').slice(0, MAX_OUTPUT);
      const summary = passed
        ? `Post-fix check PASSED: \`${command}\` exited 0`
        : `Post-fix check FAILED: \`${command}\` exited ${exitCode}. Output: ${combined.slice(0, 300)}`;
      fixLog(`[POST-FIX] ${summary}`);
      resolve({ command, exitCode, stdout: stdout.slice(0, MAX_OUTPUT), stderr: stderr.slice(0, MAX_OUTPUT), passed, summary });
    });

    proc.on('error', (err) => {
      const summary = `Post-fix check ERROR: could not run \`${command}\`: ${err.message}`;
      fixLog(`[POST-FIX] ${summary}`);
      resolve({ command, exitCode: -1, stdout: '', stderr: err.message, passed: false, summary });
    });
  });
}

/** Detect the most likely re-runnable verification command for a project root.
 *  Falls back heuristics if no terminal command was captured. */
export function inferVerificationCommand(root: string, capturedCommand?: string): string | null {
  // Always prefer the actual command that failed
  if (capturedCommand && isSafeCommand(capturedCommand)) { return capturedCommand; }

  // Heuristic fallbacks based on project files present
  const fs = require('fs');
  const hasPkg = fs.existsSync(path.join(root, 'package.json'));
  const hasTsConfig = fs.existsSync(path.join(root, 'tsconfig.json'));
  const hasPyProject = fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'setup.py'));
  const hasCargoToml = fs.existsSync(path.join(root, 'Cargo.toml'));
  const hasMakefile = fs.existsSync(path.join(root, 'Makefile'));

  if (hasPkg) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      if (pkg.scripts?.build) { return 'npm run build'; }
      if (pkg.scripts?.test) { return 'npm test'; }
      if (pkg.scripts?.typecheck) { return 'npm run typecheck'; }
    } catch { /* ignore */ }
    if (hasTsConfig) { return 'npx tsc --noEmit'; }
  }
  if (hasPyProject) { return 'python -m pytest --tb=short -q 2>&1 | head -50'; }
  if (hasCargoToml) { return 'cargo check 2>&1 | head -50'; }
  if (hasMakefile) { return 'make 2>&1 | head -50'; }

  return null;
}

/** Safety check — only run commands that look like build/test/check commands, not destructive ones. */
function isSafeCommand(cmd: string): boolean {
  const lower = cmd.toLowerCase().trim();
  // Block anything destructive
  if (/\brm\b|\brmdir\b|\bdel\b|\bformat\b|\bdrop\b|\btruncate\b|>\s*\//.test(lower)) { return false; }
  // Allow known safe build/test patterns
  return /^(npm|yarn|pnpm|npx|node|python3?|tsc|pytest|jest|vitest|cargo|go|make|gradle|mvn|bundle)\b/.test(lower);
}
