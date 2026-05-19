# Dead End Log — chassis

Things that didn't work and why. Learn from these.

---

## [DEAD] \n escape sequences in webview template literal script blocks
- **What was tried:** Using `'\n\n'` inside a single-quoted JS string, inside a TypeScript template literal that generates a webview HTML script block.
- **What happened:** The `\n` passed through as a real newline character in the rendered HTML. A literal newline inside a JS string literal is a `SyntaxError`, which silently killed the entire `<script>` block — every button in the webview stopped working with no error shown to the user.
- **Never do this:** `confirm('message\n\nmore text')` inside any template literal that generates webview HTML.
- **Do this instead:** Use spaces — `confirm('message. more text')` — or `\\n` if a newline is truly needed.

---

## [DEAD] Unconditional scope question interception on all free-text messages
- **What was tried:** `hasPendingScopeQuestion()` check in chatPanelMessages.ts intercepted ANY user message and routed it to `resolveScopeQuestion()`, returning early. The pending resolver had a 5-minute timeout.
- **What happened:** If a build triggered `askScopeQuestions` and the build completed through another path (or user ignored the scope question), the resolver stayed alive for 5 minutes. During this window, every free-text message was silently consumed — never displayed in chat, never sent to AI.
- **Never do this:** Unconditionally intercept all user input with a stale pending promise resolver. Always add staleness checks (timestamp) and plausibility checks (message length/content).
- **Do this instead:** Only intercept if the scope question was asked < 2 minutes ago AND the reply is short (< 100 chars). Clear stale pending questions immediately so normal chat resumes.

---

## [DEAD] Retry builds without skipComplex — vault/placement/cost gates stall the retry
- **What was tried:** `handleBuildRequest(retryTask)` called from the "Try Again with Fix" handler without `skipComplex=true`. This sent the retry through the full gate chain: vault search, vault-hit modal, placement check, cost estimate modal.
- **What happened:** The webview already replaced the feedback UI with "Got it -- retrying with your notes..." — the user could not see or interact with the gate modals. The build appeared to stall forever.
- **Never do this:** Call `handleBuildRequest` without `skipComplex=true` for any automated retry, iteration, or fix-driven rebuild. Only first-time fresh builds from user input should go through the full gate chain.
- **Do this instead:** Pass `skipComplex=true` to bypass all gates. The `MessageHandlerDeps.handleBuildRequest` signature accepts `(task, skipComplex?)`.

---

## [DEAD] Case-sensitive matching on file paths extracted from lowercased tasks
- **What was tried:** `WorkspaceContextService.findBestTargetForModification` used `task.toLowerCase()` to match the regex `\b([\w\-]+)\.(ts|tsx|js|...)\b`, and then performed a case-sensitive search `f.relativePath.endsWith(mentionedFile)`.
- **What happened:** A task requesting modification of `mapBuilderService.ts` had its casing destroyed to `mapbuilderservice.ts`. The exact match against the workspace's `context.files` failed because the file system and relative paths use camelCase. The file contents were never injected into the Worker AI's prompt.
- **Never do this:** Never use `task.toLowerCase()` before a regex capture group if you intend to use the captured string as an exact file path match in a case-sensitive file system or data structure.
- **Do this instead:** Execute the regex against the original, case-preserved `task` string using the `/i` case-insensitive regex flag. Then compare both strings with `.toLowerCase()` to ensure robust matching.

---

## [DEAD] Emitted tokens without renderer parser — __BUILD_RESULT__ showing raw text
- **What was tried:** The build pipeline emitted `__BUILD_RESULT__filename|||filepath|||END__` tokens to mark files that were built, but the renderer only had parsers for `__ACTION_CARD__`, `__RESULT_CARD__`, etc. — no parser for `__BUILD_RESULT__`.
- **What happened:** After every build, users saw raw text like `__BUILD_RESULT__src/main.ts|||/home/user/project/src/main.ts|||END__` in the chat, blocking the conversation flow and appearing broken.
- **Never do this:** Never emit a token format without adding a corresponding parser in `chatPanelRenderer.ts`. The renderer regexes must always match the token format exactly, or the token shows raw text.
- **Do this instead:** Add the parser regex in `chatPanelRenderer.ts` when you add the token emitter. Include a fallback strip regex (`.replace(/__BUILD_RESULT__[^\n]*/g, '')`) to catch any malformed tokens and prevent chat blocking.

---

## [DEAD] Routing conversion verbs (convert/turn/transform/rewrite) through BUILD_TRIGGER_RE
- **What was tried:** Added conversion verbs (convert, turn, transform, rewrite, port, refactor, rebuild, redo) to `BUILD_TRIGGER_RE` in `chatPanelMsgSendMessage.ts` plus a separate `CONVERT_TRIGGER_RE` regex, so "Convert this TypeScript file to HTML" would route to the build pipeline.
- **What happened:** The full build pipeline (supervisor -> worker -> guardian) is too heavy for conversion requests. The chat showed "aligning tolerances..." indefinitely and never produced output. The pipeline stalled trying to run vault search, supervisor plan, worker build, and guardian review.
- **Never do this:** Never route conversion/transform verbs into `BUILD_TRIGGER_RE`. The build pipeline expects brand-new project creation with full orchestration.

---

## [DEAD] Bypassing the chunked build pipeline for multi-AI orchestrated builds
- **What was tried:** In `chatPanelChunked.ts`, added an early return for `routing.orchestratedBuild` when 2+ AIs were available. This orchestrated build ran its own plan->execute->review loop and dumped the final code directly into the chat history.
- **What happened:** The early return completely skipped the core CHASSIS build pipeline. File auto-save, project creation wizard, workspace opening, and vault capture (`autoCaptureFiles`) were never triggered. The user received a wall of raw code instead of a managed project.
- **Never do this:** Do not replace the chunked build pipeline. Multi-AI coordination must hook *into* the existing pipeline phases (e.g. at the planning phase), not circumvent the pipeline entirely.
- **Do this instead:** Use the existing supervisor/worker logic in `chatPanelChunked.ts` where the supervisor generates the plan array and the worker executes the file builds, triggering all appropriate pipeline hooks (auto-save, vault, ledger).
- **Do this instead:** Keep conversion requests on the AI chat path (`handleAIChat`). Use `chatPanelAutoSave.ts` to auto-detect substantial code blocks in the AI response and save them to disk automatically.

---

## [DEAD] Vault keyword-overlap matching returns false positives for same-word, wrong-domain items
- **What was tried:** `findSimilar("make yellow ball look like an actual bird")` returned 9 audio functions (`playSound`, `synthesizeSegment`, `getBirdDuration`, `decodeAudioData`, etc.) because they all contained "bird" from a previous sound build.
- **What happened:** `chatPanelBuildVault.ts` assembled these 9 audio components into a visual modification request. The worker tried to incorporate irrelevant audio code into the bird sprite task. The assembly prompt said "do not rewrite from scratch" which forced all 9 in. Result: visual task got broken audio-contaminated output.
- **Never do this:** Trust keyword overlap scoring alone to gate vault item selection. `findSimilar()` scores on word match — "bird" in task description matches `getBirdDuration` even though one is visual and the other is audio.
- **Do this instead:** Run a fast AI relevance check (12s timeout) on matched vault items BEFORE assembly when > 2 items are found. If AI returns "none", fall through to `runSingleFileBuild`. This is implemented in `chatPanelBuildVault.ts`. The assembly prompt must also say "use ONLY what's relevant — skip unrelated components".

---

## [DEAD] Single-regex code extraction from AI responses that mix prose and code
- **What was tried:** `res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim()` — strips the first ``` and last ``` from the response.
- **What happened:** When the AI returned a response in the format "To fix the issues, you can modify... ```javascript\n// code\n``` Note that this is just one possible solution...", the `/m` flag makes `^` match any line start, so the first ``` fence is removed. But the prose text before AND after the code block stays. The result written to disk was the explanation text + raw code + trailing note, displayed as a broken page of text in the browser.
- **Never do this:** Do not use a simple leading/trailing fence strip for AI responses that may contain explanation text.
- **Do this instead:** Use `extractCodeFromResponse(text)` from `chatPanelBuildInference.ts`. It scans for ALL fenced code blocks with a non-greedy regex, then returns the LARGEST one. This correctly isolates just the code from mixed prose+code AI responses.

**Follow-up (same bug, deeper case):** The stage-1 fix (non-greedy regex for closed blocks) failed when the AI returned a response with NO closing ``` fence. The regex requires both opening and closing fence — without a closing fence, no blocks are matched and the old single-replace fallback runs, which still leaves prose text intact. Stage-2 fix: `text.slice(text.indexOf('```')).replace(/^```[a-zA-Z0-9]*\n?/, '')` — finds the FIRST fence and slices from there, discarding all prose preamble even when the closing fence is absent.
