# Redivivus Full Audit Handoff — Jun 12, 2026
> [SCOPE] Extension codebase audit + RigOps admin audit merged into one doc.
> Covers: IDE Version bug (the one you asked about), security holes, rigops bugs, missing admin features, doc drift, code quality debt.
> Each item has file:line pointers. Work top-to-bottom within each priority.
> Delete this file when resolved or migrated into docs.
> For: Claude Code (Opus 4.8) follow-up session.

---

# PART A — THE BUG YOU ASKED ABOUT: IDE Version shows "—"

## A.1 Root cause #1: Expired Supabase access token → `user_id: null` in telemetry

**The chain:**
1. `src/commands/signIn.ts:81` calls `setAccountToken(token)` after magic-link auth.
2. The token is a **Supabase access JWT** with a ~1-hour expiry (Supabase default).
3. `src/services/api/apiClient.ts:27-40` caches this token in `_cachedToken` and `SecretStorage` — **never refreshes it**.
4. After 1 hour, `getAccountToken()` returns the expired JWT.
5. `src/services/api/apiClient.ts:166-176` (`logSessionStart`) sends it to `/telemetry`.
6. Backend `telemetry/route.ts:20-26` calls `supabase.auth.getUser(token)` — **rejects expired JWT** → `user = null`.
7. Row inserted into `activity_logs` with `user_id: null`, but `metadata.ide_version: '0.4.7'` IS present.
8. `rigops/panels/admin/users.py:164-179` skips rows where `uid` is empty string → ide_version never attributed.

**Database evidence (queried live during audit):**
- `activity_logs` total: **909 rows**
- `session_start` events: **2** (both `user_id: null`, `ide_version: '0.4.7'`)
- Rows WITH `ide_version` in metadata: **4** (all `user_id: null`)
- **No rows with both `user_id` AND `ide_version` exist.** This confirms the bug.
- Event distribution (last 2000): 745 ai_prompt, 102 classify_intent, 35 ai_build, 15 welcome_email_sent, 10 waitlist_invite_sent, 2 session_start

**Fix options (pick one):**
- **Option A (recommended):** Store the user's `id` (not just the JWT) in the extension's `globalState` at sign-in, and send it as `x-redivivus-user-id` header in telemetry. The backend reads the header and bypasses JWT validation for telemetry (telemetry is already intentionally anonymous-tolerant per the comment at `telemetry/route.ts:16`).
- **Option B:** Add a refresh-token flow in the IDE. Periodically call `supabase.auth.refreshSession()` or re-verify via the backend `/auth/verify` endpoint. More complex but keeps auth intact.
- **Option C:** In rigops `users.py`, when iterating activity_logs, if `user_id` is null but metadata contains an email, match by email fallback. Requires the extension to send email in metadata.

## A.2 Root cause #2: `configured_providers` is always `[]` — wrong require path

- `src/services/api/apiClient.ts:149,172`: `require('./secretKeyStore.js')` — this looks in `out/services/api/secretKeyStore.js`.
- The actual compiled file is at `out/services/ai/secretKeyStore.js`.
- The `try/catch` swallows the MODULE_NOT_FOUND error → `configured_providers: []` always.
- **Fix:** Change to `require('../../ai/secretKeyStore.js')` (relative to compiled `out/services/api/`).
- **Why "Configured AIs" shows "(inferred)":** `users.py:227` falls back to inference from `ai_prompt` model names because `cfg_providers` is empty. Once this fix lands, you'll see real configured provider lists.

## A.3 Why the Jun 12 "session heartbeat" fix didn't solve it

- The fix added `logSessionStart()` to `extension.ts:71` — it DOES fire and sends `ide_version: '0.4.7'`.
- BUT the token is expired, so the backend stores it with `user_id: null`.
- The fix assumed the token was valid. It wasn't.

---

# PART B — SECURITY & CRITICAL CORRECTNESS

## B.1 Live API keys in scratch files at repo root
- `scratch-test-gemini*.js`, `scratch-test-groq.js`, `scratch-test-kimi.js` contain live key patterns. Untracked but on disk.
- System Health (Jun 12 fix log) already shows 3/6 providers dead (OpenAI invalid, xAI 403, Kimi invalid).
- **Action:** rotate ALL keys, delete every `scratch-*.js` and root-level `test-*.js` one-off, add `scratch-*` to `.gitignore`.

## B.2 `mcpService.ts` spawns unvalidated commands from project config
- `src/services/mcpService.ts:27-46` — `loadMcpConfigs` reads `.redivivus/mcp.json` and `connectServer` spawns `config.command` with `config.args`. The file's own header says "[WARN] Always validate server paths before spawning" — **no validation exists**.
- Opening a malicious project folder = arbitrary code execution at extension-host privilege.
- **Action:** allowlist binaries, prompt user before first spawn per project (like VS Code workspace trust), dispose connections on deactivate.

## B.3 Debug logging: sync `appendFileSync` to `~/redivivus_debug.log` in production
- `src/core/project/chatPanelMsgProjectOps.ts:34,39,49,71,88` and `src/extension.ts:303` — sync I/O on hot UI paths, unbounded file growth in `$HOME`, inline `require()` instead of imports.
- **Action:** route through `debugLog()` gated behind `redivivus.debugLogging` setting, or delete the lines.

## B.4 Settings conflict: extension vs installer on `window.restoreWindows`
- `src/extension.ts:153-155` sets `window.restoreWindows: 'one'` when uncustomized.
- Jun 10 installer writes `"window.restoreWindows": "none"`.
- Non-installer installs (marketplace/VSIX-only) get `'one'`, re-enabling the session-restore bug.
- **Fix:** Pick one value (`'none'`) and use it in both places.

---

# PART C — ARCHITECTURE & ROOT CAUSES

## C.1 Stray `~/projects/.redivivus/` keeps regenerating (W2 follow-up — OWED)
- Jun 12 fix suppressed the symptom in 3 places (`chatPanelHeader.ts`, `chatPanelEmptyState.ts`, `chatPanelHtml.ts`) — but the CAUSE (logger writing `.redivivus/` into the projects container) is still live.
- **Action:** find where the logger initializes against workspace root without checking `isProjectsContainer()`, and route home-level logs to `~/.redivivus/` instead.

## C.2 Build/fix binary taxonomy — bypasses are stacking
- Tactical bypasses: `chatPanelMsgSendBuildIntent.ts` (`skipComplex=true`) and `chatPanelMsgSendMessage.ts` (`fromBlueprintCard` → straight to build).
- Real fix specced in REDIVIVUS_FEATURES.md "In-project operation taxonomy" (build / add / edit / remove / fix).
- **Related:** backend `/chat` classifier has NO `run` action, so keyword-"run it" regex in `chatPanelMsgSendKeywords.ts` is load-bearing. Add `run` to backend classifier, retire regex.

## C.3 Panel lifecycle: 4 overlapping race guards for one race
- `src/extension.ts:237-332` uses: deserializer sentinel, `ChatPanel.suppressAutoOpen` (sync), `redivivus.suppressAutoOpen` (async globalState), `wasProjectClosedRecently()` (sync marker), `redivivus.userClosedProject` (async), plus `setTimeout` at 150/200/500/1200ms.
- **Action:** extract single `panelLifecycle.ts` module owning ONE source of truth.

## C.4 Window-swap choreography duplicated 3×
- `forceNewWindow: true` + `setTimeout(closeWindow, 1000)` in `chatPanelMsgProjectOps.ts:72-73`, `:97-98`, and `ensureProjectsWorkspace.ts:84-85`.
- **Action:** extract `reopenAsCleanWorkspace(uri)` helper.

## C.5 Two different exported `runProject` functions
- `src/core/project/runProject.ts` (interactive: terminal + browser) and `src/services/build/runtimeRunner.ts:85` (verification: 8s spawn + kill-group) both export `runProject`.
- **Action:** rename runtimeRunner's to `verifyRuns()`.

## C.6 `runProject.ts` private-access + fixed-delay error monitoring
- `src/core/project/runProject.ts:37-49` — fixed 3s/8s `setTimeout`, reads "last terminal error" (race-prone), accesses `ChatPanel.currentPanel['_panel']` private field, lazy `require()` mid-function.
- **Action:** expose public `ChatPanel.injectTerminalError(err)` API; poll terminal-error service with deadline.

---

# PART D — RIGOPS BUGS

## D.1 Race condition: `_selected_id()` re-fetches from DB by cursor index
- **Files:** `rigops/panels/admin/feedback.py:79-85`, `access.py:103-109`
- **Bug:** `_selected_id()` runs a fresh SELECT and picks `rows[cursor_row]["id"]`. If table changed between load and click, index points to WRONG row.
- **Impact:** Clicking "Resolve" on item #3 might mark item #5.
- **Fix:** Store actual row IDs in DataTable `row_key` or parallel `_row_ids` list.

## D.2 Double-counting in analytics
- **File:** `rigops/panels/admin/analytics.py:125-126`
- **Bug:** Backend `build/route.ts:816-818` inserts `ai_build` event. Extension's `logTelemetry` (for ai_prompt) also fires. A single build generates 3-4 telemetry rows.
- **Fix:** Backend stops inserting its own `ai_build` telemetry; extension owns all telemetry. OR add `request_id` and deduplicate in analytics.

## D.3 Error tab is noisy — flags non-error events
- **File:** `rigops/panels/admin/errors.py:59-62`
- **Bug:** `"error" in ev.lower() or "fail" in ev.lower()` matches `guardian_catch`, `classify_intent`, etc.
- **Fix:** Only show rows where `m.get("success") is False` or `m.get("error")` is truthy. Remove string matching.

## D.4 `_active_since()` queries full table repeatedly
- **File:** `rigops/panels/admin/analytics.py:134-138`
- **Bug:** Called 3 times (30d, 7d, 1d) — each fresh SELECT over all activity_logs.
- **Fix:** Single query with `distinct on`, or add `last_activity_at` to `profiles` table.

## D.5 No admin action audit trail
- **File:** `rigops/panels/admin/shared.py:34-41`
- **Bug:** Admin actions logged without `admin_user_id`. Multi-admin setups can't tell who did what.
- **Fix:** Add `actor_id` to `_log_event` calls.

## D.6 Notifications tab: O(N) user lookup
- **File:** `rigops/panels/admin/notifications.py:74-79`
- **Bug:** Fetches ALL users then filters by email in Python.
- **Fix:** Query `profiles` with `.eq('email', to).single()`.

## D.7 Analytics "Provider" shows model names, not providers
- **File:** `rigops/panels/admin/analytics.py:163-167`
- **Bug:** `m.get("model")` returns `"claude-haiku-4-5-20251001"` — model ID, not provider name.
- **Fix:** Extension should send `provider: "claude"` alongside `model` in telemetry. Or map in rigops.

## D.8 No data retention / cleanup
- `activity_logs`: 909 rows, ~50/day, 18K/year. No cleanup policy.
- **Fix:** Add `cleanup_old_logs` function (Supabase cron or rigops button) for 90-day retention.

---

# PART E — MISSING ADMIN FEATURES

| # | Feature | Why it matters |
|---|---|---|
| 1 | **IDE version rollout dashboard** | Who is on what version, who is a straggler. Currently impossible (expired tokens = anonymous data). |
| 2 | **Dead provider alerting** | Backend knows 3/6 are dead. Rigops should show red alert: "Builds may fail." |
| 3 | **User journey / churn risk** | Sign-up → first key → first build → last build → days idle. Flag churn risks and power users. |
| 4 | **Build failure analysis** | Success rate per user, per project type, common error patterns. Use `guardian_catches`. |
| 5 | **Feature flag targeting** | Per-user / per-segment / percentage rollout. Currently global on/off only. |
| 6 | **Force sign-out / token revoke** | Compromised token, security update, auth flow testing. |
| 7 | **In-app announcement system** | Admin writes message → extension polls `notifications` table → toast to all users. Table exists, extension doesn't read it. |
| 8 | **Guardian catch review** | Approve/reject patterns before injection into `community_gotchas`. Currently auto-approved. |
| 9 | **Waitlist approval tracking** | Approved but never signed in, signed in but never built, time-to-first-build. |
| 10 | **Cost / token burn monitoring** | Per-provider pricing × tokens = daily/weekly spend estimate. |

---

# PART F — CODE QUALITY DEBT (measured at v0.4.7)

| Metric | Count | Worst offenders |
|---|---|---|
| Files > 200 lines (Rule 9) | 16+ | `cloudBuildClient.ts` 371, `extension.ts` 363, `surgicalEditService.ts` 317, `chatPanelMsgFix.ts` 301, `chatPanelMsgFixEscalation.ts` 299 |
| `: any` annotations | 345 | Heaviest around ChatPanel casts |
| `TODO/FIXME/HACK` | 107 | Sweep into FEATURES backlog or delete |
| Silent `catch {}` | ~108 | Build/run pipelines should at least `debugLog` |

- **`(ChatPanel as any)` pattern:** external code mutates private state directly. **Action:** add public methods (`ChatPanel.resetToLauncher()`, `ChatPanel.claimInstance()`) and kill casts.
- `runtimeRunner.ts:100` hardcodes `PORT: '3000'` — collides with other projects. Pick a free port.
- `chatPanelHeader.ts` is 220 lines — split still owed per Jun 12 fix log.

---

# PART G — DOCUMENTATION DRIFT

1. **`CHANGELOG.md`** stops at 0.4.5 — missing 0.4.6 (auto-update, DeepSeek, `.rdvkeys`, providerTierState) and 0.4.7 entries.
2. **`REDIVIVUS_ROADMAP.md`** — "Last updated 2026-06-10"; 124 lines vs its own 80-line rule.
3. **`docs/REDIVIVUS_ARCHITECTURE.md:12`** — says `Version: 0.3.84` (actual 0.4.7).
4. **ARCHITECTURE contradiction:** "[WARN] NEVER sync to `~/.vscode/extensions/`" — but `postcompile-deploy.js` deliberately syncs there since Jun 10.
5. **Doctrine contradiction:** `REDIVIVUS_FEATURES.md` "Intent Classifier Improvements" says "[NEXT] Add hardcoded overrides" — opposite of `REDIVIVUS_ADAPTIVE_PLANNING.md` "boundaries not blinders" (regex = blinder).
6. **`plan.md` (repo root) is a fossil** — references OBD1/OBD2 routing that no longer exists. Delete it.
7. **`docs/REDIVIVUS_FIXES.md` is 8,233 lines** — archive pre-June into `docs/archive/`.
8. **Encoding corruption:** `docs/REDIVIVUS_FEATURES.md:32,45` have broken emoji (`###`).

---

# PART H — WORKSPACE HYGIENE

- **Tracked in git, should be removed:** `src.bak/` (old extension.ts + compiled output), ~15 root-level `test-*.js` one-offs, `test-script.js.map`.
- **Untracked clutter:** 8 `.vsix` files (keep latest, move rest to `releases/`), `eslint-report.txt`, `eslint-output.txt`, `madge-report*.txt`, `release.log`, `game-after-start.png`, `fix_rule13.mjs`, `scratch-*.js`.
- Git history is `chore: update <timestamp>` auto-commits every ~10 min — FIXES.md is effectively the only usable history.

---

# PART I — QUICK WINS (DO THESE FIRST)

1. **Fix require path** (`apiClient.ts:149,172`) — one line, fixes Configured AIs immediately.
2. **Add `x-redivivus-user-id` header** + backend read — fixes IDE Version showing "—".
3. **Fix error tab false positives** (`errors.py:59-62`) — removes noise.
4. **Fix `_selected_id` race** (`feedback.py`, `access.py`) — prevents wrong-row updates.
5. **Stop debug logging** (`chatPanelMsgProjectOps.ts`, `extension.ts:303`) — cleans production paths.

---

# PART J — BACKEND FIXES

### J.1 Telemetry endpoint: accept anonymous or header-based user ID
**File:** `redivivus-backend/src/app/api/v1/telemetry/route.ts`
- Read `x-redivivus-user-id` header as fallback.
- If no valid JWT but header present, trust it (telemetry is not security-sensitive).

### J.2 Remove backend-side `ai_build` telemetry insert
**File:** `redivivus-backend/src/app/api/v1/build/route.ts:816-818`
- Extension already logs `ai_prompt` for the same build. Remove duplicate insert to fix analytics double-counting.

---

# PART K — VERIFICATION QUERY (run after fixes)

```python
from supabase import create_client
import os
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

# Should return rows with non-null user_id:
r = sb.table("activity_logs").select("user_id,event,metadata,created_at") \
    .eq("event", "session_start").not_.is_("user_id", "null") \
    .order("created_at", desc=True).limit(5).execute()
print(r.data)

# configured_providers should no longer be empty:
r2 = sb.table("activity_logs").select("user_id,metadata") \
    .eq("event", "session_start").not_.is_("metadata->>configured_providers", "null") \
    .order("created_at", desc=True).limit(5).execute()
for row in r2.data or []:
    print(row["user_id"], row["metadata"].get("configured_providers"))
```

---

# PART L — STILL-OPEN VERIFICATION ITEMS

- [ ] `xprop WM_CLASS` check on Redivivus window — must report `"Redivivus"` (dock-grouping fix).
- [ ] Auto-updater end-to-end test — `resolveCliPath()` finds `bin/redivivus` in real update cycle.
- [ ] Gemini status-bar chip shows "Gemini" with no key configured (distinct from Jun 12 "No AI banner" race fix, which is done).

---

*Audit completed: 2026-06-12 17:55 UTC-4*
*Auditor: Fable 5 (Cascade)*
*For: Claude Code (Opus 4.8) follow-up session*
