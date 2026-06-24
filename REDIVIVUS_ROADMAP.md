# Redivivus — Roadmap Index
> [SCOPE] **INDEX ONLY.** Session entries go in `docs/REDIVIVUS_FIXES.md`. Planned features go in `docs/REDIVIVUS_FEATURES.md`. Architecture/rules go in `docs/REDIVIVUS_ARCHITECTURE.md`.
>
> **RULE — NO EXCEPTIONS:**
> - New session fix entry? → `docs/REDIVIVUS_FIXES.md`
> - New planned feature / backlog item? → `docs/REDIVIVUS_FEATURES.md`
> - Architecture change / design rule? → `docs/REDIVIVUS_ARCHITECTURE.md`
> - This file stays under 80 lines. If you are about to make it longer, you are in the wrong file.

*Last updated:* June 23, 2026 — AI Intent Classifier Hardening: hardened the fallback routing prompt in `chatPanelMsgSendPostCloudHandlers.ts` to strictly route bug reports and imperative commands into the Fix pipeline. Full entries in docs/REDIVIVUS_FIXES.md.

*Prior:* June 23, 2026 — Orphaned Diagnostic Context Restoration: wired `collectFixContext` back into `collectAllFixContext` to restore the primary diagnostic engine (File Tree, Terminal Errors, Browser Runtime Errors) that was disconnected during a Rule 9 file split. Full entries in docs/REDIVIVUS_FIXES.md.

*Prior:* June 23, 2026 — Claude API Temperature Parameter Rejection: stripped the `temperature` parameter from Claude execution calls in `redivivus-backend` to prevent `invalid_request_error` crashes. Full entries in docs/REDIVIVUS_FIXES.md.

*Prior:* 2026-06-14 — Build Contract enforcement (PRIORITY): worker gets full rulebook, quality gate rejects flat games, distillation logged+retried, multi-file decomposition. Canonical: docs/REDIVIVUS_BUILD_CONTRACT.md.

*Prior:* 2026-06-07 — failure message shows prescription + green "Try this fix" button with suggested prompt

---

## Documentation Map

| File | What goes here | What does NOT go here |
|---|---|---|
| **`REDIVIVUS_ROADMAP.md`** | YOU ARE HERE — index, last 3 sessions summary, doc pointers | Session fix tables, backlog items, design rules |
| **`docs/REDIVIVUS_HANDOFF.md`** | OPEN WORK — prioritized to-do with file pointers for continuing the work | Long fix history (lives in FIXES) |
| **`docs/REDIVIVUS_FIXES.md`** | Every session entry — what changed, why, risk | Planned features, architecture specs |
| **`docs/REDIVIVUS_FEATURES.md`** | Backlog, planned work, What's Working, Competitive Gap | Fix history, architecture details |
| **`docs/REDIVIVUS_ARCHITECTURE.md`** | Design rules, project info, deployment steps, source file map | Fix history, planned features |
| **`docs/REDIVIVUS_VISION.md`** | Product vision, monetization, P2P/LLM strategy | Anything operational |

---

## Recent Sessions (last 3 — full entries in `docs/REDIVIVUS_FIXES.md`)

### Jun 10, 2026 (Evening) — Auto-Update Notification System (v0.4.6)
- `/api/version` backend endpoint: env var `REDIVIVUS_VERSION` fast path + GitHub Releases fallback; deployed to Fly.io
- `checkForUpdates.ts`: beta ⚠️ warning message, "What's New" + "Remind Me Later" (4-hour snooze) buttons, `runStartupUpdateCheck()` export
- `statusBar.ts`: `versionItem` badge (Right, 998) — always shows current version, clicks to check for updates
- `extension.ts`: inline 28-line startup check replaced with `runStartupUpdateCheck(context, statusBar)` call (file shrunk to 349 lines)
- Workflow `deploy-ide.yml.disabled`: added `flyctl secrets set REDIVIVUS_VERSION` step for future automated releases

### Jun 10, 2026 (PM) — Linux Branding Overhaul (v0.4.4–v0.4.5)
- Installer fixes: pkill/`set -e` crash, stale `extensions.json`, macOS VSIX path bug, session restore, `.vscode-oss` migration
- Full VSCodium debrand: `nls.messages.json` sed patch, `product.json` all keys, Welcome page suppression
- `bin/redivivus` symlinks at root ELF + `bin/` level; `bin/codium` compat shim kept for legacy updaters
- Desktop `.desktop` file: `--class=Redivivus` + `StartupWMClass=Redivivus` (root ELF, not bin wrapper)
- `resolveCliPath()` in `checkForUpdates.ts` — platform-aware, `appRoot`-relative, tries `redivivus` then `codium`
- `redivivusSidebar` visibility: `hidden` → `collapsed`; postcompile deploy now syncs `~/.redivivus/extensions`
- Export Keys (.env) button moved to Setup Hub panel; save-dialog flow

### Jun 23, 2026 — Session 17: Blueprint Revisions & Setup Rework

**Blueprint Revision System** replaces the old "lock blueprint" boolean. Every save snapshots the previous version as a locked `BlueprintRevision`. Current blueprint is always open. Reversions create new revisions — history is never destroyed.

**Setup Progress Rework**: Steps 6-8 moved from code-health metrics to meaningful milestones (first build, architecture map, health baseline). Steps 1, 2, 3, 4, 5, 6, 8, and 10 now auto-complete on first build. Only step 7 (map) and step 9 (session) require user action.

**Hybrid Deep Fix**: Architect Review now offers "Fix All" (light edit pipeline, fast) and "Deep Fix" (full Supervisor→Worker→Guardian with retry loop, high quality). Extracted to own file per Rule 9.

**Blueprint Evolution Context**: Fix, edit, and Q&A pipelines now feed the AI the current blueprint + last 5 revision summaries (~200 tokens). Annotation-based understanding vs. loading raw codebase.

**Performance Audit**: 30s TTL cache on static fix context; O(n) conversation scan replaced with O(1) `slice(-3)`.

Full entries in `docs/REDIVIVUS_FIXES.md`.

### Jun 3 – May 29, 2026 — Sessions 11DD–16 (archived)
Full entries in `docs/REDIVIVUS_FIXES.md`. Highlights: adaptive blueprint completion, AI breakdown card, auto-continuation on token limit, duplicate panel fix, static validators, full security audit, auth repair, sidebar fixes, cloud build local fallback.

---

## Active Next Steps
> Full backlog in `docs/REDIVIVUS_FEATURES.md`
- [ ] **Vault sync command** — wire `vaultCloudSync.ts` to `redivivus.syncVaultToCloud` palette command
- [ ] **Live Preview** — `▶ Preview` tab with device toggle (IN PROGRESS)
- [ ] **Community vault** — admin approval flow for submitted patterns

---

## Routing: Where to Write

```
Made a code change this session?
  → docs/REDIVIVUS_FIXES.md  (add a table row)

Planning a future feature?
  → docs/REDIVIVUS_FEATURES.md  (add to backlog)

Changed a design rule or architecture decision?
  → docs/REDIVIVUS_ARCHITECTURE.md

Completed one of the active next steps above?
  → Update the checkbox here AND add entry to REDIVIVUS_FIXES.md
```
