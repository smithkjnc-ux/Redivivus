// [SCOPE] PWA host Worker — GET /p/<token>/<path>. Serves a published bundle from KV. Root -> the entry HTML;
// unknown paths -> entry (so client routing + the installed service worker keep working). Missing token -> the
// friendly expired page (its TTL evicted it). See REDIVIVUS_ADD_TO_PHONE.md.
import type { Env } from './index';
import { contentType, expiredPage } from './util';

interface Meta { entry: string; tier: string; title: string; expiresAt: number; }

export async function handleServe(url: URL, env: Env): Promise<Response> {
  const m = url.pathname.match(/^\/p\/([A-Za-z0-9]+)\/?(.*)$/);
  if (!m) { return new Response('Not found', { status: 404 }); }
  const token = m[1];

  const metaRaw = await env.PWA_KV.get(`m:${token}`);
  if (!metaRaw) { return expiredPage(); }
  const meta = JSON.parse(metaRaw) as Meta;

  let path = m[2];
  if (!path || path.endsWith('/')) { path = meta.entry; } // root -> entry HTML

  let bytes = await env.PWA_KV.get(`b:${token}:${path}`, 'arrayBuffer');
  let servedPath = path;
  if (!bytes) {
    // Unknown sub-path: fall back to the entry (SPA routing / SW navigations). If even the entry is gone, expired.
    bytes = await env.PWA_KV.get(`b:${token}:${meta.entry}`, 'arrayBuffer');
    servedPath = meta.entry;
    if (!bytes) { return expiredPage(); }
  }
  return new Response(bytes, { headers: serveHeaders(servedPath) });
}

function serveHeaders(path: string): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': contentType(path),
    'x-content-type-options': 'nosniff',
    'cache-control': 'public, max-age=600',
  };
  // Let the service worker control the whole token path scope.
  if (path.endsWith('sw.js')) { h['service-worker-allowed'] = '/'; }
  return h;
}
