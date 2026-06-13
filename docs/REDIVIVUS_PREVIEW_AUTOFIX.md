# Redivivus — Preview Auto-Fix (Execution-Feedback Loop)

> [SCOPE] Why a "fix" can pass review yet still not run, and a phased plan to close the gap by PROVING the
> result runs — actually executing the preview, capturing real runtime failures (blank canvas, JS errors,
> a game loop that never starts), and looping the fix on that evidence until reality (not an AI opinion) says
> it works. Companion to REDIVIVUS_INTENT_ARCHITECTURE.md. Created Jun 13, 2026.

---

## 1. The problem (one line)

Redivivus verifies a fix by **AI reasoning** (Verify + Guardian *read* the code), never by **execution**. For
a browser/canvas project there is no compiler, so a **complete file that is a dead program** (defines the game
but never starts the loop, or throws on load) **passes review and ships** — only the user, running it, finds
out. The pipeline trusts an AI's *opinion* that the code works instead of *proving* it.

This is also why a first fix can look incomplete: the diagnosis is usually right, but the Worker's first
*implementation* of a generative fix is partial, and nothing detects that until a human runs it.

## 2. The principle

**Real execution > AI judgment.** Close the loop: run it → detect broken → fix on the concrete runtime
evidence → re-run → repeat (capped) until it genuinely runs. `runCompileAutoFix` already does this for
TS/Node/Python (compiler as truth). This brings the same truth to web/canvas projects (preview as truth).

## 2a. Loop philosophy — FIRST-PASS QUALITY, the loop is a backstop (PapaJoe, Jun 13, 2026)

**The standard is the Supervisor model's quality on the FIRST pass.** If the user is on Claude, they expect
Claude results immediately — not after 5 tries, not even 2 unless the project is genuinely tough. Therefore:
- **The auto-fix loop is a SAFETY NET for the occasional genuine miss — never the quality mechanism.**
- **Hard cap = 1 corrective pass** (one re-fix on the runtime evidence). **2 ONLY for genuinely complex/large
  projects** (rebuild-sized diagnosis / many files). **NEVER 3+.**
- The real lever is the FIRST pass: a precise, complete prescription + the right-tier Worker. Spend effort
  there, not on more iterations.
- **Frequent looping is a SIGNAL, not a solution.** If the run-check keeps failing, that means the first pass
  was under-resourced (vague prescription, Worker tier too low, output truncated, or it's really a rebuild) —
  surface/telemeter that and fix the CAUSE; do not paper over it with more loops.
- Every loop iteration is VISIBLE in the activity panel with a cost, and the cap is shown ("attempt 1 of 1").
  If it still fails after the cap, tell the user honestly ("couldn't get it running in N pass(es) — this may
  need a rebuild or a more capable model") rather than silently grinding.

## 3. How to capture runtime signals (grounded in what exists)

- The preview server (`chatPanelPreview.ts` `_buildStaticServer` + `_injectInspector`) already serves the
  built HTML and injects a script. Previews run in a **webview iframe** (`window.parent.postMessage`) OR an
  **external browser** (`openWebInBrowser.ts` -> `openExternal`).
- The channel that works for BOTH and headlessly is a **beacon**: a small injected capture script POSTs runtime
  failures to a new endpoint on the local preview server (`POST /__rdv_runtime`), which buffers them per-load.
- **What the capture script reports:**
  - `window.onerror` + `window.onunhandledrejection` — uncaught exceptions / boot failures.
  - wrapped `console.error` — logged errors.
  - a **post-load probe** (after ~1.5s): is there a `<canvas>` whose pixels are all one color (BLANK)? was
    `requestAnimationFrame`/`setInterval` ever called (no loop = dead game)? did the DOM stay empty?
  - referenced-but-missing scripts (a `<script src>` that 404'd).
- **Headless verification**: `verifyPreviewRuns(root)` starts the server, loads the entry in a HIDDEN webview
  with the capture script, waits, then reads the server's buffer -> `{ ok, errors[], blank, noLoop }`. No user
  action, no visible browser needed.

## 4. Phased plan (reversible, test between each)

- **Phase 0 — Runtime capture. [DONE Jun 13, 2026]** New `chatPanelPreviewCapture.ts` (`getCaptureScript()`,
  ASCII-only per Rule 13) injected EARLY into served HTML (right after `<head>`, before the page's scripts) so
  its rAF/setInterval + error hooks catch the page's behaviour. It beacons (`navigator.sendBeacon` -> `fetch`
  fallback) uncaught errors, failed `<script src>` loads, `console.error`, and a 1.5s probe (blank canvas AND
  no loop started) to `POST /__rdv_runtime`. `chatPanelPreview.ts` buffers reports (`_runtimeReports`, capped
  200, cleared per new preview) and exposes `getRuntimeReports()` / `clearRuntimeReports()`. Pure capture — the
  build/fix pipeline is unchanged. `tsc` clean, deployed. *Foundation for Phase 1's headless `verifyPreviewRuns`.*
- **Phase 1 — Headless `verifyPreviewRuns(root)`. [DONE Jun 13, 2026]** `chatPanelPreviewVerify.ts`: serves the
  project, loads it in a short-lived webview (iframe via `asExternalUri`), waits ~2.8s for the capture script to
  beacon, returns `{ applicable, ok, errors, blank, noLoop, summary }`. Best-effort (a verify failure is
  "inconclusive", never "broken"). Non-static/non-web projects return `applicable:false` (skipped).
- **Phase 2 — Gate, don't loop yet. [DONE Jun 13, 2026]** `chatPanelMsgFixFinalize.ts` runs `verifyPreviewRuns`
  after a fix; the activity panel shows "Ran the preview - it works" / "...- <problem>", and on failure the chat
  says honestly "the file was changed and passed review, but the preview still has a problem -- <summary>".
  *Validate detection accuracy here (no false "broken" on working games) BEFORE enabling Phase 3 — a false
  verdict would trigger exactly the wasteful loop we want to avoid.*
- **Phase 3 — The auto-fix loop (CAPPED — see 2a). [NEXT, after detection is validated]** On a real runtime
  failure, feed the CONCRETE evidence (actual error text + "canvas is blank / loop never started") back as ONE
  targeted re-fix, then re-verify. **Cap = 1** (2 only for genuinely complex). If it still fails, stop and tell
  the user honestly. Each attempt is a visible activity-panel step with its cost. *Test: a dead-canvas game is
  driven to running in ONE corrective pass; a working game triggers ZERO loops.*
- **Phase 4 — Build-vs-fix sizing (related lever).** When the Supervisor's diagnosis says "most of this file is
  missing / must be generated," route to the BUILD pipeline (complete-file generation + the dead-canvas gate)
  rather than grinding a rebuild through surgical-fix machinery.

## 5. What does NOT change

- Workshop 7 principles, blueprint, vault, dead-ends, the rich Build Activity panel (the loop's iterations
  show up there as steps), all project rules (200-line files, NO FLAT FILES, log every change, `[DEAD]`).
- The injected capture is ASCII-only (Rule 13) and best-effort — it can never block a preview or a build.

## 6. Risks & guardrails

- **Don't make the preview slower / flaky.** Capture is async best-effort; the probe runs once after a short
  delay; the beacon failing is a no-op.
- **Headless webview cost.** Reuse one hidden webview; dispose after; only run on previewable (web) projects.
- **Loop cost.** Hard iteration cap + the same cost guards as the fix pipeline; each iteration is a step in the
  activity panel so the user SEES it (no silent spend — the lesson from the double-run bug).
- **False "blank".** The blank-canvas probe samples pixels and requires ALL-one-color AND no loop before
  flagging, so a legitimately solid-background intro screen isn't mislabeled (tune like the dead-canvas gate).

---

*Last updated: Jun 13, 2026 — initial draft. Owner: PapaJoe. Feeds the "Preview auto-fix loop" keep-up priority.*
