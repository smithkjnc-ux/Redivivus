// [SCOPE] Agent-mode integration test for the Tool-Gap escalation — drives the REAL run_command tool
// (out/services/ai/agentTools.js), not just the core resolveToolGap. Proves the wiring an actual
// Agent-mode run exercises: in-plan command runs; out-of-plan dead end writes the real flag + blocks;
// out-of-plan costlier alternate asks the user then runs the alternate.
//
// Run AFTER compiling:  npx tsc -p ./ && node scripts/test-agent-toolgap.cjs

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// agentTools.js imports `vscode` (write_file uses it) — stub it so we can require the module.
const noop = () => {};
const vscodeStub = {
  workspace: { getConfiguration: () => ({ get: () => undefined }), openTextDocument: async () => ({}) },
  window: { showTextDocument: async () => ({}) },
  Uri: { file: (p) => ({ fsPath: p }) },
  ViewColumn: { Beside: 2 },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') { return vscodeStub; }
  return origLoad.call(this, request, parent, isMain);
};

const { BUILT_IN_TOOLS } = require(path.resolve(__dirname, '..', 'out', 'services', 'ai', 'agentTools.js'));
const runCommand = BUILT_IN_TOOLS.find((t) => t.name === 'run_command');
const FLAG = path.join(os.homedir(), '.redivivus', 'pending_toolgap.json');
const DEAD_ENDS_MD = path.join(os.tmpdir(), '.redivivus', 'dead_ends.md'); // ctx root is os.tmpdir()

let passed = 0;
const ok = (m) => { passed++; console.log('  ✓', m); };

// A context like the agent loop builds. `routing.routeByComplexity` is the Supervisor re-prescription.
const ctx = (plan, supervisorReply, userChoice) => ({
  root: os.tmpdir(),
  task: 'verify the build',
  plan,
  log: noop,
  modifiedFiles: new Set(),
  routing: { routeByComplexity: async () => ({ success: true, text: supervisorReply }) },
  askUser: async () => userChoice,
});

(async () => {
  assert.ok(runCommand, 'run_command tool exists');
  try { fs.unlinkSync(FLAG); } catch {}

  console.log('1) in-plan command → runs normally, no escalation, no flag:');
  {
    const out = await runCommand.execute({ command: 'pwd' }, ctx('confirm the working directory by running pwd', 'PROCEED: x', 'wait'));
    assert.ok(!out.startsWith('_PAUSE_ASK_USER_'), 'did NOT escalate — ran as-is');
    assert.ok(/\//.test(out), 'command actually executed (printed a path)');
    assert.ok(!fs.existsSync(FLAG), 'no flag written for an in-plan command');
    ok('in-plan `pwd` ran; output returned; no escalation, no flag');
  }

  console.log('2) out-of-plan COSTLIER alternate → user picks "alternate" → runs the alternate:');
  {
    const out = await runCommand.execute(
      { command: 'apt-get install ffmpeg' },
      ctx('use npm only', 'COSTLY: echo agent-alt-ran', 'alternate'),
    );
    assert.ok(/agent-alt-ran/.test(out), 'ran the supervisor alternate command, not the original');
    assert.ok(!fs.existsSync(FLAG), 'no flag — a path existed');
    ok('costlier alternate → asked → "alternate" → executed the alternate (echo agent-alt-ran)');
  }

  console.log('3) out-of-plan COSTLIER alternate → user picks "wait" → does NOT run, no flag:');
  {
    const out = await runCommand.execute(
      { command: 'apt-get install ffmpeg' },
      ctx('use npm only', 'COSTLY: echo should-not-run', 'wait'),
    );
    assert.ok(!/should-not-run/.test(out), 'the alternate did NOT execute');
    assert.ok(/wait|hold/i.test(out), 'returned a hold/wait signal to the agent loop');
    assert.ok(!fs.existsSync(FLAG), 'no flag for a wait');
    ok('costlier alternate → "wait" → nothing ran, agent paused, no flag');
  }

  console.log('4) out-of-plan DEAD END → writes the real flag + a project dead-end + blocks the loop:');
  {
    try { fs.unlinkSync(DEAD_ENDS_MD); } catch {}
    const out = await runCommand.execute(
      { command: 'ffmpeg -i in.mp4 out.gif' },
      ctx('use rsvg-convert', 'DEAD_END: ffmpeg / video tooling', 'wait'),
    );
    assert.ok(out.startsWith('_PAUSE_ASK_USER_'), 'returns the loop-ending sentinel (build paused)');
    assert.ok(/tool gap|needs your attention/i.test(out), 'blocking message surfaced');
    assert.ok(fs.existsSync(FLAG), 'the REAL ~/.redivivus/pending_toolgap.json was written');
    const payload = JSON.parse(fs.readFileSync(FLAG, 'utf8'));
    assert.strictEqual(payload.command, 'ffmpeg -i in.mp4 out.gif', 'flag JSON notes the command');
    assert.ok(payload.tool && payload.task && payload.at, 'flag JSON has tool + task + timestamp');
    console.log('     flag JSON →', JSON.stringify(payload));
    // NEW: the lesson is also logged to the project's dead_ends.md so a FUTURE fix avoids the missing tool.
    assert.ok(fs.existsSync(DEAD_ENDS_MD), 'project dead_ends.md was written for the missing tool');
    const de = fs.readFileSync(DEAD_ENDS_MD, 'utf8');
    assert.ok(/tool-unavailable/i.test(de) && /ffmpeg/.test(de), 'dead-end names the unavailable tool so a future Supervisor wont prescribe it');
    console.log('     dead_ends.md →', (de.match(/tool-unavailable: .*/) || [''])[0]);
    try { fs.unlinkSync(DEAD_ENDS_MD); } catch {}
    ok('dead end → real flag + project dead-end logged (future fixes learn), agent loop blocked');
  }

  // Clean up the real flag so rigops doesn't stay red after the test.
  try { fs.unlinkSync(FLAG); } catch {}
  assert.ok(!fs.existsSync(FLAG), 'flag cleaned up after the test');

  console.log(`\n✅ ALL ${passed} AGENT-MODE TOOL-GAP CHECKS PASSED (real run_command tool, flag cleaned up)`);
})().catch((e) => {
  try { fs.unlinkSync(FLAG); } catch {}
  console.error('\n✗ FAILED:', e && e.message ? e.message : e);
  process.exit(1);
});
