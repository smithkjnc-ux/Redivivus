"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServe = handleServe;
const util_1 = require("./util");
async function handleServe(url, env) {
    const m = url.pathname.match(/^\/p\/([A-Za-z0-9]+)\/?(.*)$/);
    if (!m) {
        return new Response('Not found', { status: 404 });
    }
    const token = m[1];
    const metaRaw = await env.PWA_KV.get(`m:${token}`);
    if (!metaRaw) {
        return (0, util_1.expiredPage)();
    }
    const meta = JSON.parse(metaRaw);
    let path = m[2];
    if (!path || path.endsWith('/')) {
        path = meta.entry;
    } // root -> entry HTML
    let bytes = await env.PWA_KV.get(`b:${token}:${path}`, 'arrayBuffer');
    let servedPath = path;
    if (!bytes) {
        // Unknown sub-path: fall back to the entry (SPA routing / SW navigations). If even the entry is gone, expired.
        bytes = await env.PWA_KV.get(`b:${token}:${meta.entry}`, 'arrayBuffer');
        servedPath = meta.entry;
        if (!bytes) {
            return (0, util_1.expiredPage)();
        }
    }
    return new Response(bytes, { headers: serveHeaders(servedPath) });
}
function serveHeaders(path) {
    const h = {
        'content-type': (0, util_1.contentType)(path),
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=600',
    };
    // Let the service worker control the whole token path scope.
    if (path.endsWith('sw.js')) {
        h['service-worker-allowed'] = '/';
    }
    return h;
}
//# sourceMappingURL=serve.js.map