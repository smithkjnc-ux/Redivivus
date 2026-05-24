// Quick smoke test for fix pipeline utilities.
// Run with: node scripts/test-fix-pipeline.mjs
// No VS Code dependency — tests pure functions only.

import assert from 'assert';

// ── Inline the functions under test (avoids TS compilation step) ──────────────

function stripSeparatorArtifacts(content) {
  return content.split('\n').filter(l => l.trim() !== '===').join('\n');
}

function parseUnifiedDiff(response) {
  const edits = [];
  const sections = response.split(/^(?=---\s)/m).filter(s => /^---\s+\S+\n\+\+\+/.test(s));
  for (const section of sections) {
    const fm = section.match(/^---\s+\S+\n\+\+\+\s+(?:b\/)?(.+?)(?:\s|$)/m);
    if (!fm) { continue; }
    const filePath = fm[1].trim().replace(/^b\//, '');
    let inHunk = false;
    let searchLines = [];
    let replaceLines = [];
    const flushHunk = () => {
      const searchBlock = searchLines.join('\n').trimEnd();
      const replaceBlock = replaceLines.join('\n').trimEnd();
      if (searchBlock && searchBlock !== replaceBlock) { edits.push({ filePath, searchBlock, replaceBlock }); }
      searchLines = []; replaceLines = [];
    };
    for (const line of section.split('\n')) {
      if (line.startsWith('@@')) { if (inHunk) { flushHunk(); } inHunk = true; }
      else if (inHunk && !line.startsWith('---') && !line.startsWith('+++')) {
        if (line.startsWith('-')) { searchLines.push(line.slice(1)); }
        else if (line.startsWith('+')) { replaceLines.push(line.slice(1)); }
        else { const ctx = line.startsWith(' ') ? line.slice(1) : line; searchLines.push(ctx); replaceLines.push(ctx); }
      }
    }
    if (inHunk) { flushHunk(); }
  }
  return edits;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

// ── stripSeparatorArtifacts ───────────────────────────────────────────────────

console.log('\nstripSeparatorArtifacts');

test('removes standalone === lines', () => {
  const input = 'button {\n===\n  color: red;\n}';
  const out = stripSeparatorArtifacts(input);
  assert(!out.includes('==='), `Still contains ===: ${out}`);
  assert(out.includes('color: red'), 'Removed valid content');
});

test('preserves lines containing === as part of code', () => {
  const input = 'if (a === b) {\n===\n  return true;\n}';
  const out = stripSeparatorArtifacts(input);
  assert(out.includes('a === b'), 'Removed inline === comparison');
  assert(!out.split('\n').some(l => l.trim() === '==='), 'Standalone === still present');
});

test('no-op on clean content', () => {
  const input = 'const x = 1;\nconst y = 2;';
  assert.strictEqual(stripSeparatorArtifacts(input), input);
});

test('removes multiple === lines', () => {
  const input = 'a\n===\nb\n===\nc';
  const out = stripSeparatorArtifacts(input);
  assert.strictEqual(out, 'a\nb\nc');
});

// ── parseUnifiedDiff ──────────────────────────────────────────────────────────

console.log('\nparseUnifiedDiff');

test('parses single hunk with context', () => {
  const diff = `--- a/src/game.ts
+++ b/src/game.ts
@@ -10,7 +10,7 @@
 function update() {
-  const speed = 5;
+  const speed = 3;
   applySpeed(speed);
 }
`;
  const edits = parseUnifiedDiff(diff);
  assert.strictEqual(edits.length, 1, `Expected 1 edit, got ${edits.length}`);
  assert.strictEqual(edits[0].filePath, 'src/game.ts');
  assert(edits[0].searchBlock.includes('const speed = 5'), `Search block wrong: ${edits[0].searchBlock}`);
  assert(edits[0].replaceBlock.includes('const speed = 3'), `Replace block wrong: ${edits[0].replaceBlock}`);
  // Context lines appear in BOTH search and replace
  assert(edits[0].searchBlock.includes('function update'), 'Context missing from search');
  assert(edits[0].replaceBlock.includes('function update'), 'Context missing from replace');
});

test('parses multiple hunks in one file', () => {
  const diff = `--- a/src/config.ts
+++ b/src/config.ts
@@ -5,3 +5,3 @@
-const PIPE_SPEED = 5;
+const PIPE_SPEED = 3;
@@ -20,3 +20,3 @@
-const GRAVITY = 0.6;
+const GRAVITY = 0.4;
`;
  const edits = parseUnifiedDiff(diff);
  assert.strictEqual(edits.length, 2, `Expected 2 edits, got ${edits.length}`);
  assert(edits[0].searchBlock.includes('PIPE_SPEED = 5'));
  assert(edits[1].searchBlock.includes('GRAVITY = 0.6'));
});

test('parses multiple files in one response', () => {
  const diff = `--- a/src/game.ts
+++ b/src/game.ts
@@ -1,3 +1,3 @@
-const A = 1;
+const A = 2;
--- a/src/ui.ts
+++ b/src/ui.ts
@@ -1,3 +1,3 @@
-const B = 1;
+const B = 2;
`;
  const edits = parseUnifiedDiff(diff);
  assert.strictEqual(edits.length, 2, `Expected 2 edits, got ${edits.length}`);
  assert.strictEqual(edits[0].filePath, 'src/game.ts');
  assert.strictEqual(edits[1].filePath, 'src/ui.ts');
});

test('ignores wrong line numbers (AI hallucination)', () => {
  // @@ -999,3 +999,3 @@ — numbers completely wrong, should still apply via text anchor
  const diff = `--- a/src/game.ts
+++ b/src/game.ts
@@ -999,3 +999,3 @@
 context before
-old line
+new line
 context after
`;
  const edits = parseUnifiedDiff(diff);
  assert.strictEqual(edits.length, 1);
  assert(edits[0].searchBlock.includes('old line'));
  assert(edits[0].replaceBlock.includes('new line'));
});

test('returns empty array for non-diff response', () => {
  const response = 'Here is the fix:\n```typescript\nconst x = 1;\n```';
  assert.deepStrictEqual(parseUnifiedDiff(response), []);
});

test('handles b/ prefix in +++ line', () => {
  const diff = `--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,3 @@
-old
+new
`;
  const edits = parseUnifiedDiff(diff);
  assert.strictEqual(edits[0].filePath, 'src/file.ts', `b/ prefix not stripped: ${edits[0]?.filePath}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) { process.exit(1); }

// ── End-to-end: unified diff against real flappy bird code ────────────────────

console.log('\nEnd-to-end: apply unified diff to real file');

import { readFileSync } from 'fs';

const GAME_FILE = '/home/papajoe/projects/flappy-bird-game/index.html';

test('unified diff parses flap line and search block found in real file', () => {
  const diff = `--- a/index.html
+++ b/index.html
@@ -363,4 +363,4 @@
             flap() {
-                this.velocity = FLAP_STRENGTH;
+                this.velocity = FLAP_STRENGTH * gameState.speedMultiplier;
                 playSound(523, 0.1); // C5 note
             },
`;

  const edits = parseUnifiedDiff(diff);
  assert.strictEqual(edits.length, 1, `Parser returned ${edits.length} edits`);
  assert(edits[0].searchBlock.includes('this.velocity = FLAP_STRENGTH;'), 'Wrong search block');
  assert(edits[0].replaceBlock.includes('FLAP_STRENGTH * gameState.speedMultiplier'), 'Wrong replace block');

  // Verify the search block is actually findable in the real file (parse sanity check)
  const content = readFileSync(GAME_FILE, 'utf-8');
  const idx = content.indexOf(edits[0].searchBlock);
  assert(idx !== -1, `Search block not found in file. Block: "${edits[0].searchBlock}"`);

  console.log('    (parse + search-anchor verified; not applying — flap strength should stay constant)');
});

console.log(`\n${passed + failed} tests total: ${passed} passed, ${failed} failed\n`);
if (failed > 0) { process.exit(1); }
