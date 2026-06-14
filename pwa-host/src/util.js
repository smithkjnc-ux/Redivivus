"use strict";
// [SCOPE] PWA host Worker — shared helpers: token generation, content-type lookup, free-tier badge re-stamp,
// and the friendly "link expired" page. No state; pure functions over Worker runtime globals.
Object.defineProperty(exports, "__esModule", { value: true });
exports.newToken = newToken;
exports.contentType = contentType;
exports.ensureBadge = ensureBadge;
exports.expiredPage = expiredPage;
exports.json = json;
exports.b64ToBytes = b64ToBytes;
// Unguessable share token (URL-safe, ~95 bits). One per publish, so KV keys never collide and never go stale.
function newToken() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    const cs = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from(a, (b) => cs[b % 62]).join('');
}
const TYPES = {
    html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    ico: 'image/x-icon', wasm: 'application/wasm', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg',
    txt: 'text/plain; charset=utf-8', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', map: 'application/json',
};
function contentType(path) {
    return TYPES[path.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream';
}
// Keep this string identical in meaning to pwaTemplates.madeWithBadge (the extension generator) — the Worker is a
// separate deployable so it can't import it. ASCII-only.
const BADGE = '<a id="rdv-badge" href="https://redivivus.dev" target="_blank" rel="noopener" ' +
    'style="position:fixed;right:8px;bottom:8px;z-index:2147483647;font:600 11px system-ui,sans-serif;color:#fff;' +
    'background:rgba(0,0,0,.55);padding:3px 8px;border-radius:10px;text-decoration:none;opacity:.75">Made with Redivivus</a>';
// Free tier: guarantee the badge is present (tamper-resistant — re-inject if a free user stripped it locally).
function ensureBadge(html) {
    if (html.includes('id="rdv-badge"')) {
        return html;
    }
    return html.includes('</body>') ? html.replace('</body>', BADGE + '\n</body>') : html + BADGE;
}
// Shown when a token's TTL has passed (KV evicted it). Already-installed apps are unaffected (they run from cache).
function expiredPage() {
    const body = '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">' +
        '<style>body{font:16px system-ui,sans-serif;background:#0f1117;color:#e6e6e6;display:grid;place-items:center;' +
        'height:100vh;margin:0;text-align:center;padding:24px}h2{margin:.2em 0}a{color:#7aa2ff}p{opacity:.85}</style>' +
        '<body><div><h2>This install link expired</h2><p>Open Redivivus and tap <b>Add to Phone</b> again for a fresh link.</p>' +
        '<p style="opacity:.55">Already installed it? It still works on your device, offline.</p></div>';
    return new Response(body, { status: 410, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
function json(o, status = 200) {
    return new Response(JSON.stringify(o), {
        status,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
}
// Decode base64 (the publish payload sends each file as base64) to bytes.
function b64ToBytes(b64) {
    const bin = atob(b64);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        a[i] = bin.charCodeAt(i);
    }
    return a;
}
//# sourceMappingURL=util.js.map