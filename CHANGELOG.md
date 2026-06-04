# Change Log

All notable changes to the "redivivus" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

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