# Redivivus — Handoff / Open Work (as of 2026-06-16)

> [SCOPE] Actionable to-do list for continuing in Windsurf / Antigravity until the next session.
> Full fix detail is in `docs/REDIVIVUS_FIXES.md`. This file = what's LEFT, prioritized, with file pointers.
> When you finish an item: log it in `docs/REDIVIVUS_FIXES.md` and tick it here.

---

## 0. ✅ DONE — backend deployed to Fly v164 (2026-06-16 evening)

Deployed commit `01351d3` → Fly release **v164** (was v162). Both fixes are now live:
- ✅ **Classifier JSON recovery** — `src/app/api/v1/chat/route.ts`
- ✅ **Failover attribution** — `src/app/api/v1/build/route.ts`

**Verify in IDE:** rigops SysOp → Sync → confirm version = 164. Then `Developer: Restart Extension Host`.

The **client** is deployed locally (auto) and committed (`redivivus` @ `970f365`). To test, in the IDE: `Developer: Restart Extension Host`.

---

## 1. ✅ DONE — Manual model picker "shown ≠ used" (2026-06-16 evening, Fly v166)

**Root cause:** `build/route.ts` destructured the body but never read `workerModel`. Client sent it; backend ignored it; tier routing won every time.

**Fix (commit b152d33):**
- Added `resolveManualModel(modelId)` — scans `PROVIDER_MODELS` (from `routingTiers.ts`) to map a model ID → provider, checks the user has a key for it.
- Applied in all 3 worker-selection paths: multi-file (`targetFile`), single-file pre-plan reuse, single-file fresh-supervisor.
- Falls back gracefully to tier routing if the model ID is unknown or the key is missing.

**Verify:** Lock Gemini Pro in the picker → run a build → confirm the "AI Used" card Worker row shows **Gemini Pro**, not Flash.

---

## 2. Generated games don't hide the HTML title overlay on start  (MEDIUM — output quality)

**Symptom:** the test Breakout (`/home/papajoe/projects/canvas-breakout-game`) renders the running canvas BEHIND a title-screen overlay that never hides. Title ("BREAKOUT / Press SPACE to Start") stays on top of live play.
**Nature:** defect in the GENERATED output, not Redivivus code. The build/guardian didn't catch a title-overlay ↔ game-phase coordination bug.
**Two options:**
- (a) **Fix via the Redivivus fix pipeline** — good real test of the fix pipeline + region-anchored surgical edits (every file has `[REGION:]` markers now). Prompt: "Hide the title screen overlay once the game starts."
- (b) Edit the generated files directly: `index.html` (title overlay element) + `ui.js`/`renderer.js` (toggle overlay on `phase==='playing'`).
**Consider:** should the quality gate flag "title overlay with no hide-on-play wiring"? Possible build-contract guard. (Lower priority.)

---

## 3. Classifier emits build intent double-encoded as an "answer"  (MEDIUM — root cause)

The recovery in #0 catches the SYMPTOM. The deeper issue: the `/chat` main model sometimes returns the build JSON wrapped/truncated so strict `JSON.parse` fails.
**Where:** `redivivus-backend/src/app/api/v1/chat/route.ts` — main answer call `maxTokens:1024` (line ~193) + `MAIN_SYSTEM` JSON-format instructions.
**Fix idea:** tighten the system prompt to forbid literal newlines inside JSON string values, and/or detect-and-retry on parse failure at the source. Watch the new log line `[chat] strict JSON.parse failed — recovered action=...` after deploy to gauge frequency.

---

## Confirmed WORKING this session — do NOT re-investigate

- ✅ **Region markers** — paired `[REGION:]` emitted in every file of a multi-file build (validated on Breakout).
- ✅ **Multi-file decomposition** — complex build splits into small modules (Breakout = 7 files).
- ✅ **Build-contract validation** — single-file judgment (tip calc = 1 file), no empty folders/files, docs/README + docs/ARCHITECTURE written, runs from `file://`, no TS-in-browser-JS.
- ✅ **Mechanics distillation** — `[LIVING BLUEPRINT] distill OK` fires (was previously broken).
- ✅ **Cost accuracy** — per-role cost + the new **Total** row; multi-file Supervisor row now shows (after restart).
- ✅ **Failover** — gemini → grok-3 automatic failover works; card now credits the winner (after Fly deploy in #0).
- ✅ **Routing container guard** — a new build in `~/projects` now shows the blueprint + creates its own sub-project (was silently routed to fix).
- ✅ **Installer** — `.sh` existing-VSCodium path fixed and LIVE on redivivus.dev.
- ✅ **rigops** — admin suite + analytics committed; logcat `DuplicateIds` crash fixed; welcome-email Back button.

---

## Deferred / backlog (not urgent)

- Region-scoped loading: load ONLY the target `[REGION:]` for huge files (scaling endgame) — see `docs/REDIVIVUS_REGION_MAP.md`.
- Archive `docs/REDIVIVUS_FIXES.md` (now ~1.2MB).
- Test `Redivivus: Show Build Record` (reassembler) on a project with history.
- Visual context for fixes (screenshot → fix).
