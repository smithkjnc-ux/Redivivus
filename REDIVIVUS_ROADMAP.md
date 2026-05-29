# Redivivus — Roadmap Index
> [SCOPE] **INDEX ONLY.** Session entries go in `docs/REDIVIVUS_FIXES.md`. Planned features go in `docs/REDIVIVUS_FEATURES.md`. Architecture/rules go in `docs/REDIVIVUS_ARCHITECTURE.md`.
>
> **RULE — NO EXCEPTIONS:**
> - New session fix entry? → `docs/REDIVIVUS_FIXES.md`
> - New planned feature / backlog item? → `docs/REDIVIVUS_FEATURES.md`
> - Architecture change / design rule? → `docs/REDIVIVUS_ARCHITECTURE.md`
> - This file stays under 80 lines. If you are about to make it longer, you are in the wrong file.

*Last updated:* May 29, 2026 — Cross-session build decision memory: AI extracts decisions after every build (Session 11CU)

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

### Session 11CU — May 29, 2026: Cross-Session Build Decision Memory
- Implicit decisions from back-and-forth ("ok, use JWT") were never stored across sessions
- Added `extractBuildDecisions` to `LearnedMemoryService` — reviews full conversation post-build
- Wired into `runPostBuildActions` non-blocking — every successful build feeds `learned.md`
- Complements existing `extractFacts` (mid-chat explicit preferences) — now both paths are covered

### Session 11CT — May 29, 2026: Project Export Scanner
- Worker was hallucinating imports because it had no map of what the project actually exports
- New `projectExportScanner.ts`: static regex scan (no AI), 25 files × 15 names, excludes target file
- Injected as `PROJECT EXPORTS` block in Worker prompt before vault and existing content
- Attacks hallucination upstream (prevention) rather than relying solely on Guardian (detection)

### Session 11CT — May 29, 2026: Project Export Scanner
- Worker was hallucinating imports because it had no map of what the project actually exports
- New `projectExportScanner.ts`: static regex scan (no AI), 25 files x 15 names, excludes target file
- Injected as `PROJECT EXPORTS` block in Worker prompt before vault and existing content
- Attacks hallucination upstream (prevention) rather than relying solely on Guardian (detection)

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
