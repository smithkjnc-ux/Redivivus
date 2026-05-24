// Test the GitHub commit button chain end-to-end (no VS Code required).
// Run with: node scripts/test-github-commit.mjs

import assert from 'assert';

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

// ── Inline the token generation logic from chatPanelMsgFixOutput.ts ──────────

function makeCommitToken(written, plainSummary, userText) {
  if (written.length === 0) { return ''; }
  const payload = Buffer.from(JSON.stringify({
    files: written,
    message: plainSummary || `fix: ${userText.slice(0, 80)}`
  })).toString('base64');
  return `\n__GITHUB_COMMIT__${payload}|||END_GITHUB_COMMIT__`;
}

// ── Inline the renderer regex from chatPanelRenderer.ts ───────────────────────

function renderCommitToken(html) {
  return html.replace(/__GITHUB_COMMIT__([A-Za-z0-9+/=]+)\|\|\|END_GITHUB_COMMIT__/g, (_m, b64) => {
    return `<button class="github-commit-btn" data-payload="${b64}">Commit + Push to GitHub</button>`;
  });
}

// ── Inline the payload decode from chatPanelMessages.ts ───────────────────────

function decodePayload(b64) {
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nToken generation');

test('token emitted when files were written', () => {
  const token = makeCommitToken(['index.html'], 'speed persistence fix', 'speed reverts on reload');
  assert(token.includes('__GITHUB_COMMIT__'), 'Missing token marker');
  assert(token.includes('|||END_GITHUB_COMMIT__'), 'Missing end marker');
});

test('no token when no files written', () => {
  const token = makeCommitToken([], '', 'test');
  assert.strictEqual(token, '', 'Expected empty string');
});

test('message falls back to userText when no plainSummary', () => {
  const token = makeCommitToken(['index.html'], '', 'fix the gravity at slow speeds');
  const b64 = token.match(/__GITHUB_COMMIT__([A-Za-z0-9+/=]+)/)?.[1];
  assert(b64, 'No base64 payload found');
  const data = decodePayload(b64);
  assert(data.message.includes('fix the gravity'), `Wrong fallback message: ${data.message}`);
});

test('multiple files encoded correctly', () => {
  const token = makeCommitToken(['src/game.ts', 'src/ui.ts'], 'fixed two files', 'test');
  const b64 = token.match(/__GITHUB_COMMIT__([A-Za-z0-9+/=]+)/)?.[1];
  const data = decodePayload(b64);
  assert.deepStrictEqual(data.files, ['src/game.ts', 'src/ui.ts']);
});

console.log('\nToken rendering');

test('token renders as button with data-payload', () => {
  const token = makeCommitToken(['index.html'], 'fixed speed persistence', 'speed resets');
  const rendered = renderCommitToken(token);
  assert(rendered.includes('class="github-commit-btn"'), 'Missing button class');
  assert(rendered.includes('data-payload='), 'Missing data-payload');
  assert(!rendered.includes('__GITHUB_COMMIT__'), 'Raw token not replaced');
});

test('rendered button payload decodes to original data', () => {
  const files = ['index.html'];
  const message = 'fixed speed persistence';
  const token = makeCommitToken(files, message, 'speed resets');
  const rendered = renderCommitToken(token);
  const b64 = rendered.match(/data-payload="([A-Za-z0-9+/=]+)"/)?.[1];
  assert(b64, 'No payload in rendered button');
  const data = decodePayload(b64);
  assert.deepStrictEqual(data.files, files);
  assert.strictEqual(data.message, message);
});

test('non-commit content passes through unchanged', () => {
  const html = '<p>What I found: speed resets on reload</p>';
  assert.strictEqual(renderCommitToken(html), html);
});

console.log('\nRound-trip: fix output -> render -> click decode');

test('full round-trip for flappy bird speed fix', () => {
  // Simulate what chatPanelMsgFixOutput.ts produces
  const written = ['index.html'];
  const plainSummary = 'Speed setting now saved to localStorage so it persists across reloads';
  const userText = 'when the user sets the game speed slower or higher, it reverts back to normal on start';
  const content = `**What I found:** ${plainSummary}\n\n**What I changed:**\n• \`index.html\`` + makeCommitToken(written, plainSummary, userText);

  // Simulate renderer
  const rendered = renderCommitToken(content);
  assert(rendered.includes('github-commit-btn'), 'Button not rendered');

  // Simulate button click decode (what chatPanelMessages.ts does)
  const b64 = rendered.match(/data-payload="([A-Za-z0-9+/=]+)"/)?.[1];
  assert(b64, 'No payload extracted');
  const data = decodePayload(b64);
  assert.deepStrictEqual(data.files, ['index.html'], `Files wrong: ${JSON.stringify(data.files)}`);
  assert(data.message.includes('localStorage'), `Message wrong: ${data.message}`);

  console.log(`    payload decodes: files=${JSON.stringify(data.files)} message="${data.message.slice(0, 50)}..."`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) { process.exit(1); }
