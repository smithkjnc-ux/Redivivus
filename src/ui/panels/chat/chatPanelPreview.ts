// [SCOPE] Redivivus Live Preview — dev server detection and lifecycle management
// Static HTML projects: built-in Node HTTP server (no npm deps required).
// npm-based projects (Next, Vite, CRA, Express): terminal dev server.
// Non-web projects (Python, CLI, shell): returns null + a redirect message to Run button.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import { getInspectorScript } from './chatPanelPreviewInspector';
import { getCaptureScript } from './chatPanelPreviewCapture';

// [PREVIEW-AUTOFIX Phase 0] Runtime reports beaconed by the injected capture script (POST /__rdv_runtime).
// Buffered here so the extension can read "did this preview actually run?" — uncaught errors, failed script
// loads, console.error, and the blank-canvas / no-loop probe. See docs/REDIVIVUS_PREVIEW_AUTOFIX.md.
let _runtimeReports: Array<{ kind: string; msg: string; t: number }> = [];
export function getRuntimeReports(): Array<{ kind: string; msg: string }> {
  return _runtimeReports.map(r => ({ kind: r.kind, msg: r.msg }));
}
export function clearRuntimeReports(): void { _runtimeReports = []; }

export interface DevServerInfo {
  port: number;
  command: string;
  type: 'static' | 'vite' | 'next' | 'cra' | 'express' | 'npm';
  loadingMsg: string;
  webRoot?: string; // serve from this subdirectory instead of workspace root (for AI-generated subfolder projects)
}

export type ProjectKind = 'web' | 'python' | 'node-cli' | 'api' | 'shell' | 'unknown';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.ts': 'application/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.webm': 'video/webm', '.mp4': 'video/mp4',
};

let _staticServer: http.Server | null = null;
let _staticRoot: string | null = null; // which webRoot our static server is serving (to detect stale roots)
let _devTerminal: vscode.Terminal | null = null;

// Returns root if it directly contains HTML, else first immediate subdir that does, else null.
// Handles the common case where AI builds <project>/<project>/index.html (double-nested).
function findHtmlRoot(root: string): string | null {
  try {
    if (fs.readdirSync(root).some(f => f.endsWith('.html'))) { return root; }
    const subs = fs.readdirSync(root, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules');
    for (const sub of subs) {
      const p = path.join(root, sub.name);
      try { if (fs.readdirSync(p).some(f => f.endsWith('.html'))) { return p; } } catch {}
    }
  } catch {}
  return null;
}

export function detectProjectKind(root: string): ProjectKind {
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(path.join(root, 'requirements.txt')) || fs.existsSync(path.join(root, 'app.py')) || fs.existsSync(path.join(root, 'main.py'))) {
    try {
      const reqs = fs.existsSync(path.join(root, 'requirements.txt')) ? fs.readFileSync(path.join(root, 'requirements.txt'), 'utf-8') : '';
      if (/fastapi|flask|django|uvicorn|starlette/i.test(reqs)) { return 'api'; }
    } catch {}
    return 'python';
  }
  const shFiles = fs.existsSync(root) ? fs.readdirSync(root).filter(f => f.endsWith('.sh')) : [];
  if (shFiles.length > 0 && !fs.existsSync(pkgPath)) { return 'shell'; }
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps['react'] || deps['next'] || deps['vue'] || deps['vite'] || deps['svelte']) { return 'web'; }
      if (deps['express'] || deps['fastify'] || deps['koa'] || deps['hapi']) { return 'api'; }
      if (pkg.bin) { return 'node-cli'; }
    } catch {}
  }
  if (findHtmlRoot(root)) { return 'web'; }
  return 'unknown';
}

export function getNoPreviewMessage(kind: ProjectKind): string {
  const msgs: Record<ProjectKind, string> = {
    python:   'Python scripts run in the terminal, not a browser. Use the ▶ Run button in the chat input bar to execute it.',
    'node-cli': 'CLI tools run in the terminal. Use the ▶ Run button in the chat input bar to execute it.',
    shell:    'Shell scripts run in the terminal. Use the ▶ Run button in the chat input bar to execute it.',
    api:      'API server detected — starting it now so you can see the docs at /docs or test endpoints.',
    web:      'No index.html found yet. Build a web project first, then click Preview.',
    unknown:  'Nothing to preview yet. Build a web project first, then click Preview.',
  };
  return msgs[kind];
}

export function detectDevServer(root: string): DevServerInfo | null {
  const pkgPath = path.join(root, 'package.json');
  const htmlRoot = findHtmlRoot(root);
  const hasHtml = htmlRoot !== null;

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const scripts: Record<string, string> = pkg.scripts || {};
      // Framework dev servers — these own their port
      if (deps['next'])          { return { port: 3000, command: 'npm run dev', type: 'next',    loadingMsg: 'Starting Next.js dev server...' }; }
      if (deps['vite'])          { return { port: 5173, command: 'npm run dev', type: 'vite',    loadingMsg: 'Starting Vite dev server...' }; }
      if (deps['react-scripts']) { return { port: 3000, command: 'npm start',   type: 'cra',     loadingMsg: 'Starting React dev server...' }; }
      // Static HTML project with package.json (TypeScript tooling, etc.) — serve files directly.
      // Must come before generic dev/start checks so "tsc -w" or "http-server -p 8080" projects
      // don't get misdetected as a web server on port 3000.
      if (hasHtml) {
        return { port: 5500, command: '', type: 'static', loadingMsg: 'Serving files...', webRoot: htmlRoot ?? undefined };
      }
      // Generic npm server (Express, etc.) — only when no index.html exists
      if (scripts['dev'])    { return { port: 3000, command: 'npm run dev', type: 'npm',     loadingMsg: 'Starting dev server...' }; }
      if (scripts['start'])  { return { port: 3000, command: 'npm start',   type: 'express', loadingMsg: 'Starting server...' }; }
    } catch { /* fall through */ }
  }
  if (hasHtml) {
    return { port: 5500, command: '', type: 'static', loadingMsg: 'Serving files...', webRoot: htmlRoot ?? undefined };
  }
  return null;
}

export async function startPreviewServer(root: string, info: DevServerInfo): Promise<{ port: number; stop: () => void; alreadyRunning: boolean }> {
  if (info.type === 'static') {
    const webRoot = info.webRoot || root;
    // [FIX] Our static server already serving THIS root → reuse. If it's serving a DIFFERENT project's root
    // (e.g. asteroids), RE-ROOT it. The old code reused any server on port 5500 without checking the root,
    // so after previewing one project, every other project's preview kept serving the first one.
    if (_staticServer && _staticRoot === webRoot) {
      return { port: info.port, stop: stopPreviewServer, alreadyRunning: true };
    }
    stopPreviewServer(); // closes our stale-root server (frees the port for the new root)
    clearRuntimeReports(); // [PREVIEW-AUTOFIX] fresh runtime signals for this project's preview
    _staticServer = _buildStaticServer(webRoot, info.port);
    _staticRoot = webRoot;
    _staticServer.listen(info.port, 'localhost');
    return { port: info.port, stop: stopPreviewServer, alreadyRunning: false };
  }
  // Non-static dev server (npm/vite/next) — reuse if already up on its port; these own their port.
  if (await _isPortOpen(info.port)) {
    return { port: info.port, stop: () => {}, alreadyRunning: true };
  }
  stopPreviewServer();
  const terminal = vscode.window.createTerminal({ name: 'Redivivus Preview', cwd: root });
  terminal.sendText(info.command);
  terminal.show(true);
  _devTerminal = terminal;
  return { port: info.port, stop: stopPreviewServer, alreadyRunning: false };
}

export function stopPreviewServer(): void {
  if (_staticServer) { try { _staticServer.close(); } catch {} _staticServer = null; _staticRoot = null; }
  if (_devTerminal)  { try { _devTerminal.dispose(); } catch {} _devTerminal = null; }
}

export async function waitForPort(port: number, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await _isPortOpen(port)) { return true; }
    await new Promise(r => setTimeout(r, 600));
  }
  return false;
}

function _isPortOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error',   () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, 'localhost');
  });
}

function _injectInspector(html: string): string {
  const script = getInspectorScript();
  // [PREVIEW-AUTOFIX] Capture script goes EARLY (right after <head>/<html>) so its rAF + error hooks are
  // installed BEFORE the page's own scripts run. Falls back to prepend if there's no head/html tag.
  const capture = getCaptureScript();
  let out = html;
  if (/<head[^>]*>/i.test(out)) { out = out.replace(/<head[^>]*>/i, m => m + capture); }
  else if (/<html[^>]*>/i.test(out)) { out = out.replace(/<html[^>]*>/i, m => m + capture); }
  else { out = capture + out; }
  // Inspector stays at the end (it activates on demand from the webview parent).
  return out.includes('</body>') ? out.replace('</body>', script + '</body>') : out + script;
}

function _buildStaticServer(root: string, port: number): http.Server {
  return http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0].split('#')[0];
    // [PREVIEW-AUTOFIX] Runtime beacon endpoint — the injected capture script POSTs failures here.
    if (req.method === 'POST' && urlPath === '/__rdv_runtime') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 10000) { req.destroy(); } });
      req.on('end', () => {
        try {
          const r = JSON.parse(body);
          if (r && r.kind) {
            _runtimeReports.push({ kind: String(r.kind), msg: String(r.msg || '').slice(0, 400), t: Date.now() });
            if (_runtimeReports.length > 200) { _runtimeReports.shift(); }
          }
        } catch { /* malformed beacon — ignore */ }
        res.writeHead(204); res.end();
      });
      return;
    }
    const normalized = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = path.join(root, normalized);
    if (!filePath.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
    const ext = path.extname(filePath).toLowerCase();
    try {
      let content: Buffer | string = fs.readFileSync(filePath);
      if (ext === '.html') { content = _injectInspector(content.toString('utf-8')); }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(content);
    } catch {
      try {
        let fallbackPath = path.join(root, 'index.html');
        if (!fs.existsSync(fallbackPath)) {
          const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html') && !f.startsWith('.'));
          if (htmlFiles.length > 0) { fallbackPath = path.join(root, htmlFiles[0]); }
        }
        const indexHtml = _injectInspector(fs.readFileSync(fallbackPath, 'utf-8'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(indexHtml);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    }
  });
}
