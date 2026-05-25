// [SCOPE] Redivivus Compile Runner — detects the project's compile command and runs it
// as a Node child process (not a terminal) so stdout/stderr can be read programmatically.
// Used by compileAutoFix.ts to close the build → compile → error → fix loop.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CompileResult {
  success: boolean;
  output: string;   // combined stdout + stderr, ANSI stripped
  command: string;  // the command that was run (empty string = no compile step detected)
}

/** Detect the right compile/typecheck command for the project at root. Returns null if none. */
export function detectCompileCommand(root: string): string | null {
  // TypeScript project — prefer scripts over bare tsc
  if (fs.existsSync(path.join(root, 'tsconfig.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      if (pkg.scripts?.compile)   { return 'npm run compile'; }
      if (pkg.scripts?.build)     { return 'npm run build'; }
      if (pkg.scripts?.typecheck) { return 'npm run typecheck'; }
    } catch { /* no package.json alongside tsconfig — use bare tsc */ }
    return 'npx tsc --noEmit';
  }
  // Node.js only — look for build/compile script
  if (fs.existsSync(path.join(root, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      if (pkg.scripts?.build)   { return 'npm run build'; }
      if (pkg.scripts?.compile) { return 'npm run compile'; }
    } catch { }
  }
  // Python — syntax-check each .py file (no separate compile step, just parse errors)
  try {
    const pyFiles = fs.readdirSync(root).filter(f => f.endsWith('.py') && f !== '__init__.py');
    if (pyFiles.length > 0) {
      return `python -m py_compile ${pyFiles.slice(0, 10).map(f => `"${f}"`).join(' ')}`;
    }
  } catch { }
  return null;
}

/** Run the compile command synchronously as a child process. 45-second timeout. Never throws. */
export function runCompileCheck(root: string): CompileResult {
  const command = detectCompileCommand(root);
  if (!command) { return { success: true, output: '', command: '' }; }
  try {
    const result = cp.spawnSync(command, [], {
      cwd: root,
      shell: true,
      timeout: 45_000,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', TERM: 'dumb' },
    });
    // Strip ANSI escape codes from combined output
    const raw = [(result.stdout || ''), (result.stderr || '')].join('\n');
    const output = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
    return { success: result.status === 0, output, command };
  } catch (e) {
    return { success: false, output: String(e), command };
  }
}
