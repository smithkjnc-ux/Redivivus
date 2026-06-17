import { randomBytes } from 'crypto';

export function newToken(): string {
  const a = randomBytes(16);
  const cs = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(a, (b) => cs[b % 62]).join('');
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  ico: 'image/x-icon', wasm: 'application/wasm', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg',
  txt: 'text/plain; charset=utf-8', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', map: 'application/json',
};
export function contentType(path: string): string {
  return TYPES[path.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream';
}

const BADGE = '<a id="rdv-badge" href="https://redivivus.dev" target="_blank" rel="noopener" ' +
  'style="position:fixed;right:8px;bottom:8px;z-index:2147483647;font:600 11px system-ui,sans-serif;color:#fff;' +
  'background:rgba(0,0,0,.55);padding:3px 8px;border-radius:10px;text-decoration:none;opacity:.75">Made with Redivivus</a>';

export function ensureBadge(html: string): string {
  if (html.includes('id="rdv-badge"')) { return html; }
  return html.includes('</body>') ? html.replace('</body>', BADGE + '\n</body>') : html + BADGE;
}

export function expiredPageHtml(): string {
  return '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">' +
    '<style>body{font:16px system-ui,sans-serif;background:#0f1117;color:#e6e6e6;display:grid;place-items:center;' +
    'height:100vh;margin:0;text-align:center;padding:24px}h2{margin:.2em 0}a{color:#7aa2ff}p{opacity:.85}</style>' +
    '<body><div><h2>This install link expired</h2><p>Open Redivivus and tap <b>Add to Phone</b> again for a fresh link.</p>' +
    '<p style="opacity:.55">Already installed it? It still works on your device, offline.</p></div>';
}
