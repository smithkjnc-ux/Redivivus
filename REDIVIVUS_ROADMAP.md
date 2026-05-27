# Redivivus — Roadmap Index
> [SCOPE] **INDEX ONLY.** Session entries go in `docs/REDIVIVUS_FIXES.md`. Planned features go in `docs/REDIVIVUS_FEATURES.md`. Architecture/rules go in `docs/REDIVIVUS_ARCHITECTURE.md`.
>
> **RULE — NO EXCEPTIONS:**
> - New session fix entry? → `docs/REDIVIVUS_FIXES.md`
> - New planned feature / backlog item? → `docs/REDIVIVUS_FEATURES.md`
> - Architecture change / design rule? → `docs/REDIVIVUS_ARCHITECTURE.md`
> - This file stays under 80 lines. If you are about to make it longer, you are in the wrong file.

*Last updated:* May 27, 2026 — Added KNOWN_PATTERN for vw-only responsive layout to prevent repeat AI mistakes

---

## Documentation Map

| File | What goes here | What does NOT go here |
|---|---|---|
| **`REDIVIVUS_ROADMAP.md`** | YOU ARE HERE — index, last 3 sessions summary, doc pointers | Session fix tables, backlog items, design rules |
| **`docs/REDIVIVUS_FIXES.md`** | Every session entry — what changed, why, risk | Planned features, architecture specs |
| **`docs/REDIVIVUS_FEATURES.md`** | Backlog, planned work, What's Working, Competitive Gap | Fix history, architecture details |
| **`docs/REDIVIVUS_ARCHITECTURE.md`** | Design rules, project info, deployment steps, source file map | Fix history, planned features |
| **`docs/REDIVIVUS_VISION.md`** | Product vision, monetization, P2P/LLM strategy | Anything operational |

---

## Recent Sessions (last 3 — full entries in `docs/REDIVIVUS_FIXES.md`)

### Session 11BJ — May 27, 2026: Remove Workspace Creation
- Stopped creating `.code-workspace` files when opening or scaffolding projects
- Replaced `vscode.openFolder` on `.code-workspace` with `vscode.openFolder` directly on directory paths
- Affected files: `chatPanelMsgProjectOps.ts`, `messageRouterWizard.ts`, `chatPanelShow.ts`, `projectOperations.ts`

### Session 11BI — May 27, 2026: Cloud Vault + Templates + Architecture Diagram
- Migrated 10 templates from GitHub to Supabase `templates` table
- New backend endpoints: `GET/POST /api/v1/vault`, `GET /api/v1/templates`
- New Supabase tables: `vault_items`, `templates`, `vault_community`
- New extension files: `vaultCloudSync.ts`, `templateCloudService.ts`
- New admin pages: `/admin/vault`, `/admin/templates`, `/admin/architecture`
- 13/13 tests passing

### Session 11BH — May 26, 2026: Thin Client Architecture + Backend Deploy
- Rewrote `chatPanelBuildRunner.ts` — hard auth gate, delegates to `callCloudBuild()`
- New cloud: `buildPipeline.ts` (secret sauce), `/api/v1/build`, `/api/v1/telemetry`
- Lazy-init Supabase client in all 6 backend route files
- Added `vscode.UriHandler` for deep-link auth (`vscodium://papajoe.redivivus/auth`)
- Fixed SecretStorage silent failure on Linux with in-memory `_cachedToken` fallback
- Renamed CHASSIS → Redivivus across all 430 source files

### Session 11BK — May 27, 2026: Webview Click Handler Stability Fix
- Fixed text-node click target normalization in `chatPanelScript*.ts` to prevent `.closest()` exceptions
- Restored functionality of the "Open Project" button and Recent Projects list inside the empty state
- Resolved silent click swallowing across all Chat Panel interactive elements

---

## Active Next Steps
> Full backlog in `docs/REDIVIVUS_FEATURES.md`

- [ ] **Vault sync command** — wire `vaultCloudSync.ts` to `redivivus.syncVaultToCloud` palette command
- [ ] **Live Preview** — `▶ Preview` tab with device toggle (IN PROGRESS)
- [ ] **Community vault** — admin approval flow for submitted patterns
- [ ] **Template library expansion** — grow from 10 → 50+ starters

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
