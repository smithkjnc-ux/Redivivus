# Redivivus — Handoff / Open Work (as of 2026-06-16)

> [SCOPE] Actionable to-do list for continuing in Windsurf / Antigravity until the next session.
> Full fix detail is in `docs/REDIVIVUS_FIXES.md`. This file = what's LEFT, prioritized, with file pointers.
> When you finish an item: log it in `docs/REDIVIVUS_FIXES.md` and tick it here.

---

## 0. DO THIS FIRST — deploy the backend to Fly

The backend is COMMITTED (`redivivus-backend` @ `01351d3`+) but **NOT deployed**. Last live Fly version was **v162**; two fixes are sitting un-deployed:
- **Classifier JSON recovery** — `src/app/api/v1/chat/route.ts` (recovers `action` from malformed/truncated model JSON instead of mislabeling a build as an "answer").
- **Failover attribution on the `done` frame** — `src/app/api/v1/build/route.ts` (credits the model that actually finished after a failover, not the one that failed).

**Action:** from `redivivus-backend/`, run the Fly deploy (`fly deploy`). **Verify:** rigops SysOp → Sync shows Fly version **> v162**.

The **client** is deployed locally (auto) and committed (`redivivus` @ `970f365`). To test, in the IDE: `Developer: Restart Extension Host`.

---

## 1. Manual model picker — "shown ≠ used"  (HIGH — core promise)

**Symptom:** picked Worker = **Gemini Pro**, build ran **Gemini 2.5 Flash**. The locked model is overridden by tier logic.
**Where:** `redivivus-backend/src/app/api/v1/build/route.ts:261-263` —
```
workerProvider = rs2.getProviderForTier(...)
workerModel    = rs2.getModelForTier(workerProvider, requestedWorkerTier...)
```
This derives the model from the TIER, ignoring a manually-locked worker model.
**Fix:** when the client sent an explicit worker model (manual pick), use THAT instead of `getModelForTier`. Trace how the picked model arrives — `redivivus/src/services/build/cloudBuildClient.ts` sends `preferred`/worker model; confirm `build/route.ts` reads it and prefers it over the tier-derived model.
**Verify:** lock Gemini Pro, build, confirm the "AI Used" card Worker row says Gemini Pro (and Build Activity worker model matches).

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
