// [SCOPE] Tool-Gap escalation tiers — same pattern as test-guardian-independence.cjs: standalone, no
// VS Code, injected deps, runs against compiled out/. Proves the three required scenarios:
//   - in-plan command proceeds silently (no escalation)
//   - out-of-plan with a viable but COSTLIER alternative triggers the live user choice
//   - out-of-plan with NO alternative writes the flag file and surfaces the blocking message
//
// Run AFTER compiling:  npx tsc -p ./ && node scripts/test-toolgap-escalation.cjs

const assert = require('assert');
const path = require('path');

const { resolveToolGap, clearToolGapFlag, commandInPlan } =
  require(path.resolve(__dirname, '..', 'out', 'services', 'ai', 'toolGapEscalation.js'));

let passed = 0;
const ok = (m) => { passed++; console.log('  ✓', m); };

// In-memory fs that records writes/unlinks — no real filesystem is touched.
function fakeFs() {
  const store = {};
  return {
    writes: [], unlinks: [], _store: store,
    existsSync(p) { return p in store; },
    mkdirSync() {},
    writeFileSync(p, data) { store[p] = data; this.writes.push({ p, data }); },
    unlinkSync(p) { delete store[p]; this.unlinks.push(p); },
  };
}

const FLAG = '/tmp/__toolgap_test_flag.json';

(async () => {
  console.log('plan-match (commandInPlan — not a whitelist):');
  {
    assert.ok(commandInPlan('npm install', 'Run npm install to add deps'), 'tool referenced by plan');
    assert.ok(commandInPlan('npm run build', 'the plan says: npm run build'), 'exact command in plan');
    assert.ok(!commandInPlan('apt-get install ffmpeg', 'Run npm install and node server.js'), 'unrelated tool = gap');
    assert.ok(!commandInPlan('curl http://x', ''), 'empty plan can approve nothing = gap');
    ok('commands matched to the plan by tool/text, not a hardcoded list');
  }

  console.log('Scenario 1 — in-plan command proceeds silently (no escalation):');
  {
    let represcribed = false, asked = false;
    const fs = fakeFs();
    const out = await resolveToolGap('npm install', 'First run npm install', 'build the app', {
      represcribe: async () => { represcribed = true; return { found: false, costlier: false }; },
      askUser: async () => { asked = true; return 'wait'; },
      log: () => {}, fs, flagPath: FLAG,
    });
    assert.strictEqual(out.kind, 'in-plan');
    assert.ok(!represcribed, 'Supervisor NOT consulted for an in-plan command');
    assert.ok(!asked, 'user NOT prompted');
    assert.strictEqual(fs.writes.length, 0, 'no flag written');
    ok('in-plan → kind=in-plan; no supervisor call, no user prompt, no flag');
  }

  console.log('Scenario 1b — out-of-plan but a FREE/low-cost alternate → proceed silently:');
  {
    let asked = false;
    const fs = fakeFs();
    const out = await resolveToolGap('yarn add lodash', 'Run npm install', 'build the app', {
      represcribe: async () => ({ found: true, costlier: false, command: 'npm install lodash' }),
      askUser: async () => { asked = true; return 'wait'; },
      log: () => {}, fs, flagPath: FLAG,
    });
    assert.strictEqual(out.kind, 'proceed');
    assert.strictEqual(out.command, 'npm install lodash', 'runs the supervisor alternate');
    assert.ok(!asked, 'no user prompt when the alternate is free');
    assert.strictEqual(fs.writes.length, 0, 'no flag');
    ok('out-of-plan + free alternate → proceed with alternate, no user prompt, no flag');
  }

  console.log('Scenario 2 — out-of-plan with a viable COSTLIER alternate → live user choice:');
  {
    const fs = fakeFs();
    const prompts = [];
    const base = {
      represcribe: async () => ({ found: true, costlier: true, command: 'npm install --legacy-peer-deps' }),
      log: () => {}, fs, flagPath: FLAG,
    };
    const yes = await resolveToolGap('npm ci', 'Run npm install', 'build the app', {
      ...base, askUser: async (p) => { prompts.push(p); return 'alternate'; },
    });
    assert.strictEqual(yes.kind, 'proceed-costly');
    assert.strictEqual(yes.command, 'npm install --legacy-peer-deps');
    assert.ok(prompts.length === 1 && /additional tokens|alternate/i.test(prompts[0]), 'user asked, cost-aware prompt');
    assert.strictEqual(fs.writes.length, 0, 'no flag — a path exists');
    ok('costlier alternate fires the live user choice; "alternate" → proceed-costly');

    const no = await resolveToolGap('npm ci', 'Run npm install', 'build the app', {
      ...base, askUser: async () => 'wait',
    });
    assert.strictEqual(no.kind, 'wait');
    assert.strictEqual(fs.writes.length, 0, 'still no flag');
    ok('same prompt, "wait" → kind=wait (nothing run, no flag)');
  }

  console.log('Scenario 3 — out-of-plan with NO alternative → flag file + blocking message:');
  {
    let asked = false;
    const fs = fakeFs();
    const out = await resolveToolGap('ffmpeg -i in.mp4 out.gif', 'Convert the video', 'make a gif', {
      represcribe: async () => ({ found: false, costlier: false, neededTool: 'ffmpeg', note: 'no media tool available' }),
      askUser: async () => { asked = true; return 'wait'; },
      log: () => {}, fs, flagPath: FLAG,
    });
    assert.strictEqual(out.kind, 'blocked');
    assert.ok(/needs your attention|tool gap/i.test(out.message), 'blocking message surfaced');
    assert.ok(!asked, 'no cost choice for a true dead end');
    assert.strictEqual(fs.writes.length, 1, 'flag written exactly once');
    assert.strictEqual(fs.writes[0].p, FLAG, 'written to the flag path');
    const payload = JSON.parse(fs.writes[0].data);
    assert.strictEqual(payload.tool, 'ffmpeg', 'flag notes the missing tool');
    assert.strictEqual(payload.command, 'ffmpeg -i in.mp4 out.gif', 'flag notes the attempted command');
    assert.ok(payload.task && payload.at, 'flag notes the task + a timestamp (JSON contract)');
    ok('dead end → kind=blocked; flag JSON written (tool+task+command+at); blocking message');
  }

  console.log('flag cleared on retry:');
  {
    const fs = fakeFs();
    fs.writeFileSync(FLAG, '{}');
    clearToolGapFlag(fs, FLAG);
    assert.ok(!fs.existsSync(FLAG), 'flag removed');
    assert.deepStrictEqual(fs.unlinks, [FLAG]);
    ok('clearToolGapFlag removes the flag (called when a build is retried)');
  }

  console.log(`\n✅ ALL ${passed} TOOL-GAP ESCALATION CHECKS PASSED`);
})().catch((e) => { console.error('\n✗ FAILED:', e && e.message ? e.message : e); process.exit(1); });
