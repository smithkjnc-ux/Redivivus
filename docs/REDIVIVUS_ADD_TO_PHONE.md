<!-- [SCOPE] Design doc — "Add to Phone": one-click turn a self-contained Redivivus game/app into an installable
     PWA, served from an EPHEMERAL (~1 hour) link the user scans to install. Status: DESIGN (no code yet).
     Owner: PapaJoe + Claude. Created Jun 14, 2026. -->

# Redivivus — "Make Installable" / Add to Device (Ephemeral PWA Export)

## Goal
A novice builds a simple game/app in Redivivus, clicks **one button — "Make Installable" (aka "Add to Device")**,
and gets a **QR code + a link**. The same install works on **anything with a modern browser** — phone, tablet,
laptop, desktop (Windows / macOS / Linux / ChromeOS):
- **Phone/tablet:** scan the QR -> Add to Home Screen -> icon, fullscreen, offline.
- **Desktop/laptop:** open the link in Chrome/Edge -> click **Install** in the address bar -> a standalone app
  window with its own taskbar/dock/launcher icon, offline.

No app store, no sideloading, no accounts, nothing for the user to host. One artifact installs everywhere a browser
runs. (Phone framing kept in the docs because it's the headline use case, but the feature is device-agnostic.)

## Why a PWA (and not an APK)
APK sideloading is now novice-hostile — Google's Play Protect warnings, the "unknown sources" gauntlet, and the
new developer-verification mandate (extending even to sideloaded apps) make "download this .apk and install it" a
dead end for non-technical users. And APK never worked for iPhone at all. A **PWA** is the opposite: one tap to
install, no warnings, works on **Android AND iOS**, auto-offline. The only cost is that it must be served from an
`https` URL — which is the thing this design makes invisible and ephemeral.

## What apps fit (scope — not just simple games)
The generator wraps the OUTPUT (a static web bundle), not the source language — so it's language/framework-agnostic:
hand-written HTML/JS, a React/Vue/Svelte `dist/`, or other languages compiled to WebAssembly (Python via
Pyodide/pygbag, Rust/C/Go via WASM) all work, simple or involved. Two boundaries decide how well an INVOLVED app
fits the ephemeral one-click model:
- **Backend dependency.** The ephemeral host serves the FRONTEND bundle only. A client-side / offline-first app
  (games, tools, single-player, local-storage apps) is fully self-contained and runs offline after install. An app
  that calls a live API/DB/auth server works only while THAT backend is up and reachable — it's a valid PWA, but not
  the "throwaway link, runs forever offline" story.
- **Capacitor native plugins.** Capacitor and PWA are two delivery targets of the same web app. Capacitor wraps it
  in a native shell with native plugins (camera/filesystem/push/secure-storage) via a native bridge that does NOT
  exist in a browser PWA. So a Capacitor app installed as a PWA gets only the web-capable subset (web fallbacks
  where Capacitor provides them; native-only features don't run). Native-grade features stay the Capacitor build.

So the limit isn't "simple vs complex" — it's "client-side & self-contained?" and "needs the native bridge?". The
"Add to Phone" path is ideal for involved-but-web-capable, offline-friendly apps.

## The key insight that makes ephemeral hosting work
**Install window ≠ run lifetime.** A PWA's service worker *precaches the whole game onto the phone* the moment the
page loads. After the user taps "Add to Home Screen," the installed app runs entirely from that on-device cache —
**it no longer needs the server at all.** So the host only has to live long enough for the user to (1) open the
link and (2) add it to their home screen. After that, the 1-hour expiry is irrelevant: the app is theirs, on their
phone, offline, permanently.

That turns PapaJoe's caveat into a feature:
- **Backend stays clean** — nothing lingers; the link auto-evicts after ~1 hour.
- **Privacy/security for the user** — their app isn't sitting on someone's server indefinitely; it's a throwaway
  install link, then it's gone.
- **Repeatable** — want it again (e.g., to install on another phone)? Click "Add to Phone" again → fresh link,
  fresh hour. Re-publishing also picks up any edits since last time.

## User flow
1. User finishes a game (single self-contained HTML, like the showcase demos).
2. Clicks **Add to Phone**.
3. Redivivus (a) wraps the game as a PWA (manifest + service worker + icon), (b) uploads the tiny bundle to the
   ephemeral host, (c) shows a **QR code + short link + a 60-minute countdown**.
4. User scans with their phone camera → opens in the mobile browser → the page loads and **precaches** (a tiny
   "Ready to install ✓" confirms everything cached).
5. User taps **Add to Home Screen** (Android shows an install prompt; iOS via Share -> Add to Home Screen).
6. Icon appears. Tapping it launches the game fullscreen, offline. **The link can now expire — the app stays.**

## Architecture

```
Redivivus extension (client)                Ephemeral host (Cloudflare Worker + KV)
─────────────────────────────              ──────────────────────────────────────
[Add to Phone]                              POST /publish  -> store bundle in KV with
  -> assemble self-contained game             expirationTtl: 3600s, return {token, url}
  -> generate manifest.json                 GET /p/<token>/<file> -> serve from KV
  -> generate service worker (precache)        (404/expired -> friendly "link expired" page)
  -> generate icon (192 + 512)
  -> POST bundle --------------------------> KV auto-evicts after ~1h (no cron, no cleanup)
  <- {url, token, expiresAt}
  -> render QR + countdown
```

- **Ephemeral host = Cloudflare Worker + KV.** KV's `expirationTtl` gives true ~1-hour auto-expiry at
  second granularity, edge-served, near-free, and self-cleaning (no cron, no clutter — exactly the requirement).
  A self-contained game is ~20–80 KB, far under KV's 25 MB value limit. (Already in PapaJoe's stack — the web app
  is on Cloudflare.)
- **Client owns PWA generation** (no proprietary prompts; it's deterministic templating, fine on the client).
- **One unguessable token** per publish (e.g. 22-char base62) → the link isn't discoverable.

## What "PWA-ify" generates (deterministic, no AI)
- **`manifest.json`** — `name`, `short_name`, `start_url: "."`, `display: "standalone"`, `theme_color`,
  `background_color`, `icons: [192, 512]`, `orientation` (portrait/landscape guessed from canvas aspect).
- **`sw.js`** — a tiny precache service worker: on `install`, cache `["./", "./index.html", "./manifest.json",
  "./icon-192.png", "./icon-512.png"]`; on `fetch`, serve cache-first (so it runs offline and survives host
  expiry). Versioned cache name so re-publishes refresh.
- **`index.html`** — the user's self-contained game + injected `<link rel="manifest">`, `<meta name="theme-color">`,
  `<link rel="apple-touch-icon" href="icon-192.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">`,
  and a small inline SW-registration + "Ready to install ✓" badge once `navigator.serviceWorker.ready` resolves.
- **Icon** — v1: generate a clean tile (game title initials on a theme-colored gradient) at 192 & 512. v2: snap a
  screenshot of the running preview as the icon. (Decision below.)

## Platform reality (set expectations honestly) — every browser-capable device
- **Android (Chrome):** first-class. Real install prompt; becomes a WebAPK with its own icon; full offline.
- **iPhone/iPad (Safari):** works via Share → Add to Home Screen; standalone icon + fullscreen; offline via SW.
  More manual (no auto-prompt) and a few advanced web APIs are limited — fine for arcade games. Instructions must
  show the Share-sheet path explicitly (it trips people up).
- **Desktop/laptop Chrome & Edge (Windows / macOS / Linux / ChromeOS):** first-class. An **Install** icon appears
  in the address bar → installs as a standalone app window with a real OS icon (taskbar/dock/Start/launcher),
  offline. This is the strong desktop target.
- **Android tablets:** same as Android phones.
- **Honest weak spots:** desktop **Firefox** dropped its install-PWA feature (you can still run it in a tab, no
  installed icon). Desktop **Safari (macOS Sonoma+)** has "Add to Dock," which works but is newer/less discoverable.
  So for installed-app behavior, steer desktop users to **Chrome/Edge**; everywhere else it still *runs* in a tab.
- The bundle MUST be fully precached before the link expires — show "Ready to install ✓" and don't enter the
  countdown "danger zone" until the SW reports cached (true on all platforms).

## Delivery — one artifact, two ways in
- **QR code** for phones/tablets (scan with the camera).
- **Clickable link** for the desktop the user is building on (and to share). Since the user is often already on a
  PC in Redivivus, "Install on this computer" can be a direct click; "Install on my phone" is the QR.

## Edge cases
- **User waits too long / link expired before install:** `GET /p/<token>` returns a friendly "This install link
  expired — open Redivivus and tap Add to Phone again." Already-installed apps are unaffected.
- **Added to home screen but SW hadn't finished caching:** mitigated by precaching the (tiny) bundle on first load
  and gating the "Ready to install" badge on `serviceWorker.ready`. Worst case the user re-opens the link (still
  within the hour) to re-cache.
- **Updates:** ephemeral by design — there's no long-lived URL to auto-update from. Re-publish = new install. State
  this plainly; it's the point.
- **Bigger / multi-file apps:** v1 targets self-contained single-file games (the showcase inliner already produces
  these). Multi-file/asset-heavy apps are a later phase (bundle the folder, precache all assets).

## Security & privacy
- Unguessable token; link dies in ~1h; nothing persisted server-side after that. No PII in the bundle.
- The user's code lives on the edge for at most an hour, then is gone — a clean privacy story to tell novices.
- Optional later: a "burn after install" — invalidate the token on first successful SW cache (one scan, one
  install). Decision below.

## Sharing (decided model — no account, no recipient re-host)
The goal: a builder makes a game, wants to share it so a kid/friend gets the FULL install (home-screen icon,
offline) on their own device — without anyone signing in, and without non-users turning the backend into a free host.

**The unavoidable truth:** a full install ALWAYS needs an https host (no host -> no service worker -> no install).
There is no portable "PWA file," no peer-to-peer install, no offline beam-and-install. So the question is never "how
to avoid hosting" — it's "how to host without getting freeloaded."

**The gate is the APP, not a login.** Publishing happens FROM the Redivivus app, which carries a baked-in app/install
token. So:
- **No sign-in to share or install.** The builder doesn't log in (the app authenticates itself); the recipient
  doesn't either (they just scan + install).
- **Only a Redivivus app instance can publish/host.** A recipient who merely received a game link isn't running
  Redivivus, so they CANNOT re-host. This is what blocks freeloading — possession of the app, not a password.

**Flow:** builder clicks **Share** -> Redivivus mints an ephemeral link + QR (one publish, counts against the
app-instance's rate limit) -> builder sends the link/QR however they like -> **one link, unlimited installs during
the window** (the whole family scans in the same hour) -> link auto-expires; recipients have full installed apps.

**No recipient re-share.** The earlier "re-share button baked into the PWA" is REJECTED — it would let non-users
re-host (the freeloading leak). Onward sharing still works, it just has to originate from someone running Redivivus.
(That's a growth funnel — recipients see "made with Redivivus" — not a cost.)

**Guardrails (it's a share feature, not a free CDN):** app-token-gated publish, per-instance rate limits + quota
(tiered: free = short TTL/few shares, paid = more — also the cost knob), size caps, ephemeral TTL, sandboxed serving
(CSP on a dedicated subdomain), abuse reporting. The 1h TTL bounds any abuse window to minutes.

**Honest limits:** sharing needs brief internet at publish + install time (to reach the https host). There is NO
pure-offline, no-internet "beam it over and they install it" — platform limit, not Redivivus. The only no-internet
fallback is AirDrop/Nearby-Share the single self-contained HTML FILE: the recipient can OPEN and play it in a
browser, but NOT install it as an app.

## Branding badge & attribution ("Made with Redivivus")
Every generated PWA carries a small, unobtrusive **"Made with Redivivus"** badge — a low-profile corner chip
linking to redivivus.dev. It ships INSIDE the bundle, so it's present in the installed/offline app too, on every
device it lands on.

- **Free tier:** badge always on, **no remove option** (the in-app toggle is shown but locked -> "Upgrade to
  remove" — also a discovery point for the paid tier).
- **Paid tier:** a toggle to remove it (present by default; paid users opt out, per-app or globally).
- **Tamper-resistant — enforced at PUBLISH, not just generated.** Badge inclusion is decided **server-side at the
  publish endpoint** from the app-instance's tier (the same app/install token that gates publishing — see Sharing).
  Free-tier bundles are stamped with the badge at publish time, so a free user stripping the HTML locally doesn't
  help: the ephemeral host re-injects it. Paid bundles (remove toggled) publish without it. This is the only way to
  make it stick — pure client-side injection is trivially removable.
- **Why it earns its place:** (1) **growth** — every shared/installed app is a "made with Redivivus" impression on a
  non-user (the funnel we want, since onward sharing must originate from a Redivivus instance); (2) **upsell** —
  badge removal is a clean, classic paid perk; (3) **accountability** — the badge ties a shared app back to
  Redivivus for abuse handling.
- **Design constraints:** small, non-blocking (corner, low opacity, never covers controls), accessible, ASCII/emoji
  safe, and it must not break the fullscreen feel or interfere with gameplay.

## Scale & cost (10K+ users)
The ephemeral + edge + no-egress design is purpose-built for this — at 10K users it barely registers, with no
servers to manage and storage that self-purges.

**Why it scales cleanly:**
- **Ephemeral TTL = storage never accumulates.** Only the last ~hour of shares is stored at any instant; it
  self-deletes. 10K or 100K users, storage stays flat — this is what kills most "hosting at scale" cost.
- **Cloudflare edge = auto-scale, zero servers.** Workers + KV scale horizontally; no provisioning/capacity planning.
- **No egress fees.** Cloudflare doesn't bill bandwidth out — serving bundles is free (bandwidth is what sinks you
  on AWS/traditional hosts).

**Back-of-envelope at 10K users** (~3 shares/user/day ≈ 900K publishes/mo, ~200 KB avg bundle, ~3 installs/share;
pricing approximate — verify current Cloudflare rates):

| Cost | Volume | ≈ $/mo |
|---|---|---|
| KV writes (publishes) | ~0.9–4.5M | $5–22 |
| KV reads (installs) | ~25–30M | $13–18 |
| Storage (1h TTL) | ~250 MB peak | ~$0.15 |
| Workers requests | ~30M | ~$15 |
| Bandwidth (egress) | any | $0 |
| **Total** | | **~$30–60/mo** |

Storage is the punchline — a fraction of a dollar, because of the TTL. Cost is almost entirely cheap per-op
reads/writes that scale LINEARLY. 10K → 100K users = ~10× a small number; nothing architecturally changes.

**What scales vs what doesn't:** reads/writes scale linearly & cheaply; storage stays flat (TTL purges it);
infrastructure = none to add; bandwidth = free.

**Where it could hit harder (watch these):**
- **Abuse / bot-publishing** — the real risk is someone scripting publishes to use it as a free CDN, NOT legit
  users. Defended by the **app-token gate** (must be the Redivivus app to publish — see Sharing), **per-instance
  rate limits**, and **size caps**. An abuse-control problem with standard answers, bounded hard by the 1h TTL.
- **A viral app** — one share installed by 50K devices in its window is a read spike, but reads are the cheapest op
  and bandwidth is free, so even a smash hit costs cents; the edge absorbs the request volume natively.
- **Big bundles** — multi-file apps averaging MBs raise reads/storage (still cheap). KV's 25 MB value cap is the
  hard limit; beyond ~1–2 MB, **Cloudflare R2** is the better store (cheaper at size, egress still free). Scaling
  lever: **KV for small bundles, R2 for big ones.**

**Cost knob = monetization knob.** Publishing is quota'd, so cost is matched to revenue by design: free tier = short
TTL + few shares/day; paid tiers = longer windows + more shares. Heavy users are paying users; cost can't outrun
revenue if tiers are set sanely.

**Bottom line:** at 10K users this is a rounding error on the Cloudflare bill with zero ops attention. The only
thing needing real engineering care is **abuse control**, not scale.

## Phases
- **Phase 0 — PWA generator (client).** Pure templating: given a self-contained HTML string + title + theme,
  produce `{index.html, manifest.json, sw.js, icon-192.png, icon-512.png}`. Unit-testable offline; no hosting yet.
- **Phase 1 — Ephemeral host (Cloudflare Worker + KV).** `POST /publish` (store bundle, TTL 3600s, return token)
  and `GET /p/<token>/<file>`; expired/404 friendly page.
- **Phase 2 — "Add to Phone" button + QR.** Wire the button into the build/result UI; show QR + link + countdown +
  the iOS-vs-Android install instructions; "Ready to install ✓" gated on SW cache.
- **Phase 3 — Icon quality + polish.** Screenshot-based icons, orientation detection, landscape games, theme-color
  from the game's palette.
- **Phase 4 — Multi-file / larger apps**, and optional burn-after-install.

## Decisions (locked Jun 14, 2026)
1. **Ephemeral host = Cloudflare Worker + KV** with `expirationTtl`. Self-cleaning TTL, edge-served, in-stack.
2. **Icon (v1) = generated title-tile** — game initials on a theme-colored gradient. Instant, dependency-free.
   Screenshot-based icons deferred to a later phase.
3. **Window = configurable: 15 min / 60 min / 240 min** (default 60), chosen per publish. Burn-after-install
   deferred (optional later).
4. **v1 supports MULTI-FILE apps**, not just single-file. This changes two things vs the original plan:
   - **Bundle = the whole project folder** (the showcase inliner stays useful for single-file, but multi-file
     uploads each asset). Publish uploads a manifest of files; the Worker stores each under `KV[<token>/<path>]`
     with the same TTL and serves `GET /p/<token>/<path>`.
   - **Service worker precaches EVERY asset** (HTML, CSS, JS, images, fonts, sounds) so the installed app is fully
     offline. The generator must enumerate the bundle's files into the SW precache list. Runtime `fetch()` of
     local assets now works (they're cached) — and the showcase "won't-bundle" warning logic can be reused to flag
     anything referenced but missing before publish.
   - KV per-value limit is 25 MB; total bundle should stay well under that (warn if a project is unusually large).

## Phase change from the decisions
Multi-file moves OUT of "Phase 4 (later)" and INTO v1. Revised:
- **Phase 0 — DONE (Jun 14, 2026).** PWA generator built: `src/services/pwa/pwaGenerator.ts` + `pwaTemplates.ts`.
  `generatePwa(srcDir, opts)` enumerates the folder (skips junk/non-runtime files) -> generates `manifest.json`,
  a precache `sw.js` (caches EVERY bundled file), an `icon.svg` title-tile, injects the PWA wiring + "Made with
  Redivivus" badge into the entry HTML, and warns about local refs NOT in the bundle (real 404s only — bundled
  multi-file refs don't false-flag). Pure/offline, unit-testable. Verified on frogger (single-file, no warnings)
  and chess (multi-file: bundles game.js/style.css/SVGs, no warnings). PNG-rasterized icons = Phase 3.
- **Phase 1 — BUILT (Jun 14, 2026), pending deploy.** Cloudflare Worker + KV in `pwa-host/` (`src/index.ts` router,
  `publish.ts`, `serve.ts`, `util.ts` + `wrangler.toml`/`package.json`/`tsconfig`/`README`). `POST /publish`
  (app-token-gated, rate-limited 30/h, 10 MB cap, TTL 15/60/240, free-tier badge re-stamp) -> `{token, url,
  expiresAt}`; `GET /p/<token>/<path>` serves from KV (root->entry, unknown->entry, missing->410 expired page).
  Bundles clean (esbuild); round-trip validated with a mock KV (publish/serve/badge/expired/401 all correct). TODO:
  wire real app-token verification + derive paid/free TIER from the token (v1 stub = free). **User deploys via
  wrangler** (login, create KV namespace, paste id, deploy).
  **DEPLOYED Jun 14, 2026** -> `https://redivivus-pwa-host.smithkjnc.workers.dev` (KV id `279c02e3033e4b4c9a9c662467f03c30`,
  account `8da4f31c3ce6415c090f4263de983e58`). Live round-trip verified end-to-end: publish 200, serve+badge re-stamp,
  icon content-type, unknown-path->entry fallback, bad-token->410, no-token->401. **Caveat:** Cloudflare's edge 403s
  requests with a bare/`Python-urllib` UA — the Phase 2 publish call MUST send a normal `User-Agent` header.
- **Phase 2** — "Add to Phone" button: QR + link + TTL picker (15/60/240) + countdown + iOS/Android steps.
- **Phase 3** — icon polish (screenshots), orientation/landscape, theme-color from palette, optional
  burn-after-install.
