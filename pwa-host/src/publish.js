"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePublish = handlePublish;
const util_1 = require("./util");
const TTL_CHOICES = new Set([15, 60, 240]); // minutes
const MAX_BUNDLE_BYTES = 10 * 1024 * 1024; // 10 MB total
const MAX_PUBLISH_PER_HOUR = 30; // per app token
// [TODO] Verify the app/install token (HMAC/signature against a secret, or an allowlist) and derive the TIER from
// it. NEVER trust a client-sent tier — paid badge-removal must come from a verified token. v1 stub: presence-only
// check, always 'free' (badge stays) until token issuance is wired to the account system.
function verifyApp(token) {
    if (!token) {
        return { ok: false, tier: 'free' };
    }
    return { ok: true, tier: 'free' };
}
async function handlePublish(req, env) {
    const appToken = req.headers.get('x-redivivus-app') || '';
    const app = verifyApp(appToken);
    if (!app.ok) {
        return (0, util_1.json)({ error: 'Missing or invalid Redivivus app token' }, 401);
    }
    // Per-token hourly rate limit (KV counter with a 1h TTL).
    const bucket = `rl:${appToken}:${Math.floor(Date.now() / 3_600_000)}`;
    const count = parseInt((await env.PWA_KV.get(bucket)) || '0', 10);
    if (count >= MAX_PUBLISH_PER_HOUR) {
        return (0, util_1.json)({ error: 'Rate limit reached — try again later' }, 429);
    }
    let body;
    try {
        body = await req.json();
    }
    catch {
        return (0, util_1.json)({ error: 'Invalid JSON' }, 400);
    }
    const files = body.files || {};
    const names = Object.keys(files);
    if (names.length === 0) {
        return (0, util_1.json)({ error: 'No files in bundle' }, 400);
    }
    const ttlMin = TTL_CHOICES.has(body.ttlMinutes) ? body.ttlMinutes : 60;
    const ttl = ttlMin * 60;
    const entry = body.entry && files[body.entry]
        ? body.entry
        : (names.find((n) => n.toLowerCase().endsWith('index.html')) || names[0]);
    // Decode + size-cap.
    const decoded = {};
    let total = 0;
    for (const n of names) {
        const bytes = (0, util_1.b64ToBytes)(files[n]);
        total += bytes.length;
        if (total > MAX_BUNDLE_BYTES) {
            return (0, util_1.json)({ error: 'Bundle too large (max 10 MB)' }, 413);
        }
        decoded[n] = bytes;
    }
    // Free tier: re-stamp the badge into the entry HTML so stripping it locally doesn't help.
    if (app.tier === 'free') {
        const html = new TextDecoder().decode(decoded[entry]);
        decoded[entry] = new TextEncoder().encode((0, util_1.ensureBadge)(html));
    }
    const token = (0, util_1.newToken)();
    const expiresAt = Date.now() + ttl * 1000;
    await Promise.all([
        ...names.map((n) => env.PWA_KV.put(`b:${token}:${n}`, decoded[n], { expirationTtl: ttl })),
        env.PWA_KV.put(`m:${token}`, JSON.stringify({ entry, tier: app.tier, title: body.title || 'App', expiresAt }), { expirationTtl: ttl }),
        env.PWA_KV.put(bucket, String(count + 1), { expirationTtl: 3600 }),
    ]);
    const origin = new URL(req.url).origin;
    return (0, util_1.json)({ token, url: `${origin}/p/${token}/`, expiresAt, ttlMinutes: ttlMin });
}
//# sourceMappingURL=publish.js.map