// [SCOPE] CHASSIS Live Preview — dev server detection and lifecycle management
// Static HTML projects: built-in Node HTTP server (no npm deps required).
// npm-based projects (Next, Vite, CRA, Express): terminal dev server.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';

export interface DevServerInfo {
  port: number;
  command: string;
  type: 'static' | 'vite' | 'next' | 'cra' | 'express' | 'npm';
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

let _staticServer: http.Server | null = null;
let _devTerminal: vscode.Terminal | null = null;

export function detectDevServer(root: string): DevServerInfo | null {
  const pkgPath = path.join(root, 'package.json');

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const scripts: Record<string, string> = pkg.scripts || {};

      if (deps['next']) { return { port: 3000, command: 'npm run dev', type: 'next' }; }
      if (deps['vite']) { return { port: 5173, command: 'npm run dev', type: 'vite' }; }
      if (deps['react-scripts']) { return { port: 3000, command: 'npm start', type: 'cra' }; }
      if (scripts['dev']) { return { port: 3000, command: 'npm run dev', type: 'npm' }; }
      if (scripts['start']) { return { port: 3000, command: 'npm start', type: 'express' }; }
    } catch { /* fall through to static */ }
  }

  if (fs.existsSync(path.join(root, 'index.html'))) {
    return { port: 5500, command: '', type: 'static' };
  }

  return null;
}

export async function startPreviewServer(
  root: string,
  info: DevServerInfo,
): Promise<{ port: number; stop: () => void }> {
  stopPreviewServer();

  if (info.type === 'static') {
    _staticServer = _buildStaticServer(root, info.port);
    _staticServer.listen(info.port, 'localhost');
    return { port: info.port, stop: stopPreviewServer };
  }

  const terminal = vscode.window.createTerminal({ name: 'CHASSIS Preview', cwd: root });
  terminal.sendText(info.command);
  terminal.show(true); // show but don't steal focus
  _devTerminal = terminal;
  return { port: info.port, stop: stopPreviewServer };
}

export function stopPreviewServer(): void {
  if (_staticServer) { try { _staticServer.close(); } catch {} _staticServer = null; }
  if (_devTerminal) { try { _devTerminal.dispose(); } catch {} _devTerminal = null; }
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
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, 'localhost');
  });
}

function _buildStaticServer(root: string, port: number): http.Server {
  return http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0].split('#')[0];
    const normalized = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = path.join(root, normalized);

    // Security: block path traversal outside root
    if (!filePath.startsWith(root)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    const ext = path.extname(filePath).toLowerCase();
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(content);
    } catch {
      // SPA fallback: serve index.html for missing paths
      try {
        const index = fs.readFileSync(path.join(root, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(index);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    }
  });
}
