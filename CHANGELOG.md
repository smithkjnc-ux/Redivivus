# Change Log

All notable changes to the "redivivus" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- **Blueprint Revision System** (`src/types/index.ts`, `blueprintRevisions.ts`, `blueprintService.ts`): Replaced the old "lock blueprint" boolean with a full revision history. Every blueprint save snapshots the previous state as a locked `BlueprintRevision`. The current blueprint is always editable. Reverting a fix creates a new revision — history is never destroyed.
- **Hybrid Deep Fix** (`chatPanelMsgArchitectDeepFix.ts`, `chatPanelRendererArchitect.ts`): Architect Review now offers **Fix All** (light edit pipeline, fast) and **Deep Fix** (full Supervisor→Worker→Guardian with retry loop, high quality). Users choose speed vs. correctness per review.
- **Blueprint Evolution Context** (`chatPanelMsgFixBuildCtx.ts`, `chatPanelEditBuild.ts`, `chatPanelAI.ts`): Fix, edit, and Q&A pipelines now feed the AI the current blueprint plus a condensed history of the last 5 revisions. Annotation-based understanding: ~200 tokens of structured metadata vs. 50K+ tokens of raw codebase.
- **Setup Progress Auto-Completion** (`setupProgressSteps.ts`, `session.ts`): After first build, 8 of 10 setup steps auto-complete (project init, blueprint, rules, scan, build, health baseline, save point). Only architecture map and first session require user action.
- **Test All Keys** (`apiSetup.ts`, `apiSetupScript.ts`, `apiSetupHtml.ts`): API Setup panel now has a "🔍 Test All Keys" button that pings each configured provider's `/v1/models` endpoint (no tokens consumed) and shows per-provider ✓/✗ status in real time.
- **Kimi endpoint auto-detection** (`services/ai/kimiEndpoint.ts`, new): Moonshot runs two non-interchangeable platforms — `api.moonshot.ai` (international) and `api.moonshot.cn` (China). New helper probes both, caches the working base per-key, and is used by chat, streaming, balance, validation, and diagnostics. Handles both key types with zero configuration.

### Fixed
- **Build Activity failover errors** (`chatPanelBuildRunner.ts`): Backend failover steps carried raw truncated JSON error blobs (e.g. `400 {"type":"error"...`). The `onStep` callback now detects failover status and replaces the raw label with a clean human reason via `describeProviderError()`. User sees "out of API credits" instead of unreadable JSON.
- **Setup step 5 scan honesty** (`session.ts`): Instead of faking `lastScan` with a timestamp, the first build now runs a real `scanDirectory` + `buildAnalysis` so `scanResults` actually exist when the step shows "complete".
- **Fix context caching** (`chatPanelMsgFixContext.ts`): Added 30s TTL cache on static fix context (blueprint evolution, dead ends, project rules). Batch operations (Deep Fix) no longer re-read the same files per fix.
- **Panel context O(n) scan** (`chatPanelPublicAPIRefresh.ts`): Replaced full-conversation scan with `slice(-3)` — O(1) bounded check on every refresh.
- **OpenAI key truncation on re-entry**: the masked API-key field (shown as `••••`) was not cleared on focus, so re-typed keys appended to bullets and saved truncated → silent 401s. Added a focus-to-clear handler (`apiSetupScript.ts`) and `.trim()` on save.
- **Key validation read source** (`core/diagnostics/selfDiagnosticChecks.ts`): `checkApiKey`/`checkProviderReachable` read from old `settings.json` instead of SecretStorage, so every provider falsely reported "No API key configured". Now reads from SecretStorage.
- **Validation network layer**: switched the provider ping from `fetch` to Node's `https`/`http` module for reliable behaviour in the extension host.
- **Provider error messages**: 401/403/400 results now surface the provider's actual JSON error (e.g. xAI "team has no credits") via a new `extractProviderError` parser, instead of a generic "API key invalid or missing permissions".

## [0.4.5] — 2026-06-10

### Fixed
- **Sidebar visibility**: `redivivusSidebar` (Redivivus Menu) changed from `"hidden"` to `"collapsed"` — view was completely absent from sidebar after fresh install.
- **postcompile deploy gap**: deploy script now syncs to both `~/.vscode/extensions` and `~/.redivivus/extensions`; previously the post-rebrand extension location never received compiled output.
- **Installer pkill crash** (`set -e`): replaced `pkill -f "codium" && pkill -f "redivivus"` with a single path-based `pkill -f "$HOME/.local/opt/redivivus" || true` — name patterns could match the installer process itself; exit code 1 aborted the script.
- **Extension registry stale entries**: `extensions.json` is now unconditionally reset to `[]` before every VSIX install — stale entries caused "please restart VSCodium" error on reinstall.
- **macOS VSIX install path**: installer no longer uses the Linux-only path for VSIX installation on macOS.
- **VSCodium Welcome page branding**: `nls.messages.json` patched via `sed` to replace all "VSCodium" strings; `workbench.welcomePage.extraAnnouncements` and `update.showReleaseNotes` set to `false` in default settings.

### Added
- **Auto-updater CLI resolution** (`checkForUpdates.ts`): new `resolveCliPath()` resolves the IDE CLI from `vscode.env.appRoot` — tries `redivivus` first, falls back to `codium`; works on all platforms.
- **`bin/redivivus` symlink** in build root and generated `install.sh` — both root ELF and `bin/codium` wrapper have `redivivus` aliases; `bin/codium` kept for legacy updater compat.
- **Linux desktop file**: `Exec=` now uses `--class=Redivivus`; `StartupWMClass=Redivivus` — correct WM_CLASS override for GNOME dock grouping.
- **`.vscode-oss` → `.redivivus` migration** in installer (step 1c): moves old extension data on upgrade.
- **Export Keys (.env)**: API Setup panel now has a "💾 Export Keys (.env)" button that opens a save dialog and writes all configured keys in `.env` format.

## [0.4.4] — 2026-06-10

### Fixed
- **SecretStorage migration**: after migrating API key to SecretStorage, plaintext key is now deleted from `settings.json` via `cfg.update(..., undefined, ConfigurationTarget.Global)`.
- **Installer session cleanup**: added `rm -rf` of `workspaceStorage` and `globalStorage/papajoe.redivivus` after extension install.
- **extensions.json reset**: unconditional reset to `[]` before every install.

### Fixed
- **Project context**: exiting a session and starting/opening another no longer leaves the previous
  project "stuck in the queue" or the layout stuck on the old project. The context guard now allows
  user-initiated switches, resets on session-end, and follows manually-opened workspaces.
- **Build pipeline** (Session 11DZ audit): install deps before the post-build run check; multi-file
  cloud build no longer silently "succeeds" with 0 files; consistent on-disk file paths in logs;
  security scanner is symlink-safe; reliable timeouts; `runProject` reaps orphaned server processes.

### Added
- **Model-aware token budgeting** (`tokenBudget.ts`): build context is measured against the target
  model's window and trimmed deterministically with a visible "trimmed to fit" signal.
- **Bug reports** now attach environment, build commit, workspace state, and recent builds; report
  content is preserved verbatim (full session logs) end-to-end.

> Full per-change history: `docs/REDIVIVUS_FIXES.md`. Triage index: `docs/REDIVIVUS_DEBUG_MAP.md`.

## [0.0.1]

- Initial release