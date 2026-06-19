// [SCOPE] Integration test for Guardian independence + fail-closed review (audit findings H1/H2/H3).
// Verifies: (H2) the Guardian is never the same provider as the Worker; (H1) the review is actually
// executed by the independently-selected Guardian, not the planner/worker; (H3) a forced Guardian
// failure BLOCKS the ship instead of passing through.
//
// Run AFTER compiling sources to out/:  npx tsc -p ./ && node scripts/test-guardian-independence.cjs
// Standalone (no VS Code host): stubs the `vscode` module so the compiled extension code can load.

const assert = require('assert');
const path = require('path');
const Module = require('module');

// [WARN] Minimal `vscode` stub — only enough surface for import-time code in the require chain.
const noopChannel = { appendLine() {}, append() {}, clear() {}, show() {}, hide() {}, dispose() {} };
const vscodeStub = {
  workspace: {
    getConfiguration: () => ({ get: () => undefined, update: async () => {} }),
    workspaceFolders: undefined,
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
  window: {
    createOutputChannel: () => noopChannel,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
  },
  commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => undefined },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeColor: function () {},
  Uri: { parse: (s) => ({ toString: () => s }) },
  env: { openExternal: async () => true, appRoot: '/tmp' },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') { return vscodeStub; }
  return origLoad.call(this, request, parent, isMain);
};

const outDir = path.resolve(__dirname, '..', 'out', 'services', 'ai');
const { selectGuardianAI } = require(path.join(outDir, 'guardianAI.js'));
const { reviewOutput } = require(path.join(outDir, 'supervisorOrchestrator.js'));

let passed = 0;
const ok = (m) => { passed++; console.log('  ✓', m); };

// keyMap factory: listed providers return a truthy key fn, all others return null (not configured).
const keyMapOf = (...providers) => {
  const set = new Set(providers);
  const all = ['claude', 'gemini', 'openai', 'deepseek', 'groq', 'xai', 'kimi'];
  const m = {};
  for (const p of all) { m[p] = () => (set.has(p) ? 'key-' + p : null); }
  return m;
};

(async () => {
  console.log('H2 — Guardian is never the same provider as the Worker:');
  {
    const g = selectGuardianAI('claude', keyMapOf('claude', 'gemini'));
    assert.strictEqual(g, 'gemini', `expected gemini, got ${g}`);
    assert.notStrictEqual(g, 'claude', 'guardian must differ from worker');
    ok('worker=claude with {claude,gemini} -> guardian=gemini (independent)');
  }
  {
    // Worker is the top-ranked provider; Guardian must still step down to a different one.
    const g = selectGuardianAI('claude', keyMapOf('claude', 'openai'));
    assert.strictEqual(g, 'openai');
    ok('top-ranked worker still gets a different-provider guardian');
  }
  {
    const g = selectGuardianAI('claude', keyMapOf('claude'));
    assert.strictEqual(g, null, `expected null (no independent guardian), got ${g}`);
    ok('worker-only config -> null (no independent guardian possible)');
  }

  console.log('H1 — the review is executed by the independent Guardian, not the worker/planner:');
  {
    const worker = 'claude';
    const guardian = selectGuardianAI(worker, keyMapOf('claude', 'gemini')); // -> gemini
    const calledWith = [];
    const callAI = async (ai) => { calledWith.push(ai); return { success: true, text: 'REVIEW_PASS', model: ai }; };
    const review = await reviewOutput('build a thing', 'const x = 1;', guardian, callAI);
    assert.deepStrictEqual(calledWith, ['gemini'], `review should run on gemini, ran on ${JSON.stringify(calledWith)}`);
    assert.notStrictEqual(calledWith[0], worker, 'the worker/planner must never review its own output');
    assert.strictEqual(review.passed, true);
    assert.ok(!review.blocked, 'a clean PASS must not be blocked');
    ok('review ran on independent guardian (gemini); worker (claude) never reviewed itself');
  }

  console.log('H3 — a forced Guardian failure blocks shipping (no silent pass-through):');
  {
    // Simulate the Guardian call erroring / timing out.
    const callAI = async () => ({ success: false, text: '', model: 'gemini', error: 'simulated timeout' });
    const review = await reviewOutput('build a thing', 'const x = 1;', 'gemini', callAI);
    assert.strictEqual(review.passed, false, 'a failed guardian must NOT report passed');
    assert.strictEqual(review.blocked, true, 'a failed guardian must BLOCK the ship');
    assert.ok(!review.degraded, 'a real failure must NOT be mislabeled degraded');
    assert.ok(/fail|timeout/i.test(review.error || ''), 'a clear error must be surfaced');
    ok('guardian timeout -> blocked=true, passed=false, NOT degraded, error surfaced');
  }
  {
    // No guardian + degraded NOT allowed (default) -> fail closed.
    const review = await reviewOutput('build a thing', 'const x = 1;', '', async () => ({ success: true, text: 'REVIEW_PASS', model: 'x' }));
    assert.strictEqual(review.blocked, true, 'missing guardian must block when degraded is not allowed');
    assert.strictEqual(review.passed, false, 'missing guardian must not auto-approve');
    assert.ok(!review.degraded, 'without the single-provider signal this is a block, not degraded');
    ok('no guardian (degraded not allowed) -> blocked, never auto-approved');
  }
  {
    // Ambiguous response (neither PASS nor FIX) -> block rather than ship unreviewed.
    const review = await reviewOutput('build a thing', 'const x = 1;', 'gemini', async () => ({ success: true, text: 'looks fine to me', model: 'gemini' }));
    assert.strictEqual(review.blocked, true, 'unrecognized response must block');
    assert.strictEqual(review.passed, false);
    assert.ok(!review.degraded, 'an ambiguous failure must NOT be mislabeled degraded');
    ok('ambiguous guardian response -> blocked (fail closed), not degraded');
  }

  console.log('DEGRADED — single-provider config proceeds but is marked unreviewed (the two paths stay distinct):');
  {
    // Single provider: no independent guardian, caller passes the degraded signal -> proceed + warn.
    let guardianCalled = false;
    const callAI = async () => { guardianCalled = true; return { success: true, text: 'REVIEW_PASS', model: 'x' }; };
    const review = await reviewOutput('build a thing', 'const x = 1;', '', callAI, undefined, true);
    assert.strictEqual(guardianCalled, false, 'no AI should be called when there is no guardian');
    assert.ok(!review.blocked, 'single-provider degraded must NOT block the ship');
    assert.strictEqual(review.degraded, true, 'must be marked degraded');
    assert.strictEqual(review.passed, false, 'degraded must NOT collapse into passed:true');
    assert.ok(/one (ai )?provider|second provider/i.test(review.warning || ''), 'a clear single-provider warning must fire');
    ok('single-provider -> proceeds, degraded=true, passed=false, warning fired (not blocked, not passed)');
  }
  {
    // Distinctness guard: even WITH the degraded flag set, a real guardian failure still blocks —
    // because the guardian WAS present and its call failed (degraded only covers the no-guardian case).
    const review = await reviewOutput('build a thing', 'const x = 1;', 'gemini', async () => ({ success: false, text: '', model: 'gemini', error: 'timeout' }), undefined, true);
    assert.strictEqual(review.blocked, true, 'a real guardian failure must still block even with the degraded flag set');
    assert.ok(!review.degraded, 'a real failure must never be relabeled degraded');
    ok('real guardian failure stays blocked even when degraded flag is set (no regression into degraded)');
  }

  console.log(`\n✅ ALL ${passed} GUARDIAN INDEPENDENCE CHECKS PASSED`);
})().catch((e) => {
  console.error('\n✗ INTEGRATION TEST FAILED:', e && e.message ? e.message : e);
  process.exit(1);
});
