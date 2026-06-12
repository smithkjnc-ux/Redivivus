# Redivivus — Adaptive Planning & Guidance Allocation
> [SCOPE] Living design doc for how the Supervisor allocates guidance to the Worker. The central
> unsolved problem of the build pipeline: how much to plan vs. let the Worker decide, given the Worker's
> capability and the sub-problem's risk. Update the STATUS section as each phase ships.
>
> *Status: DESIGN — not yet implemented. Last updated: Jun 11, 2026.*

---

## 1. The Problem (the quandary)

A heavy, exhaustive Supervisor prescription is slow (~8k tokens, 2–3 min), expensive (the plan costs as
much as the build), and wasteful on the *easy* parts a Worker would nail anyway. But a light plan shifts
decisions to the Worker — and a **weak/cheap Worker makes bad decisions on hard problems**. Lower-tier
models have basic abilities that "just work," but complex/novel logic needs guidance.

So the real question is NOT "light plan vs heavy plan." It is:
**how do we spend a fixed guidance budget where it actually changes the outcome — for THIS Worker?**

This is new territory (open research in AI agent design). The goal is to get it *progressively* correct
via shippable, measurable stages — not to guess a perfect plan depth upfront.

---

## 2. Core Principles

### P1 — Guidance ∝ expected failure cost, not complexity alone
> **Guidance(piece) ∝ P(this worker gets it wrong) × Impact(if it's wrong)**

- **P(wrong)** = the *interaction* of (piece novelty/trickiness) and (worker capability). A flash model
  writing flexbox: P≈0. A flash model writing SRS wall-kick rotation: P≈high. Sonnet writing that same
  rotation: P≈low. Difficulty AND model tier together — never either alone.
- **Impact** = how much one failure breaks. A wrong game-loop or core data structure poisons everything
  downstream; a wrong color is cosmetic. Central, load-bearing pieces earn detail even at moderate P.

The Supervisor's job becomes **triage**: spend almost the whole detail budget on the few high-(P×Impact)
pieces; one line everywhere else.

### P2 — Be strict about the SEAMS, flexible about the SURFACES
Multi-piece programs rarely break because a function is internally wrong. They break at the **interfaces**
— the contracts between pieces (constructor signatures, shared state shape, event names). That is the
failure class that killed early multi-file builds.

- **Contracts/interfaces between pieces → ALWAYS strict** (cheap: a few lines per seam; prevents the
  N² integration-bug class). Exact signatures, exact shared-state keys, exact event names.
- **Piece internals → adaptive (P1)** — let a capable Worker implement however it wants, *as long as it
  matches the contract*.

This is "design the interfaces, let the teams build the modules." It scales to big programs because the
strictness targets the part that doesn't scale (the interactions), not the part that does (the surfaces).

### P3 — Plan for cheap RECOVERY, not for certainty
Don't guarantee correctness by planning harder (expensive, and it still failed — the truncated Tetris).
Get *close* with the plan; get *correct* with a feedback loop (write → run → observe → fix). A light plan
is only dangerous if there's no cheap way to catch what slips through. Build the safety net and light
plans become safe — for any model tier:
- **Deterministic verification (free):** parse/terminate/contract-match checks (already started:
  `checkWorkerOutput`). Zero AI cost.
- **Run-it loop (highest leverage):** generate → run in Preview → capture runtime error → fix.
  Catches bugs no plan can anticipate, regardless of Worker tier. Pieces exist: `runtimeRunner.ts`,
  `previewErrorService.ts`, the Preview pane.
- **Selective escalation:** when a piece fails verification, escalate THAT piece to a stronger model —
  not the whole build. Pay top-tier prices only for the ~10% that needs it. Cost-optimal strictness,
  applied reactively instead of pre-paid everywhere.

---

## 3. How the Supervisor estimates P(wrong) — three escalating sophistications

1. **Supervisor judgment (ship first).** Tell the Supervisor the Worker's model tier (have:
   `modelTierList.ts`). Instruct: *"For each component, rate how likely a [worker-tier] model gets it
   right unaided. Spend exact instructions ONLY where that's low; name the standard approach in one line
   elsewhere."* No new infra.
2. **Capability profiles (next).** Curated per-tier weakness map ("flash: reliable at CRUD/layout/standard
   UI; fumbles state machines, coordinate math, async ordering, parsers, non-obvious edge cases"). Feed as
   ground truth so the Supervisor isn't guessing. Small, high-value, proprietary knowledge asset.
3. **Learned weakness map (the prize).** Instrument every build → record (worker model, component type,
   verify pass/fail). Learn *empirically* which (model × problem-type) pairs fail; feed back into guidance
   allocation. Substrate exists: `learnedMemory` / `dead_ends`. A dataset competitors can't fake.

---

## 4. Plan of Action (phased, shippable, ordered)

> Each phase is independently shippable and de-risks the next. Check off + date as completed.

- [x] **Phase 0 — Streaming `/plan` (DONE Jun 11; backend pending Fly redeploy).** `/plan` is now a
      streaming endpoint: keep-alive (no false timeout at any size) + streams the Supervisor plan to the
      Build Activity panel live via `@@RDV_STEP@@`/`@@RDV_CODE@@` frames, final `@@RDV_RESULT@@` carries
      files+prescription. `/build` reuses it (one Supervisor call) and skips its own Supervisor panel step
      when reused (`supervisorReused`). Fixes the double-cost (33¢→~15¢), the timeout, and the frozen screen.
- [x] **Phase 1 — Contract-first guidance (DONE Jun 11; backend pending Fly redeploy).** Supervisor schema
      gained a `contracts` block (the seams: `kind`/`signature`/`sharedState`/`usedBy`) + a top "CONTRACTS
      FIRST" rule (`generateSupervisorPrompt`). Worker prompt reordered to: (1) match every contract EXACTLY,
      (2) then follow component instructions, using judgment where brief (`assembleWorkerPrompt`). Panel's
      readable plan view (`prescriptionToText`) lists the interfaces. This is the "strict seams" foundation
      that makes loosening component depth safe.
- [ ] **Phase 2 — Run-it loop (NEXT).** Wire `runtimeRunner`/`previewErrorService` into generate → run → capture
      runtime error → fix. Makes light plans safe for weak models. *(Do alongside Phase 1.)*
- [ ] **Phase 3 — Worker-tier-aware, risk-proportional depth.** Feed Worker tier to the Supervisor;
      per-component detail ∝ P(wrong)×Impact (Section 3, stage 1). Light on standard pieces, exact on the
      risky-for-this-worker ones.
- [ ] **Phase 4 — Selective per-piece escalation.** Failed-verification piece → escalate that piece only to
      a stronger model. Cost-optimal capability injection.
- [ ] **Phase 5 — Instrumentation + learned map.** Record (model, component-type, pass/fail) on every build
      now (even before using it), so the dataset exists. Later: capability profiles (stage 2) → learned map
      (stage 3).

**First move:** Phase 1 (contract-first) + Phase 2 (run-it loop). Together they make *any* plan depth
safer — the precondition for safely loosening the plan at all.

---

## 5. Skeleton — the structures to build on

> Bare-bones, solid shapes. Refine as we implement; treat as the contract for the contract-first work.

### Prescription shape (extends the current contract)
```
{
  "evaluation": string,
  "filesToCreate": string[],
  "buildSequence": string[],
  "contracts": {                         // [Phase 1] ALWAYS strict — the seams
    "<name>": {
      "kind": "function" | "state" | "event" | "module",
      "signature": string,               // exact: e.g. "new Board(ctx, cols, rows)"
      "sharedStateKeys": string[],        // exact keys other pieces read/write
      "usedBy": string[]                  // which files depend on this contract
    }
  },
  "components": {
    "<name>": {
      "files": string[],
      "risk": "low" | "medium" | "high",  // [Phase 3] Supervisor's P(wrong) for THIS worker tier
      "guidance": string                  // depth scales with risk: 1 line (low) .. exact algo (high)
    }
  },
  "workerTier": "flash" | "pro" | "ultra"
}
```

### Verification result (the recovery loop)
```
{
  "stage": "static" | "runtime",
  "passed": boolean,
  "issues": string[],                     // plain-English (Design Rule 1)
  "failedComponent": string | null,       // [Phase 4] -> escalate THIS piece only
  "escalated": boolean
}
```

### Inputs the Supervisor must receive
- `workerModelTier` (from `modelTierList.ts`) — to estimate P(wrong).
- `capabilityProfile` (Phase 2 of Section 3) — per-tier known weaknesses, once curated.

### Telemetry row (Phase 5 — start collecting now)
```
{ buildId, workerModel, componentName, componentType, risk, verifyStage, passed, escalated, ts }
```

---

## 6. Open Questions / Research Notes
> Append findings here as we build. This is the empirical core; expect it to evolve.

- How well can a strong Supervisor actually predict a weak Worker's failures? (Phase 3 will measure.)
- Where is the crossover — at what build size/complexity does contract-first stop being enough and the
  whole multi-file integration need a heavier hand?
- Does streaming the plan live change the *quality* of plans (does the model "perform" differently when
  streamed)? Watch for it.
- Cost/latency curve: measure tokens+time per phase so "light vs strict" is a data-backed dial, not a guess.

---

## 7. STATUS LOG
- **Jun 11, 2026** — Doc created. Framework + 5-phase plan defined.
- **Jun 11, 2026** — **Phase 0 DONE** (streaming `/plan` + reuse + live plan in panel; `supervisorReused`
  guard in `/build`). **Phase 1 DONE** (contract-first: `contracts` block + "CONTRACTS FIRST" rule +
  Worker honors contracts first). Both backend changes need a **Fly redeploy** to activate; extension
  (client `/plan` stream reader) deployed. **Next: Phase 2 (run-it loop).**
