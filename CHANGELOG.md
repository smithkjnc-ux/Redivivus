# Change Log

All notable changes to the "redivivus" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

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