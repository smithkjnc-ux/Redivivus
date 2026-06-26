// [SCOPE] Redivivus Report Issue — panel creation and command registration.
// Message handling, log bundling, and upload logic live in reportIssueHandler.ts (Rule 9 split).

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { RoutingService } from '../shared/ai/infrastructure/routingService.js';
import { buildReportHtml } from './reportIssueHtml.js';
import { handleReportMessage, resetPickedPaths } from './reportIssueHandler.js';

let _panel: vscode.WebviewPanel | undefined;

export function registerReportIssueCommand(context: vscode.ExtensionContext, routing?: RoutingService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.reportIssue', () => showReportPanel(context, routing)),
  );
}

function showReportPanel(context: vscode.ExtensionContext, routing?: RoutingService): void {
  if (_panel) { _panel.reveal(vscode.ViewColumn.Beside); return; }
  const version: string = (require('../../package.json') as any).version;
  resetPickedPaths();
  // [WARN] extensionUri covers out/ so asWebviewUri works for the external script file.
  // Inline <script> blocks are silently blocked by VSCodium's WebView CSP regardless of nonce/structure.
  const extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));
  _panel = vscode.window.createWebviewPanel(
    'redivivusReport', 'Report an Issue', vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] },
  );
  _panel.onDidDispose(() => { _panel = undefined; resetPickedPaths(); }, null, context.subscriptions);
  const scriptPath = path.join(__dirname, '..', 'ui', 'reportPanel.js');
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, REPORT_PANEL_SCRIPT, 'utf8');
  const scriptUri = _panel.webview.asWebviewUri(vscode.Uri.file(scriptPath)).toString();
  _panel.webview.html = buildReportHtml(version, scriptUri);
  _panel.webview.onDidReceiveMessage(async (msg) => {
    if (!_panel) { return; }
    try { await handleReportMessage(msg, version, routing, _panel); }
    catch (e: any) { _panel?.webview.postMessage({ type: 'error', text: e?.message ?? 'Unexpected error' }); }
  }, null, context.subscriptions);
}

// Browser-compatible IIFE served as external file — avoids VSCodium inline-script CSP blocks.
// [WARN] ASCII only — no emoji or Unicode. Rule 13: non-ASCII in WebView scripts causes silent parse failures.
const REPORT_PANEL_SCRIPT = `(function() {
  const vscode = acquireVsCodeApi();
  window.__vscode_api = vscode;
  var previewUris = [];
  document.getElementById('pick-btn').addEventListener('click', function() {
    try { vscode.postMessage({ type: 'pick-image' }); } catch(e) { document.getElementById('st').textContent = 'Error: ' + e; }
  });
  function renderThumbs() {
    var c = document.getElementById('thumbs');
    c.innerHTML = '';
    previewUris.forEach(function(src, i) {
      var wrap = document.createElement('div'); wrap.className = 'thumb';
      var img = document.createElement('img'); img.src = src;
      var btn = document.createElement('button'); btn.className = 'rm'; btn.textContent = 'x';
      btn.addEventListener('click', function() { previewUris.splice(i, 1); renderThumbs(); vscode.postMessage({ type: 'clear-images' }); });
      wrap.appendChild(img); wrap.appendChild(btn); c.appendChild(wrap);
    });
  }
  document.getElementById('sub').addEventListener('click', function() {
    var desc = document.getElementById('desc').value.trim();
    if (!desc) { document.getElementById('st').textContent = 'Please describe the issue first.'; return; }
    document.getElementById('sub').disabled = true;
    document.getElementById('st').textContent = 'Submitting...';
    var includeLogs = document.getElementById('include-logs') ? document.getElementById('include-logs').checked : true;
    try { vscode.postMessage({ type: 'submit', category: document.getElementById('cat').value, description: desc, steps: document.getElementById('steps').value, includeLogs: includeLogs }); }
    catch(e) { document.getElementById('sub').disabled = false; document.getElementById('st').textContent = 'Error: ' + e; }
  });
  document.getElementById('close-btn').addEventListener('click', function() {
    try { vscode.postMessage({ type: 'close' }); } catch(e) {}
  });
  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (msg.type === 'images-previewed') { previewUris = previewUris.concat(msg.uris || []); renderThumbs(); }
    if (msg.type === 'status') { document.getElementById('st').textContent = msg.text; }
    if (msg.type === 'success') {
      document.getElementById('desc').value = '';
      document.getElementById('steps').value = '';
      document.getElementById('cat').selectedIndex = 0;
      previewUris = []; renderThumbs();
      document.getElementById('st').textContent = '';
      document.getElementById('sub').disabled = false;
      document.getElementById('res').classList.add('show');
      document.getElementById('ok-box').style.display = 'block';
      document.getElementById('err-box').style.display = 'none';
      document.getElementById('close-btn').style.display = 'block';
      var sub = msg.isDuplicate
        ? 'Looks like a known issue -- logged and flagged as duplicate. Admin will review.'
        : 'Report sent to admin at redivivus.dev';
      if (msg.screenshotUrls && msg.screenshotUrls.length) { sub += '\\nScreenshots: ' + msg.screenshotUrls.join(', '); }
      document.getElementById('ok-sub').textContent = sub;
    }
    if (msg.type === 'error') {
      document.getElementById('st').textContent = '';
      document.getElementById('sub').disabled = false;
      document.getElementById('res').classList.add('show');
      document.getElementById('err-box').style.display = 'block';
      document.getElementById('err-box').textContent = 'Error: ' + msg.text;
      document.getElementById('ok-box').style.display = 'none';
      document.getElementById('close-btn').style.display = 'block';
    }
  });
})();`;
