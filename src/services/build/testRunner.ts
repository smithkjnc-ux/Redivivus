// [SCOPE] CHASSIS Test Runner — detects the project's test command and runs it as a child process.
// Parses pass/fail counts. Used by testAutoFix.ts to close the build → test → fail → fix loop.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  success: boolean;
  output: string;
  command: string;
  failureCount: number;
}

/** Detect the right test command for the project at root. Returns null if no tests found. */
export function detectTestCommand(root: string): string | null {
  if (fs.existsSync(path.join(root, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const testScript = pkg.scripts?.test || '';
      // Skip the default npm "no test specified" placeholder
      if (testScript && !testScript.includes('no test specified') && !testScript.includes('echo')) {
        return 'npm test -- --watchAll=false --ci --passWithNoTests 2>&1';
      }
    } catch { }
  }
  // Python pytest — look for test files or config
  try {
    const entries = fs.readdirSync(root);
    const hasPyTests = entries.some(f => (f.startsWith('test_') || f.endsWith('_test.py')) && f.endsWith('.py'));
    const hasPytestCfg = entries.some(f => ['pytest.ini', 'setup.cfg', 'pyproject.toml'].includes(f));
    if (hasPyTests || hasPytestCfg) { return 'python -m pytest --tb=short -q 2>&1'; }
  } catch { }
  // Go
  if (fs.existsSync(path.join(root, 'go.mod'))) { return 'go test ./... 2>&1'; }
  // Rust
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) { return 'cargo test 2>&1'; }
  return null;
}

/** Run the test command synchronously. 2-minute timeout. Never throws. */
export function runTests(root: string): TestResult {
  const command = detectTestCommand(root);
  if (!command) { return { success: true, output: '', command: '', failureCount: 0 }; }
  try {
    const result = cp.spawnSync(command, [], {
      cwd: root, shell: true, timeout: 120_000, encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: 'true' },
    });
    const output = [(result.stdout || ''), (result.stderr || '')].join('\n')
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
    return { success: result.status === 0, output, command, failureCount: countFailures(output) };
  } catch (e) {
    return { success: false, output: String(e), command, failureCount: 1 };
  }
}

function countFailures(output: string): number {
  const jestMatch  = output.match(/(\d+)\s+(?:tests?\s+)?failed/i);   if (jestMatch)  { return parseInt(jestMatch[1]);  }
  const mocha      = output.match(/(\d+)\s+failing/i);                if (mocha)      { return parseInt(mocha[1]);       }
  const goFails    = (output.match(/^FAIL\s/gm) || []).length;        if (goFails)    { return goFails;                  }
  const rustMatch  = output.match(/(\d+)\s+failed/i);                 if (rustMatch)  { return parseInt(rustMatch[1]);   }
  return (output.includes('FAILED') || output.includes('FAIL')) ? 1 : 0;
}
