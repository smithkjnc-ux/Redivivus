# Redivivus — Roadmap Index
> [SCOPE] **INDEX ONLY.** Session entries go in `docs/REDIVIVUS_FIXES.md`. Planned features go in `docs/REDIVIVUS_FEATURES.md`. Architecture/rules go in `docs/REDIVIVUS_ARCHITECTURE.md`.
>
> **RULE — NO EXCEPTIONS:**
> - New session fix entry? → `docs/REDIVIVUS_FIXES.md`
> - New planned feature / backlog item? → `docs/REDIVIVUS_FEATURES.md`
> - Architecture change / design rule? → `docs/REDIVIVUS_ARCHITECTURE.md`
> - This file stays under 80 lines. If you are about to make it longer, you are in the wrong file.

*Last updated:* June 27, 2026 — PRESCRIPTION_CHECK false-positive fix: condition tightened from "any unwritten file" to "all prescribed files unwritten" — prevents second escalation loop when CSS path-references appear in prescription but don't need writing. Also: static gate dry-run fix. Full entries in docs/REDIVIVUS_FIXES.md.

*Prior:* June 27, 2026 — Static gate dry-run fix: `runStaticCompilationGateForFix` now checks search-block presence in memory before any disk write, eliminating the silent-revert cascade that caused false "Search block not found" compile errors across all escalation retries. Full entry in docs/REDIVIVUS_FIXES.md.

*Prior:* June 26, 2026 — `features/ai/` promoted from `shared/ai/`; 91 files, logic/providers + data. All 17 of 17 features converted. `shared/` reduced to `shared/ui/` only — blueprint target state reached. Migration tracker in `.redivivus/blueprint.md`. Full entries in docs/REDIVIVUS_FIXES.md.

*Prior:* June 26, 2026 — Enforced Rule 9 by extracting and refactoring 8 oversized files in the features/chat routing and build paths to stay under the 200-line hard stop limit. Full entries in docs/REDIVIVUS_FIXES.md.

*Prior:* June 26, 2026 — Fully migrated the codebase to a Hybrid Modular Monolith Architecture. Extracted 573 legacy monolithic files across 3 phases via `ts-morph` AST manipulation. Established highly cohesive bounded contexts (`features/`, `shared/`) and auto-patched static/dynamic runtime imports. Full entries in docs/REDIVIVUS_FIXES.md.

*Prior:* June 25, 2026 — Enforced Bottom-Up Build Sequence and Strict JSDoc Interface Contracts in the Supervisor prompt to prevent API hallucinations in multi-file generations. Full entries in docs/REDIVIVUS_FIXES.md.

*Prior:* June 23, 2026 — Supervisor Architecture Hardening: added strict rules to `SUPERVISOR_CONTRACT_GUIDANCE` to enforce the generation of `package.json` and build systems whenever the AI prescribes a frontend framework. Full entries in docs/REDIVIVUS_FIXES.md.

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

## Recent Sessions
> Full logs live in `docs/REDIVIVUS_FIXES.md`. See that file for details on version updates, architecture changes, and bug fixes.

---

## Active Next Steps
> Full backlog in `docs/REDIVIVUS_FEATURES.md`
- [x] **Vault sync command** — wire `vaultCloudSync.ts` to `redivivus.syncVaultToCloud` palette command
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
