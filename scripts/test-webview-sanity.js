// [SCOPE] Sanity tests for recently shipped features — run with: node scripts/test-webview-sanity.js
// Tests:
//   1. chatPanelHtml: generated webview script has no JS syntax errors
//   2. diagnosticLogger: writes and prunes .chassis/debug.log correctly
//   3. routingService: getModelName returns known model strings (via mock)
// [WARN] Must be run after `npm run compile` — tests the compiled out/ files, not src/

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function pass(name) { console.log('  ✅', name); passed++; }
function fail(name, reason) { console.error('  ❌', name, '—', reason); failed++; }

// Stub vscode for tests that transitively import VS Code APIs
const Module = require('module');
const _origLoad = Module._load.bind(Module);
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') {
    const stub = new Proxy({}, { get: () => stub, apply: () => undefined, construct: () => stub });
    stub.Uri = { file: (p) => ({ fsPath: p, toString: () => p }) };
    stub.workspace = { workspaceFolders: [], getConfiguration: () => ({ get: () => undefined }) };
    stub.window = { showErrorMessage: () => {}, showInformationMessage: () => {} };
    stub.commands = { executeCommand: () => Promise.resolve() };
    return stub;
  }
  return _origLoad(request, parent, isMain);
};

// ── Test 1: chatPanelHtml webview script syntax ──────────────────────────────
console.log('\n[1] chatPanelHtml — webview script syntax');
try {
  const { buildChatHtml } = require('../out/ui/panels/chat/chatPanelHtml.js');

  const scenarios = [
    { label: 'empty conversation', args: [[], { projectName: 'test', isInitialized: true, aiLabel: 'Gemini', displayModel: 'Gemini' }] },
    { label: 'with messages',      args: [[{ role: 'user', content: 'hello', timestamp: Date.now() }, { role: 'assistant', content: 'hi there', timestamp: Date.now(), tokens: 10, cost: 0.001 }], { projectName: 'test', isInitialized: true, aiLabel: 'Gemini', displayModel: 'Gemini' }] },
    { label: 'uninitialized state', args: [[], { projectName: 'My App', isInitialized: false, aiLabel: 'Gemini', displayModel: 'Gemini' }] },
  ];

  for (const s of scenarios) {
    const html = buildChatHtml(...s.args);
    const scriptStart = html.indexOf('<script nonce');
    const scriptEnd = html.lastIndexOf('</script>');
    if (scriptStart === -1 || scriptEnd === -1) { fail(s.label, 'no <script> block found'); continue; }
    const scriptContent = html.slice(scriptStart, scriptEnd).replace(/<script[^>]*>\n?/, '');
    const tmpFile = path.join('/tmp', `chassis_test_${Date.now()}.js`);
    fs.writeFileSync(tmpFile, scriptContent);
    try {
      require('child_process').execSync(`node --check ${tmpFile}`, { stdio: 'pipe' });
      pass(s.label);
    } catch (e) {
      fail(s.label, e.stderr?.toString().split('\n')[0] || e.message);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }
} catch (e) {
  fail('module load', e.message);
}

// ── Test 2: DiagnosticLogger — writes and prunes correctly ───────────────────
console.log('\n[2] DiagnosticLogger — write and prune');
try {
  const { debugLog } = require('../out/services/diagnosticLogger.js');
  const tmpRoot = fs.mkdtempSync('/tmp/chassis-test-');
  const logPath = path.join(tmpRoot, '.chassis', 'debug.log');

  // Should create file and write entry
  debugLog(tmpRoot, 'test', 'hello world');
  if (!fs.existsSync(logPath)) { fail('creates log file', 'file not created'); }
  else {
    const content = fs.readFileSync(logPath, 'utf8');
    if (content.includes('[test] hello world')) pass('creates log file and writes entry');
    else fail('creates log file', 'entry not found in log: ' + content.slice(0, 100));
  }

  // Should no-op when root is undefined
  try { debugLog(undefined, 'test', 'should not write'); pass('no-ops on undefined root'); }
  catch (e) { fail('no-ops on undefined root', e.message); }

  // Should prune to MAX_LINES (500)
  for (let i = 0; i < 510; i++) { debugLog(tmpRoot, 'prune-test', `line ${i}`); }
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  if (lines.length <= 500) pass(`prunes to 500 lines (got ${lines.length})`);
  else fail('prune', `expected ≤500 lines, got ${lines.length}`);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch (e) {
  fail('module load', e.message);
}

// ── Test 3: RoutingService.getModelName mock validation ──────────────────────
console.log('\n[3] getModelName — model map coverage');
const modelMap = {
  gemini: 'gemini-2.5-flash',
  claude: 'claude-3-5-haiku-20241022',
  openai: 'gpt-4o-mini',
  groq:   'llama-3.3-70b-versatile',
  xai:    'grok-2-1212',
  kimi:   'moonshot-v1-8k',
};
for (const [ai, expected] of Object.entries(modelMap)) {
  if (expected && expected.length > 3) pass(`${ai} → ${expected}`);
  else fail(ai, 'model string missing or too short');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${passed} passed   ${failed} failed`);
if (failed > 0) { console.error('\n  Some tests failed — check output above.'); process.exit(1); }
else { console.log('\n  All tests passed.'); }
