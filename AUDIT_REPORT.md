# Redivivus Codebase Audit — 2026-06-18

Read-only audit. **No code was changed.** Scope per the 6-phase brief; roadmap (`REDIVIVUS_ROADMAP.md` + `docs/`) read first. Findings are organized by severity with `file:line` references, impact, and a one-line suggested fix (not yet applied).

**Environment baseline captured:** `tsc -p ./ --noEmit` → **0 errors**. `eslint src` → **0 errors / 539 warnings**. 29 source files exceed the 200-line Rule 9 limit.

**Not assessed (no access from this environment):**
- **Phase 4 — Dead End Vault** (Supabase project `nadcrknbzsbhpnnvhtir`): no MCP/DB connectivity available here. Cross-referencing reintroduced bugs against known dead ends could not be performed. Recommend re-running this phase where the Supabase project is reachable.

---

## CRITICAL

### C1 — Auto-update download closes the write stream before the real download (updates hang)
> ✅ **RESOLVED** — `downloadFile` now follows redirects to the final 200 on one kept-open stream + `file.on('error')` rejects (`checkForUpdates.ts:37-78`).
**`src/commands/checkForUpdates.ts:36-55`** (`downloadFile`)
On a 301/302 the code does `file.close(); request(res.headers.location!); return;` (line 40-41) but the *same* `file` write stream is reused for the redirected 200 response (`res.pipe(file)`, line 50). GitHub release-asset URLs (`runUpdate`, line 59) **always** 302-redirect to `objects.githubusercontent.com`, so the final response is always piped into an already-closed stream → `ERR_STREAM_WRITE_AFTER_END`. There is no `file.on('error')` handler, so the promise never resolves and the `withProgress` spinner from "Update Now" hangs indefinitely.
- **Why it matters:** The in-IDE updater is the primary recovery/distribution mechanism for a beta. The always-taken path is broken; only the status-bar *check* (separate `/api/version` fetch) works, not the actual install.
- **Fix:** Don't close `file` on redirect — recreate the stream only on the final 200, or guard the pipe; add `file.on('error', reject)`.

### C2 — Linux build is not debranded; `dataFolderName` mismatch breaks extension-update delivery
> ✅ **RESOLVED** — `scripts/debrand-linux-product.js` (wired into `update-linux-base.sh` + `local-release.sh`) sets `dataFolderName='.redivivus'`, matching the deploy/update target.
Linux build base `~/projects/redivivus-build/VSCode-linux-x64/resources/app/product.json` currently reports full VSCodium branding: `nameShort/nameLong: "VSCodium"`, `applicationName: "codium"`, **`dataFolderName: ".vscode-oss"`**, **`urlProtocol: "vscodium"`**, `serverDataFolderName: ".vscodium-server"`, and Microsoft/VSCodium `reportIssueUrl`/`documentationUrl`/`releaseNotesUrl`.
- Only **Windows** is patched (inline in **`scripts/build-windows.sh:70-95`**). There is **no Linux `product.json` debrand step** in any repo script — `scripts/local-release.sh` packages the base as-is, and `scripts/update-linux-base.sh:38-41` `mv`s a freshly downloaded VSCodium over the base, wiping any prior manual patch.
- **Consequence beyond branding:** `scripts/postcompile-deploy.js:63` deploys extension updates to `~/.redivivus/extensions` (the rebranded folder), but the running IDE uses `dataFolderName = .vscode-oss` → `~/.vscode-oss/extensions`. Deployed fixes can land in a folder the IDE doesn't read.
- **Why it matters:** Debranding is a core release goal and the data-folder mismatch silently misroutes updates. (Caveat: product.json state is read from the out-of-repo build base; the *root cause* — no reproducible Linux patch — is verifiable from this repo.)
- **Fix:** Add a Linux `product.json` patch step (mirror the Windows block: `dataFolderName='.redivivus'`, `urlProtocol='redivivus'`, names, doc/issue URLs) to `local-release.sh`, run after `update-linux-base.sh`.

---

## HIGH

### H1 — Guardian independence broken in the orchestrated phase build (self-review)
> ✅ **RESOLVED** — orchestrated review now uses an independently-selected Guardian, not `ranked[0]` (`chatPanelBuildOrchestrated.ts` Step 3).
**`src/core/build/chatPanelBuildOrchestrated.ts:127`** → **`src/services/ai/supervisorOrchestrator.ts:123-161`** (`reviewOutput`)
The orchestrated multi-AI phase build (live; called from `chatPanelBuildPhase.ts:9`) runs its "Guardian" review with `ranked[0]` — the **same AI that produced the plan** (`createPlan` uses `availableAIs[0]` as supervisor) — and passes the supervisor's own plan as the review rubric (`planContext`). The independent Guardian (`routingGuardian.guardianReviewImpl` with `selectGuardianAI` + separate `/guardian` endpoint) is **bypassed entirely** on this path. The reviewer reviews its own work against its own plan → maximal self-bias.
- **Why it matters:** Violates the stated invariant that Guardian must not share a code path with Supervisor/Worker that lets either bias the review.
- **Fix:** Route the orchestrated review through `guardianReviewImpl`/`selectGuardianAI` (or otherwise force a different provider than the planner), not `reviewOutput(...ranked[0]...)`.

### H2 — `selectGuardianAI` no longer excludes the worker's provider
> ✅ **RESOLVED** — `selectGuardianAI` excludes `workerAI`; returns null when the worker is the only provider (`guardianAI.ts:64`).
**`src/services/ai/guardianAI.ts:64`**
The first parameter is `_workerAI` (unused). The function always returns `ranked[0]`. The file header (line 5) still asserts "Guardian should always be the better AI, **not the same as the worker**," but the `[RULE]` at line 54 reframes Guardian≡Supervisor as intentional. Net effect: when the worker is also the top-ranked provider, Guardian and Worker are the **same provider** (different tier/model, e.g. Sonnet-guardian vs Haiku-worker, but same vendor → correlated blind spots).
- **Why it matters:** Directly contradicts the Phase-2 independence requirement; the "exclude worker" contract was silently dropped.
- **Fix:** Decide the intended policy. If independence is required, restore worker-exclusion in `selectGuardianAI` (use the param). If Guardian≡Supervisor is intended, update the header comment and the audit requirement to match — and document the single-AI degraded case.

### H3 — Review/Guardian gates fail OPEN (unreviewed code ships silently)
> ✅ **RESOLVED** — gates fail closed (`routingGuardian.ts:103,153`, `supervisorOrchestrator.ts:reviewOutput`); single-provider degraded mode added so only genuine failures block.
- **`src/services/ai/supervisorOrchestrator.ts:150`** and **`:160`** — `reviewOutput` returns `passed: true` when the review AI call fails or returns an unrecognized response.
- **`src/services/ai/routingGuardian.ts:153`** — after every provider fails, `guardianReviewImpl` returns `passed: true` (only `console.error`, not surfaced to the user).
- **Why it matters:** A failed safety gate that defaults to "approved" ships code that was never reviewed, with no user-visible signal. (The failover at `routingGuardian.ts:106-116` improved this but the terminal fallback is still fail-open.)
- **Fix:** On total review failure, surface a "review unavailable — proceed?" state to the user instead of auto-passing; at minimum mark the result as `reviewUnavailable` and badge it in the UI.

### H4 — Release script drops the `--class=Redivivus` flag and sets `StartupWMClass=codium`
> ✅ **RESOLVED** — `local-release.sh` `.desktop` now matches `install.sh`: `Exec=…/redivivus --class=Redivivus` + `StartupWMClass=Redivivus`, with the symlink ensured (`scripts/local-release.sh:102-115`).
**`scripts/local-release.sh:103-114`**
The `.desktop` file written on every release uses `Exec=$STABLE_LINK/codium --no-sandbox --reuse-window %U` (no `--class=Redivivus`) and `StartupWMClass=codium`. This contradicts the correct generator in **`scripts/postcompile-deploy.js:159,164`** (`--class=Redivivus` + `StartupWMClass=Redivivus`). The flag is *dropped*, not moved to the bin wrapper — but the invariant the brief flagged is broken in the live release pipeline (clobbers the developer's launcher each release; WM_CLASS grouping breaks).
- **Why it matters:** This is exactly the "a refactor accidentally moved/dropped the flag" case called out in Phase 1.
- **Fix:** Make `local-release.sh` emit the same `Exec`/`StartupWMClass` as `postcompile-deploy.js` (use `redivivus` symlink + `--class=Redivivus`), or have it reuse the generated `install.sh`.

---

## MEDIUM

### M1 — Worker step failure returns empty code silently
> ✅ **RESOLVED** — `executeStep` returns `{failed,error}`; the orchestrated loop pushes a ⚠️ "Step N failed" message (`supervisorOrchestrator.ts:120`, `chatPanelBuildOrchestrated.ts` loop). *Lower-impact than scored — only the 2+ provider orchestrated path.*
**`src/services/ai/supervisorOrchestrator.ts:117`** — `if (!res.success) { return { code: '', tokens: 0 }; }`. In `routingOrchestration.ts:42`/`chatPanelBuildOrchestrated.ts`, the empty result is folded into `assembledCode` (`result.code || assembledCode`) so a failed step just vanishes with no surfaced error.
- **Fix:** Propagate a step-failure signal and surface "Step N failed" to the user / abort assembly.

### M2 — Release workflow's Fly.io version step is redundant and harmful (delete it)
**Ground truth established by live probe (2026-06-18):** the authoritative backend is **Cloud Run** (`redivivus-backend-1017737301468.us-east4.run.app`, `server: Google Frontend`) — every shipped client points only there (`apiClient.ts:12`, `checkForUpdates.ts:96,140`, `signIn.ts:63`). Fly.io (`redivivus-backend.fly.dev`) is **still live but orphaned** — same code/Dockerfile, serves identical `{"version":"0.4.11","source":"github"}`, Fly build label dated today, but no shipped client references it. Not decommissioned, just a parallel deployment with no live consumer.

The `/api/version` endpoint (`redivivus-backend/src/app/api/version/route.ts`) derives the version from the **latest GitHub Release** (`source:"github"`, 60s cache). `REDIVIVUS_VERSION` is an **emergency pin/override only** — its own header says *"normally it is UNSET… Do NOT set REDIVIVUS_VERSION unless you must pin a version."* Both backends currently return `source:"github"` (override unset). Version reporting already works on both platforms with no secret set.

The final step of **`.github/workflows/deploy-ide.yml.disabled:143-150`** (`flyctl secrets set REDIVIVUS_VERSION=$NEW_VERSION --app redivivus-backend`) is therefore wrong on two counts: (1) it targets Fly.io, which no client uses; and (2) setting `REDIVIVUS_VERSION` would flip `/api/version` to `source:"override"` and **pin** the version, defeating the GitHub-release-as-source-of-truth design. The workflow already creates that GitHub Release at `:120-124`, so the version propagates automatically within ~60s.
- **Why it matters:** Re-enabling the workflow as-is would pin/misroute version reporting; the step adds risk and a fake dependency for zero benefit.
- **Fix:** **Delete the entire "Update Fly.io REDIVIVUS_VERSION secret" step (`:143-150`)** — do not repoint it to Cloud Run; per the backend's own design no version-push secret is needed at all. The rest of the workflow (build, GitHub release, web-link update) is platform-agnostic and fine.
- **FLY_API_TOKEN — RESOLVED, not a blocker:** the `secrets.FLY_API_TOKEN` reference (`:145`) exists only inside the step being deleted. Once that step is removed, the token is unnecessary and is **not** a prerequisite for re-enabling the workflow. (This supersedes the roadmap's "pending FLY_API_TOKEN secret" note, which is stale.)
- **Stale "Fly.io is current" claims to correct separately (so the next reader doesn't repeat the wrong assumption):** `redivivus-backend/fly.toml` (app still defined as the deploy target), `redivivus-backend/DEPLOYMENT_GUIDE.md` (calls Fly the "current" deploy), and `apiClient.ts:1,15` comments ("routes AI calls through the Fly.io backend" / "hits the Fly.io backend directly") all still describe Fly.io as authoritative when the live client uses Cloud Run. The roadmap's Phase-3 premise (`Fly.io redivivus-backend.fly.dev/api/version`) is likewise stale.

### M3 — Leftover debug instrumentation writes to the user filesystem
> ✅ **RESOLVED (partial, by design)** — removed the unconditional `~/redivivus_debug.log` write (`extension.ts:~312`). Conditional `/tmp/...` activation-error writes left as low-impact diagnostics.
- **`src/extension.ts:312`** — `require('fs').appendFileSync(~/redivivus_debug.log, ...)` runs **unconditionally on every activation** (auto-open timer). Grows without bound in the user's home dir.
- **`src/extensionCommands.ts:86-95`** — every command-registration `catch` appends to `/tmp/redivivus_activation_errors.log`.
- **Fix:** Remove the unconditional `~/redivivus_debug.log` write; route the activation-error log through `redivivusLogger` / output channel.

### M4 — Dead orchestration path
> ✅ **RESOLVED** — deleted `orchestratedBuild()` + `routingOrchestration.ts` (`routingService.ts:193` `[DEAD]` tag). *Confirmed fully dead — pure deletion, no behavior change.*
`RoutingService.orchestratedBuild()` (**`src/services/ai/routingService.ts:196`**) and `orchestratedBuildImpl` (**`src/services/ai/routingOrchestration.ts`**) have **no live callers** — the only reference is a `[DEAD]` comment at `src/core/build/chatPanelChunked.ts:43`. (The live orchestrated path is `chatPanelBuildOrchestrated.ts`.)
- **Fix:** Delete `orchestratedBuild`/`orchestratedBuildImpl` (log a `[DEAD]` tag per Rule 8), or wire them back if intended.

### M5 — Broad silent-failure surface: 139 empty `catch {}` blocks
> ⚠️ **FLAGGED — needs judgment, not a blanket sweep.** Most empty catches are intentional best-effort (`try{ fs.unlinkSync }catch{}`, `process.kill` on an already-dead group, etc.); the spawn/timeout paths the brief cared about (`runtimeRunner.ts`) already surface errors. Blanket-logging 139 sites would add noise and risk. Recommend a targeted, case-by-case pass deciding which catches genuinely hide a user-visible failure — left for discussion.
139 empty catch blocks across `src/`. Several wrap process spawns / fs ops where a swallowed failure produces a confusing no-op (the brief specifically called out pkill/timeout/spawn paths). `runtimeRunner.ts` handles its spawns well (returns error strings, `killGroup` guarded), but those error strings should be confirmed to reach the user at each call site.
- **Fix:** Audit empty catches around spawn/fs/git; log at minimum. Treat as a cleanup sweep, not one fix.

### M6 — `AbortSignal.timeout` used where it's documented as unreliable in Electron
> ✅ **RESOLVED** — added `fetchWithTimeout()` (Promise.race + cleared hard timer, matching `cloudBuildClient.ts`) and routed both `/api/version` fetches through it (`checkForUpdates.ts:11-24,143,186`). Test: `test-update-and-debrand.cjs` M6 section.
`checkForUpdates.ts:99,142` rely on `AbortSignal.timeout(20_000)`, but **`src/services/build/cloudBuildClient.ts:38,176`** carry a `[WARN]`/`[FIX]` that `AbortSignal.timeout()` does not reliably abort in Electron's fetch (they switched to `Promise.race`). The update check is wrapped in try/catch and non-blocking, so a hang is swallowed — but the timeout may not fire.
- **Fix:** Use the same `Promise.race`/`makeTimeout` pattern for the `/api/version` fetches for consistency.

### M7 — 29 files violate Rule 9 (>200 lines); enforcement is warn-only
> ⚠️ **FLAGGED — large refactor + a hard gate is a policy call.** Splitting 29 files (extension.ts 373, cloudBuildClient 362, …) is a multi-session refactor, each split carrying regression risk — out of scope for a low-risk pass. Making `compile` fail on Rule 9 would instantly break the build for all 29 existing files, so it can't flip on until they're split. Both are decisions for the owner. *(Still 29 as of this pass.)*
Top offenders: `src/extension.ts` (372), `services/build/cloudBuildClient.ts` (362), `core/routing/chatPanelMsgFix.ts` (359), `services/build/surgicalEditService.ts` (354), `core/routing/chatPanelMsgFixEscalation.ts` (339), `services/build/cloudBuildResultProcessor.ts` (333). `scripts/postcompile.js:45-49` only `console.warn`s.
- **Fix:** Split the worst offenders at natural `[NEXT]` points; consider failing `compile` on Rule 9 if the rule is meant to be hard.

### M8 — Capability vs governance "dials" are not represented in code
> ⚠️ **FLAGGED — architecture decision, not a bug.** Whether the capability/governance separation *should* be enforced in code (distinct config objects/modules) or remain a documented concept is a product/architecture call with real design cost. I won't unilaterally build a dial system or unilaterally declare it doc-only. Needs an owner decision on intended strength of the separation.
No code construct named/structured as separate capability/governance dials was found (`grep` for capability/governance "dial(s)" → none). If the separation exists it is convention/doc-level only, not architecturally enforced — which is exactly what Phase 2 asked to rule out.
- **Fix:** If the separation is a real requirement, model it explicitly (distinct config objects / modules) so it can't be collapsed by convention drift; otherwise note it as conceptual in the architecture doc.

---

## LOW

- **L1 — ESLint warnings (0 errors).** ⚠️ **FLAGGED (partially reduced).** Down to **424** (from 539) after L2. The remaining are mostly `complexity` + `eqeqeq` + `curly`. `eslint --fix` is **not** safe to run blanket: the `eqeqeq` autofix rewrites `==`→`===`, which changes behavior where `== null` was intentional (catches null *and* undefined). The `complexity` warnings (`_buildHtml` 43, `renderFilesTab` 33) need real refactors. Both are out of scope for a low-risk pass — recommend a dedicated lint pass that reviews `eqeqeq` sites individually.
- **L2 — Vendored file is linted.** ✅ **RESOLVED** — added `ignores: ["**/vendor/**"]` to `eslint.config.mjs`; dropped the ~116 third-party `qrcode.js` warnings (total 540→424).
- **L3 — 112 `console.*` calls ship in the extension.** ⚠️ **FLAGGED — broad sweep.** Rerouting 112 calls across many files through `redivivusLogger` is a wide, low-value diff (console output is harmless, not a bug) that touches files beyond this scope. Recommend folding into the same dedicated hygiene pass as L1.
- **L4 — Floating promise** `void usageTracker.runOneTimeNonePurge();` (`src/extension.ts:109`) — unhandled rejection if it throws. ✅ **RESOLVED** — replaced with `.catch(() => {…})` so a rejection can't surface as an unhandled rejection.
- **L5 — Startup update-check cooldown race** (`checkForUpdates.ts:133-144`): two windows can both pass the cooldown gate before either writes `lastUpdateCheck`. ⚠️ **FLAGGED — the obvious fix conflicts with an invariant.** The suggested "write the timestamp optimistically (before the fetch)" would *regress* the deliberate "write `lastUpdateCheck` only after a successful fetch" design (Verified-GOOD item). The race is harmless (one duplicate version fetch). Leaving as-is unless the owner wants a cross-window lock — recommend WONTFIX.

---

## NITPICK

- **N1 — `src.bak/`** directory (`extension.ts/.js/.map`). ✅ **RESOLVED** — owner confirmed obsolete (predates the Great Reorganization: flat `extension.ts` + stray compiled output, no `commands/`/`core/`/`services/`/`ui/` subdirs, last touched 4 weeks ago). `rm -rf src.bak/` and deleted the shallow self-test step 4 (`scripts/self-test.sh`, renumbered 7→6 steps); self-test runs clean with no `src.bak` reference remaining.
- **N2 — Repo-root clutter:** two 123 MB `.vsix` files plus ~10 smaller ones, `eslint-output.txt`, `madge-report*.txt`, `game-after-start.png`, root `scratch-*.js`/`test-*.js`. ⚠️ **FLAGGED — owner's call.** These are gitignored *local* artifacts; deleting the release `.vsix` builds in particular could discard things the owner wants kept. Not safe for me to unilaterally remove — left for the owner to clean (move to `tmp-binaries/` or delete).
- **N3 — CHASSIS references are intentional and correct.** ✅ **CONFIRMED — no action.** Re-verified: all `chassis` hits in `src/` remain legacy-namespace migration paths (`extensionMigration.ts`, `secretKeyStore.ts:46-50`, `routingKeys.ts:3`, `redivivusService.ts:18-24`). Nothing to rename.

---

## Verified GOOD (no action needed)

- **`tsc` clean** — 0 type errors.
- **`/api/version` timeout = 20s**, not reverted to 8s ✓ (`checkForUpdates.ts:99,142`). The 8s timeouts in `chatPanelHealthCheck.ts:32,42` are a different `/build` OPTIONS healthcheck, not the version call.
- **`lastUpdateCheck` cooldown written only after a successful fetch** ✓ — `checkForUpdates.ts:143-144` writes the timestamp only after `res.ok` passes. Recent fix intact.
- **No hardcoded secrets** in `src/`, `scripts/`, `pwa-host/` — only placeholders (`chatPanelServiceTemplatesA.ts:62`) and `process.env` reads. `pwa-host/wrangler.toml` holds only a KV namespace id (not a secret). Release scripts guard `CLOUDFLARE_API_TOKEN` (`local-release.sh:63`).
- **No OBD1/OBD2 dead branches** remain in the orchestration engine.
- **`userClosedProject` globalState gate holds on fresh install** — both `wasProjectClosedRecently()` and the globalState flag are unset on first run, so activation falls through to a normal single panel open (`extension.ts:330-340`). The deserialize/auto-open duplicate-panel race is guarded by the SENTINEL pattern (`extension.ts:260-267`).
- **Independent Guardian on the edit/fix path** (`chatPanelMsgSendAI.ts:123`, `chatPanelMsgFixEscalation.ts:154`) correctly calls `guardianReview` → separate `/guardian` endpoint with provider step-down. (Independence caveats are H1/H2 above, which concern the *orchestrated build* path and provider selection.)

---

## Top 10 — Fix First  —  ✅ ALL RESOLVED

1. ✅ **C1** — Updater now follows redirects to the final 200 with a single kept-open stream + `file.on('error')` reject (`checkForUpdates.ts:37-78`). Test: `scripts/test-update-and-debrand.cjs`.
2. ✅ **C2** — `scripts/debrand-linux-product.js` patches the Linux `product.json` (`dataFolderName='.redivivus'` …), wired into `update-linux-base.sh` + `local-release.sh`; deploy target now matches. Test: same file.
3. ✅ **H3** — Gates fail closed: `routingGuardian.ts:103,153` + `supervisorOrchestrator.ts:reviewOutput` return blocking verdicts; degraded single-provider follow-up added. Test: `scripts/test-guardian-independence.cjs`.
4. ✅ **H1** — Orchestrated review routed through an independently-selected Guardian (`chatPanelBuildOrchestrated.ts` Step 3), not `ranked[0]`.
5. ✅ **H2** — `selectGuardianAI` now excludes the worker's provider (`guardianAI.ts:64`); returns null when worker is the only provider.
6. ✅ **H4** — `local-release.sh` `.desktop` now uses `Exec=…/redivivus --class=Redivivus` + `StartupWMClass=Redivivus`, matching `install.sh` (`scripts/local-release.sh:102-115`).
7. ✅ **M2** — Fly.io `REDIVIVUS_VERSION` step deleted (`deploy-ide.yml.disabled`); `FLY_API_TOKEN` confirmed a non-blocker; stale "Fly is current" claims fixed in `fly.toml`, `DEPLOYMENT_GUIDE.md`, `apiClient.ts`. **Workflow flagged READY to re-enable (not yet flipped on).**
8. ✅ **M3** — Unconditional `~/redivivus_debug.log` write removed (`extension.ts:~312`).
9. ✅ **M1** — Worker-step failures now surfaced to the user (`supervisorOrchestrator.ts:executeStep` + `chatPanelBuildOrchestrated.ts` loop).
10. ✅ **M4** — Dead `orchestratedBuild()` + `routingOrchestration.ts` deleted (`routingService.ts:193` `[DEAD]` tag).

**+ Parity (found during C1/C2):** ✅ `build-windows.sh` now applies `urlProtocol`/`serverDataFolderName`/doc-URL debrand via shared `scripts/debrand-product.js` (was Linux-only).

### Re-scoring notes (turned out lower-impact than first scored)
- **M4** — confirmed *fully* dead (zero live callers; only a `[DEAD]` comment referenced it). Pure deletion, no behavior change — hygiene, not risk.
- **M1** — only reachable on the orchestrated multi-AI phase build (needs 2+ providers) when a worker step's provider call fails; the build already continued, just silently. Real but narrow — closer to Low/Medium.
- **M2** — the `FLY_API_TOKEN` "blocker" was never a real prerequisite; deleting the step removed the dependency entirely.
- **M3** — only the unconditional home-dir write was removed. The conditional `/tmp/redivivus_activation_errors.log` writes in `extensionCommands.ts` (fire only on a registration error, self-cleaning `/tmp`) were left as low-impact diagnostics.

---

## Post-audit tooling fixes (2026-06-19)

Not part of the original M/L/N findings — surfaced when running `scripts/self-test.sh` during the N1 closeout. The self-test was passing *vacuously* (checking moved/renamed paths), so these restore it as a real safety net. After all three, `self-test.sh` reports **✅ ALL CLEAR — 0 errors / 0 warnings** (6 steps).

1. ✅ **Stale `CORE_FILES` list (self-test step 5).** Two paths still pointed at pre-Great-Reorganization locations and so never validated anything: `src/ui/chat/chatPanel.ts` → `src/ui/panels/chat/chatPanel.ts`, and `src/ui/chat/chatPanelOrchestrator.ts` → `src/core/build/chatPanelOrchestrator.ts`. Audited the full 9-entry list against current `src/`; the other 7 were correct. Step 5 now validates real current core files.
2. ✅ **Empty reorg-leftover directories (self-test step 3).** Removed `src/ui/chat/`, `src/tests/ui/` (incl. `panels/chat`), and `src/tests/core/build/` — all genuinely empty (no `.gitkeep`, nothing git-tracked, unreferenced). `src/tests/` core content (`__baselines__`, `core/ai`, `__mocks__`, `utils`) untouched.
3. ✅ **False-positive broken import (self-test step 2).** `chatPanelScaffoldReact.ts → ./App` is import-like text inside a React-scaffold **template string** the extension generates (`src/main.tsx` content), not a real import. Per instruction, left the source untouched and added a `KNOWN_IMPORT_EXCEPTIONS` allowlist (with reason) to the step-2 checker so it isn't flagged forever.
