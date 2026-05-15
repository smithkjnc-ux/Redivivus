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
- **Do this instead:** Keep conversion requests on the AI chat path (`handleAIChat`). Use `chatPanelAutoSave.ts` to auto-detect substantial code blocks in the AI response and save them to disk automatically.
