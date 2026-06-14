"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// [SCOPE] Redivivus PWA host — Cloudflare Worker entry/router. Ephemeral hosting for "Add to Phone":
//   POST /publish            -> store a PWA bundle in KV with a TTL, return {token, url, expiresAt}
//   GET  /p/<token>/<path>   -> serve it; expired -> friendly page
// Storage = Cloudflare KV (expirationTtl auto-evicts, self-cleaning, edge-served, near-free). Deploy with wrangler.
// See docs/REDIVIVUS_ADD_TO_PHONE.md.
const publish_1 = require("./publish");
const serve_1 = require("./serve");
exports.default = {
    async fetch(req, env) {
        const url = new URL(req.url);
        if (req.method === 'OPTIONS') {
            return cors();
        }
        if (req.method === 'POST' && url.pathname === '/publish') {
            return (0, publish_1.handlePublish)(req, env);
        }
        if (req.method === 'GET' && url.pathname.startsWith('/p/')) {
            return (0, serve_1.handleServe)(url, env);
        }
        if (url.pathname === '/' || url.pathname === '/health') {
            return new Response('Redivivus PWA host: OK', { status: 200, headers: { 'content-type': 'text/plain' } });
        }
        return new Response('Not found', { status: 404 });
    },
};
function cors() {
    return new Response(null, {
        status: 204,
        headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'POST, GET, OPTIONS',
            'access-control-allow-headers': 'content-type, x-redivivus-app',
            'access-control-max-age': '86400',
        },
    });
}
//# sourceMappingURL=index.js.map