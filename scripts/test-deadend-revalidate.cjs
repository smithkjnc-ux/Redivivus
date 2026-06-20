// [SCOPE] Auto-revalidation test for project dead-ends. Proves readProjectDeadEnds() retires a
// `tool-unavailable` entry to [FIXED] once the tool is installed (hiding it from the Supervisor) while
// leaving missing-tool and logic dead-ends as live [DEAD]. Run after compiling:
//   npx tsc -p ./ && node scripts/test-deadend-revalidate.cjs

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readProjectDeadEnds } = require(path.resolve(__dirname, '..', 'out', 'core', 'routing', 'chatPanelMsgFixDeadEnds.js'));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-deadend-'));
const file = path.join(root, '.redivivus', 'dead_ends.md');
fs.mkdirSync(path.dirname(file), { recursive: true });

// `node` is guaranteed present (we're running it); the other two must stay DEAD.
const seed =
  '# Dead End Log\nApproaches tried and failed.\n\n---\n\n' +
  '## [DEAD] tool-unavailable: node (logged 2026-06-01)\n- **What was tried:** ran `node x.js`\n- **Why it fails:** node missing\n- **Do this instead:** install node\n\n---\n\n' +
  '## [DEAD] tool-unavailable: zzmissing999 (logged 2026-06-01)\n- **What was tried:** ran `zzmissing999 go`\n- **Why it fails:** not installed\n- **Do this instead:** install it\n\n---\n\n' +
  '## [DEAD] guardian-rejected: inverted the loop condition (logged 2026-06-01)\n- **What was tried:** flipped <\n- **Why it fails:** off-by-one\n- **Do this instead:** rephrase\n\n---\n\n';
fs.writeFileSync(file, seed);

let passed = 0;
const ok = (m) => { passed++; console.log('  ✓', m); };

try {
  const visible = readProjectDeadEnds(root); // triggers revalidation + strips [FIXED]
  const onDisk = fs.readFileSync(file, 'utf8');

  // 1) The now-available tool is retired and HIDDEN from the Supervisor.
  assert.ok(!/tool-unavailable: node/.test(visible), 'the now-installed tool (node) is NOT shown to the Supervisor');
  assert.ok(/## \[FIXED\] tool-unavailable: node/.test(onDisk), 'node entry rewritten to [FIXED] in the file');
  assert.ok(/verified available \d{4}-\d{2}-\d{2}/.test(onDisk), 'a verified-available date was stamped');
  ok('installed tool → retired to [FIXED] (kept on disk for audit, hidden from Supervisor)');

  // 2) A genuinely-missing tool stays a live dead end, still shown.
  assert.ok(/tool-unavailable: zzmissing999/.test(visible), 'missing tool still shown to the Supervisor');
  assert.ok(/## \[DEAD\] tool-unavailable: zzmissing999/.test(onDisk), 'missing tool stays [DEAD] on disk');
  ok('still-missing tool → left as live [DEAD]');

  // 3) A non-mechanical (logic) dead end is never auto-touched.
  assert.ok(/guardian-rejected: inverted the loop/.test(visible), 'logic dead end still shown');
  assert.ok(/## \[DEAD\] guardian-rejected/.test(onDisk), 'logic dead end left [DEAD] (human review only)');
  ok('logic dead end → untouched (only mechanically-verifiable ones are auto-retired)');

  console.log(`\n✅ ALL ${passed} DEAD-END REVALIDATION CHECKS PASSED`);
} catch (e) {
  console.error('\n✗ FAILED:', e && e.message ? e.message : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}
