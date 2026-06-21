// [SCOPE] Detect a project's test framework + how to run it, and recognise test files. Used by the agent's
// proactive-test nudge ("write the test for the change you just made, so coverage accretes"). Conservative:
// returns null when there's no clear runner, so we never suggest a command that would just fail. Heuristic
// over deps/marker-files, no VS Code deps → unit-testable. Sibling to migrationsGuard / productionReadiness.

import * as fs from 'fs';
import * as path from 'path';

export interface TestSetup { id: string; label: string; runCmd: string; isTestFile: (p: string) => boolean; }

function read(root: string, rel: string): string { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; } }
function exists(root: string, rel: string): boolean { try { return fs.existsSync(path.join(root, rel)); } catch { return false; } }
function deps(root: string): Record<string, string> {
  try { const j = JSON.parse(read(root, 'package.json') || '{}'); return { ...(j.dependencies || {}), ...(j.devDependencies || {}) }; } catch { return {}; }
}

const NODE_TEST = (p: string) => /(^|\/)__tests__\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
const PY_TEST = (p: string) => /(^|\/)tests?\//.test(p) || /(^|\/)test_[^/]*\.py$/.test(p) || /_test\.py$/.test(p);

/** Identify the project's test runner. Returns null when none is clearly set up (so the nudge stays quiet
 *  rather than suggest a failing command — the readiness preflight is what nudges to SET UP testing). */
export function detectTestFramework(root: string): TestSetup | null {
  const d = deps(root);
  const nodeRunner = ['vitest', 'jest', 'mocha', 'ava', '@playwright/test', 'cypress'].find((r) => d[r]);
  if (nodeRunner) {
    const runCmd = nodeRunner === 'vitest' ? 'npx vitest run'
      : nodeRunner === 'jest' ? 'npx jest'
      : nodeRunner === '@playwright/test' ? 'npx playwright test'
      : 'npm test';
    return { id: 'node', label: nodeRunner.replace('@playwright/test', 'Playwright'), runCmd, isTestFile: NODE_TEST };
  }
  if (exists(root, 'requirements.txt') || exists(root, 'pyproject.toml') || exists(root, 'manage.py') || exists(root, 'setup.py')) {
    return { id: 'python', label: 'pytest', runCmd: 'pytest -q', isTestFile: PY_TEST };
  }
  if (exists(root, 'go.mod')) {
    return { id: 'go', label: 'go test', runCmd: 'go test ./...', isTestFile: (p) => /_test\.go$/.test(p) };
  }
  if (exists(root, 'Cargo.toml')) {
    return { id: 'rust', label: 'cargo test', runCmd: 'cargo test', isTestFile: (p) => /(^|\/)tests\//.test(p) };
  }
  if (/\brspec\b/.test(read(root, 'Gemfile'))) {
    return { id: 'ruby', label: 'RSpec', runCmd: 'bundle exec rspec', isTestFile: (p) => /_spec\.rb$|(^|\/)spec\//.test(p) };
  }
  return null;
}
