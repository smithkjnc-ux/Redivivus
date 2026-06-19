// [SCOPE] Integration test for audit findings C1 (auto-update download) + C2 (Linux debrand + path).
// C1: downloadFile must FOLLOW redirects to the final 200 and pipe correctly, and must REJECT (not
//     hang) on failure.
// C2: the Linux debrand step must rewrite product.json (dataFolderName .vscode-oss -> .redivivus,
//     urlProtocol, doc URLs, names), and that dataFolderName must match the directory
//     postcompile-deploy.js deploys to — i.e. where the running IDE will actually find the update.
//
// Run AFTER compiling sources:  npx tsc -p ./ && node scripts/test-update-and-debrand.cjs
// Standalone (no VS Code host): stubs `vscode`, and maps `https` -> Node `http` so we can drive the
// download against a local mock redirect server.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const cp = require('child_process');
const Module = require('module');

const vscodeStub = {
  workspace: { getConfiguration: () => ({ get: () => undefined, update: async () => {} }) },
  window: {}, commands: {}, env: { appRoot: '/tmp' },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') { return vscodeStub; }
  if (request === 'https') { return http; } // [C1] drive downloadFile against an http mock server
  return origLoad.call(this, request, parent, isMain);
};

const repoRoot = path.resolve(__dirname, '..');
const { downloadFile, fetchWithTimeout } = require(path.join(repoRoot, 'out', 'commands', 'checkForUpdates.js'));

let passed = 0;
const ok = (m) => { passed++; console.log('  ✓', m); };
const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT (${label}) — the promise hung instead of settling`)), ms)),
]);

(async () => {
  // ── C1: update download follows a GitHub-style redirect to the final 200 ───
  console.log('C1 — auto-update download follows redirects and never hangs:');
  {
    // Mimics GitHub: /releases/.../asset.vsix -> 302 -> /cdn/<signed> -> 200 <bytes>.
    const BODY = 'REDIVIVUS-VSIX-BYTES-' + 'x'.repeat(5000);
    const server = http.createServer((req, res) => {
      if (req.url === '/releases/download/asset.vsix') {
        res.writeHead(302, { Location: `http://127.0.0.1:${server.address().port}/cdn/signed` });
        res.end();
      } else if (req.url === '/cdn/signed') {
        res.writeHead(200, { 'content-length': String(Buffer.byteLength(BODY)) });
        res.end(BODY);
      } else if (req.url === '/broken') {
        res.writeHead(500); res.end('boom');
      } else { res.writeHead(404); res.end(); }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const dest = path.join(os.tmpdir(), `rdv-test-${Date.now()}.vsix`);
    let progressFired = false;
    await withTimeout(
      downloadFile(`http://127.0.0.1:${port}/releases/download/asset.vsix`, dest, () => { progressFired = true; }),
      5000, 'redirected download'
    );
    const got = fs.readFileSync(dest, 'utf8');
    assert.strictEqual(got, BODY, 'downloaded bytes must match the final 200 body (redirect followed + piped)');
    assert.ok(progressFired, 'progress callback should fire while streaming');
    fs.unlinkSync(dest);
    ok('302 -> 200: file written with the full final body (no hang, redirect followed)');

    // Failure must REJECT within the timeout, not hang forever (the old bug).
    const dest2 = path.join(os.tmpdir(), `rdv-test-fail-${Date.now()}.vsix`);
    let rejected = false;
    try {
      await withTimeout(downloadFile(`http://127.0.0.1:${port}/broken`, dest2, () => {}), 5000, 'HTTP 500');
    } catch (e) {
      rejected = true;
      assert.ok(/HTTP 500|TIMEOUT/.test(e.message), `expected an HTTP error, got: ${e.message}`);
      assert.ok(!/TIMEOUT/.test(e.message), 'a failed download must REJECT, not hang');
    }
    assert.ok(rejected, 'HTTP 500 must reject the promise');
    try { fs.unlinkSync(dest2); } catch {}
    ok('HTTP 500: promise rejects promptly (no silent hang)');

    await new Promise((r) => server.close(r));
  }

  // ── C2: a fresh Linux build is debranded, and the path lines up with deploy ─
  console.log('C2 — fresh Linux build is debranded and lands where the IDE reads it:');

  // Simulate a freshly-downloaded VSCodium base product.json (unpatched, as the audit found it).
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-build-'));
  const appDir = path.join(sandbox, 'VSCode-linux-x64', 'resources', 'app');
  fs.mkdirSync(appDir, { recursive: true });
  const productPath = path.join(appDir, 'product.json');
  fs.writeFileSync(productPath, JSON.stringify({
    nameShort: 'VSCodium', nameLong: 'VSCodium', applicationName: 'codium',
    dataFolderName: '.vscode-oss', urlProtocol: 'vscodium', serverDataFolderName: '.vscodium-server',
    reportIssueUrl: 'https://github.com/VSCodium/vscodium/issues/new',
    documentationUrl: 'https://go.microsoft.com/fwlink/?LinkID=533484#vscode',
    releaseNotesUrl: 'https://go.microsoft.com/fwlink/?LinkID=533483#vscode',
  }, null, 2));

  // Run the actual debrand step the Linux build scripts now call.
  cp.execFileSync('node', [path.join(repoRoot, 'scripts', 'debrand-linux-product.js'), productPath], { stdio: 'pipe' });
  const patched = JSON.parse(fs.readFileSync(productPath, 'utf8'));

  assert.strictEqual(patched.dataFolderName, '.redivivus', 'dataFolderName must be rebranded to .redivivus');
  assert.strictEqual(patched.urlProtocol, 'redivivus', 'urlProtocol must be rebranded');
  assert.strictEqual(patched.nameShort, 'Redivivus');
  assert.strictEqual(patched.serverDataFolderName, '.redivivus-server');
  const blob = JSON.stringify(patched).toLowerCase();
  assert.ok(!blob.includes('vscodium'), 'no VSCodium strings may remain in the patched fields');
  assert.ok(!blob.includes('go.microsoft.com'), 'MS doc URLs must be replaced');
  ok('fresh VSCodium product.json -> fully debranded (names, dataFolderName, urlProtocol, doc URLs)');

  // [C1+C2 link] The update is installed into <dataFolderName>/extensions. Confirm that equals the
  // directory postcompile-deploy.js deploys to (~/.redivivus/extensions) — so a downloaded update
  // lands exactly where the running IDE looks.
  const deployJs = fs.readFileSync(path.join(repoRoot, 'scripts', 'postcompile-deploy.js'), 'utf8');
  const deployFolderMatch = deployJs.match(/path\.join\(home,\s*'([^']+)',\s*'extensions'\)/g) || [];
  const deployFolders = deployFolderMatch.map((m) => m.match(/'([^']+)',\s*'extensions'/)[1]);
  assert.ok(deployFolders.includes(patched.dataFolderName),
    `postcompile-deploy.js must deploy to ~/${patched.dataFolderName}/extensions; found targets: ${deployFolders.join(', ')}`);
  ok(`deploy target ~/${patched.dataFolderName}/extensions matches product.json dataFolderName (update will be found)`);

  fs.rmSync(sandbox, { recursive: true, force: true });

  // ── M6: the version-check fetch races a hard timer (a hung request can't block) ──
  console.log('M6 — /api/version fetch times out instead of hanging:');
  {
    const realFetch = global.fetch;
    try {
      // A request that never resolves must REJECT via the timer, not hang.
      global.fetch = () => new Promise(() => {});
      let timedOut = false;
      try {
        await withTimeout(fetchWithTimeout('http://example.invalid/api/version', 150), 3000, 'hung fetch');
      } catch (e) {
        timedOut = true;
        assert.ok(/timed out/i.test(e.message), `expected a timeout error, got: ${e.message}`);
        assert.ok(!/^TIMEOUT \(/.test(e.message), 'fetchWithTimeout must reject on its own, not via the test guard');
      }
      assert.ok(timedOut, 'a never-resolving fetch must reject via the timeout');
      ok('never-resolving fetch -> rejects with TimeoutError (no hang)');

      // A fast response resolves normally and is returned untouched.
      const sentinel = { ok: true, marker: 'resp' };
      global.fetch = async () => sentinel;
      const res = await withTimeout(fetchWithTimeout('http://example.invalid/api/version', 5000), 3000, 'fast fetch');
      assert.strictEqual(res, sentinel, 'a fast response must pass through unchanged');
      ok('fast fetch -> resolves with the response (timer cleared, no false timeout)');
    } finally {
      global.fetch = realFetch;
    }
  }

  console.log(`\n✅ ALL ${passed} UPDATE + DEBRAND CHECKS PASSED`);
})().catch((e) => {
  console.error('\n✗ INTEGRATION TEST FAILED:', e && e.message ? e.message : e);
  process.exit(1);
});
