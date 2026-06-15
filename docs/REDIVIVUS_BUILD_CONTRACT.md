<!-- [SCOPE] Canonical doc: the Build Contract & Quality Enforcement system. Structure is a CONTRACT that is
ENFORCED, not decoration that is suggested. A build does not COMPLETE until the contract is met — no empty
folders, no bland blueprints, no flat-fillRect sprites, no "[TODO] later" escape hatches. Rules are gates. -->

# Redivivus — Build Contract & Quality Enforcement

*Status: locked Jun 14, 2026. PRIORITY work until done. Canonical source — link, don't duplicate.*

## Why this is the whole point of Redivivus

The #1 reason AI coding tools frustrate people: **you give them rules and they ignore them.** Cursor was told
absolute rules and refused to follow them. **Redivivus exists so that does not happen.** Rules are not
suggestions the AI may weigh — they are **gates**. A build that violates the contract does not ship with a
warning; it does not ship at all until it complies. No exceptions.

## The disease we found: the hollow shell

Three Flappy Bird builds (same prompt, different supervisors) exposed one root cause:

- **Claude** — rich: animated composite bird (body + flapping wing + eye + beak), gradients.
- **Gemini flash** — `drawBird()` was a SINGLE yellow `fillRect`; pipes/ground were rectangles. The worker rules
  name this exact thing a "build failure" — and it shipped anyway. (It wrote great JSDoc; rendered a box.)
- **Groq** — failed to produce output.

But the deeper finding was the same in EVERY Redivivus build: **the structure is generated as a shell and never
filled.**
- Blueprint = a 5-W's stub (WHO/WHAT/WHERE/WHEN/WHY). **No `## MECHANICS`. No sound. No quality spec.**
- `src/`, `tests/`, `docs/` folders created — **completely empty** (0 lines). All code crammed in one HTML.
- The AI's documentation (JSDoc) trapped inline; `docs/` empty.
- `work_log`, `dead_ends` = template stubs.

Decoration, not contract. The build sets up the frame and walks away.

## The three pillars (the fix)

### 1. Real Blueprint — the contract, not 5 W's
At build time, distill a **MECHANICS + QUALITY contract** from the request (the `## MECHANICS` HEAD the Living
Blueprint already has infrastructure for — it is just never populated):
- **MECHANICS** — behavioral rules: gravity + flap impulse, pipe scroll + gap, collision, scoring, death/restart.
- **QUALITY CONTRACT** — required aspects for this build type. Game -> composite animated sprites (NO flat
  fillRect), gradient background, **Web Audio sound on every interaction**, multi-file structure, responsive.
- **FILE PLAN** — the modules to actually create: `physics.js`, `render.js`, `input.js`, `audio.js`, `state.js`...
This is the HEAD the gate checks against. A bland blueprint is itself a contract violation.

### 2. Real Scaffold — filled, never decorative
- Write ACTUAL multi-file code into `src/` per the FILE PLAN. **NEVER create a folder you do not fill.**
- Record the documentation in `docs/` — the AI's docs land in the scaffold, not trapped inline.
- Emit `[REGION]` markers (wire build-side region map — see REDIVIVUS_REGION_MAP.md phase 1, build half).
- Two rules, both enforced: **NO FLAT FILES** and **NO EMPTY FOLDERS**.

### 3. Real Quality Gate — enforces the WHOLE contract (all aspects, not just visual)
Before a build COMPLETES, check it against the contract:
- **VISUAL** — no entity drawn as a single `fillRect`; composite shapes; gradient bg; no `var(--x)` on canvas.
- **SOUND** — Web Audio present for interactions when the contract calls for it.
- **STRUCTURE** — scaffold files non-empty; multi-file where required; no empty folders; files under 200 lines.
- **DOCS** — recorded in `docs/`, not only inline.
- **REGIONS** — `[REGION]` markers present.
- **COMPLETENESS** — no stub functions, real rAF loop, immediately playable, all spec features present.
A failure does not ship. It escalates and re-does.

## The enforcement model — the anti-Cursor core

1. **Gates, not guidelines.** A rule violation BLOCKS completion. The build is not "done" until it complies.
2. **No escape hatches.** Not "[TODO] add sound later", not "good enough", not "the user can fix it". The
   contract is met or the build is not finished.
3. **Escalation, not surrender.** If the worker cannot meet the bar, size UP the model (capability-aware routing /
   manual model picker) and retry — do not lower the bar to match a weak worker. A weak worker needs the gate
   MORE, not less.
4. **Honest failure.** If it genuinely cannot meet the contract after escalation, tell the user plainly — never
   ship a hollow shell and call it done.

## Phased plan (priority order)
1. **Quality gate on builds** — stops bare-rectangle / hollow builds now; would have caught Gemini's box-bird.
2. **Real blueprint** — distill MECHANICS + QUALITY + FILE PLAN at build, so the contract is real and the gate
   has something to check against.
3. **Real scaffold** — write real modules into `src/`, record docs in `docs/`, wire build-side `[REGION]` markers;
   enforce NO EMPTY FOLDERS + NO FLAT FILES. (The long road.)
4. **Manual model picker** — let the user pick the capability the quality demands (queued from before; now clearly
   justified — capability drives build quality).

## Status (Jun 14, 2026)
Diagnosed from 3 Flappy Bird builds. Plan locked.
- **Phase 1 DONE** — build worker now gets the full rulebook; quality gate (FLAT_RENDERING/NO_SOUND/FLAT_BACKGROUND)
  feeds retry/escalate; `[QualityGate] PASS|FAIL` logs.
- **Phase 3 (structure) DONE** — killed "single HTML preferred" (build now decomposes into js/+css/, file://-safe,
  PWA-compatible); killed BOTH empty-folder sources (init scaffold + skeleton foldersToCreate); blueprint
  distillation logged + retried (no more silent hollow blueprints); collector passes `mechanics` to the worker.
- **NEXT** — distill mechanics BEFORE the build (per-project contract drives the worker); manual model picker
  (queued, capability-justified). Test-build a game and read the logs to drive the next iteration.
PRIORITY continues until the hollow-shell disease is gone: no empty folders, no bland blueprints, no exceptions.
