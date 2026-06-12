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

### The governing line: BOUNDARIES, not BLINDERS
> Rules, structure, blueprint, contracts, verification = **boundaries** (a fence around the field); the AI
> roams freely inside them. Exhaustive prescriptions, interrogating the user for what the AI knows, forced
> mode choices, over-gating, regex-as-understanding = **blinders** (narrow rails that waste the AI's
> superior knowledge). **Keep boundaries. Remove blinders.**

**Test for anything we add** (a rule, gate, prompt, plan field): *does it constrain the SHAPE of the
output, or the AI's THINKING?* Shape (structure/contracts/verification) → keep. Thinking (dictating every
line, asking what's inferable, forcing a path) → remove.

**Why this protects quality (answers the weak-model worry):** boundaries — contracts pin the seams,
verification catches misses, selective escalation fixes the hard piece — protect quality *without* the
blinders. Trust the AI more, not by hoping but because the fence + safety net catch a miss cheaply.
Quality comes from the guardrails, not from blinding the AI. Every principle below is one expression of
this single line.

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

### P0 — Absorb uncertainty; don't offload it (the governing principle)
> The AI should HOLD uncertainty and resolve it itself, escalating to the user ONLY when the user is the
> unique source of a build-critical answer. Helping ≠ asking — helping = absorbing the complexity. When
> the AI asks a question it could answer itself, it is offloading its own uncertainty onto the user; that
> is backwards for a tool meant to serve non-technical builders.

**Ask the user a question only when BOTH are true:**
1. The AI cannot reasonably infer the answer from the request + general knowledge, AND
2. The user is the *unique* source of that answer AND a wrong guess would materially change the build.

This is the SAME P(wrong)×Impact test as guidance depth (P1) — applied to *questions* instead of *plan
detail*. Style/framework/layout/defaults → the AI picks a good one and lets the user change it after
(P3, recovery-not-certainty). The user's business purpose, their specific must-haves → only they know
those → ask, but ask that ONE targeted thing, never a blanket interview.

**Consequences for the entry flow:**
- **No Auto-vs-Guided mode choice.** Forcing the user to pick *how* they want to be asked questions is the
  worst friction — a meta-question with zero payoff. ONE adaptive path.
- **Default = infer everything → confirm in one glance → build.** The AI fills the 5W by inference, shows
  a confirmable blueprint card ("here's what I understood — Build it / Change something"), and builds. No
  separate 5W interrogation, no "missing WHO/WHAT/WHERE" gate.
- **A question surfaces only for a genuinely unknowable + build-critical dimension** — one targeted ask.
- **"Guided / let me specify" stays as opt-IN** for the rare user who wants to drive — invoked by them,
  never forced on anyone, never the default.
- **Never deadlock the input.** If a gate needs the user's answer, the input bar MUST be enabled.

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
  (client `/plan` stream reader) deployed.
- **Jun 12, 2026** — Added the governing line **"BOUNDARIES, not BLINDERS"** + **P0** (absorb uncertainty).
  **Gating collapse (deployed):** removed the forced "How do you want to work?" popover (defaults to Auto;
  Guided opt-in via header badge); Auto mode now skips BOTH 5W interrogations — the Stage-4 mismatch
  (`chatPanelMsgSendMessage.ts`) and the blueprint gap prompt (`chatPanelMsgSendBuildIntent.ts`). Auto =
  sentence → build, no gauntlet. **Still open:** no-project host-reload kills the build (build with a
  folder open for now); make project-open Auto optionally show the confirm card; **Phase 2 (run-it loop).**
- **Jun 12, 2026** — **Strip-down + Limbs plan adopted** (see Section 8). **Step 0 DONE** (`chatPanelMsgSendMessage.ts`:
  commented out Stages 4/5/Adaptive — naked build body = classify -> infer -> confirm -> build). Awaiting user test.

---

## 8. The Strip-Down & Limbs (body-first rebuild) — adopted Jun 12, 2026

> The pipeline grew too many overlapping "clothes" (gates, wizards, mode choices, 3 question-systems, a
> parallel fix pipeline, and TWO build bodies). User mental model: **strip to the naked conversational body,
> then dress back only layers that pass the test — "would Claude, in a chat, make you fill out a form for
> this?" If no, it does not go back on.** Old code is **commented out, not deleted** (`[DEAD][STRIP-0]`).

**Body decision:** the **new streaming `/plan` pipeline** is the one body. Legacy `supervisorOrchestrator.ts`
(createPlan/executeStep/reviewOutput text-prompt path) retires in Step 1.

**The body = skin + skeleton.** Skin = the conversation (understand -> infer -> confirm in one glance ->
build). Skeleton = the build engine (classify -> infer -> confirm -> plan -> build -> review). The skeleton
is invisible but part of the body, like tool-use under a chat. The gates were bad *clothing* over the skin.

### Sequence (test between every phase; nothing deleted)
- [x] **Step 0 — Naked body.** Commented out the 3 extra pre-build AI stages (Five W's diagnostic, Visual
      Spec, Adaptive complexity routing) in `chatPanelMsgSendMessage.ts`. Build path now fires only the 2
      load-bearing AI calls: `cloudChat` (classify) + `inferBlueprintFields` (confirm card). *Awaiting test.*
- [ ] **Step 1 — One body.** Retire legacy `supervisorOrchestrator` text-prompt path; route `orchestratedBuild`
      to the streaming `/plan` pipeline. Comment out, keep as fallback until proven.
- [ ] **Step 1.5 — REATTACH LIMBS** (the agent's tools, cheapest-power-first). Today's agent has only
      read_file/write_file(full-overwrite)/run_command(15s exec!)/ask_user/list_dir/read_file_lines + web
      search + MCP, and these are **quarantined** in a rarely-triggered "agent mode" — normal builds get NO
      tools. Peer VS-based editors (Cursor/Windsurf/Cline/Roo) give their agent all of the below on every
      task. Reattach to the ONE body, in order:
      1. **`read_diagnostics`** — read VS Code Problems panel (TS/lint/compile). Native, FREE, zero AI
         tokens. Unlocks write -> check -> fix loop. `getDiagnostics` already used by the fix pipeline
         (`chatPanelMsgFixContext.ts`) but the agent has no tool for it. HIGHEST power-to-cost — do first.
      2. **Real integrated terminal** — `createTerminal` + shell integration (already used in 5 files);
         long-running/background commands, live output. Replaces the crippling 15s `child_process.exec`.
      3. **`search_files`** (local ripgrep — VS Code bundles it) + **`list_definitions`** (symbols).
      4. **`replace_in_file`** — wire existing `surgicalEditService.ts` as a tool (diffs, not full rewrites).
      5. **`run_vscode_command`** — allowlisted command execution (format, tasks, git, debug).
      6. **Browser/preview console** — runtime + console errors = this doc's Phase 2 run-it loop; lands here.
- [ ] **Step 2 — One question-system.** Collapse `decisionTriage` + `expandedInterview` + `templateScopeService`
      into a single infer-then-confirm step. Delete the Rule-18 regex fast-paths + the bug-report regex.
- [ ] **Step 3 — Dress up.** Put back ONLY: auth, one cost-confirm (expensive builds), one merged vault-reuse
      check, fix folded into the one body, Guided opt-in. Placement gate / 5W interrogation / mode popover /
      blueprint-gap prompt stay OFF (failed the form test).

### Workspace model (Model A) — the body's workshop
**Governing invariant (PapaJoe, Jun 12):** *Redivivus owns the workspace (= the projects home, default
`~/projects`, changeable via `redivivus.projectsDirectory`, established once at first install); the user
works in **folders** inside it.* That way **VS Code always sees the projects home as THE workspace and never
as "another folder"** — so the workspace identity never changes → no host reloads, no "Untitled (Workspace)"
churn, no project-vs-folder confusion. This one invariant kills the whole class of bugs (reload-wipes-build,
untitled multi-root, chat-doesn't-see-project). The heal (`ensureProjectsWorkspace.healUntitledProjectsWorkspace`)
exists only to *enforce* it. (Open follow-up: changing the setting AFTER first install doesn't auto-migrate
the home yet.)

**Decision (Jun 12):** the workspace is the **parent** `~/projects`; each project is a **subfolder**. Open
once, never switch, never reload. (Model B — project == workspace — was rejected: switching projects reloads
the host and wipes builds.) Establish it as a **deliberate first-run step** (after AI keys), default
`~/projects`, with a one-line note; one-time flag so it never re-fires.
- Why it kills the reload bug: the host reload is triggered by the **0-folders → 1-folder** transition. With
  `~/projects` always open we are never at zero, so a build (which only creates a subfolder) never trips it.
- Already half-wired: `getLiveRoot()` (`chatPanelBuildRunner.ts`) treats "workspace root == projects
  container" as "no active project → auto-create a subfolder," which IS Model A behavior.
- [x] **W1 (DONE Jun 12)** — `ensureProjectsWorkspace.ts` + 2 lines in `extension.ts`: first-run establish of
      `~/projects` as workspace root (one idle reload, then sticky). *Awaiting test.*
- [ ] **W2** — Active-project tracking: after a build, the active project = the built subfolder (not the
      workspace root). So follow-up edits/fixes target the right subfolder without re-creating. Then retire
      the remaining `openFolder`-reload paths (`chatPanelBuildSteps.ts:167`, `chatPanelGates.ts:58`) and the
      custom Project-Files-tree workaround (native Explorer always works under Model A).
