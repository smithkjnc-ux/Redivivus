<!-- [SCOPE] Design doc — the Living Blueprint: a versioned, behavioral spec the Supervisor reads to make
     informed build/fix decisions. Original spec + an append-only revision ledger of every accepted change.
     Status: DESIGN (no code yet). Owner: PapaJoe + Claude. Created Jun 13, 2026. -->

# Redivivus — The Living Blueprint

## Problem (why this exists)

Today `.redivivus/blueprint.md` holds only the 5 W's — *intent*, not *mechanics*. So when a user says
"it's broken" (vague, which is normal), the fix-Supervisor has **no statement of how the thing is supposed
to behave**. It reverse-engineers intended behavior from the (buggy) code and guesses. That is exactly how the
frogger fix went wrong: the Supervisor invented a fancy "interpolated collision box" theory instead of the real
rule — *a frog can't drown mid-hop; it only drowns if it lands in water with no log under it.*

There is also **no behavioral memory of change**. `build_history.json` logs files+cost, `dead_ends.md` logs
failures, snapshots enable revert — but nothing tells the Supervisor *what the project is supposed to do now*
and *how it got there*. PapaJoe: "the blueprint should contain all edits — fixes, addons, modifications — as
revised blueprints, so the Supervisor can see the original, look at what happened to get to the present, and
make educated decisions."

## The model: head + ledger (like git for intent)

Two artifacts, both behavioral (what the project *does*, never `playerRect`/function names — implementation
detail goes stale on refactor and starts crying wolf):

1. **`blueprint.md` = the HEAD.** The current, reconciled, canonical spec. Always up to date. The 5 W's PLUS a
   `## MECHANICS` contract — a short list of observable rules. This is the cheap, always-loaded source of truth.

   ```
   ## MECHANICS (frogger-arcade-game)   <!-- the HEAD, rev 7 -->
   - Frog moves one tile per arrow press as a short hop animation.
   - River rows: frog rides logs/turtles. It drowns ONLY if it finishes a hop in water
     with no platform under it. It CANNOT drown while a hop is still in progress.
   - Road rows: frog dies on contact with a vehicle.
   - Fill all goal slots to advance level. 3 lives. Score on reaching a slot.
   ```

2. **`blueprint_revisions.jsonl` = the LEDGER.** Append-only. One entry per accepted change — the "git log" of
   intent. This is how the Supervisor sees "what happened to get to the present."

   ```json
   {"rev":7,"ts":"2026-06-13T22:38:00Z","kind":"fix","request":"frog dies on logs in the river",
    "summary":"Drowning now evaluated only after a hop lands, not during the hop.",
    "mechanics_delta":["~ Frog cannot drown while a hop animation is in progress."],
    "files":["index.html"],"by":"gemini","snapshotId":"fix-1781…","cost":0.0042}
   ```

   `kind`: `build` | `fix` | `addon` | `modification`. `mechanics_delta` uses `+` add / `~` change / `-` remove
   so the head can be reconstructed/reconciled and a human can read the evolution at a glance.

`blueprint.md` answers *"what should it do now?"* (loaded in full, it's tiny). The ledger answers *"why is it
like this / what changed recently?"* (loaded selectively). Together: original → revisions → present.

## Generation — AI distills, code stores (Rule 18)

- **At BUILD:** the Supervisor's plan already reasons about mechanics. Distill that into the `## MECHANICS`
  section and write **rev 1** (`kind:"build"`). Code writes the files; the AI only produces the behavioral prose.
- **At each accepted FIX / ADDON / MODIFICATION:** *after* the change applies and the Guardian approves, one tiny
  distiller call (~50–150 tokens) summarizes the change **in behavioral terms** ("describe what observably
  changed, NOT code identifiers") → append a ledger entry, and update the HEAD if a rule actually changed. The
  HEAD is always the reconciled present (deltas are folded in, not just stacked).
- **Never on a failed/rejected fix** — those already go to `dead_ends.md`. The ledger records *accepted* intent
  changes only; dead_ends records what NOT to try. Complementary.

## Consumption — how the Supervisor uses it

`fix-supervisor` and `plan` already receive `context.blueprint`. Expand that payload to:
- the **HEAD** (full `## MECHANICS` — small), plus
- the **last K revision summaries** (compact one-liners; K ~8–12), plus
- on a fix, **relevance-ranked** older revisions that touch the same files/feature (when history is long).

Then a vague "it's broken" becomes *diffable*: "HEAD says no drowning mid-hop; the code evaluates the drown
check every frame including during the hop → that's the regression." The exact thing it missed.

## Guardrails (so it never cries wolf or bloats context)

- **Behavioral, not implementation.** The distiller is prompted to avoid file/function/variable names.
- **HEAD is reconciled, not append-only.** Conflicting deltas update the HEAD; the ledger keeps the trail.
- **Rolling compaction.** Old ledger entries summarize/coalesce so the context cost stays bounded as projects
  age. Full detail stays on disk; only recent/relevant entries enter the prompt.
- **Cross-reference, don't duplicate.** Ledger entries carry `snapshotId` (→ `snapshots/` for revert) and align
  with `build_history.json` by timestamp. The ledger is the *behavioral* layer over the existing *file* layer.

## Phases

- **Phase 0 — storage + helpers.** Add `## MECHANICS` to `blueprint.md`; create `blueprint_revisions.jsonl`;
  read/write/reconcile helpers (`livingBlueprintService.ts`, <200 lines). No AI yet — seed the head manually or
  derive it from build_history so existing projects aren't blank.
- **Phase 1 — build seeding.** Distill the build Supervisor's plan → `## MECHANICS` + rev 1.
- **Phase 2 — revision capture.** After each accepted fix/addon, the distiller appends a ledger entry + folds the
  delta into the HEAD. Hook point: right after the Guardian approves and files are written.
- **Phase 3 — Supervisor consumption.** Feed HEAD + recent revisions into `fix-supervisor` / `plan`. Re-run the
  frogger "it's broken" case and measure: does it now diagnose the mid-hop drown rule directly?
- **Phase 4 — scale.** Relevance-ranked revision retrieval + rolling compaction for long-lived projects.

## Decisions (locked Jun 13, 2026)

1. **Storage = head file + JSONL ledger.** `## MECHANICS` lives inside `blueprint.md` (human-readable HEAD); the
   trail lives in a separate append-only `blueprint_revisions.jsonl` (machine-appendable, queryable).
2. **Distiller = whoever did the change.** Reuse the fix/build Worker (the provider that just made the change) to
   write the ~100-token behavioral summary — it already has the context loaded; no extra routing. (Note: with
   "aces in their places", that Worker was already right-sized to the task, so cost stays proportionate.)
3. **Seeding = retroactive on first use.** The first time a tracked project is touched, distill a starter HEAD
   (`rev 0`) from `build_history.json` + current code, THEN proceed with the requested change. Existing projects
   (frogger) get a spec immediately rather than staying blank.
