// [SCOPE] Redivivus PWA host — Cloudflare Worker entry/router. Ephemeral hosting for "Add to Phone":
//   POST /publish            -> store a PWA bundle in KV with a TTL, return {token, url, expiresAt}
//   GET  /p/<token>/<path>   -> serve it; expired -> friendly page
// Storage = Cloudflare KV (expirationTtl auto-evicts, self-cleaning, edge-served, near-free). Deploy with wrangler.
// See docs/REDIVIVUS_ADD_TO_PHONE.md.
import { handlePublish } from './publish';
import { handleServe } from './serve';

export interface Env {
  PWA_KV: KVNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') { return cors(); }
    if (req.method === 'POST' && url.pathname === '/publish') { return handlePublish(req, env); }
    if (req.method === 'GET' && url.pathname.startsWith('/p/')) { return handleServe(url, env); }
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('Redivivus PWA host: OK', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    return new Response('Not found', { status: 404 });
  },
};

function cors(): Response {
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
