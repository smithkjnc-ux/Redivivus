// [SCOPE] PWA host Worker — POST /publish. Stores a PWA bundle in KV with a TTL (15/60/240 min) and returns a
// {token, url, expiresAt}. App-token-gated (only a Redivivus instance can publish), rate-limited, size-capped.
// Free tier re-stamps the "Made with Redivivus" badge server-side (tamper-resistant). See REDIVIVUS_ADD_TO_PHONE.md.
import type { Env } from './index';
import { newToken, ensureBadge, json, b64ToBytes } from './util';

const TTL_CHOICES = new Set([15, 60, 240]);   // minutes
const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;     // 10 MB total
const MAX_PUBLISH_PER_HOUR = 30;               // per app token

interface PublishBody {
  ttlMinutes?: number;
  entry?: string;
  title?: string;
  files?: Record<string, string>; // relpath -> base64
}

// [TODO] Verify the app/install token (HMAC/signature against a secret, or an allowlist) and derive the TIER from
// it. NEVER trust a client-sent tier — paid badge-removal must come from a verified token. v1 stub: presence-only
// check, always 'free' (badge stays) until token issuance is wired to the account system.
function verifyApp(token: string): { ok: boolean; tier: 'free' | 'paid' } {
  if (!token) { return { ok: false, tier: 'free' }; }
  return { ok: true, tier: 'free' };
}

export async function handlePublish(req: Request, env: Env): Promise<Response> {
  const appToken = req.headers.get('x-redivivus-app') || '';
  const app = verifyApp(appToken);
  if (!app.ok) { return json({ error: 'Missing or invalid Redivivus app token' }, 401); }

  // Per-token hourly rate limit (KV counter with a 1h TTL).
  const bucket = `rl:${appToken}:${Math.floor(Date.now() / 3_600_000)}`;
  const count = parseInt((await env.PWA_KV.get(bucket)) || '0', 10);
  if (count >= MAX_PUBLISH_PER_HOUR) { return json({ error: 'Rate limit reached — try again later' }, 429); }

  let body: PublishBody;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const files = body.files || {};
  const names = Object.keys(files);
  if (names.length === 0) { return json({ error: 'No files in bundle' }, 400); }

  const ttlMin = TTL_CHOICES.has(body.ttlMinutes as number) ? (body.ttlMinutes as number) : 60;
  const ttl = ttlMin * 60;
  const entry = body.entry && files[body.entry]
    ? body.entry
    : (names.find((n) => n.toLowerCase().endsWith('index.html')) || names[0]);

  // Decode + size-cap.
  const decoded: Record<string, Uint8Array> = {};
  let total = 0;
  for (const n of names) {
    const bytes = b64ToBytes(files[n]);
    total += bytes.length;
    if (total > MAX_BUNDLE_BYTES) { return json({ error: 'Bundle too large (max 10 MB)' }, 413); }
    decoded[n] = bytes;
  }

  // Free tier: re-stamp the badge into the entry HTML so stripping it locally doesn't help.
  if (app.tier === 'free') {
    const html = new TextDecoder().decode(decoded[entry]);
    decoded[entry] = new TextEncoder().encode(ensureBadge(html));
  }

  const token = newToken();
  const expiresAt = Date.now() + ttl * 1000;
  await Promise.all([
    ...names.map((n) => env.PWA_KV.put(`b:${token}:${n}`, decoded[n], { expirationTtl: ttl })),
    env.PWA_KV.put(`m:${token}`, JSON.stringify({ entry, tier: app.tier, title: body.title || 'App', expiresAt }), { expirationTtl: ttl }),
    env.PWA_KV.put(bucket, String(count + 1), { expirationTtl: 3600 }),
  ]);

  const origin = new URL(req.url).origin;
  return json({ token, url: `${origin}/p/${token}/`, expiresAt, ttlMinutes: ttlMin });
}
