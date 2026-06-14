<!-- [SCOPE] Canonical design doc for the Region Map system: paired [REGION:] markers + auto-generated
region index + line-numbered files, so the Supervisor localizes a fix like a mechanic using a repair
manual (index -> chapter -> page), and the Worker edits only that region. Governs build, retrofit, and fix. -->

# Redivivus — Region Map

*Status: design locked Jun 14, 2026. Implementation in phases (see bottom). Canonical source — link, don't duplicate.*

## The principle (why this exists)

A fix/edit is a **targeted operation**, like tinting a car's windows or editing one chapter of a book.
You read the whole thing to understand context, but you **touch only the part the request names** plus
whatever is *directly required* to make that part work. You never rebuild the car to tint a window.

AIs drift — they "improve" things no one asked about. The cure is to make the *scope* explicit and
*navigable* so the Supervisor can point at exactly one area and say "work here, nowhere else."

**Read the whole car, touch only the windows.** The AI still SEES the full file (context); it only
WRITES inside the named region (scope). This doc is about making that boundary visible and enforceable.

## The real prize: don't load the whole book (scaling)

For a small game this is about *precision*. For a **200k-line / huge project** it is about *feasibility*. You
should never have to load an entire 200k file into the model's context just to color one dog brown.

- The **blueprint** (who/what/where/when/why + mechanics) tells you what the program IS and how it behaves —
  *without reading the code*. It's tiny and constant no matter how big the project is.
- The **index** tells you the dog lives in chapter 6, lines 4500-4560.
- So you load **only chapter 6** — the dog's region — edit it, and write it back. The other 195k lines never
  enter the context window.

This is the inversion that makes the rules pay off: **blueprint to understand, index to locate, region to
load.** The structure people think of as a burden (no flat files, [SCOPE], regions, an index) is exactly what
makes a huge project *cheap and fast* to edit — small, bounded context instead of "stuff the whole repo in and
hope." The bigger the project, the bigger the win.

(Today the Supervisor still receives the full numbered file. That's fine for small games and is the foundation;
region-scoped loading — Supervisor sees index+blueprint only, then just the target region is loaded for the
Worker — is the dedicated scaling phase below.)

## The repair-manual model

| Manual | Our artifact | Where it lives |
|---|---|---|
| Index in the back ("Brakes ... p.214") | **Region index** (table of contents) | Auto-generated, handed to the Supervisor |
| Chapter headings ("Ch.7: Brake System") | **`[REGION: ...]` paired markers** | In the file itself |
| Page numbers | **Line numbers** | Added when we send the file to the AI |
| Exploded schematic | **Blueprint** (mechanics contract) | Already exists |

One convention, four payoffs: **chapters** (markers), **index** (fast localization), **page numbers**
(precise citing), and **stable surgical anchors** (markers are text that never drifts).

## The convention

**Paired, entity-level markers in language-correct comment syntax (Rule 7):**

```
// [REGION: FROG] sprite, colors, movement, draw -- the player
let FROG_SPRITE = [ ... ];
function drawFrog() { ... }
// [/REGION: FROG]
```

- **Paired** (`[REGION: X]` ... `[/REGION: X]`), not a lone header — the closing tag makes the boundary
  literal, so "do not touch the engine" is enforceable and the index can compute a line span.
- **Entity / concept granularity**, not per-function: `FROG`, `VEHICLES`, `WATER`, `HUD`, `INPUT`,
  `GAME_LOOP`, `COLLISION`, `COLORS`. Coarse enough to stay stable across edits, specific enough to pinpoint.
- **Name + one-line description** on the opening tag. UPPER_SNAKE token, then a short purpose blurb.
- **Syntax per language:** `// [REGION: X]` (JS/TS), `<!-- [REGION: X] -->` (HTML), `/* [REGION: X] */`
  (CSS), `# [REGION: X]` (Python/Shell/YAML). A self-contained HTML game uses the comment syntax of the
  block it sits in (CSS markers in `<style>`, JS markers in `<script>`, HTML markers in the body).
- **Where boundaries go is an AI judgment** (Rule 18 — AI for understanding). Code only writes/scans markers.

## The region index (free + self-maintaining)

The index is **derived from the markers by a pure scan** — no extra AI call:

```
REGION INDEX (table of contents):
  COLORS      L182-199   palette constants
  HUD         L218-256   score / lives overlay
  VEHICLES    L320-410   cars, trucks -- road hazards
  FROG        L471-540   sprite, colors, movement, draw -- the player
  WATER       L600-680   logs, lily pads, river
  GAME_LOOP   L700-760   update + render tick
```

Because it's regenerated from the live markers on every fix, it can never go stale as long as the markers
are preserved. It is the *same source of truth* as the chapters and the surgical anchors.

This **extends the existing `fileSkeletonBlock`** ("FILE ARCHITECTURE", built from `[SCOPE]` lines) from
file-level to within-file region-level.

## Three touchpoints

### 1. Build generator (new projects are born navigable)
The build Worker lays down `[REGION:]` markers as it writes code. Mechanism: the shared annotation rule in
`redivivusWorkerRules.ts` (backend) — already injected into every Worker — gains a `[REGION:]` clause, so
new files get chapters automatically.

### 2. Retrofit (existing/imported "books" printed without chapters)
`retrofitService.ts` already adds `[SCOPE]/[TODO]/[WARN]` via AI with backup + opt-in. Extend its prompt
(`retrofitService.ts:121`) to also add `[REGION:]` markers. Assist Mode still leaves code untouched.

### 3. Fix pipeline (where it pays off)
- **Supervisor — localize-first contract:** before prescribing, it must name the `[REGION]`(s) the request
  touches and declare every other region OFF-LIMITS ("DO NOT TOUCH: WATER, VEHICLES, HUD"). Default to a
  surgical edit of the named region. Full-file is allowed ONLY with a stated basket-case reason
  (file unparseable, user imported a broken app). It receives the **region index + line-numbered files**.
- **Worker — region-anchored surgical:** the `<search>` block anchors on the stable `// [REGION: FROG]`
  line, which never drifts — this is the technical jackpot that kills "search block didn't match." Edits
  stay inside the named region; markers are preserved.
- **Guardian — boundary enforcement:** an edit landing outside the named region(s) is a scope violation it
  can reject. Boundaries become checkable, not a polite request.
- **Maintenance:** every fix preserves all `[REGION:]`/`[/REGION:]` tags (extends Rule 1 / annotation rules).

## Existing hooks we build on (no greenfield)
- `redivivusWorkerRules.ts` (backend) — shared annotation rules -> add `[REGION:]` clause (hits build + fix).
- `fix-supervisor/route.ts` `buildSupervisorPrompt` — `fileSkeletonBlock` -> region index; number `filesBlock`.
- `SUPERVISOR_SYSTEM` (same route) — add the localize-first contract.
- `retrofitService.ts:121` — add `[REGION:]` to the retrofit annotation prompt.
- Skeleton-first build (`X-Skeleton-Meta`) — markers ride along as code is written.

## Honest constraints
- **Imported projects get comments injected.** Consistent with retrofit today (backup + opt-in). Assist Mode untouched.
- **Very large single files** still stress surgical matching; region anchors mitigate it, and the real long-term
  remedy is splitting the file into panels. Region markers make that split easier later (chapters become files).
- **Visual blindness** (separate gap): "make it look real" is an aesthetic ask the Supervisor reasons about
  without seeing the rendered game. Deferred — tackled AFTER the region map (feed a frame later).

## Implementation phases
1. **Convention + shared rule** — `[REGION:]` clause in `redivivusWorkerRules.ts` (emit on build, preserve on
   fix, anchor surgical SEARCH on markers). Foundation; one shared file, both pipelines.
2. **Region index + line numbers** — fix-supervisor: scan `[REGION:]` into a region index (replaces/augments
   the `[SCOPE]` skeleton); number the lines in `filesBlock`.
3. **Supervisor localize-first contract** — `SUPERVISOR_SYSTEM`: name region(s), DO NOT TOUCH the rest,
   surgical-default, full-file-must-justify.
4. **Guardian boundary check** — reject edits outside the named region(s).
5. **Retrofit** — add `[REGION:]` to the retrofit annotation prompt; validate on frogger.
6. **Build validation** — build a fresh small game, confirm it is born with chapters + index.
7. **Region-scoped loading (the scaling phase)** — a region extractor (pull lines start..end for a named region).
   Two-stage flow: (1) Supervisor sees blueprint + index ONLY and names the target region; (2) only that region's
   lines are loaded for the Worker to edit, then written back. Huge files never fully enter the context window.
   This is where the "color the dog on ch.6 p.456 without loading the book" payoff lands.
8. **Visual context** (separate doc) — feed the Supervisor a frame for aesthetic asks.

## Status (Jun 14, 2026)
- Phase 1 (shared [REGION:] rule), Phase 2 (region index + line-numbered files), Phase 3 (Supervisor localize-first
  contract + removed the contradicting "3+ regions -> FULL FILE" rule): DONE on the backend (pending Fly deploy).
- Phase 4 (Guardian rejects out-of-region edits + deleted/moved markers, gated to targeted fixes): DONE on the
  backend (pending Fly deploy). `guardianAIPrompt.ts` regionBoundarySection.
- Phase 5 (retrofit emits [REGION:]; [SCOPE]-only files re-process): DONE on the client (pending compile/deploy).
- Phases 6 (build validation), 7 (region-scoped loading — the scaling payoff), 8 (visual context): NEXT.
