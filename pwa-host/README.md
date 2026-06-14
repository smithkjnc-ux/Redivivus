# Redivivus PWA Host (Phase 1)

Ephemeral Cloudflare Worker that hosts "Add to Phone" PWAs for ~15/60/240 minutes, then auto-evicts (KV TTL).
Part of the `docs/REDIVIVUS_ADD_TO_PHONE.md` design. The Redivivus extension generates the PWA bundle (Phase 0)
and `POST`s it here; users scan the returned link/QR and install.

## Endpoints
- `POST /publish` — body `{ ttlMinutes: 15|60|240, entry: "index.html", title, files: { "<path>": "<base64>" } }`,
  header `X-Redivivus-App: <app-token>`. Returns `{ token, url, expiresAt, ttlMinutes }`.
- `GET /p/<token>/<path>` — serves the bundle (root -> entry HTML). Expired/missing -> friendly 410 page.
- `GET /health` — `OK`.

## Deploy
```bash
cd pwa-host
npm install
npx wrangler login                       # one-time
npx wrangler kv namespace create PWA_KV  # paste the printed id into wrangler.toml -> kv_namespaces.id
npm run typecheck                        # optional
npm run deploy                           # wrangler deploy
```
Then (recommended) bind a dedicated subdomain in `wrangler.toml` (`apps.redivivus.dev/*`) for origin isolation.

## Local test
```bash
npx wrangler dev          # serves on http://localhost:8787
# publish a bundle (build one first with the Phase 0 generator), then open the returned URL.
```

## Guardrails (v1)
- **App-token gate** — only requests with a valid `X-Redivivus-App` token can publish (`verifyApp` in `publish.ts`).
  **TODO:** wire real token verification + derive the paid/free TIER from the token (never trust client). v1 = free.
- **Rate limit** — 30 publishes/hour per app token (KV counter).
- **Size cap** — 10 MB total bundle.
- **TTL** — 15/60/240 min; KV `expirationTtl` auto-evicts (no cron, self-cleaning).
- **Free-tier badge** — re-stamped server-side into the entry HTML (tamper-resistant).

## Notes
- Each publish uses a fresh unguessable token -> new KV keys -> no stale-cache / eventual-consistency issues on read.
- Installed apps survive expiry: the service worker precaches everything on first load, so the app runs offline from
  the device cache after the link is gone (the whole point of the ephemeral model).
