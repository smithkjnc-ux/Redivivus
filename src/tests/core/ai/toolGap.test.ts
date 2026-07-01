// [SCOPE] Unit tests for commandInPlan (toolGapEscalation.ts) — the plan-match check that decides
// whether a Worker's command aligns with the Supervisor's approved plan (Tier 0) or escalates.

import * as assert from 'assert';
import { commandInPlan } from '../../../features/ai/data/toolGapEscalation.js';

suite('commandInPlan plan-match (fix #7b)', () => {
  test('exact substring of the plan matches', () => {
    assert.strictEqual(commandInPlan('npm install', 'first run npm install then npm test'), true);
  });

  test('verb-phrase match ignores trailing operands (npm install lodash ~ npm install)', () => {
    assert.strictEqual(commandInPlan('npm install lodash', 'the plan: npm install the deps'), true);
  });

  test('npm ci does NOT match a plan that only approved npm install', () => {
    assert.strictEqual(commandInPlan('npm ci', 'npm install'), false);
  });

  test('empty plan approves nothing -> gap (false)', () => {
    assert.strictEqual(commandInPlan('npm test', ''), false);
  });

  test('empty command has nothing to run -> true', () => {
    assert.strictEqual(commandInPlan('', 'npm install'), true);
  });

  test('executable path is stripped before matching (/usr/bin/npm install)', () => {
    assert.strictEqual(commandInPlan('/usr/bin/npm install', 'run npm install'), true);
  });

  test('verb-phrase mismatch: git push does not match a plan that only says git commit', () => {
    // includes() fails, and the two-token verb phrase "git push" is absent from the plan.
    assert.strictEqual(commandInPlan('git push origin main', 'git commit -m done'), false);
  });
});
