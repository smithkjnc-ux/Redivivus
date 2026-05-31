# Redivivus — Roadmap Index
> [SCOPE] **INDEX ONLY.** Session entries go in `docs/REDIVIVUS_FIXES.md`. Planned features go in `docs/REDIVIVUS_FEATURES.md`. Architecture/rules go in `docs/REDIVIVUS_ARCHITECTURE.md`.
>
> **RULE — NO EXCEPTIONS:**
> - New session fix entry? → `docs/REDIVIVUS_FIXES.md`
> - New planned feature / backlog item? → `docs/REDIVIVUS_FEATURES.md`
> - Architecture change / design rule? → `docs/REDIVIVUS_ARCHITECTURE.md`
> - This file stays under 80 lines. If you are about to make it longer, you are in the wrong file.

*Last updated:* May 30, 2026 — Vault auto-capture wired to build pipeline; files from every build now feed the vault (Session 11DW)

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

### Session 11DF — May 29, 2026: Build UX — Auto-reload, Game Quality, Result Card
- Removed forced `vscode.openFolder` after new-project builds — result card already has "Open Project" button; auto-reload fired before user could read anything
- Local fallback SYSTEM prompt now explicitly requires fully playable games (event handlers, game state, win conditions)
- Local fallback narration now shows Builder/Cloud/Cost clearly

### Session 11DE — May 29, 2026: Auto vs Guided Build Modes
- Renamed `'direct'`/`'plan'` → "Auto"/"Guided" across all UI (popover, badge, launcher cards, empty state)
- Added `redivivus.buildMode: "auto" | "guided"` VS Code setting — persists mode across sessions
- Pre-loads setting in message router so mode is applied from first message
- Guided interview: all 5 W questions rewritten (more detailed), style follow-up added, task string improved

### Session 11DD — May 29, 2026: Cloud Build Local Fallback (5xx → Local AI Build)
- Cloud `/build` returns 500 (server framework crash, empty body — unfixable from client)
- Solution: on `status >= 500`, call `runLocalBuild()` — builds using user's own AI keys directly
- `cloudBuildClient.ts` was 291 lines → split into 3 files (170 / 62 / 129)
- New: `cloudBuildResultProcessor.ts`, `cloudBuildLocalFallback.ts`

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
