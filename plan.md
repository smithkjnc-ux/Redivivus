# Implementation Plan

## Goal
Fix four specific bugs identified during the Flappy Bird agentic test run related to routing, extraction, UX, and file creation.

## Proposed Changes

### `src/services/ai/adaptiveClassifier.ts`
- **Bug 1:** Adaptive Intent Classifier is routing 'make me a flappy bird game' to OBD2 instead of OBD1.
- **Fix:** Update the AI prompt rules to explicitly state `- Creating entirely new applications, games, or projects from scratch -> obd1`.
- **Fix:** Add game creation verbs to `OBD1_FAST_PATHS` to catch it without needing the AI.

### `src/core/build/chatPanelChunkedLoop.ts`
- **Bug 2:** Guardian AI is writing its correction reasoning as plain text into the output file.
- **Fix:** On line 164, apply `extractCodeFromResponse(review.correctedCode)` to cleanly strip markdown fences and prose, rather than using brittle `.replace()` regexes that leave preamble text intact.
- **Bug 4:** Chunked build file extraction drops files or corrupts them if multiple markdown fences are returned.
- **Fix:** On lines 115-121, replace the brittle string manipulation with a robust RegExp block extractor that explicitly targets the file's `basename` if multiple code blocks are found, defaulting to the single block if only one exists.

### `src/core/build/chatPanelChunked.ts`
- **Bug 3:** CHASSIS should automatically open the created project folder in the VS Code workspace explorer after a build.
- **Fix:** At the end of `runChunkedBuild` (around line 191), trigger the `workbench.view.explorer` command to bring focus to the file explorer so the user immediately sees the newly generated files.

## Verification
- Run CHASSIS tests to ensure no regressions.
- Execute a browser subagent test run for "make me a flappy bird game" to verify it routes to OBD1, produces clean files without Guardian narrative, creates all planned files, and successfully renders the game in a webview.
