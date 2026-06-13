# Redivivus — Intent Architecture & Migration Plan

> [SCOPE] Why Redivivus's intent handling differs from agent-mode editors (Claude Code, Cursor, Windsurf),
> why that difference is the root cause of a whole class of bugs, and a phased plan to fix it WITHOUT
> discarding Redivivus's structure (Workshop pipeline, blueprint, vault, rules). Companion to
> REDIVIVUS_ADAPTIVE_PLANNING.md. Created Jun 13, 2026.

---

## 1. The core difference (one line)

Agent-mode editors **infer intent continuously inside one context-keeping loop**.
Redivivus **classifies intent as a discrete first step, then hands off to a separate pipeline.**
That single choice — *decide-then-dispatch* vs *understand-while-doing* — is the root of most intent bugs.

---

## 2. How agent editors do it

- **No classify step.** The prompt + full context (conversation, files, repo state) + tools (read/edit/run/
  search) goes to the model. It decides what to DO by choosing actions. The category ("build"/"fix") is
  never named.
- "make a frogger game" / "build a frogger game" / "I want a frogger game" all just → it builds. No
  verb-matching; the understanding is the model's, holistically.
- The thing that UNDERSTOOD the request is the same thing that EXECUTES it — **no lossy handoff**.
- Ambiguity → ask inline, then continue in the same context.
- Cursor/Windsurf/Copilot add **mode/model selection** (cheap autocomplete vs big agent; chat vs inline) —
  a UI/cost distinction, NOT an AI classifying the sentence into a routed category.

Intent is **implicit, continuous, and held** — not a label.

---

## 3. How Redivivus does it today

A **router + specialized pipelines** architecture:

1. `chat/route.ts` (`PREPASS_SYSTEM` Haiku pre-pass for tier+typos, then `MAIN_SYSTEM` Phase 2) returns a
   discrete label: `{"action":"build"|"fix"|"answer"|"clarify"|"command"|"personality-picker"}`.
2. The label is decided **before and separately from** execution.
3. Client (`chatPanelMsgSendMessage.ts` → `chatPanelMessages.ts`) routes to an ISOLATED pipeline:
   - build → `cloudBuildClient.ts` → `/plan` (Supervisor prescription + file list) → multi-file
     (`cloudBuildMultiFile.ts`) or single `/build` → Worker per file.
   - fix → `chatPanelMsgFix.ts` → Supervisor diagnoses → Worker → Guardian.
   - answer → text only. command → a VS Code command id.

Each pipeline **re-resolves the project root, re-collects context, and receives only a compressed
hand-forward** (e.g. `/plan`'s prescription is reused by `/build`; the Worker gets a prescription summary +
per-file instructions, NOT the conversation).

> Note: `MessageHandlerDeps` already threads `{routing, conversation, panel, refresh, vault,
> blueprintContext, …}` through handlers — it is the **seed of a shared context** and makes Phase 0 cheap.

---

## 4. The session's bugs were structural, not random

Four "separate" bugs, one root cause (compress intent → label → dispatch):

| Bug (Jun 12–13) | Structural cause |
|---|---|
| `make` ≠ `build` (tutorial instead of build) | A **gate** that can misfire. Agent loops have no gate. |
| "losing something between plan and worker" | **Lossy handoff** — Worker sees the prescription, not the conversation. |
| "all edits aren't fixes — edit/add/subtract" (user insight) | Discrete categories can't hold a **continuum**. |
| build↔fix flip-flop on the blueprint card | Intent is a **re-derivable label**, not a held understanding. |

Patches applied (few-shot classifier, prescription pass-through) live *inside* the classify-then-route
world. They reduce damage; they don't remove the failure class.

---

## 5. The target: soft signal + shared context

Keep the structure; lose the hard gate. Two changes do the heavy lifting:

1. **Intent becomes a HINT, not a router.** The cheap classify call still runs (cost tier, the "Building…/
   Updating…" UX badge, and a fast-path for obvious `answer`/`command` so we don't spin up the Supervisor for
   "how do I center a div"). But for anything touching code it **does not lock a pipeline** — it annotates a
   shared turn and lets the Supervisor (full context) decide the operation.
2. **One shared `TurnContext` flows through every stage.** Created once per user turn; carries the raw
   message, full conversation, active project root, blueprint, vault hits, the classifier hint+confidence,
   and accumulates artifacts (prescription, files, diffs, Guardian notes). Supervisor → Worker → Guardian all
   **read/write the same object** instead of re-deriving from a passed-forward summary. This is what kills the
   lossy handoff.

**The build-vs-fix decision moves INTO the Supervisor**, which can see the project and conversation, so
"an edit is not always a fix" is handled by understanding, not by a sentence classifier (aligns with Rule 18:
AI for understanding, code for execution).

---

## 6. Migration plan (phased, reversible, test between each)

Follows the strip-down method: **comment out old code (don't delete), feature-flag new paths, test + commit
after every phase.** Each phase ships value on its own and can be reverted.

- **Phase 0 — `TurnContext` scaffold (no behavior change). [DONE Jun 13, 2026]** New `turnContext.ts`
  (`TurnContext` = rawMessage, conversation, projectRoot, blueprint, `hint`, `artifacts`). Created at the top of
  `handleSendMessage`, attached to `deps.turnContext` (threads everywhere `deps` flows — build + fix entrypoints
  included, no signature changes). `hint` is recorded at each routing decision (blueprint-card build, bug-report
  fix, post-classify). Verified pure scaffold: in compiled output only the definition + the writer reference it;
  nothing reads/branches on it, so behavior is identical. `tsc` clean, deployed.

- **Phase 1 — Classifier returns `{action, confidence}`.** `MAIN_SYSTEM` emits confidence. Client keeps
  routing on HIGH-confidence build/fix/answer/command; LOW-confidence code requests go to the unified handler
  (Phase 2) instead of guessing. Keep the few-shot. *Test: low-confidence prompts stop misrouting; obvious
  ones unchanged.*

- **Phase 2 — One `handleChangeRequest(turnCtx)` that shares context.** Merge the build + fix entrypoints
  behind one handler that collects context ONCE (`getActiveProjectRoot`, files, blueprint, vault) into
  `TurnContext`, runs the Supervisor ONCE with the FULL turn (conversation + project state), and lets the
  Worker(s) read the SAME `TurnContext` (prescription **and** relevant conversation). *Fixes "losing something
  between plan and worker." Test: a build's Worker has the conversation context; a fix still fixes.*

- **Phase 3 — Supervisor decides the operation.** The classifier stops deciding build-vs-fix; it only
  fast-paths obvious `answer`/`command`. For code, the Supervisor (full context) prescribes operation
  (create / edit / mixed) + files + per-file instructions. The UX badge derives from the Supervisor's
  operation, not the pre-gate. *Fixes "make≠build" and "edits aren't fixes" at the architecture level. Test:
  `make`/`build`/`create` all build; an in-project addition is not forced to "fix".*

- **Phase 4 — Unify apply / Guardian / finalize.** Build and fix currently have separate
  apply→Guardian→finalize. Share them via `TurnContext` so snapshots, vault, dead-ends, build history, and
  the result card are one consistent code path. *Removes duplicate root/handoff logic that caused the
  container-root and cross-project bugs. Test: snapshots/vault/history identical for build and fix.*

- **Phase 5 — Continuous turn (optional, later).** Allow one turn to answer AND change (e.g. "explain X then
  add Y"), since the executor holds context — the real agent-loop benefit, gated to stay inside Redivivus's
  structured UX.

---

## 7. What does NOT change (the structure is preserved)

- **Workshop 7 principles** — Supervisor prescribes, Worker executes, Guardian reviews; failover; multi-Worker
  parallelism; single-model mode. They operate ON the `TurnContext`.
- **Blueprint card, Vault, Dead-ends, annotation tags, plain-English / never-cry-wolf.**
- **BYOK cost routing** — cheap classify + tier selection stay (that's *why* the hint survives).
- **The "Building…/Updating…/Answering…" mode UX** for non-coders — now derived from the Supervisor's chosen
  operation instead of a pre-gate, so the badge is more accurate, not less.
- **All project rules** — 200-line files, NO FLAT FILES, log every change, comment-out via `[DEAD]`.

The agent-loop ideas are absorbed as *boundaries, not blinders* — the same framing as the strip-down work.

---

## 8. Risks & guardrails

- **Big core refactor.** Mitigated by phasing + feature flags + keeping the old router commented (`[DEAD]`)
  until each phase is proven. Never delete the working path before the new one passes.
- **Cost.** Moving build-vs-fix into the Supervisor must NOT spin up the Supervisor for plain answers — keep
  the cheap fast-path for `answer`/`command` (Phase 3 guard).
- **Paradox guard stays.** The unified handler resolves root via `getActiveProjectRoot()` and refuses sibling/
  protected projects (the cross-project fix this session must not regress).
- **Guardian is still string-/contract-certain where it can be** (e.g. the dead-canvas completeness gate); the
  shared context makes "verify against the prescription" reliable because the prescription is right there.

---

*Last updated: Jun 13, 2026 — initial draft + Phase 0 (TurnContext scaffold) shipped. Owner: PapaJoe. Feeds REDIVIVUS_ADAPTIVE_PLANNING.md.*
