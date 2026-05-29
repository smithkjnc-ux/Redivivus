# Redivivus — Roadmap Index
> [SCOPE] **INDEX ONLY.** Session entries go in `docs/REDIVIVUS_FIXES.md`. Planned features go in `docs/REDIVIVUS_FEATURES.md`. Architecture/rules go in `docs/REDIVIVUS_ARCHITECTURE.md`.
>
> **RULE — NO EXCEPTIONS:**
> - New session fix entry? → `docs/REDIVIVUS_FIXES.md`
> - New planned feature / backlog item? → `docs/REDIVIVUS_FEATURES.md`
> - Architecture change / design rule? → `docs/REDIVIVUS_ARCHITECTURE.md`
> - This file stays under 80 lines. If you are about to make it longer, you are in the wrong file.

*Last updated:* May 29, 2026 — Project export scanner injected into Worker prompt to prevent import hallucinations (Session 11CT)

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

### Session 11CT — May 29, 2026: Project Export Scanner
- Worker was hallucinating imports because it had no map of what the project actually exports
- New `projectExportScanner.ts`: static regex scan (no AI), 25 files × 15 names, excludes target file
- Injected as `PROJECT EXPORTS` block in Worker prompt before vault and existing content
- Attacks hallucination upstream (prevention) rather than relying solely on Guardian (detection)

### Session 11CS — May 29, 2026: Delete Confirmation Gate
- File deletion previously fired silently on AI classify → `fs.unlinkSync` with no confirm step
- `identifyFilesToDelete` extracted from `deleteRequestedFiles` — identify first, delete second
- `showWarningMessage` modal now shows exact files before any deletion proceeds
- Also fixed module-level `/g` regex `lastIndex` statefulness in the identification path

### Session 11CR — May 29, 2026: AI-Driven Context Window Selection
- Replaced hardcoded `slice(-10).map(m.content.slice(0,300))` with `selectRelevantTurns` — AI picks which turns matter
- New module: `src/core/ai/contextSelector.ts` — short convs skip AI, long convs use cheap AI call, fallback = last 6
- Wired into Q&A path (`chatPanelAI.ts`) and build Supervisor path (`chatPanelBuild.ts`)
- Conversation context now reaches the Supervisor for the first time — was zero before this change

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
