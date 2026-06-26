// [SCOPE] Static server helpers for Live Preview — extracted from chatPanelPreview.ts (Rule 9 split).
// Covers: _buildStaticServer, _injectInspector, _isPortOpen.
// Parent: chatPanelPreview.ts (owns DevServerInfo detection and server lifecycle).

import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import { getInspectorScript } from './chatPanelPreviewInspector.js';
import { getCaptureScript } from './chatPanelPreviewCapture.js';

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

export function isPortOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error',   () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, 'localhost');
  });
}

export function injectInspector(html: string): string {
  const script = getInspectorScript();
  const capture = getCaptureScript();
  let out = html;
  if (/<head[^>]*>/i.test(out)) { out = out.replace(/<head[^>]*>/i, m => m + capture); }
  else if (/<html[^>]*>/i.test(out)) { out = out.replace(/<html[^>]*>/i, m => m + capture); }
  else { out = capture + out; }
  return out.includes('</body>') ? out.replace('</body>', script + '</body>') : out + script;
}

export function buildStaticServer(
  root: string,
  port: number,
  runtimeReports: Array<{ kind: string; msg: string; t: number; image?: string }>
): http.Server {
  return http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0].split('#')[0];
    if (req.method === 'POST' && urlPath === '/__rdv_runtime') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 10000) { req.destroy(); } });
      req.on('end', () => {
        try {
          const r = JSON.parse(body);
          if (r && r.kind) {
            runtimeReports.push({ kind: String(r.kind), msg: String(r.msg || '').slice(0, 400), image: r.image ? String(r.image) : undefined, t: Date.now() });
            if (runtimeReports.length > 200) { runtimeReports.shift(); }
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
      if (ext === '.html') { content = injectInspector(content.toString('utf-8')); }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(content);
    } catch {
      try {
        let fallbackPath = path.join(root, 'index.html');
        if (!fs.existsSync(fallbackPath)) {
          const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html') && !f.startsWith('.'));
          if (htmlFiles.length > 0) { fallbackPath = path.join(root, htmlFiles[0]); }
        }
        const indexHtml = injectInspector(fs.readFileSync(fallbackPath, 'utf-8'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(indexHtml);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    }
  });
}
