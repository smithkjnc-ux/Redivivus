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

export interface DevServerInfo {
  port: number;
  command: string;
  type: 'static' | 'vite' | 'next' | 'cra' | 'express' | 'npm';
  loadingMsg: string;
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
let _devTerminal: vscode.Terminal | null = null;

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
  if (fs.existsSync(path.join(root, 'index.html'))) { return 'web'; }
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
      if (fs.existsSync(path.join(root, 'index.html'))) {
        return { port: 5500, command: '', type: 'static', loadingMsg: 'Serving files...' };
      }
      // Generic npm server (Express, etc.) — only when no index.html exists
      if (scripts['dev'])    { return { port: 3000, command: 'npm run dev', type: 'npm',     loadingMsg: 'Starting dev server...' }; }
      if (scripts['start'])  { return { port: 3000, command: 'npm start',   type: 'express', loadingMsg: 'Starting server...' }; }
    } catch { /* fall through */ }
  }
  if (fs.existsSync(path.join(root, 'index.html'))) {
    return { port: 5500, command: '', type: 'static', loadingMsg: 'Serving files...' };
  }
  return null;
}

export async function startPreviewServer(root: string, info: DevServerInfo): Promise<{ port: number; stop: () => void; alreadyRunning: boolean }> {
  // Reuse an already-running dev server without touching it
  if (await _isPortOpen(info.port)) {
    return { port: info.port, stop: () => {}, alreadyRunning: true };
  }
  stopPreviewServer();
  if (info.type === 'static') {
    _staticServer = _buildStaticServer(root, info.port);
    _staticServer.listen(info.port, 'localhost');
    return { port: info.port, stop: stopPreviewServer, alreadyRunning: false };
  }
  const terminal = vscode.window.createTerminal({ name: 'Redivivus Preview', cwd: root });
  terminal.sendText(info.command);
  terminal.show(true);
  _devTerminal = terminal;
  return { port: info.port, stop: stopPreviewServer, alreadyRunning: false };
}

export function stopPreviewServer(): void {
  if (_staticServer) { try { _staticServer.close(); } catch {} _staticServer = null; }
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
  return html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script;
}

function _buildStaticServer(root: string, port: number): http.Server {
  return http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0].split('#')[0];
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
        const indexHtml = _injectInspector(fs.readFileSync(path.join(root, 'index.html'), 'utf-8'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(indexHtml);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    }
  });
}
