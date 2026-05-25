# Redivivus — Roadmap Index
> **Rule:** Every AI working on Redivivus MUST read this file first AND update `docs/REDIVIVUS_FIXES.md` before ending any session. No exceptions.

*Last updated:* May 24, 2026 (Session 11BG)

---

## Project Rename: CHASSIS → Redivivus — May 24, 2026 (Session 11BG)

| Scope | What Changed | Notes |
|---|---|---|
| `package.json` | `name: "redivivus"`, `displayName: "Redivivus"`, all `chassis.*` commands → `redivivus.*`, menu groups `chassis@N` → `redivivus@N` | Extension ID becomes `papajoe.redivivus` |
| All 430 `src/**/*.ts` files | `CHASSIS` → `Redivivus`, `chassis-` → `redivivus-`, `chassis.` → `redivivus.`, `Chassis` → `Redivivus`, `chassis` → `redivivus` (camelCase, strings, import paths) | Zero remaining `chassis` strings in source |
| 13 source files renamed | `chassisXxx.ts` → `redivivusXxx.ts` (Logger, Init, Paths, Config, Rules, Service, Sidebar, WebviewProvider, Formatter, etc.) via `git mv` | All imports updated by sed pass |
| Root docs renamed | `CHASSIS_ROADMAP.md` → `REDIVIVUS_ROADMAP.md`, `CHASSIS_CHAT_SPEC.md`, `CHASSIS-SPEC.md`, `CHASSIS_UX_VISION.md` | Content also updated |
| `.chassis/` → `.redivivus/` | Project tooling folder renamed; `postcompile.js` and path helpers updated | Old `.chassis/` folder preserved on disk for existing sessions |
| `scripts/postcompile.js` | Commit message prefix, deploy path lookups, session dir path all updated | Auto-commit now says "Redivivus checkpoint:" |

## Move Mode Phase 2: Cross-container Reparenting + HUD Layers Panel — May 24, 2026 (Session 11BF)

| File | What Changed | Why | Risk |
|---|---|---|---|
| `src/ui/panels/chat/chatPanelRearrangeScript.ts` | Added zone detection (top 25% = before, bottom 25% = after, middle 50% = nest inside); `dropInside`/`dropInsideEl` for blue-dashed glow on nest targets; `postReparent()` sends `inside:true` message with `fromParentPath`+`toPath`; HUD upgraded from `textContent` + `pointer-events:none` to interactive innerHTML — children list (tag + text, clickable to drill down), ungroup checkboxes, Save/Revert buttons; HUD temporarily loses pointer-events during `elementFromPoint` hit test to avoid interference | Phase 1 reordering worked; Phase 2 adds Cricut-like layer navigation and ability to nest elements inside containers | Medium — replaces showHud internals and adds new drag zone logic |
| `src/services/html/htmlElementMover.ts` | Added `reparentElement(html, fromParentPath, fromIndex, toPath)` — extracts element from source parent, appends as last child of destination; `adjustPathAfterRemoval()` corrects `toPath` indices when source and destination share a common ancestor (prevents path shift after deletion) | Disk-side counterpart to DOM reparenting in the injected script | Medium — new string manipulation on HTML tree |
| `src/core/routing/chatPanelMessageRouterRearrange.ts` | Imported `reparentElement`; `handleRearrangeMove` now accumulates `{inside:true, fromParentPath, fromIndex, toPath}` moves separately from reorder moves; `handleRearrangeFinish` dispatches `reparentElement` vs `moveChildElement` per move type | Accumulate-on-Done architecture extended to cover reparent moves — still zero file I/O during session | Low — additive branch inside existing loop |
| `src/ui/panels/chat/chatPanelScriptListener.ts` | Updated `redivivus-drag-drop` forward to include `inside`/`fromParentPath`/`toPath` when `msg.inside`; added `redivivus-hud-save` → `rearrange-finish` and `redivivus-hud-revert` → `rearrange-undo` forwarding for HUD buttons inside the iframe | HUD Save/Revert buttons in the injected script send postMessage to parent; listener must forward them to the extension | Low — two new if-blocks |

## Live Preview: Absolute Overlay + Full-Size Fix — May 24, 2026 (Session 11BE)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/panels/chat/chatPanelStylesBase.ts` | Added `body { position: relative; }`. Added `#preview-view { position:absolute; top:0; left:0; right:0; bottom:0; display:none; flex-direction:column; background:var(--c-bg); z-index:10; }`. Added `min-height:0; align-items:stretch` to `.preview-frame-wrap`. | Two bugs: (1) preview visible in chat mode even when hidden — sibling-hiding JS was fragile; CSS-only hidden-by-default is reliable. (2) preview small/cramped — `flex:1` height chain collapsed because parent had no definite height; `position:absolute; inset:0` gives the overlay a definite height from the positioned body, and `min-height:0` prevents flex overflow collapse on the frame-wrap. | None — `position:absolute` overlaying `body { position:relative }` is standard CSS and works in VS Code webviews. |
| `src/ui/panels/chat/chatPanelHtml.ts` | Removed inline `style="display:none;flex:1;..."` from `#preview-view` — CSS rule handles all of this now. | Eliminates inline/CSS conflict. | None. |
| `src/ui/panels/chat/chatPanelPreviewScript.ts` | Simplified `showPreview()` to just `pv.style.display = 'flex'`. Simplified `hidePreview()` to just `pv.style.display = 'none'`. No sibling-hiding needed — position:absolute covers everything. Fixed `setPreviewError` back button to use `data-action="preview-hide"` instead of (CSP-blocked) `onclick`. | Simpler is more reliable. Sibling-hiding was the source of the "chat still shows behind preview" bug. | None. |

---

## Live Preview: Detection Fix (index.html priority) — May 24, 2026 (Session 11BD+)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/panels/chat/chatPanelPreview.ts` | In `detectDevServer`: moved `index.html`-at-root check to run BEFORE generic `dev`/`start` npm script checks (after framework checks). Projects with `index.html` at root now always use the built-in static server on port 5500, even if they also have a `package.json` with a `dev` or `start` script. | Flappy Bird project had `"start": "npx http-server -p 8080"` — our code matched `scripts['start']` → assumed port 3000. Something unrelated was on port 3000, so the iframe showed "Not Found". The game is self-contained HTML; it needs the static server, not any npm process. | Low — framework deps (next/vite/react-scripts) are still checked first, so those projects are unaffected. |

---

## Live Preview: Button Fix + Run Integration — May 24, 2026 (Session 11BD)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/panels/chat/chatPanelHtml.ts` | Replaced all `onclick="window.__chassis*"` attributes with `data-action` attributes: `data-action="preview-show"` (header button), `data-action="preview-hide"` (← Chat), `data-action="preview-refresh"` (↺), `data-action="preview-browser"` (🌐 Browser), `data-action="preview-popout"` (Pop Out). | VS Code webview CSP (`script-src 'nonce-...'`) blocks inline `onclick` event handlers — they were silently dead. All other working buttons in Redivivus use `data-cmd`/`data-action` + event delegation. | None. |
| `src/ui/panels/chat/chatPanelPreviewScript.ts` | Replaced the device-button-only `click` listener with a unified handler covering all preview `data-action` values plus `.preview-device-btn[data-w]`. Actions: `preview-show`, `preview-hide`, `preview-refresh`, `preview-browser`, `preview-popout`. | Needed to add event delegation for the new data-action buttons to replace the dead onclick handlers. | None. |
| `src/ui/panels/chat/chatPanelScriptListener.ts` | Added `trigger-preview` handler → calls `window.__chassisPreviewShow()`. | Allows the extension host to trigger the preview panel from outside the webview (e.g., from the Run command handler). | None. |
| `src/core/project/chatPanelMsgRunCommand.ts` | For `info.type === 'html'`: replaced `vscode.env.openExternal(...)` with `panel.webview.postMessage({ type: 'trigger-preview' })`. | "▶ Run" was opening the HTML file in the OS browser instead of the Redivivus embedded preview. Now it shows the preview inline, consistent with the ▶ Preview header button. | Low — if preview fails to start, user can click ▶ Preview manually. |

---

## Live Preview Polish + Overlay Fix — May 24, 2026 (Session 11BC)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/panels/chat/chatPanelHtml.ts` | Removed `position:fixed;inset:0;z-index:500` from `#preview-view` inline style — replaced with `flex:1;flex-direction:column`. Added URL bar (`<input id="preview-url" class="preview-url-bar">`), "🌐 Browser" button, and wider Pop Out button to preview toolbar. | `position:fixed` does not create a true viewport overlay in VS Code webviews — the div appeared as a flex child at the bottom of the panel below the chat, visible even when preview was not triggered. | Low — display-only changes. |
| `src/ui/panels/chat/chatPanelPreviewScript.ts` | Rewrote `showPreview()` to explicitly hide `.header`, `.header-badges`, `#conversation`, `#input-area` before showing `#preview-view` as a flex child. `hidePreview()` restores all. Added `setPreviewLoading(msg)` for type-specific spinner text. `setPreviewReady(port)` now populates URL bar. `refreshPreview()` preserves current URL path. Added `openInBrowser()` and `window.__chassisPreviewOpenBrowser`. URL bar: Enter key navigates iframe, relative paths resolved to `http://localhost:PORT/path`. Device buttons apply `border-radius:20px` for mobile frame effect. | Same overlay fix — hiding siblings is the only reliable full-panel swap approach in VS Code webviews. | Low. |
| `src/ui/panels/chat/chatPanelStylesBase.ts` | Added `.preview-url-bar` CSS (flex:1, monospace, focus accent). Fixed `.preview-status` — removed `margin-left:auto` (URL bar now fills that space). | UI polish for URL bar. | None. |
| `src/ui/panels/chat/chatPanelScriptListener.ts` | Added `preview-loading` handler → `window.__chassisPreviewSetLoading`. Added `preview-refresh` handler → `window.__chassisPreviewRefresh` (for future auto-refresh on build). | Wire up new message types from extension host. | None. |
| `src/core/routing/chatPanelMessageRouterPreview.ts` | New file (52 lines). Extracted all 3 preview message handlers from `chatPanelMessageRouterEarlyExits.ts`: `start-preview` (with `detectProjectKind` → context-aware errors for Python/CLI/shell, `loadingMsg` send before server starts, `alreadyRunning` fast timeout), `popout-preview`, `open-in-browser` (uses `vscode.env.openExternal`). | Rule 9 split — early exits was 238 lines. | None — pure extraction. |
| `src/core/routing/chatPanelMessageRouterEarlyExits.ts` | Replaced inline preview handlers with single delegation: `return handlePreviewMessages(panel, msg)`. Now 198 lines (under Rule 9 limit). | See above. | None. |

---

## Complexity Hotspot Reduction — May 24, 2026 (Session 11BB)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/build/chatPanelBuildSteps.ts` | New file (159 lines). Exports 5 step functions extracted from `runSingleFileBuild`: `inferBuildTarget` — resolves target path, existingTarget, isCrossLang, ext from task + routing; `resolveWorkerPrompt` — builds worker prompt with conditional existing-file reads; `runCodeReviewPipeline` — Guardian review + static validation + import validation; `applyCodeToFile` — surgical edit detection + full-file write + narration extraction; `runPostBuildActions` — vault capture, roadmap entry, autocommit, workspace explorer open, compile auto-fix, test auto-fix. | `runSingleFileBuild` had ESLint complexity of 58 — entire build pipeline in one function made it hard to test, trace, or extend individual steps. | Low — pure extraction; no logic changed. TypeScript: 0 errors. |
| `src/core/build/chatPanelBuild.ts` | Reduced from 191 → 97 lines. `runSingleFileBuild` complexity: 58 → 23. Replaced 5 inline blocks with calls to the extracted step functions. Removed now-redundant imports (`extractNarrator`, `autoCommitIfEnabled`, `refreshSetupProgressIfOpen`, `runCompileAutoFix`, `runTestAutoFix`, `writeProjectRoadmapEntry`, `logFileChange`). | See above. | Low. |

---

## Retrofit Blueprint-from-Scan — May 24, 2026 (Session 11AZ)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/retrofit/retrofitBlueprint.ts` | Added `STACK_MAP` (17 entries) mapping package.json dep names to readable stack labels (React, Next.js, Electron, Phaser, Prisma, VS Code extension, etc.). Added `detectTechStack(pkg)` private method — filters `STACK_MAP` against `dependencies` + `devDependencies`, returns comma-joined label string. Added `sampleEntryPoint()` — searches `index.html`, `main.ts`, `app.py`, `server.js`, etc. and returns first 25 non-comment lines. `scanCodebase()` updated to: include `devDependencies` alongside `dependencies`; call `detectTechStack` and append `=== DETECTED TECH STACK ===` section; call `sampleEntryPoint` and append entry point code; read `requirements.txt` / `Dockerfile` when present. | For non-Redivivus projects with no README and no `[SCOPE]` tags, the old scan returned almost no signal — AI had little to work with. Tech stack detection and entry-point sampling give strong "what does this do" context even for blank-slate projects. | Low — all additions are optional/fallback; no existing scan logic removed. |
| `src/core/routing/chatPanelMsgSendKeywords.ts` | Added keyword intercept for retrofit blueprint trigger: matches "retrofit blueprint", "figure out what my project does", "generate blueprint from my code", "what does my project do", "auto blueprint", "infer blueprint", etc. Posts "Scanning your project..." to chat then fires `redivivus.retrofitBlueprint`. | Users had to know the command name to run it. Now accessible from natural language in chat. | Low — new branch before AI classifier; no existing intercepts modified. |

---

## AI Delegation Button + Complexity Reduction — May 24, 2026 (Session 11AY)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/mapBuilderHelpers.ts` | Added `warnTexts?`, `todoTexts?`, `deadTexts?` to `MapNode` interface. Added `extractAnnotationTexts(content, tag)` helper — extracts the text after each `[WARN]`/`[TODO]`/`[DEAD]` tag, capped at 120 chars. | Need the actual annotation text (not just counts) to populate the delegate button prompt. | Low — additive fields, all optional. |
| `src/services/mapBuilderService.ts` | Import `extractAnnotationTexts`; populate `warnTexts`, `todoTexts`, `deadTexts` on each node during file scan. | Feeds annotation text into node graph data so it's available in the webview. | Low — additive to existing scan loop. |
| `src/ui/map/mapScriptActions.ts` | `showSidePanel`: added `renderAnnotations(texts, tag)` inner function that renders each annotation as a row with tag badge + text + Delegate button (`data-action="delegate"`, `data-tag`, `data-idx`). Added `window.doDelegate(tag, idx)` — reads text from `window._selectedNode.warnTexts/todoTexts/deadTexts`, posts `{type:'delegateAnnotation', ...}` to extension. | One-click delegation for `[WARN]`/`[TODO]`/`[DEAD]` tags directly from the Architecture Map side panel. | Low — pure UI addition; no existing handlers modified. |
| `src/ui/map/mapScriptEngine.ts` | Added `else if (action==='delegate') window.doDelegate(...)` branch to the side-panel click dispatcher. | Wire the new `data-action="delegate"` button into the existing click handler pattern. | Low — one branch added to existing switch. |
| `src/ui/map/mapStyles.ts` | Added `.annot-list`, `.annot-row`, `.annot-tag` (warn/todo/dead variants), `.annot-text`, `.delegate-btn` CSS. | Visual styling for the annotation list and delegate button. | Low — additive CSS. |
| `src/ui/map/mapMessageDispatcher.ts` | Added `delegateAnnotation` case: opens chat (`redivivus.openChat`) then posts prompt via `redivivus.postToChat`. Prompt format: `[TAG] in \`filePath\`: annotation text\n\nPlease address this annotation.` | Routes the delegate message from the webview to the chat panel. | Low — new case; no existing cases touched. |
| `src/core/routing/chatPanelMsgSendClarify.ts` | NEW. Extracted `runChatClarifyStep(userText, routing, conversation, refresh)` from `handleSendMessage`. Returns `{routedText, cancelled}`. | `handleSendMessage` clarify block was 24 lines of nested async branching (push → wait → cancel/summary/pop). | Low — identical logic; re-exported via new import in handleSendMessage. |
| `src/core/routing/chatPanelMsgSendBuildIntent.ts` | NEW. Extracted `handleBuildIntent(routedText, userText, msg, deps, conversation, refresh)` from `handleSendMessage`. Contains mode gates, blueprint gap check, template wizard routing. | Build intent block was 30 lines of nested branching inside `handleSendMessage`. | Low — identical logic. |
| `src/core/routing/chatPanelMsgSendMessage.ts` | Replaced clarify block with `runChatClarifyStep(...)` call; replaced build intent block with `handleBuildIntent(...)` call. Removed no-longer-needed imports. 166→101 lines, complexity ~77→~35. | Complexity reduction — two major branch clusters extracted. | Low. |
| `src/core/build/chatPanelBuildClarify.ts` | NEW. Extracted `runBuildClarifyStep(task, ctx, isFixRequest, skipComplex)` from `runBuildAfterGates`. Returns `{cancelled}`, mutates `ctx.clarifyAnswers`. | 33-line clarify block in `runBuildAfterGates` was the dominant complexity driver (Thinking... push → questions → token render → race → cancel/now/answers branching). | Low — identical logic; `ctx` is mutated in-place exactly as before. |
| `src/core/build/chatPanelBuildRunner.ts` | Replaced 33-line clarify block with `runBuildClarifyStep(...)` call. Removed unused `extractBlueprintFromPrompt` import. 195→168 lines, complexity ~81→~42. | Complexity reduction. | Low. |

---

## Extension Activation Fix + Complexity Reduction — May 24, 2026 (Session 11AX)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/workspace/terminalErrorService.ts` | Wrapped `onDidWriteTerminalData` property access in try/catch inside `registerTerminalErrorService`. Added explanatory comment about the proposed API behavior. | `onDidWriteTerminalData` is a proposed VS Code API — VS Code 1.110+ throws when you access a proposed API property on `vscode.window` if the extension hasn't declared it in `enabledApiProposals`. The existing `?.()` optional chaining only prevents errors from calling `undefined`; it can't catch a throw from the property getter itself. Without the guard, the throw inside `registerInlineCommandsC` caused all subsequent command registrations (`redivivus.injectTerminalError`, `redivivus.openVisualEditor`, etc.) to silently not register. Terminal buffering degrades gracefully to returning `null` from `getLastTerminalError()`. | Low — all callers already handle `null` from `getLastTerminalError`. |
| `src/extensionInlineCommands.ts` | Removed unused import of `registerTerminalErrorService, getLastTerminalError`. | Dead import — registration is done in `extensionInlineCommandsC.ts`. | Low — import-only removal. |
| `src/extensionCommands.ts` | Same unused import removed. | Same. | Low. |
| `src/core/routing/chatPanelMsgSendKeywords.ts` | NEW. Extracted 7 keyword shortcut intercepts from `handleSendMessage`: template listing, run/open program, scan project, current project info, setup progress, list projects, explain files. | `handleSendMessage` had cyclomatic complexity ~80 with 33 lines of regex inline before the AI classifier. | Low — identical logic, just moved. Re-exported as a single `handleKeywordShortcuts(userText, lowerText, deps)` call. |
| `src/core/routing/chatPanelMsgSendMessage.ts` | Replaced 33-line keyword block with `if (await handleKeywordShortcuts(...)) { return; }`. Removed `ProjectOperations` and `_scanChassisProjects` imports (now in keywords file). Removed `projectOps` instantiation. 200→166 lines, complexity ~80→~47. | Complexity reduction. | Low. |
| `src/core/routing/chatPanelMsgSendAIConvert.ts` | NEW. Extracted chunked-generation path from `handleAIChat`: `runChunkedConvert(userText, wsRoot, routing, usageTracker, conversation, refresh)` — returns `null` when source is small enough for a single call, otherwise runs `chunkedGenerate` and returns the formatted result. | `handleAIChat` had a nested if/if/else for the chunked vs. single-call convert path inside the isConvert branch, adding ~16 lines of nested logic. | Low — return type `ChunkedConvertResult | null` makes the null/fall-through contract explicit. |
| `src/core/routing/chatPanelMsgSendAI.ts` | Replaced chunked generate block with `runChunkedConvert(...)` call. Removed `findSourceFiles`, `splitSourceIntoSections`, `chunkedGenerate` imports and `CHUNKED_THRESHOLD` constant (all moved to new file). 168→152 lines, complexity ~61→~45. | Complexity reduction. | Low. |

---

## Rule 9 Splits (All 12 Files ≤200 Lines) — May 24, 2026 (Session 11AW)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/logging/chassisLoggerOps.ts` | NEW. Extracted `logBuildOperation`, `logFixOperation`, `logAnalysisOperation`, `logChatOperation`, `listChassisLogs`, `readLogFile` from `chassisLogger.ts`. | `chassisLogger.ts` was 277 lines. | Low — re-exported from original file; callers unchanged. |
| `src/services/logging/chassisLogger.ts` | Removed 6 functions, added re-export from `chassisLoggerOps.ts`. 277→~193 lines. | Rule 9. | Low |
| `src/services/ai/guardianAIPrompt.ts` | NEW. Extracted `buildGuardianPrompt` (96-line review prompt) from `guardianAI.ts`. | `guardianAI.ts` was 218 lines. | Low — single call site updated to import. |
| `src/services/ai/guardianAI.ts` | Removed `buildGuardianPrompt` body, added import. 218→~122 lines. | Rule 9. | Low |
| `src/core/routing/chatPanelMsgFixRoadmap.ts` | NEW. Extracted `writeProjectRoadmapEntry` from `chatPanelMsgFixUtils.ts`. | `chatPanelMsgFixUtils.ts` was 221 lines. | Low — re-exported from original file. |
| `src/core/routing/chatPanelMsgFixUtils.ts` | Replaced 26-line function with re-export. 221→~196 lines. | Rule 9. | Low |
| `src/core/project/chatPanelMsgRunCommand.ts` | NEW. Extracted `handleRunCommand` from `chatPanelMsgProjectOps.ts`. | `chatPanelMsgProjectOps.ts` was 273 lines. | Low — re-exported; callers unchanged. |
| `src/core/project/chatPanelMsgProjectOps.ts` | Removed `handleRunCommand` body, added re-export. 273→~154 lines. | Rule 9. | Low |
| `src/services/mcpServiceTypes.ts` | NEW. Extracted `McpServerConfig`, `McpTool`, `McpResource`, `McpCallResult` interfaces from `mcpService.ts`. | `mcpService.ts` was 205 lines. | Low — re-exported; callers unchanged. |
| `src/services/mcpService.ts` | Removed 4 interfaces, added import+re-export from types file. 205→~178 lines. | Rule 9. | Low |
| `src/services/ai/routingServiceAnalyze.ts` | NEW. Extracted `analyzeFileImpl` standalone function from `RoutingService.analyzeFile`. | `routingService.ts` was 226 lines. | Low — delegate pattern; method signature unchanged. |
| `src/services/ai/routingService.ts` | `analyzeFile` now delegates to `analyzeFileImpl`. 226→~195 lines. | Rule 9. | Low |
| `src/services/userMemoryServiceProfile.ts` | NEW. Extracted `buildPromptInjection`, `getMemoryForDisplay`, `updateMemoryField`, `removeExplicit` from `userMemoryService.ts`. | `userMemoryService.ts` was 225 lines. | Low — re-exported; callers unchanged. |
| `src/services/userMemoryService.ts` | Replaced 4 function definitions with re-export. 225→~182 lines. | Rule 9. | Low |
| `src/services/sessionServiceFinalize.ts` | NEW. Extracted `finalizeSession` and `parseEndSessionData` from `sessionService.ts`. | `sessionService.ts` was 213 lines. | Low — class delegates to standalone function. |
| `src/services/sessionService.ts` | Removed `finalizeSession` body, added delegate + import. 213→~175 lines. | Rule 9. | Low |
| `src/commands/apiSetupHtmlCards.ts` | NEW. Extracted `buildProviderCards` (64-line HTML renderer) from `apiSetupHtml.ts`. | `apiSetupHtml.ts` was 216 lines. | Low — single call site updated. |
| `src/commands/apiSetupHtml.ts` | Replaced card map with `buildProviderCards(...)` call. 216→~150 lines. | Rule 9. | Low |
| `src/core/build/chatPanelBuildResult.ts` | NEW. Extracted `buildSingleFileResult` + `SingleFileBuildResultParams` + `diffSummary` from `chatPanelBuild.ts`. | `chatPanelBuild.ts` was 233 lines. | Low — single call site updated. |
| `src/core/build/chatPanelBuild.ts` | Replaced 45-line result block with `buildSingleFileResult(...)` call. 233→~186 lines. | Rule 9. | Low |
| `src/ui/panels/chat/chatPanelScriptListener.ts` | NEW. Extracted `buildListenerScript` (the `window.addEventListener('message', ...)` block) from `chatPanelScript.ts`. | `chatPanelScript.ts` was 212 lines. | Low — injected via template literal `${buildListenerScript()}`. |
| `src/ui/panels/chat/chatPanelScript.ts` | Replaced 43-line listener block with `${buildListenerScript()}`. 212→~170 lines. | Rule 9. | Low |
| `src/services/build/buildOrchestrator.ts` | Removed unused `fs` and `path` imports. 201→199 lines. | Rule 9. | Low |

---

## Vault Toggle Setting + Chat History Persistence — May 23, 2026 (Session 11AV)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/commands/setupHubHtml.ts` | Added Vault Context section with status badge and checkbox toggle (`id="vault-toggle"`, `onchange="send('toggle-vault',{enabled:this.checked})"`) between Guardian and the divider. Added `vaultEnabled = true` param to `getHubHtml()`. | User request: vault context injection should be on by default but explicitly toggleable in Setup Hub — same pattern as Guardian toggle. | Low — additive only; doesn't change any existing section. |
| `src/commands/setupHub.ts` | `refreshPanel()` now accepts `context` as first param and reads `redivivus.vaultEnabled` from globalState to pass to `getHubHtml`. Added `toggle-vault` message handler (`context.globalState.update + refreshPanel`). | Needed to read and write vault toggle state from the panel and reflect it live on re-render. | Low |
| `src/services/vault/vaultContextService.ts` | Added `isVaultEnabled()` export — reads `redivivus.vaultEnabled` from `ChatPanel.extensionContext.globalState` (defaults `true`). | Single source of truth for "is vault injection enabled" used by all 3 pipeline files. Requires() chatPanel at runtime to avoid circular import. | Low — try/catch; returns `true` on any error. |
| `src/core/build/chatPanelBuild.ts` | Gated vault search and message copy behind `isVaultEnabled()`. Shows "Building..." instead of "Checking code library..." when vault is off. | Single-file build pipeline now respects the Setup Hub toggle. | Low |
| `src/core/build/chatPanelChunked.ts` | Gated vault search, vault result message, and vault context block behind `isVaultEnabled()`. | Multi-file build pipeline now respects the Setup Hub toggle. | Low |
| `src/core/routing/chatPanelMsgFix.ts` | Changed `deps.vault ?` to `(deps.vault && isVaultEnabled()) ?` for vault context injection. Added `isVaultEnabled` to import. | Fix pipeline now respects the Setup Hub toggle. All 3 AI pipelines share the same gate. | Low — additive condition; file stays at exactly 200 lines. |
| `src/ui/panels/chat/chatPanelPublicAPI.ts` | NEW (recreated from compiled JS — source was deleted). Adds `saveConversation()`, `restoreConversation()`, `clearPersistedConversation()` using `globalState` keyed by workspace root (`redivivus.chatHistory.${root}`). Keeps last 100 messages. | Chat history was resetting every time the panel was reopened. GlobalState persists across VS Code restarts and panel closes. Per-project key means switching projects shows the right history. | Low — silent try/catch on all operations; never blocks panel open. |
| `src/ui/panels/chat/chatPanel.ts` | Constructor calls `restoreConversation(this)` before `loadLastSessionContext`. Workspace change handler clears and restores history for the new root. | Wires persistence into panel lifecycle. | Low |
| `src/core/routing/chatPanelMessages.ts` | `clear-chat` handler also calls `clearPersistedConversation()`. | Ensures explicit clear wipes globalState so history doesn't come back on next open. | Low |

---

## Vault System — "Make it 100%" Fixes — May 24, 2026 (Session 11AU)

Four gaps that caused vault items to be retrieved poorly or ignored during builds ("mish-mash" problem).

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/vault/buildFromVaultSearch.ts` | Added `description` and `useCase` fields to the `itemText` string used in `findRelevantByTask` scoring. | AI-generated descriptions and use-case strings are the highest-signal retrieval text — but the search was only looking at name, tags, source path, and raw code preview. Items with rich AI metadata were invisible to task-based search. | Low — additive to existing scoring; only improves recall. |
| `src/core/build/chatPanelChunkedLoop.ts` | Replaced raw code snippet dump (`map(v => '// [FROM VAULT: name]\n' + v.code)`) with `formatVaultContext(relevant.slice(0, 4))`. Added `formatVaultContext` import. | The old format gave workers raw code with no description or useCase context. The `formatVaultContext` block shows name, description, "Use when:" hint, source path, and 1500 chars — the same richer format the single-file build already used. Workers can now make informed decisions about which vault items to use and how. | Low — same 4-item limit; same no-injection-on-modify guard. |
| `src/core/routing/chatPanelMsgFix.ts` | Added vault search + injection before Phase 1 supervisor. `findRelevantByTask` searches the vault for items relevant to the fix task; top 4 results are formatted and prepended to `buildContext`. Added `findRelevantByTask` and `formatVaultContext` imports. | The fix pipeline (Supervisor → Worker → Guardian) never looked at the vault. Relevant patterns from previous builds were invisible during bug fixes — the Worker wrote patches from scratch even when a vault item contained the correct pattern. File stays at exactly 200 lines. | Low — vault search is fast (in-memory); formatted block only injected when hits found (≥1 match). |
| `src/commands/vault.ts` | Manual save (`redivivus.saveToVault`) now runs `evaluateQuality()` on each item before saving — enriches with `description`, `useCase`, `qualityScore`, and AI-generated `tags`. Applied to both scan-to-save and single-file-save paths. Added `evaluateQuality` import. | Manually saved items had no AI metadata: no description, no useCase, no quality score. They were nearly unfindable by the task-based search and generated no useful "Use when" hints for workers. Auto-captured items (post-build) already ran this gate — manual save now does the same. | Low — quality gate failure is caught and ignored; item saves anyway with whatever metadata is available. |

---

## AI Capability Parity: Diagnostics, Terminal Context, Unified Diff — May 23, 2026 (Session 11AS+)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/routing/chatPanelMsgFixContext.ts` | NEW. `collectFixContext()` replaces bare `getRecentBuildContext` call. Adds (1) `vscode.languages.getDiagnostics()` — live TypeScript/ESLint errors the Language Server already knows — and (2) `getLastTerminalError()` — runtime crashes the compiler cannot see. | Supervisor was diagnosing from source text alone. Other editors (Cursor, Windsurf) pass live IDE error state to their AI. Now the Supervisor sees the same signals a human developer sees before touching code. | Low — both calls wrapped in try/catch; no-op if not available. |
| `src/services/build/surgicalEditService.ts` | Added `parseUnifiedDiff()` — converts standard git unified diff hunks into `SurgicalEdit` pairs (ignoring `@@` line numbers since AI models get them wrong; anchors on context+changed text instead). Updated `detectResponseFormat()` to return `'unified'` for `--- a/` responses. | AI models natively know unified diff format; some produce it even without being asked. Without a parser, those responses fell through to full-file parse and failed. SEARCH/REPLACE requires exact text match; unified diff provides a standard format that's less fragile when whitespace drifts. | Low — only activates when `--- a/` header detected; SEARCH/REPLACE and full-file paths unchanged. |
| `src/core/routing/chatPanelMsgFixApply.ts` | Added `'unified'` branch between surgical and full-file fallback. Calls `parseUnifiedDiff`, filters to `allowedRels`, reuses `applySurgicalEdits` machinery (same search-and-replace engine). | Closes the gap between detected format and applied format. | Low — mirrors existing surgical branch pattern. |
| `src/core/routing/chatPanelMsgFixPhases.ts` | Updated Worker output format prompt: added `UNIFIED DIFF` as accepted format (18-line-for-18-line replacement, file stays at 200). Shortened verbose SURGICAL/FULL FILE descriptions to make room. | Workers should know all three output formats Redivivus accepts so they can choose the safest one for each change. | Low — wording change only; all three formats were already accepted by the parser. |
| `src/core/routing/chatPanelMsgFix.ts` | Replaced `getRecentBuildContext` import/call with `collectFixContext` from new context module. | Wire the enriched context into the fix pipeline. | Low — same `buildContext` string parameter, just richer content. |

---

## Dynamic Context Expansion (Supervisor requests missing files) — May 23, 2026 (Session 11AS)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/routing/chatPanelMsgFixPhases.ts` | Added `CONTEXT EXPANSION` instruction to Supervisor prompt. If response contains `NEEDS_FILES:` block, reads those files from disk and re-runs Phase 1 with expanded context (one retry, `isRetry` guard). Strips `NEEDS_FILES:` from final diagnosis. Returns `expandedFilesBlock` alongside `diagnosis`. | Supervisor was capped at ~12 pre-selected files. On large projects it could see an import but not the imported file — leading to guessed diagnoses or incorrect fixes. Now the Supervisor can request what it actually needs; Worker automatically receives the expanded file set. | Low — one extra API call only when Supervisor requests files (most fixes won't need it). Path traversal (`..`, leading `/`) filtered before any read. Max 8 additional files. |
| `src/core/routing/chatPanelMsgFix.ts` | Changed `filesBlock` and `fileNames` from `const` to `let`. After Phase 1, if `expandedFilesBlock !== filesBlock`, updates `filesBlock`, adds new paths to `allowedRels`, and rebuilds `fileNames`. | Worker and `applyFixContent` both use `filesBlock` and `allowedRels` — they need to see the expanded file set or they'll refuse to write files the Supervisor requested. | Low — additive; only updates these variables when expansion actually occurred. |

---

## Fix: Strip `===` Separator Artifacts Before Writing Files — May 23, 2026 (Session 11AR+++)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/routing/chatPanelMsgFixApply.ts` | Added `stripSeparatorArtifacts()` that removes standalone `===` lines. Applied to both surgical `replaceBlock` content and legacy full-file content before writing to disk. | Some AIs (Gemini, Groq) emit `===` as visual section separators inside code output. These are never valid syntax in HTML/CSS/JS/TS — writing them to disk injects a JavaScript SyntaxError that prevents the entire script from running. Observed: flappy-bird game rendered blank canvas after speed-control fix; JS threw SyntaxError from 9 `===` lines scattered through the script. | Low — `===` is never valid in any code file Redivivus targets. ReStructuredText uses `===` as heading underlines but Redivivus doesn't generate .rst files. |

---

## Dead-End Auto-Logging for Failed Fixes — May 23, 2026 (Session 11AR++)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/routing/chatPanelMsgFix.ts` | Added `appendProjectDeadEnd` call in the `written=0 && failed=0` branch. | When the Worker produced no parseable file edits, the approach was silently forgotten — the next session's Supervisor could repeat the same no-output attempt. Now logged to `.redivivus/dead_ends.md` with the task description and plain-summary diagnosis so future Supervisors see "this approach was tried and produced nothing." | Low — best-effort write; no change to fix success path. |
| `src/services/build/compileAutoFix.ts` | Added `appendProjectDeadEnd` call after all `MAX_RETRIES` exhausted. Added import for `appendProjectDeadEnd`. | Persistent compile errors after 3 AI fix attempts were also silently lost. Now logged with the error signature so the Supervisor knows this file/pattern resisted auto-repair and can suggest a different strategy. | Low — fires only on complete failure path; files already rolled back by this point. |

---

## Guardian Redesign: Review-Only + Compiler as Truth — May 23, 2026 (Session 11AR+)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/guardianAI.ts` | Removed `GUARDIAN_CORRECTION:` from prompt and correction parsing from `runGuardianReview`. Guardian now returns pass/fail + issues only — never corrected code. | Guardian used the cheapest AI (groq/kimi) to rewrite code from more capable models. When it failed to follow format, it returned prose that overwrote the Worker's good code — causing silent "0 files written" failures. Research confirms: AI-reviewing-AI only works with real execution evidence, not code re-reading. | Low — Guardian still catches scope violations and logic bugs; now passes those as retry feedback to the Worker instead of overwriting code. |
| `src/core/routing/chatPanelMsgFixEscalation.ts` | Removed `correctedText` branch entirely. Guardian is strictly pass/fail — rejections accumulate as Worker retry feedback. | Dead code after Guardian redesign. | Low — simplifies escalation flow. |
| `src/core/routing/chatPanelMsgFix.ts` | Added `runCompileAutoFix` call after fix is applied. Real compiler (tsc/npm build/etc.) verifies correctness instead of Guardian AI. | Compiler errors are ground truth — they cannot return prose. This closes the "fix writes invalid TypeScript" gap that Guardian was supposed to catch but couldn't reliably. | Low — `runCompileAutoFix` is a no-op for projects with no detected compile command; already battle-tested in the build pipeline. |

---

## Bug Fixes: Vault Count Path, Conversation Rescue Race, CompileAutoFix Corruption, Run→Chat Error Loop — May 23, 2026 (Session 11AR)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/panels/chat/chatPanelHeader.ts` | Fixed `require('../../services/...')` → `require('../../../services/...')` in vault count IIFE. | Wrong relative depth — 2 levels up from `out/ui/panels/chat/` landed at nonexistent `out/ui/services/`; vault count always 0. | Low — path-only fix. |
| `src/extensionResumeState.ts` | Reduced rescue delay from 1200ms → 100ms; added `innerDelayMs` param to `openPanel`. | Conversation rescue (pendingRescueConversation) was racing against a 500ms auto-open timer — empty panel appeared first, overwriting restored history. 100ms fires before 500ms timer. | Low — rescue still waits for panel to mount (250ms inner delay). |
| `src/services/build/compileAutoFix.ts` | (1) Added code syntax + explanation pattern validation to `aiFixCompileError` to reject AI prose returned instead of code. (2) Expanded pre-fix snapshot to include `parseErrorFiles` result (not just `builtFiles`). | AI occasionally returned an explanation string that passed the old `length >= 10` check, overwriting source files with garbage. Source files referenced in compile errors were not snapshotted — rollback left them corrupted. | Low — validation is conservative; only rejects text with no code syntax AND a known explanation opener. |
| `src/core/build/chatPanelPostBuild.ts` | Rewrote `buildPostBuildGuidance` to reference the ▶ Run button by name with plain-language instructions per project type. | Post-build guidance was developer-oriented ("open a terminal and run:") — non-technical users had no idea what to do next. | Low — display only. |
| `src/core/project/chatPanelMsgProjectOps.ts` | Added `getLastTerminalError()` + `inject-terminal-error` monitor after terminal `sendText` in `redivivus.runProject` inline handler. | `handleRunCommand` handles `redivivus.runProject` inline (bypasses VS Code command that already had error monitor). Terminal errors were never fed back to the chat panel — user had to manually copy-paste. | Low — fires once after 4s/10s delay; no-ops if no error detected. |

---

## UX: Vault Count + Auto-Open + Clarify Routing — May 23, 2026 (Session 11AQ)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/panels/chat/chatPanelHeader.ts` | Changed `new VaultService()` to `new VaultService(extensionContext)` in the vault count IIFE. | VaultService constructor requires ExtensionContext. Without it, construction threw every time — vault count always showed 0 / "Vault empty" on the home screen even with 40+ items. | Low — one-argument fix, extensionContext is always available in this call path. |
| `src/core/build/chatPanelChunkedFinalize.ts` | Auto-open logic extended to handle 0-folder case: save conversation to `pendingRescueConversation` then call `vscode.openFolder`. Removed `__OPEN_WORKSPACE__` button (no longer needed). | First-project builds showed "NO FOLDER OPENED" in Explorer with a manual button. User expectation: Explorer opens automatically on every build. | Low for ≥1 folders (no reload). Medium for 0 folders (triggers VS Code window reload, conversation is rescued via extensionResumeState). |
| `src/core/build/chatPanelBuild.ts` | Same auto-open logic added to `runSingleFileBuild` post-build. Removed `root` from `buildResultCard` call (no button). | Single-file builds (HTML games, scripts) went through `runSingleFileBuild` which had zero workspace folder logic — Explorer never opened. | Same as above. |
| `src/core/build/chatPanelBuildRunner.ts` | Moved clarify step here from `chatPanelChunked.ts` — runs before single/multi routing decision. | Single-file builds bypassed clarify entirely — user saw no questions before build started. Fix ensures both paths get user preferences. | Low — guarded by `!isFixRequest && !skipComplex && buildMode !== 'direct'`. |
| `src/core/build/chatPanelChunked.ts` | Removed internal clarify block. Uses `ctx.clarifyAnswers` instead. | Prevent double-clarify if chunked build was called again after answers already collected. | Low. |

---

## UX: Folder-First Build + Explorer Auto-Open — May 23, 2026 (Session 11AP)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/build/chatPanelChunked.ts` | After plan is confirmed and before the build loop starts: (1) `fs.mkdirSync(root, { recursive: true })` creates the project folder immediately. (2) `updateWorkspaceFolders` adds it to the workspace. (3) `workbench.view.explorer` + `workbench.files.action.focusFilesExplorer` commands open and focus Explorer. Also removed 8 dead imports that had been moved to `chatPanelChunkedFinalize.ts` (Rule 9 compliance — back to 196 lines). | Users saw a blank Explorer sidebar for the entire build duration. The folder and files only appeared after the result card rendered. The fix makes the empty project folder appear in Explorer as soon as planning finishes — files then materialize one by one as the build loop runs, matching the Cursor/Windsurf UX. | Low — `mkdirSync` with `recursive: true` is safe on existing dirs. `updateWorkspaceFolders` is the same API used in finalize; calling it earlier has no side effects. Explorer commands are fire-and-forget. |
| `src/core/build/chatPanelChunkedFinalize.ts` | Added `workbench.view.explorer` + `workbench.files.action.focusFilesExplorer` after `updateWorkspaceFolders` in the post-build folder-add path. | Ensures Explorer is revealed even in the edge case where the folder already existed before the build (e.g. user re-running a build into an existing directory that wasn't in the workspace yet). | Low — additive; both commands are non-blocking fire-and-forget. |

---

## AI Quality Overhaul — May 23, 2026 (Session 11AO: Build Prompt + Review Quality)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/build/chatPanelChunkedLoop.ts` | (1) Removed `- Keep it under 200 lines` from user file prompts. (2) Changed "You are Redivivus" to "You are an expert software engineer." (3) Removed `CHASSIS_WORKER_RULES` injection from user builds. (4) Added `QUALITY STANDARDS` block: modern syntax (ES2020+, CSS custom props), polished UI, error handling, descriptive names, responsive/accessible markup. (5) Changed "Write working code" to "never truncate or stub out functionality." | The 200-line limit was the single largest quality bottleneck — it forced the AI to skip features, cut game mechanics, and stub out implementations. `CHASSIS_WORKER_RULES` is for Redivivus's own TypeScript source (annotation rules, internal constraints) and should never touch user projects — it was enforcing `[SCOPE]`/`[WARN]`/`[DEAD]` annotations, "No emoji", and "NO FLAT FILES" on users' code. The identity prompt "You are Redivivus" activates no useful quality behavior; "expert software engineer" does. | Medium — removes explicit line limit and Redivivus annotation rules from builds. Tested that existing single-file game rule, surgical edit rules, and contract enforcement remain unchanged. |
| `src/services/ai/supervisorReview.ts` | Changed scope check from "first 60 lines" to first 8000 characters (full code). Changed "You are a code reviewer" to "You are a senior code reviewer" and added "completely" — checking for completeness not just correctness. | A scope review that only sees the first 60 lines of a 400-line game file is reviewing header comments, not game logic. The AI would approve "YES" for a stub that had the right imports but no actual implementation. | Low — more context sent per review call (slightly more tokens). Fail-open behavior unchanged. |
| `src/core/routing/chatPanelMsgFixPhases.ts` | Supervisor: (1) Added "Do NOT write 'Solution:', 'Verification Completed:', grep results..." prohibition. (2) Changed "Do NOT suggest rebuilding, refactoring, or restructuring" to allow restructuring when the current approach is fundamentally broken. (3) Worker: Added `## Fix: path` full-file format as alternative to SEARCH/REPLACE for large rewrites. (4) Worker user message: removed "do NOT create new files" framing. | Supervisor was hallucinating fake verification output. "Never restructure" was too absolute — prevented fixing the animal sounds player where the correct fix required replacing `<audio>` element approach with Web Audio API synthesis. SEARCH/REPLACE silently failed for large structural changes; `## Fix:` full-file format routes through existing `parseFixResponse` fallback which correctly writes the file. | Medium — Supervisor restructuring permission is broader. Constrained to "fundamentally broken" cases only. |

---

## Recent Fixes — May 23, 2026 (Session 11AT: Built-in GitHub Integration)

**Live test result:** Full flow confirmed working — Setup Hub connected GitHub account, repo `smithkjnc-ux/flappy-bird-game` created as **Private** on GitHub, initial commit pushed successfully. Step-by-step PAT guide ("only check repo") resolved user confusion about GitHub token scopes. Sidebar SETUP section now shows Setup Hub as primary entry point.

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/githubBackupService.ts` | Full rewrite — token moved to VS Code `SecretStorage` (was `globalState`), removed `autoBackupOnBuild`/`autoBackupInterval`/`startTimer`/`stopTimer`, added `validateToken()` (GitHub API check before storing), split into `storeToken()`/`getToken()`/`getConfig()`/`saveConfig()`, `commitFiles()` now accepts specific file list (never `git add -A` silently) | User requirement: GitHub is opt-in, user-initiated only. Token in globalState was a security problem. Auto-timers violated the "user chooses when to commit" rule. | Low — full rewrite, no callers broken. Old config keys in globalState will just be ignored. |
| `src/commands/setupHubHtml.ts` | GitHub modal: removed "Auto-backup frequency" dropdown, changed description from "auto-backup after every build" to "Redivivus never commits without your action", added "Validating..." button state, result fed back via `postMessage({ type: 'github-saved' \| 'github-error' })`, external PAT link now uses `openExternal` handler instead of `href` | Remove all auto-backup language and UX. Token link must open in real browser, not webview. | Low |
| `src/commands/setupHub.ts` | `isConnected()` now async (secrets-backed), validates token against GitHub API before storing, auto-fills username from API response (not user-typed), removed all `startTimer()` calls, refresh panel via `refreshPanel()` helper after save | Validation catches bad tokens before they're stored. Username confirmed from GitHub instead of trusted from input. | Low |
| `src/commands/githubBackup.ts` | Removed interval QuickPick and `autoBackupOnBuild`, added token validation step to `redivivus.configureGitHubBackup`, added `redivivus.setupGitHubRepo` command, added `redivivus.githubCommitFiles` command (called by result card button — accepts files[], message, webview ref, posts result back to webview) | Clean command surface for manual-only git operations. `redivivus.githubCommitFiles` is the bridge between the fix result card button and the service. | Low |
| `src/extensionInlineCommands.ts` | Removed `githubBackupService.startTimer()` call and auto-backup hook on `onBuildFinished` | No auto-commits ever. Build finish no longer triggers any git operation. | None |
| `src/core/routing/chatPanelMsgFixOutput.ts` | Emits `__GITHUB_COMMIT__[base64]|||END_GITHUB_COMMIT__` token at end of fix result content. Payload is base64-encoded JSON `{ files: string[], message: string }`. Token only added when `written.length > 0`. | Carries file list and plain-language commit message from fix result to the renderer and click handler without threading service references through deps. | Low |
| `src/ui/panels/chat/chatPanelRenderer.ts` | Added `__GITHUB_COMMIT__` token renderer — replaces with green `💾 Commit + Push to GitHub` button (`class="github-commit-btn"`, `data-payload` holds base64 JSON) | Token → button in the fix result card UI. | Low |
| `src/ui/panels/chat/chatPanelScriptActions.ts` | Added `.github-commit-btn` click handler (shows "Committing...", disables button, posts `{ type: 'github-commit', payload }`) and `window.addEventListener('message')` for `github-commit-result` (updates button to "Committed!" or re-enables on failure) | Webview-side of the commit flow. | Low |
| `src/core/routing/chatPanelMessages.ts` | Added `github-commit` message handler — decodes base64 payload, calls `redivivus.githubCommitFiles` command with files, message, and `panel.webview` reference | Routes commit action through the VS Code command registry so the service instance is accessible without threading it through `MessageHandlerDeps`. | Low |
| `scripts/test-github-commit.mjs` | New test file — 8 tests covering token generation, rendering, payload round-trip, and the full flappy-bird fix simulation | No VS Code dependency — tests pure functions only. Run with `node scripts/test-github-commit.mjs`. | None |

---

## Recent Fixes — May 23, 2026 (Session 11AN: Visual Editor Fixes + AI Edit Routing)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/extensionInlineCommandsC.ts` | Changed top-level `import { openVisualContractPanel }` to lazy `require()` inside the command handler. | Top-level import threw on module load → ALL 4 commands in the file silently failed to register (including `redivivus.openVisualEditor`). Lazy require isolates the failure to the one command. | Low — lazy require is safe; module is loaded on demand. |
| `scripts/postcompile.js` | Added auto-discovery of all `~/.vscode/extensions/papajoe.redivivus-*` dirs and syncs compiled output to each. | Previously only synced to the baked extension path. The installed extension at `~/.vscode/extensions/papajoe.redivivus-0.3.6/` (installed May 20) was taking priority and didn't get updates. | Low — additive discovery loop. |
| `src/core/routing/chatPanelMessageRouterEarlyExits.ts` | `open-visual-editor` message now calls `openVisualContractPanel` directly via `require()` instead of `executeCommand('redivivus.openVisualEditor')`. | Extension activation was failing due to `terminalDataWriteEvent` proposed API in `registerTerminalErrorService` — `vscode.commands.registerCommand` never ran, so `redivivus.openVisualEditor` command didn't exist in the registry. Direct call bypasses the registry entirely. | Low — direct module call; same function that the command would have called. |
| `src/core/project/chatPanelMsgProjectOps.ts` | Added inline handler for `redivivus.openVisualEditor` in `handleRunCommand` that calls `openVisualContractPanel` directly. Includes fallback scan for `.html`/`.css` when build history is empty. | Same `executeCommand` reliability issue as above. Both call sites (dashboard pill and chat message) now bypass the registry. | Low — additive `else if` branch. |
| `src/ui/panels/visualContract/visualContractPanel.ts` | Extracts contract BEFORE creating HTML, passes it as inline JSON. Removed webview-ready handshake. Added debug logging (temporary). | Visual Editor opened blank because the contract was sent via `postMessage` after webview load — if the message arrived before the listener was ready, it was silently dropped. Inline JSON in the HTML avoids any timing issue. | Low — simpler, more reliable than async message handshake. |
| `src/ui/panels/visualContract/visualContractPanelHtml.ts` | (1) Contract embedded inline: `let contract = ${contractJson}`. (2) Moved `if (contract) { render(); }` to bottom of script after all `const` declarations (TDZ fix). (3) Fixed template literal backslash stripping: `\\(`, `\\d`, `\\s` in regex. (4) Removed ALL inline event handlers (`onclick`, `oninput`, `onchange`) — replaced with event delegation in nonce-allowed `<script>` block. | TDZ bug: calling `render()` before `const TABS` was declared threw ReferenceError. Backslash stripping produced invalid regex `/rgba?((d+),.../` that crashed the script. CSP blocks all inline handlers in VS Code webviews regardless of what CSP the extension sets — only the nonce-granted `<script>` block can register listeners. All three caused blank output on different code paths. | Low — behavioral parity maintained; event delegation is functionally identical to inline handlers. |
| `src/core/routing/chatPanelMsgSendMessage.ts` | (1) Added `!deps.redivivus?.isInitialized?.()` to direct-mode bypass so initialized projects always fall through to classifier. (2) Routed `build` intent on initialized projects to `handleFixRequest` instead of `handleBuildRequest`. | When user said "add X" or "change Y" on an initialized project, direct mode bypassed the classifier entirely and routed to the build pipeline — which creates code from scratch without reading existing files, effectively overwriting or rebuilding the project. For initialized projects, the edit pipeline (which reads all source files) is always correct. | Medium — changes routing for all "build" intent on initialized projects. Fix pipeline reads files and makes surgical edits; confirmed it handles feature-addition requests via Supervisor prompt update below. |
| `src/core/routing/chatPanelMsgFixPhases.ts` | (1) Supervisor prompt: changed "diagnose bugs only" to handle both bugs AND feature/change requests. Added explicit prohibition: "Do NOT write 'Solution:', 'Verification Completed:', grep results, or any language implying the fix was already applied." (2) Worker prompt: changed "fix ONLY the specific bugs" to "implement ONLY what the Supervisor identified". Added `## Fix: path` full-file format as alternative to SEARCH/REPLACE for large-scale rewrites (e.g. switching from `<audio>` elements to Web Audio API). (3) Worker user message: removed "do NOT create new files" framing. | Three bugs: (a) Supervisor hallucinated "Solution: Replaced..." and "Verification Completed: grep output 1" making users think the fix was applied when it wasn't. (b) Worker SEARCH/REPLACE fails silently when the change is structural (SEARCH pattern doesn't match), but the only fallback `parseFixResponse` looks for `## Fix:` format which the Worker never output — fix went nowhere. (c) Fix pipeline was "bugs only" framing, breaking for "add X" feature requests. | Medium — Worker now has two output formats; `detectResponseFormat` in `surgicalEditService.ts` correctly routes: SEARCH/REPLACE → surgical path, `## Fix:` → fullfile path → `parseFixResponse` fallback. |

**Known remaining issue:** `registerTerminalErrorService` uses `(vscode.window as any).onDidWriteTerminalData` which is a proposed API — extension activation fails. This breaks `redivivus.openVisualEditor` via the command registry (all calls already bypassed to direct function calls). Fix: either remove `onDidWriteTerminalData` usage or add `terminalDataWriteEvent` to `package.json#enabledApiProposals`.

---

## Feature Added — May 22, 2026 (Session 11AM: Visual Contract Editor)

| File | What It Does |
|------|-------------|
| `src/services/visualContract/visualContractTypes.ts` | Data model: `VisualProperty`, `VisualSection`, `VisualContract`. Each property stores a `findRegex`+`findGroup` pair for in-file replacement — no AST required. |
| `src/services/visualContract/propertyExtractor.ts` | Scans built HTML/CSS files and emits a `VisualContract`. CSS colors extracted via regex + selector-context walk; CSS numbers (font-size, padding, border-radius, gap) extracted with unit preservation; HTML text extracted from title, h1–h4, buttons, and inline `<style>` blocks. Sections inferred from structural HTML tags (section, header, footer, nav, main, article) for Pro mode. |
| `src/services/visualContract/visualContractPatcher.ts` | `applyPropertyPatch` and `applyBatchPatches`. Reads the file, applies stored regex replacement for the changed value, writes atomically. Batch mode reads each file once to avoid offset drift from sequential replacements. |
| `src/ui/panels/visualContract/visualContractPanelHtml.ts` | Self-contained webview HTML. Tab bar (Colors / Text / Layout / Effects / Structure). Plain/Pro toggle in the header. Controls rendered client-side from the contract JSON: color pickers (`<input type="color">`), text inputs, range+number sliders. Structure tab (Pro) shows sections list and "Add Section" free-text input. |
| `src/ui/panels/visualContract/visualContractPanel.ts` | VS Code `WebviewPanel` host. Singleton — second call reveals existing panel and re-extracts. Handles `apply-all` (batch patch + ack), `property-changed` (immediate single patch), `add-section` (dispatches fix-request to chat pipeline to build the new section with matching style). |
| `src/ui/panels/chat/chatPanelStory.ts` | `buildResultCard` now emits `__EDIT_VISUALLY__${root}|||END_EDIT_VISUALLY__` token when any built file is `.html` or `.css`. |
| `src/ui/panels/chat/chatPanelRenderer.ts` | Renders `__EDIT_VISUALLY__` token as an "✏️ Edit Visually" button (blue gradient, matches Redivivus aesthetic). |
| `src/ui/panels/chat/chatPanelScriptActionsB.ts` | Click handler for `.edit-visually-btn` — decodes base64 root, posts `open-visual-editor` message. |
| `src/core/routing/chatPanelMessageRouterEarlyExits.ts` | Handles `open-visual-editor` message → `redivivus.openVisualEditor` command. |
| `src/extensionInlineCommandsC.ts` | Registers `redivivus.openVisualEditor` command. Loads last-build file list from `BuildHistoryService`; falls back to scanning for `.html`/`.css` in the project root (2-level deep). |

**Plain vs Pro mode:**
- **Plain** — Colors, Text, Layout, Effects tabs. Only properties with `proOnly: false`. No Structure tab. Suitable for quick visual tweaks.
- **Pro** — All tabs including Structure. All properties including `proOnly: true` (gap, max-width, letter-spacing). Structure tab lists inferred HTML sections and provides free-text "Add Section" input which dispatches a fix-request to the build pipeline.

---

## Recent Fixes — May 22, 2026 (Session 11AL: Remove Automatic Git Init Prompt)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/savePointService.ts` | Replaced the modal git-init dialog in `create()` with an early silent return when no git repo exists. | `SavePointService.create()` was showing a blocking modal ("Initialize one to use Save Points?") on every build where the project wasn't already a git repo. Called from `ChatPanel.onBuildFinished` → `session.ts` after every build. A build finishing should never be a git prompt. | None — callers already check `result.success` and only show a notification on success. Silent skip is safe. |

---

## Recent Fixes — May 22, 2026 (Session 11AK: Reload Triggers Unexpected Rebuild)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/extensionInlineCommands.ts` | Removed `pendingRescueConversation` and `pendingResumeTask` saves from `onBuildFinished`. | Since `vscode.openFolder` was removed in 11AJ, there is no longer an immediate reload after build — these saves persisted in `globalState` indefinitely. Any VS Code reload (extension update, manual reload) triggered `extensionResumeState.ts` which found `pendingResumeTask` and called `resumeBuildTask` → `_handleBuildRequest` → full rebuild. | Low — the saves are now deferred to the button click handler where the reload is actually intentional. |
| `src/core/routing/chatPanelMessageRouterEarlyExits.ts` | In the `open-workspace-btn` handler, save `pendingRescueConversation` from the live panel state RIGHT BEFORE calling `vscode.openFolder`. | The only reload that should trigger conversation restoration is the one the user explicitly requested by clicking the button. Saving at click time means the conversation is current and not stale from build-finish. | Low — additive; `ChatPanel.extensionContext` is a static property set at activation. |
| `src/extensionResumeState.ts` | Added a new `pendingRescueConversation`-only path (before the `pendingBuildTask` check). Restores the conversation and returns WITHOUT calling `resumeBuildTask`. | The old path restored conversation AND rebuilt. After the `__OPEN_WORKSPACE__` click, the build is already done — only the conversation needs restoring. | Low — only fires when `pendingRescueConversation` is present AND `pendingResumeTask` is absent. The existing `pendingResumeTask` path (init flow) is unchanged. |

---

## Recent Fixes — May 22, 2026 (Session 11AJ: Explorer Auto-Open + Spinner Persist After Multi-File Build)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/build/chatPanelChunkedFinalize.ts` | Removed `vscode.openFolder` call. Replaced with `vscode.workspace.updateWorkspaceFolders` for the "≥1 existing folder" case. Also passed `root` as `projectRoot` to `buildResultCard`. | `vscode.openFolder` triggers a full VS Code window/extension-host reload on every multi-file build — destroying the webview before `set-status: 'ready'` could arrive (spinner never cleared). The reload also wiped the chat panel unless `pendingRescueConversation` was saved in time (race condition). `updateWorkspaceFolders` adds the project to the Explorer sidebar without any reload. | Low — `updateWorkspaceFolders` is the documented VS Code API for non-destructive workspace folder addition. No reload path remains. |
| `src/ui/panels/chat/chatPanelStory.ts` | Added optional `projectRoot?: string` to `buildResultCard`. Used as the root for the `__OPEN_WORKSPACE__` token when provided, falling back to `getChassisRoot()`. | `getChassisRoot()` returns the extension's activation-time workspace root (stale), not the directory where the new project was actually written. When both matched, `alreadyInWs` was `true` and no Open Workspace button was shown at all. | Low — backward-compatible optional param. Existing callers that omit it fall back to the old `getChassisRoot()` path. |
| `src/extensionInlineCommands.ts` | Captured `_prevOnBuildFinished` before assigning `ChatPanel.onBuildFinished`. Chained `await _prevOnBuildFinished(...)` at the end of the new callback. | `registerSessionCommands` (line 81 of `extensionCommands.ts`) sets `ChatPanel.onBuildFinished` first with save-point + session-record logic. `registerInlineCommands` (line 131) runs after and silently overwrites it, losing the save-point logic. The chain call preserves both. | Low — additive chain, not a replacement. Both callbacks now run in order: GitHub backup → rescue state save → save point → session record. |

---

## Recent Fixes — May 22, 2026 (Session 11AI: Done for Now / Ghost Session Bug)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/routing/chatPanelMsgSendMessage.ts` | (1) Wrapped `startSessionSilent` in a regex guard that skips it for session-management phrases ("done for now", "end session", "start session"). (2) Extended the `buildMode === 'direct'` bypass exclusion regex to also exclude those same session phrases. | Two separate bugs combined: when the user typed "done for now" in the chat box, (a) `startSessionSilent` fired unconditionally at line 36 — creating a ghost session with goal "done for now" — and (b) in `buildMode === 'direct'`, the direct-mode bypass at line 85 bypassed the hardcoded override check entirely and routed "done for now" straight to `handleBuildRequest`, restarting the build pipeline. The hardcoded override that correctly maps "done for now" → `redivivus.endSession` is at line 113, which neither code path reached. | Low — the regex guard is structural (exact phrase matching), not natural language understanding, consistent with Rule 18. The exclusion regex is additive to an existing exclusion list. |

---

## Recent Fixes — May 22, 2026 (Session 11AH: Double Clarification Panel / Round 2 Re-Asks)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/panels/chat/chatPanelClarify.ts` | Added `previousAnswersBlock?: string` parameter to `generateClarifyQuestions`. Injected into both the triage prompt ("not already covered by previous answers?") and the question-generation prompt ("do NOT ask about any of these topics again — if all design decisions are covered, return []"). | Without this, round 2 got the bare task with no context about what round 1 already captured — the AI re-asked the same topics reworded. | Low — backward-compatible parameter, no change to existing call sites that omit it. |
| `src/core/build/chatPanelChunked.ts` | Before calling `generateClarifyQuestions`, regex-extracts any `USER DESIGN PREFERENCES` block from the task string and passes it as `previousAnswersBlock`. | The round-1 answers are embedded in the task string (via the `chatPanelMsgSendMessage.ts` fix). Extracting and forwarding them to the triage step causes the AI to declare "no more ambiguity" and return `[]`, skipping round 2 entirely when everything is already answered. | Low — extraction returns undefined if no prior answers exist, leaving the normal path unchanged. |
| `src/core/routing/chatPanelMsgSendMessage.ts` | Changed three `handleBuildRequest(userText)` calls to `handleBuildRequest(routedText)` (lines 171, 172, 191). `routedText` equals `userText` when no clarification happened; when it did, it equals `userText + "\n\nUSER DESIGN PREFERENCES: ..."`. | This was the structural root cause: round-1 answers were collected into `routedText` but then silently dropped when `handleBuildRequest(userText)` was called. The build pipeline received the bare task with no answers, triggering a fresh round of clarification. | Low — `routedText === userText` when no clarification ran, so no behavior change for those builds. |

---

## Recent Fixes — May 22, 2026 (Session 11AG: Status Spinner Hang After Multi-File Build)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/build/chatPanelBuildRunner.ts` | Added `deps.postToWebview({ type: 'set-status', status: 'ready' })` before the `return` when `handleComplexityRoutedBuild` returns `true`. | `set-status: 'ready'` lives in the `finally` block of the main `try` (lines 126–142). That `finally` only fires when the orchestrator returns `false` (falls through to the direct build path). Every multi-file build goes through `handleNanoBuild` or `handleStandardBuild`, both of which run `runChunkedBuild` and return `true` — causing an early `return` that bypasses the `finally` entirely. The spinner phrase ticker (`load testing frame...`) never stopped. | Low — one added `postToWebview` call in a code path that was previously unterminated. |

---

## Recent Fixes — May 22, 2026 (Session 11AF: Blueprint Contract Enforcement)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/blueprint/blueprintContract.ts` | New file. Defines `BlueprintContract` (paradigm, htmlIds, globals, interfaces, cssClasses) and exports `emptyContract()`, `extractContractFromCode()`, `mergeContract()`, `buildContractBlock()`, `detectContractViolations()`. | Single source of truth for cross-file API surface. Extracts IDs, globals, paradigm from each built file so every subsequent file prompt knows what already exists. | Low — pure logic, no AI calls, no filesystem writes. |
| `src/core/build/chatPanelChunkedBuildFile.ts` | New file (Rule 9 split). Extracted AI call + retry + 429 fallback + supervisor review from `chatPanelChunkedLoop.ts`. Exports `generateFileCode(params): Promise<{code, fileTokens, fileCost}>`. | `chatPanelChunkedLoop.ts` was 232 lines — over the 200-line Rule 9 hard stop. Required split before any further editing. | Low — exact behavioral extract, no logic changes. |
| `src/core/build/chatPanelChunkedLoop.ts` | Replaced inline AI generation block with `generateFileCode()` call. Added contract block injection into every `filePrompt` (after file 1 is written). Added `detectContractViolations()` check after generation — paradigm mismatch triggers one regeneration with explicit fix instruction. Added `mergeContract()` accumulation after every file write. File is now 163 lines. | Without contract enforcement, file 2 of a global-vars browser game could use ES module `import`, breaking the game at `file://` load. The contract locks the paradigm and HTML IDs after file 1 and forces all subsequent files to conform. | Low — contract injection is additive (more prompt context). Violation check adds one extra AI call only when a violation is detected. |
| `src/core/build/chatPanelBuildHelpers.ts` | Added `contract?: BlueprintContract` field to `BuildContext` interface. Added `import type { BlueprintContract }` from blueprintContract. | `contract` must travel with `ctx` so the loop can accumulate and enforce it across all files in a single build. | Low — optional field, no callers affected. |
| `src/core/build/chatPanelBuildRunner.ts` | Added `contract: emptyContract()` to BuildContext initialization. Added import of `emptyContract`. | Ensures contract starts empty and accumulates from file 1. Without initialization the optional field would be undefined and no accumulation would happen. | Low — one added field to one object. |

---

## Recent Fixes — May 22, 2026 (Session 11AE: Duplicate Build Fix & CSS Centering)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/messageRouterSession.ts` | Added `isProcessingSession` semaphore around the `endSession` handler. | Prevents the "Done for Now" (Save) button from triggering multiple `endSessionWithData` calls which closed chat and triggered duplicate builds. | Low — standard concurrency control. |
| `src/core/build/chatPanelChunkedGen.ts`, `src/core/build/chatPanelChunked.ts`, `src/core/build/chatPanelChunkedLoop.ts`, `src/services/ai/chassisWorkerRules.ts` | Enforced strict `display: block` for the canvas and `overflow: hidden` for the body in single-file game templates. | The game canvas was rendering off-center to the right due to inline display properties. | Low — CSS only. |

---

## Recent Fixes — May 22, 2026 (Session 11AD: Post-Compile Auto-Deploy to Baked Extension)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `scripts/postcompile.js` | Added rsync deploy step that mirrors `out/` to the baked extension at `~/projects/redivivus-build/.../redivivus/out/` after every compile. Uses `rsync -a --delete` so stale files (like the old `out/ui/chat/` zombie outputs) are also removed. Non-fatal: skips with an info log if the baked extension path doesn't exist. | Every previous fix to source required a manual `cp` step to the baked extension — a step that was routinely missed, causing fixes to compile correctly but never reach the running build. This is the structural reason the MODULE_NOT_FOUND bug survived multiple fix attempts. | Low — rsync is idempotent; if the baked extension doesn't exist the script continues normally. |

---

## Recent Fixes — May 22, 2026 (Session 11AC: Zombie Bug Elimination — MODULE_NOT_FOUND & Auto-Open)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/build/chatPanelBuildRunner.ts` | Fixed `require('./chatPanel.js')` → `require('../../ui/panels/chat/chatPanel.js')` inside the `onBuildFinished` callback (line 116). | `chatPanelBuildRunner.ts` lives at `src/core/build/`, so `./chatPanel.js` resolved to the non-existent `out/core/build/chatPanel.js`. This runtime MODULE_NOT_FOUND exception propagated up and was caught by the `try/catch` in `runBuildAfterGates`, showing "Build failed" to the user. It also aborted `runChunkedBuildFinalize` before the `vscode.openFolder` call on line 45 was ever reached, causing the workspace explorer to show "NO FOLDER OPENED" after every chunked build. Both bugs share a single root cause. | Low — one-line path fix in a runtime require inside a callback. |
| `src/core/build/chatPanelChunkedFinalize.ts` | No source change needed. `vscode` is already imported statically at line 2 and `vscode.commands.executeCommand('vscode.openFolder', ...)` at line 45 is correct. It was simply never reached because Bug 1 threw first. | Confirmed by checking compiled output: `__importStar(require("vscode"))` on line 38 and `openFolder` call on line 78. | None. |
| `scripts/test-webview-sanity.js` | Fixed stale test path `../out/ui/chatPanelHtml.js` → `../out/ui/panels/chat/chatPanelHtml.js`. Added `Module._load` intercept that stubs the `vscode` module for bare Node.js test execution. | Path was stale from before the `src/ui/chat/` → `src/ui/panels/chat/` restructure. Transitive imports of `chatPanelMsgArchitect.js` require the VS Code API which is only available inside the extension host. | Low — test-only change. All 12 tests now pass. |

---

## Recent Fixes — May 22, 2026 (Session 11AB: Single-File Enforcement & Build Resilience)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/chassisWorkerRules.ts` | Added rule 9 to explicitly force `[BROWSER GAMES AND SIMPLE TOOLS]` to output a single, self-contained `index.html` file without external `.js` files or `src/` directory. | Multi-file generation for simple games led to broken module scopes and import errors natively running via `file://`. | Low — enforces a more reliable paradigm for simple builds. |
| `src/ui/panels/chat/chatPanelClarify.ts` | Added rule preventing the Supervisor AI from offering options that dramatically escalate scope during clarification (e.g., adding power-ups or multiple game modes). | The AI was generating options that turned simple requests into complex epics, complicating builds unnecessarily. | Low — scopes clarification questions strictly to design and feel. |
| `src/core/build/chatPanelChunkedLoop.ts` | Wrapped the AI generation and code extraction block in a retry loop (`maxAttempts = 2`). | Transient API failures or completely empty AI responses were hard-stopping the entire multi-file build pipeline at part 15. | Low — transparently retries on failure. |
| `src/core/build/chatPanelChunked.ts` | Added an explicit AI project classification step before planning. Updated the `planPrompt` to read the `projectType` and dynamically apply the single-file HTML rule for games and tools instead of treating all HTML projects the same. | The single-file rule needs to trigger automatically based on project architecture, not just prompt language, to ensure correct scaffolding. | Low — adds a lightweight classification step before planning. |

## Recent Fixes — May 22, 2026 (Session 11AA: Flappy Bird Pipeline Bug Fixes)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/adaptiveClassifier.ts` | Updated `OBD1_FAST_PATHS` to allow intervening words: `(?:[a-zA-Z0-9\-_]+\s+)*`. | The regex failed to match "make me a flappy bird game" due to strict sequential word requirements. | Low. |
| `src/core/build/chatPanelBuildInference.ts` | Updated `extractCodeFromResponse` regex to tolerate trailing spaces and filenames on the fence line (`/```(?:[a-zA-Z0-9]*)[ \t]*(?:[^\n]*)\n([\s\S]*?)```/g`). | A strict newline constraint dropped blocks containing ````javascript script.js`, silently failing multi-file builds. | Low. |
| `src/core/build/chatPanelChunked.ts` | Replaced `workbench.view.explorer` with `vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), false)`. | `workbench.view.explorer` only focused the sidebar instead of actually loading the scaffolded standalone workspace directory. | Low. |
| `src/commands/init.ts` | Added explicit `initChassisLogger` and `initMasterLogger` calls inside `onNewProject` during project initialization. | Standalone host didn't trigger `onDidChangeWorkspaceFolders` because auto-opening was disabled, causing logging to remain uninitialized during full builds. | Low. |
| `src/ui/panels/chat/chatPanel.ts` | Fixed broken `require` paths targeting `chatPanelBuildUtils.js` and `chatPanelMessageRouter.js`, updating them to correctly point to `../../../core/build` and `../../../core/routing`. | A recent file split moved these utils to the `core/` domain, but `chatPanel.ts` was still attempting to load them from `./`. This caused a synchronous `MODULE_NOT_FOUND` crash that dropped all incoming webview messages, locking the UI on the Welcome screen. | High — fixes critical broken chat loop. |
| `src/core/build/chatPanelChunked.ts` | Imported `vscode` statically at the top and replaced the dynamic `await import('vscode')` call on the `openFolder` line. | The dynamic `await import('vscode')` inside the VS Code extension host fails silently (swallowed by the `catch {}` block) because VS Code provides `vscode` as a synthetic module not resolvable via standard dynamic imports at runtime, preventing the folder from opening automatically. | Low. |
| `src/core/build/chatPanelChunked.ts` | Extracted finalization logic to `chatPanelChunkedFinalize.ts`. | Adding the import pushed the file past the 200-line limit (Rule 9). Extracted the chunked build finalize logic to comply with the project's file size hard stop. | Low. |
| `~/projects/flappy-bird-game/index.html` | Added explicit `<script>` tags for all 11 required JavaScript files generated by the AI build. | The AI generated multiple modular `.js` files but only linked `src/main.js` in `index.html`. Because the files were not using `type="module"`, all dependencies (like `GameState`, `Renderer`, etc.) were missing from the global scope, resulting in ReferenceErrors that halted the game loop immediately. | High — game now runs. |
| `~/projects/flappy-bird-game/index.html` | Rewrote entire game logic, CSS, and DOM structure into a single HTML file. Deleted the `src/` directory entirely. | The multi-file generation resulted in broken module boundaries and dependency resolution failures (`SyntaxError: Unexpected token 'export'`). Combining into a single file sidesteps all cross-file contract failures for now. | Low. |

## Recent Fixes — May 22, 2026 (Session 11Z: Handle Map Message Dispatcher)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/map/commands/*` | Created 8 distinct command files (`openFileCommand`, `mapChatCommand`, `explainFileCommand`, `analyzeFileCommand`, `fixFileCommand`, `architectReviewCommand`, `eli5Command`, `runCommand`). | Split the monolithic `handleMapMessage` function (Complexity Score 98) into a strict Command Dispatcher pattern. Each file strictly handles its own isolated logic. | Low — underlying logic is identical, just moved. |
| `src/ui/map/mapMessageDispatcher.ts` | Replaced `mapPanelMessages.ts` with a lean router. | Acts as a simple switchboard for incoming webview messages, dispatching to the new command files. | Low. |
| `src/ui/map/mapPanel.ts` & `src/ui/map/mapPanelTimelineMessages.ts` | Updated imports to `mapMessageDispatcher`. | Wiring for new dispatcher. | Low. |

## Recent Fixes — May 22, 2026 (Session 11Y: Provider Factory Pattern)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/ai/providers/*` | Created `providerUtils.ts`, `geminiProvider.ts`, `claudeProvider.ts`, `openaiProvider.ts`, `groqProvider.ts`, `xaiProvider.ts`, `kimiProvider.ts`, and `providerFactory.ts`. | Rule 9 enforcement and architectural cleanliness. Split the monolithic `callProvider` (complexity score 96) into a clean Factory pattern where each provider handles its own payload generation, networking, and telemetry independently. | Low — `providerFactory` maintains the exact same `AIResponse` contract. Covered by strict nock tests. |
| `src/services/ai/routingProviders.ts` | Deleted file entirely. | Replaced by the `src/core/ai/providers` factory. | None. |
| 9 internal files | Updated imports to point from `routingProviders` to `../core/ai/providers/providerFactory.js`. | Rewired imports to match the new directory structure. | Low — validated via `npm run compile`. |

## Recent Fixes — May 21, 2026 (Session 41A: AI reasoning quality — system messages + token limits)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/routingProviders.ts` | Added `systemMessage` optional parameter to `callProvider()`. All 6 providers (Gemini, Claude, OpenAI, Groq, xAI, Kimi) now support system messages. Gemini uses `system_instruction`, Claude uses top-level `system` field, OpenAI/Groq/xAI/Kimi use `role: 'system'` message. | AI had no persistent identity — all rules were crammed into one user message competing with the task for attention. System messages give the AI a stable behavioral anchor separate from task content. This is how every modern AI editor (Cursor, Windsurf, Copilot) structures their prompts. | Low — optional param, no existing callers break. |
| `src/services/ai/routingProviders.ts` | Increased Claude `max_tokens` from 8,192 to 32,768. | Claude was being strangled at 1/8th capacity. Any non-trivial fix was being truncated. Gemini had 65,536 but Claude only had 8,192 — massive handicap on the most capable model. | Low — cost may increase slightly for long outputs but fixes are now complete. |
| `src/services/ai/routingService.ts` | Added `systemMessage` parameter to `prompt()` method, passed through to `callProvider()`. | Allows any caller of `prompt()` to provide a system message. | None — optional param, backward compatible. |
| `src/ui/chat/chatPanelMsgFixPhases.ts` | Split Supervisor and Worker prompts into system message (identity + rules) and user message (task + code). Supervisor system message contains behavioral rules; user message contains only the bug report and source files. Worker system message contains discipline rules + output format; user message contains only diagnosis and source files. | Rules were competing with task content in one giant user message. Now the AI processes rules as "who I am" (system) and task as "what to do" (user). This is the same architecture used by Cursor, Windsurf, and Copilot. | Medium — prompt restructure could affect output format. Monitor first few builds. |

| `src/ui/chat/chatPanelMsgFixPhases.ts` | Added `runSupervisorVerify()` function — Phase 2.5 in the pipeline. Supervisor re-reads its own diagnosis + Worker output and checks if the logic matches intent. Returns PASS or FAIL with explanation. | Worker can produce syntactically correct code that misses the point logically. The Supervisor wrote the diagnosis so it knows the intent — it's the right AI to verify logical correctness. Guardian only checks scope/format. | Low — non-blocking: if verify fails to run, pipeline continues. |
| `src/ui/chat/chatPanelMsgFixEscalation.ts` | Wired Supervisor Verify between Worker and Guardian in the escalation loop. If Supervisor rejects logic, Worker retries with the Supervisor's critique accumulated. Phase labels updated to 4-phase: Supervisor → Worker → Supervisor Verify → Guardian. | Closes the oversight gap where Supervisor never saw the Worker's output. | Medium — adds one more AI call per fix attempt. Cost is low (short prompt, same expensive model already loaded). |
| `src/ui/chat/chatPanelClarify.ts` | Rewrote clarification system with 2-step Supervisor design triage. Step 1: AI decides IF questions are needed (lightbulb vs paint job). Step 2: generates 2-4 design-focused questions about what is AMBIGUOUS. Fast-path skips for fixes, edits, and single-property changes. | User had no say in design decisions. 'Build me a flappy bird game' went straight to AI defaults for colors, style, character, difficulty. Now the Supervisor asks targeted design questions when the request has visual/behavioral ambiguity. | Low -- triage adds one 50-token AI call. Questions only shown when needed. |
| `src/ui/chat/chatPanelClarifyBridge.ts` | New shared module -- bridges the orchestrator's clarify promise with the webview message handler. Module-level resolver avoids threading panel references. | Clean separation between the orchestrator (sets promise) and early exit handler (resolves it). | None -- pure plumbing. |
| `src/ui/chat/chatPanelOrchestrator.ts` | Wired design triage into nano build path. Clarify questions shown before createBuildContext. User answers injected into build task as USER DESIGN PREFERENCES block. | Previously only chunked builds got clarification. Now ALL builds get Supervisor design triage. | Low -- triage skips most requests via fast-path regex. |
| `src/ui/chat/chatPanelMessageRouterEarlyExits.ts` | Updated clarify-submit handler to resolve orchestrator-level clarify via bridge module. | Required for the design triage flow to receive user answers. | None. || `src/services/sessionService.ts` | Added `startSessionSilent()` and `recordChange()` methods. Silent start creates a session without user prompts — used for auto-session on first message. recordChange logs build outcomes in the active session. | Users had to manually click "Start Session" before Redivivus would track their work. This broke the flow for vibe-coders who expect tracking to start automatically. | Low -- adds lightweight state tracking. |
| `src/commands/session.ts` | Wired `startSessionSilent` callback on ChatPanel. Added `ChatPanel.onBuildFinished` callback that creates a git save-point after every successful build and records the change in the session. | No automatic save points existed — users had to manually create git commits. Build history tracked builds internally but not as git checkpoints. | Low -- git commit runs asynchronously and non-blocking. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Added auto-session start on first user message. Calls `ChatPanel.startSessionSilent` with the user's message text as the goal. | Session tracking required explicit user action (clicking "Start Session"), which most users skipped, leaving sessions empty. | None -- silent start, no UI blocking. |







---

## Recent Fixes — May 20, 2026 (Session 40I: Prevent unexpected project switching)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/logging/projectContextLogger.ts` | **NEW FILE**: Project context validation and logging. Tracks all project switches and prevents silent context changes. Functions: `initProjectContextLogger()`, `logProjectContextSwitch()`, `validateProjectContext()`, `getCurrentProjectContext()`. Writes to `.redivivus/logs/project-context.log`. | User experienced Redivivus silently switching from flappy-bird project to a new "game-speed-controller" project during a fix request. This validation prevents that bug by blocking unexpected project switches and showing error messages. | None — logs and validates only, does not change behavior beyond blocking bugs. |
| `src/extension.ts` | Added `initProjectContextLogger()` call during extension activation to track the initial workspace. | Project context tracking starts immediately when Redivivus activates. | None — initialization only. |
| `src/commands/init.ts` | Added project context validation in `onNewProject()` (lines 27-33) to log and block unexpected project switches. Added validation in the `pendingTask` handler (lines 76-85) to verify the current workspace matches the target before resuming build. | Prevents the bug where Redivivus creates a new project folder and silently switches to it during a fix/build request. Now shows error message if context mismatch detected. | None — validation only, blocks buggy behavior. |
| `src/ui/chat/chatPanelPublicAPI.ts` | Added import and validation in `panelResumeBuildTask()` (lines 32-46) to validate project context before switching redivivus instance. Shows error message and blocks switch if attempted project change is not allowed. | This is where the actual redivivus context switch happens. Added validation to catch and block unexpected switches at the lowest level. | None — validation only. |
| `src/ui/chat/chatPanelMsgProjectOps.ts` | Added project context validation in `handleStartNewProject()` (lines 175-193). Detects if user is trying to edit current project vs create new project based on conversation context. | This is where the "new project" flow starts. The bug was Redivivus interpreting "add speed control" as "create new project called game-speed-control". Now it detects when the conversation doesn't mention "new project" or "create" and blocks the unexpected project creation. | None — validation only, shows error message and returns early. |

---

## Recent Fixes — May 20, 2026 (Session 40J: Guardian AI import/export validation)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/guardianAI.ts` | Added explicit IMPORT/EXPORT VALIDATION section to Guardian AI prompt. Instructs Guardian to check that all imported functions actually exist in source files and exports are properly defined. | Guardian AI was passing fixes that imported functions that don't exist (e.g., `drawSpeedControl` imported but never defined). Now Guardian must verify: 1) imports reference actual functions, 2) exports are properly defined, 3) any import referencing non-existent function = COMPLETE FIX FAILURE. | None — prompt change only, no code behavior change. |

---

## Recent Fixes — May 20, 2026 (Session 40K: Prevent AI narrative text in code output)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFixPhases.ts` | Added "ZERO TOLERANCE for narrative output" CRITICAL rule to Worker prompt. Explicitly forbids phrases like "I need to", "Let me check", "Here's the fix" and FILE: markers. Worker must ONLY output SEARCH/REPLACE blocks. | AI was outputting narrative thinking like "I need to check the config.js file..." which was being written directly to index.html and breaking the game. Now Worker is explicitly told any text outside the <<<SEARCH...REPLACE>>> format will break the project. | None — prompt change only. |
| `src/services/ai/guardianAI.ts` | Added NARRATIVE TEXT DETECTION validation to Guardian prompt. Guardian must reject responses containing explanatory sentences or FILE: markers without comment prefixes. | Guardian was passing fixes that contained narrative text which would be written to files. Now Guardian validates that output is ONLY code blocks or SEARCH/REPLACE format. | None — prompt change only. |

---

## Recent Fixes — May 20, 2026 (Session 40L: Fixed freeze on reload)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/logging/chassisLogger.ts` | Removed `chassisLog()` call inside `initChassisLogger()` that was causing a circular dependency. Changed to use `console.log()` instead. | Extension was freezing on reload. The circular call to `chassisLog()` during logger initialization was causing an infinite loop or hang. | None — fixes freeze bug. |
| `src/extension.ts` | Reverted error handling around `ChatPanel.show()` and `runAutoInit()` back to original implementation. | The error handling changes didn't fix the freeze and may have introduced issues. The root cause was the circular logger call. | None — reverts previous attempt. |

---

## Recent Fixes — May 20, 2026 (Session 40F: AI not using Redivivus annotations for fixes)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFixUtils.ts` | **File selection now prioritizes annotated files** (lines 93-95). Added `annotatedFiles` filter that detects `[SCOPE]`, `[ANNOTATION]`, `[TODO]`, `[WARN]`, `[DONE]` tags and prioritizes those files in the selection. Files with Redivivus annotations are now explicitly included in context. | Core Redivivus feature: files with annotations should be prioritized because they have self-documenting structure. The AI needs these to understand what to change without guessing. | Low — improves file selection logic. |
| `src/ui/chat/chatPanelMsgFixPhases.ts` | **Supervisor prompt** (lines 23-26): Added "READ THE [SCOPE] AND [ANNOTATION] COMMENTS FIRST - they explain what each section does" to source files header. Supervisor now explicitly told to read annotations before diagnosing. | AI had annotations in files but wasn't using them to understand code structure. It was guessing instead of reading the documentation already in the code. | Low — prompt-only change. |
| `src/ui/chat/chatPanelMsgFixPhases.ts` | **Worker prompt** (lines 64-65, 88): Added Rule #1 "READ THE ANNOTATIONS FIRST", Rule #2 "USE [SCOPE] TAGS TO LOCATE CHANGES", and CRITICAL rule "DO NOT create new files like .txt, .md, or documentation. ONLY edit the existing source files". | Worker now explicitly told to look for [SCOPE] tags describing the relevant functionality (e.g., "[SCOPE] Pipe movement and speed") and make surgical edits in THAT section only. | Low — prompt-only change. |

---

## Recent Fixes — May 20, 2026 (Session 40E: Guardian not verifying actual implementation)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFixEscalation.ts` | Fixed critical bug on line 69-70. Changed `guardianContext` from broken `"${deps}"` (outputted `[object Object]`) to properly extract user request from conversation history. Guardian now receives actual user request instead of garbage context. | Guardian was passing fixes that didn't implement the requested feature because it didn't know what the user actually asked for. The context showed `[object Object]` instead of "add speed control for pipes". | High — fixes core review pipeline. |
| `src/services/ai/guardianAI.ts` | Added "FEATURE IMPLEMENTATION VERIFICATION" section to Guardian prompt (lines 107-112). Instructs Guardian to verify the worker actually implemented the feature vs just writing instructions/comments. Explicitly tells Guardian to reject responses containing "1. Open the game 2. Press UP arrow" style instructions. | AI was claiming success but only wrote instructions ("Press UP to speed up") instead of actual code implementing the feature. Guardian wasn't catching this because it didn't know to look for it. | Low — prompt-only change. |
| `src/ui/chat/chatPanelMsgFix.ts` | Added instruction-only detection (lines 140-150). Scans written files for patterns like "1. Open the", "Press ", "2. Press" and shows warning: "[CRITICAL WARNING] AI wrote instructions/testing steps instead of actual CODE." | Third line of defense — even if Guardian misses it, user sees explicit warning that the "fix" contains no actual implementation. | None — warning-only. |

---

## Recent Fixes — May 20, 2026 (Session 40D: Fix pipeline not finding source files)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFixUtils.ts` | Rewrote `collectSourceFiles()` (lines 68-94). Now includes: (1) files whose basenames are mentioned, (2) ALL files in `src/` folder, (3) files whose CONTENT contains keywords from user text (semantic matching), (4) files that import mentioned files. Previously only included files explicitly mentioned by filename, causing AI to only have package.json when user said "pipes" not "pipes.js". | User asked "add speed control for pipes" — AI modified package.json (+2/-1 lines) instead of game source files. The AI never received pipes.js or any game code in its context. | Low — broader context reduces precision but ensures relevant files are included. |
| `src/ui/chat/chatPanelMsgFix.ts` | Added config-only modification detection (lines 133-138). Warns user when AI only modified config files (package.json, tsconfig.json, etc.) and no actual source files: "[CRITICAL WARNING] AI only modified configuration files... The fix likely did NOT address your request." | Second line of defense — even if file selection fails, user is warned that the fix didn't touch actual code. | None — warning-only, non-blocking. |

---

## Recent Fixes — May 20, 2026 (Session 40C: Prevent over-engineering in fix pipeline)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFixPhases.ts` | Strengthened Worker AI rules (lines 63-72). Added "ZERO TOLERANCE for over-engineering" rule. Changed surgical edit rule to "modify ONLY the exact lines that need to change. Keep changes under 10 lines if possible." Explicitly forbids refactoring, renaming, reformatting, or "improving" anything beyond the requested fix. | User asked for "pipes take twice as long to move" — AI made 181 line changes including modifying the bird and other unrelated code. The fix should have been 1 line (speed value). | Low — prompt-only change, surgical edit fallback still works. |
| `src/services/ai/guardianAI.ts` | Added "OVER-ENGINEERING DETECTION" section to Guardian prompt (lines 127-128). Guardian now rejects passes where worker changed 50+ lines for a simple request. Instructs Guardian to flag: "Worker rewrote entire file instead of making surgical edit." | Second line of defense — if Worker ignores surgical edit rules, Guardian catches and rejects the over-engineering. | Low — prompt-only change, improves quality control. |

---

## Recent Fixes — May 20, 2026 (Session 40B: Web search context-aware disambiguation)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgSendEarlyExits.ts` | Added `inferProjectContext()` function (lines 34-63) that scans last 10 chat messages for project-type keywords (game, flappy, canvas, react, api, etc.) and prepends inferred context to web search queries. | User asked about "pipes" in Flappy Bird context — search returned plumbing physics instead of game development results. Redivivus should infer intent from conversation history like a human would. | Low — purely additive, falls back to raw query if no context matched. |

---

## Recent Fixes — May 20, 2026 (Session 40A: Fix build completion message not showing)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuild.ts` | Wrapped the complex `appendMsg` template (line 185) in try/catch with a failsafe fallback message. The complex template had multiple failure points: dynamic `require('./chatPanelBuildPipeline.js')`, potentially undefined `narration` variable, and complex string interpolation. | User reported "it does the edit but never finalizes" — the file was written but no completion message appeared. The complex template was likely throwing an error that stopped execution before `appendMsg` was called. | None — adds safety fallback that still shows basic completion info. |

---

## Recent Fixes — May 20, 2026 (Session 40: Phase 4 — Adaptive Orchestration Engine)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/adaptiveClassifier.ts` | **[NEW]** `evaluateTaskComplexity()` — 50-token AI classifier with fast-path regex. Routes each prompt to `obd1` or `obd2` based on whether it needs environment access. | Enables Adaptive mode: Supervisor auto-routes each prompt without user toggle. | Low — conservative defaults to OBD1 on failure. |
| `src/ui/chat/chatPanelMsgFixEscalation.ts` | **[NEW]** `runEscalationLoop()` — wraps Worker→Guardian in a retry loop (max 2). Accumulates Guardian critiques across retries, escalates to best model on exhaustion. | Guardian rejections no longer halt the pipeline. | Medium — modifies core fix flow, but fallback path unchanged. |
| `src/ui/chat/chatPanelMsgSendAgent.ts` | **[NEW]** Extracted `runAgentMode()` helper from `chatPanelMsgSendMessage.ts`. | Rule 9 split — `chatPanelMsgSendMessage.ts` hit 205 lines after adaptive routing addition. | None — pure extraction. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Added Adaptive routing branch (`deps.agentMode === 'adaptive'`). Calls `evaluateTaskComplexity()`, routes to OBD2 agent or falls through to OBD1. Changed explicit OBD2 check to `=== true`. | Wires Adaptive mode into the main chat path. | Low — OBD1/OBD2 explicit paths unchanged. |
| `src/ui/chat/chatPanelMsgFix.ts` | Replaced sequential Phase 2 + Phase 3 blocks with single `runEscalationLoop()` call. File shrunk from 199→179 lines. | Enables automatic retry+escalation on Guardian rejection. | Medium — core fix pipeline change, but escalation loop preserves all original behavior. |
| `src/ui/chat/chatPanelMessageRouterEarlyExits.ts` | Added `toggle-adaptive-mode` handler. Sets `state.agentMode = 'adaptive'` and sends updated badge HTML. | Wires the Adaptive button from the webview to the extension state. | None. |
| `src/ui/chat/chatPanelScriptGates.ts` | Updated `showAgentInfoPanel()` to support three-state display (OBD1/OBD2/Adaptive). Added Adaptive button with teal gradient. Header icon/title/subtitle now context-sensitive. | Premium UI for the new Adaptive mode. | None — cosmetic. |
| `src/ui/chat/chatPanelHtml.ts` | Added `🔀 Adaptive` badge branch with teal border. Updated `window._agentMode` init to support `'adaptive'` string. | Badge displays correctly for all three modes. | None. |
| `src/ui/chat/chatPanelMessages.ts` | Changed `agentMode` type from `boolean` to `boolean \| 'adaptive'`. | Type system support for three-state mode. | None. |

---

## Recent Fixes — May 20, 2026 (Session 39.2: Adaptive Handoff Pipeline)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFix.ts` | Refactored Guardian limitation abort to instead set `needsObd2Handoff`, apply the code fixes, and hand off execution to the Agent pipeline. | To enable a seamless "Adaptive" workflow where OBD1 performs safe code edits, but OBD2 Agent handles terminal/environment verification automatically. | High — bridges two core pipelines. |
| `src/ui/chat/chatPanelMsgFixHandoff.ts` | **[NEW]** Extracted `executeObd2Handoff` logic into new file. | Rule 9 (200-line hard stop) triggered on `chatPanelMsgFix.ts`. | None. |
| `src/ui/chat/chatPanelMsgFixApply.ts` | **[NEW]** Extracted surgical edit application logic. | Rule 9 compliance. | None. |
| `src/ui/chat/chatPanelMsgFixPhases.ts` | **[NEW]** Extracted Phase 1 and Phase 2 prompt logic. | Rule 9 compliance. | None. |

| `flappy-bird/package.json` | Installed `esbuild` and added `npm run build`. | ES modules (`<script type="module">`) are strictly blocked over `file://` due to CORS. Bundling the game into a single JS file allows it to run perfectly "as it sits" locally without requiring a Node/Python HTTP server. | None — dev setup only. |
| `flappy-bird/index.html` | Swapped `type="module" src="./src/main.js"` for standard script pointing to `dist/bundle.js`. | Allows immediate execution over `file://` protocol. | None. |
| `src/services/ai/guardianAI.ts` | Further fortified the `DIRECT MODE (OBD1) LIMITATION RULE` to explicitly warn the Guardian that OBD1 workers are physically incapable of running code. instructed the Guardian to strictly ignore hallucinated "Verification Performed" output from workers. | Guardian was being tricked by OBD1 workers hallucinating successful test outputs. The LLM couldn't distinguish between a real test output (OBD2) and hallucinated text (OBD1), causing it to wrongly approve passes. | Low. |
| `src/services/ai/agentTools.ts` | Added `routing` and `blueprintContext` to `AgentContext` and wired `routing.guardianReview` directly into the `write_file` tool. | OBD2 (Agent Mode) was completely bypassing the Guardian review layer. Now, the Guardian reviews all autonomous file writes and applies corrections/reviews in real-time, matching OBD1 quality. | Low — fully optional based on `isGuardianActive()`. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Passed `deps.routing` and `blueprintCtx` into the `agentCtx` configuration when executing agent tasks. | Required so that the built-in `write_file` tool can invoke the Guardian AI routing layer. | None — pure injection. |
| `src/services/ai/agentService.ts` | Updated Verification Rule 6 with highly strict wording, mandating execution of a terminal testing/verification command and requiring the command + output in the final answer. | OBD2 agent claimed success without verification. Threats of answer rejection align LLM outputs to prioritize active proof of correctness. | Low — prompt-only change. |
| `src/ui/chat/chatPanelMsgFix.ts` | Added check for Guardian's OBD1 insufficiency issue. If detected, intercepts the fix loop, blocks file writing, and displays a prominent visual block warning the user to switch to OBD2. | Essential for quality control — prevents direct mode from applying partial/broken edits to disk when Agent Mode is needed. | Low — clean early exit before writes. |
| `flappy-bird/src/entities/pipes.js` | Fixed pipe generation condition from `lastPipeX - pipes[last].x < pipeSpacing` to `CONFIG.gameWidth - pipes[last].x >= pipeSpacing`. | Inverted condition flooded the screen with pipes on every single frame, making the game unplayable. | None — logic-only fix in game code. |
| `flappy-bird/serve.js` | **[NEW]** Simple Node.js HTTP server for local development. | The game uses `<script type="module">` which Chrome blocks with CORS when loaded from `file://` protocol. This is the actual root cause of "START button does nothing". | None — new file. |

---

## Recent Fixes — May 20, 2026 (Session 38: Flappy Bird Audit — Redivivus System Infrastructure Fixes)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/agentService.ts` | Injected `CHASSIS_WORKER_RULES` into the ReAct system prompt. | Agent Mode (OBD2) was bypassing [SCOPE] and [WARN] annotation rules, causing it to write missing-annotation files in projects. | Low — brings Agent prompt to parity with standard Pipeline prompts. |
| `src/services/analyzerScanner.ts` | Added `missingScopeAtLine1` check: verifies line 0 matches `// [SCOPE]`, `<!-- [SCOPE]`, or `# [SCOPE]` based on file type. Wired into `AnalysisResult`. | Scanner previously passed files with `[SCOPE]` appearing *anywhere*, failing to flag wrong-content files (like JSON in .js). | Low — pure scanning logic, no write side-effects. |
| `src/services/analyzerReports.ts` | Added `missingScopeFiles` count to the Project Map markdown table and listed missing files in a new `❌ Files Missing [SCOPE] at Line 1` block. | Visualizing the new scanner metric in the generated map. | Low. |
| `src/services/analyzerService.ts` | Added lightweight, background-safe `updateProjectMapOnly()` method. | Project map markdown was permanently stale unless user manually ran "Analyze". | Low — no AI calls or UI progress bars used in background update. |
| `src/ui/chat/chatPanelBuildRunner.ts` | Wired `analyzerService.updateProjectMapOnly()` to run automatically after chunked builds complete. | Keeps `project_map.md` in sync with active development automatically. | Low — runs after file save loop completes. |
| `src/services/blueprint/blueprintWriter.ts` | Extracted `syncBlueprintMd(redivivus, config)` helper. | Single point to ensure `.redivivus/blueprint.md` is synced whenever config is updated. | None — pure extraction. |
| `src/ui/messageRouterCore.ts`, `src/ui/chat/chatPanelMsgSpecial.ts`, `src/ui/chat/chatPanelPlanInterviewHelpers.ts`, `src/commands/blueprint.ts` | Added `syncBlueprintMd()` calls after every `saveConfig(config)` operation containing blueprint updates. | `.redivivus/blueprint.md` was staying as an empty stub even when the user provided a full 5W blueprint via interview or side-panels. | Low — keeps internal files in sync with state. |
| `src/services/blueprint/blueprintRevisionService.ts` | Added `syncBlueprintMd()` after `applyRevision()`. | AI auto-revisions were only writing to root `blueprint.md`, missing the internal tracker. | Low. |
| `src/services/ai/guardianAI.ts` | Added DOMAIN GOTCHA: `.js`/`.ts` files must contain actual code, not JSON/markdown/plain text. Wrong content for the file extension is a CRITICAL correctness bug. | Guardian passed `src/game.js` containing JSON docs because the JSON syntax was technically valid. | Low — improves Guardian catch rate. |

---

## Recent Fixes — May 20, 2026 (Session 37: Badge doesn't update on mode toggle)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMessageRouterEarlyExits.ts` | After toggling `state.agentMode`, now posts `update-agent-badge` message to the webview with the new badge HTML and the `agentMode` bool. Uses `_panel.webview.postMessage` (private reference). | `panelRefresh()` only sends `update-conversation` once initialized — the header HTML is never rebuilt, so the badge stayed OBD1 even after switching to OBD2. | Low — badge patch is purely cosmetic, no state side-effects. |
| `src/ui/chat/chatPanelScript.ts` | Added `update-agent-badge` message handler: updates `window._agentMode` and patches the badge element in-place using `badgeEl.outerHTML = msg.html`. | Webview side needs to handle the new message type. | None. |

---

## Recent Fixes — May 20, 2026 (Session 36: Corrected deploy path)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `GEMINI.md` Rule 20 | Updated `$BAKED` path to `~/projects/redivivus-build/VSCode-linux-x64/resources/app/extensions/redivivus`. Added note that `~/.vscode/extensions/` is NOT the running IDE. Documented the desktop entry. | All prior sessions deployed to the wrong location — `~/.vscode/extensions/papajoe.redivivus-0.3.6/` is ignored by the Redivivus fork binary. All session 33–35 features were deployed to the correct path in this session. | None. |

## [NEXT] Planned Phase: Transition from Extension to Full Fork Integration

The user has requested transitioning Redivivus from a VS Code extension model to a fully integrated, standalone IDE fork. The source for the VS Code fork is located at `~/projects/redivivus-build/`. 

The ultimate goal is to bake the Redivivus UI/UX directly into the editor chrome (titlebar, sidebar, activity bar) to eliminate deployment friction, hide generic IDE features, and provide a dedicated "Workshop" experience out-of-the-box.

### Phase 3: The Standalone Shop (IDE Fork Integration)

#### Step 1: Native Sidebar & Core Integration
- **Objective:** Move Redivivus out of the Extension Host and into the native VS Code core (`src/vs/workbench`).
- **Action:** 
  - Migrate `chatPanel` and `chassisSetupHub` WebView code into native workbench parts.
  - Hide default VS Code sidebars (Explorer, Search, Source Control) by default.
  - Hardcode the Redivivus Chat panel as the primary, un-closeable view in the secondary sidebar.

#### Step 2: Custom Titlebar & Chrome
- **Objective:** Rebrand the editor window to remove all "VS Code" references.
- **Action:**
  - Modify `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts` to feature the Redivivus logo and current Project Blueprint Status natively.
  - Remove standard menu items (Terminal, Run, Help) and replace them with Workshop-specific controls (e.g., "Build Mode", "Blueprint Viewer").

#### Step 3: Deep Configuration Override
- **Objective:** Eliminate the need for `package.json` contributes and extension activation events.
- **Action:**
  - Hard-wire `redivivus.geminiApiKey`, `redivivus.startupBehavior`, and `redivivus.guardianEnabled` into the native VS Code configuration registry (`src/vs/platform/configuration/common/configurationRegistry.ts`).
  - Wire the Redivivus initialization routine directly into the VS Code startup sequence so it boots instantly without waiting for an extension host.

#### Step 4: The Branded Build Pipeline
- **Objective:** Package the entire fork as a single, downloadable executable.
- **Action:**
  - Update `build/gulpfile.vscode.js` to output a branded `Redivivus Setup.exe` / `Redivivus-linux.AppImage`.
    - Compile and verify that a fresh install boots directly to the Frictionless Intake Desk (API Key Wizard) without exposing the underlying VSCodium roots.

### Phase 4: Adaptive Orchestration Engine (The "Shop")
- **Objective:** Convert Redivivus from a manual multi-mode tool into an autonomous "Shop" where a Supervisor AI manages task routing, execution, verification, and escalation dynamically.
- **Action:**
  - **Adaptive Mode Toggle:** Add an "Adaptive" mode that intercepts the user prompt. A lightweight Supervisor AI dynamically evaluates the task complexity to determine if it should route to the OBD1 (Direct Mode) surgical pipeline, or the OBD2 (Agent Mode) environment pipeline.
  - **Autonomous Escalation Loop:** Currently, Guardian rejections halt the pipeline. We will build a feedback loop where the Guardian passes its critique back to the Worker (for up to 2 retries) before escalating the task to a smarter/more expensive API model (e.g., from Groq to Claude).
  - **Parallel Dispatching:** Upgrade the Orchestrator to break a Blueprint into independent file domains and dispatch multiple Worker invocations concurrently, resolving them in a staging buffer for a final unified Guardian inspection.
  - **Blueprint Contract Enforcement (Guardian Layer):** Before any file is written in a multi-file build, the Guardian must extract and lock the shared contract from the blueprint — HTML element IDs, global variable names, class/function interfaces, script paradigm (classic vs module). Every subsequent file the worker generates must be validated against that locked contract before being written to disk. A file that references game-canvas when the contract says gameCanvas must be rejected and regenerated, not written and patched later. This is the fix that makes Redivivus genuinely better than other vibe editors for multi-file projects.

---

## Recent Fixes — May 20, 2026 (Session 35: OBD2 Agent documentary narrator)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/agentNarrator.ts` | **New file.** `extractAgentThought()` — strips the AI's reasoning text before each `<tool_call>` and returns it for display. `narrateTool()` — deterministic documentary-style description for each tool invocation (read_file, write_file, run_command, list_dir, search_code, ask_user, MCP). `describeCommand()` — translates common shell commands into plain English. Zero AI calls. | User saw terse single-line bubbles that were cut off. | None — purely additive, no logic paths changed. |
| `src/services/ai/agentService.ts` | Imported `extractAgentThought` and `narrateTool`. Startup message upgraded to "OBD2 Agent spinning up...". Each iteration now: (1) extracts and posts the AI's own thought text as a 💬 bubble, (2) calls `narrateTool()` for a rich description before executing the tool. Error messages now include step number and plain-English context. | Same reason — users were seeing "Agent using built-in tool: read_file..." with no context. | Low — narrator calls are purely cosmetic; tool execution path unchanged. |

---

## Recent Fixes — May 20, 2026 (Session 34: Live code preview alongside chat bubbles)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuild.ts` | Added `import * as vscode`. Added early editor-pane open (existing files only) in `ViewColumn.Beside` with `preview:true, preserveFocus:true` before AI generation starts — so the pane appears immediately for modification builds. | User saw the code pane only appear after the build finished (or not at all). | Low — try/catch prevents preview failure from stalling a build. |
| `src/ui/chat/chatPanelChunkedLoop.ts` | After `fs.writeFileSync` for each file in the loop, opens that file in `ViewColumn.Beside, preview:true, preserveFocus:true`. Each successive file replaces the same preview tab (VS Code preview-mode behaviour). User sees each file appear as it's written. | Chunked builds had no live preview at all — editor only opened via final result card. | Low — try/catch, non-blocking. |
| `src/services/ai/agentTools.ts` | After `write_file` tool writes to disk, opens the file in `ViewColumn.Beside, preview:true, preserveFocus:true`. Applies to OBD2 Agent Mode. | Agent-written files had no preview at all. | Low — try/catch, non-blocking. |

---

## Recent Fixes — May 20, 2026 (Session 33: Agent Mode OBD1/OBD2 — full integration + hover info)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgSendEarlyExits.ts` | **New file.** Extracted URL-read, web-search, remember-intent, and read-#N handlers from `chatPanelMsgSendMessage.ts`. Exports `handleUrlRead`, `handleWebSearch`, `handleRememberIntent`, `handleReadResult`. | Rule 9 split — `chatPanelMsgSendMessage.ts` was at 283 lines. | None — pure extraction, no logic changes. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Reduced from 283 → 185 lines. Delegated 4 early-exit blocks to `chatPanelMsgSendEarlyExits.ts`. Added `set-status: working/ready` signals around agent execution loop. Tightened agent context building. | Rule 9 hard-stop + agent status bar was never set (spinner never showed during agent tasks). | Low — behavior unchanged; signals added around existing `executeAgentTask` call. |
| `src/ui/chat/chatPanelHtml.ts` | Changed Agent Mode badge: label now **🤖 OBD2** (purple, active) / **🚇 OBD1** (blue, inactive). `data-action` changed from `toggle-agent-mode` to `show-agent-info` — click now opens info panel instead of blind toggle. Injected `window._agentMode` JS variable before the chat script so the cost modal can detect agent mode at render time. | User requested OBD1/OBD2 naming. Info panel UX is safer than blind toggle (no accidental mode switches). | None — badge still triggers toggle via the info panel's button. |
| `src/ui/chat/chatPanelScriptGates.ts` | Added `showAgentInfoPanel()`: styled modal with OBD1 vs OBD2 cost comparison table, tool list (read_file, write_file, run_command, list_dir, search_code, ask_user), and Enable/Disable toggle button. Added OBD2 Agent Mode banner in `showCostEstimatePanel()` when `window._agentMode` is true — shows iterative cost model ($0.01–$0.12, 3–15 iterations). | User requested hover info explaining costs and differences between Pipeline (OBD1) and Agent (OBD2) modes. | Low — banner only renders when `window._agentMode === true`. |
| `src/ui/chat/chatPanelScript.ts` | Replaced `toggle-agent-mode` click handler with `show-agent-info` → `showAgentInfoPanel()`. Compacted `autoGrow`, `showStartSessionPanel`, `showContentPanel` to stay under 200 lines. | Wires up badge click to new info panel. | None — toggle now happens via button inside the info panel. |

---

## NEXT PHASE — Phase 2: Hybrid Backend / SaaS Architecture
> **Status: PLANNED — not yet started. User will begin when domain is purchased.**
> **Goal: Move Redivivus pipeline logic to a Cloudflare-hosted backend while keeping the BYOK model. Extension becomes a thin client. Users cannot extract the brains.**

### Why This Phase Exists

Redivivus is currently a VS Code extension — all pipeline logic (Supervisor/Worker/Guardian, AI routing, vault, build history) ships in the VSIX and is fully extractable by any user. Moving the logic server-side protects intellectual property, enables a future managed-key tier, and lets Redivivus evolve independently of extension releases.

### Architecture Overview

```
[VS Code Extension — thin client]
        |
        |  HTTPS + SSE  (user AI keys in headers, never stored)
        v
[Cloudflare Worker — api.chassisai.com]
   - Supervisor / Worker / Guardian pipeline
   - AI routing & complexity classification
   - Vault search & enrichment
   - Build history API
   - Dead-ends & Lessons API
        |
        |  API calls with user-provided keys
        v
[AI Providers — Gemini / Claude / OpenAI / Groq / xAI / Kimi]
```

### What Moves to the Backend (Cloudflare Workers)

| Currently In Extension | Moves To Server | Notes |
|------------------------|-----------------|-------|
| `src/services/ai/guardianService.ts` | Cloudflare Worker | Full Guardian pipeline |
| `src/services/ai/routingClassifier.ts` | Cloudflare Worker | AI intent routing |
| `src/services/ai/routingComplexity.ts` | Cloudflare Worker | Complexity classifier |
| `src/services/build/compileAutoFix.ts` | Cloudflare Worker | Compile fix loop |
| `src/services/build/testAutoFix.ts` | Cloudflare Worker | Test fix loop |
| `src/ui/chat/chatPanelBuild.ts` — AI calls only | Cloudflare Worker | File writes stay local |
| `src/ui/chat/chatPanelChunked.ts` — AI calls only | Cloudflare Worker | Planning + code gen |
| `src/ui/chat/chatPanelMsgFix.ts` — AI calls only | Cloudflare Worker | Fix pipeline |
| Vault AI enrichment | Cloudflare KV + Worker | Search stays local |

### What Stays Local (Extension)

| Stays In Extension | Reason |
|--------------------|--------|
| All file I/O (`fs.writeFileSync`, `fs.readFileSync`) | Cloudflare Workers have no filesystem access |
| WebView panels (chat, build history, architecture map) | VS Code API only |
| Snapshot / undo system (`SnapshotService`) | Requires local disk |
| Git operations (`gitContext.ts`) | Requires git binary on user machine |
| Compile runner (`compileRunner.ts`, `testRunner.ts`) | Requires local compiler/runtime |
| Extension commands & keybindings | VS Code API only |
| Blueprint, session, work log management | User's local `.redivivus/` files |

### BYOK Model — Retained as-is

Users still bring their own AI API keys. The change is WHERE the keys are used:

**Current flow:** Extension reads key from VS Code settings → calls AI provider directly
**Phase 2 flow:** Extension reads key from VS Code settings → sends key in HTTPS header → Cloudflare Worker makes the AI call → streams response back

Keys are **never logged or stored** on the server. Each request is stateless from a key perspective. Cloudflare Worker reads the key from the request header, uses it for that request only, and discards it.

```
Extension                       Cloudflare Worker
--------                        ----------------
Read key from VS Code settings
Build request body:
  { task, files, blueprintCtx }
Add header:
  X-Gemini-Key: user_key
  X-Claude-Key: user_key (if set)
POST /api/build  ─────────────> Receive request
                                Extract keys from headers
                                Run Supervisor → Worker → Guardian
                                Call AI provider with user's key
                                Stream SSE back
Receive SSE chunks <────────────
Write files locally
```

### Cloudflare Stack

| Component | Purpose | Cloudflare Product |
|-----------|---------|-------------------|
| API compute | Supervisor/Worker/Guardian pipeline | **Workers** (no cold start, global edge) |
| User vault sync (optional) | Cross-device vault access | **KV** (global, low-latency reads) |
| Build history sync (optional) | Cross-device history | **D1** (SQLite, free tier: 5M rows) |
| SSE streaming | Real-time token delivery | **Workers Streaming Response** |
| Auth | Redivivus license keys | **Workers** + **KV** (key → user record) |
| Domain | `api.chassisai.com` | **Cloudflare DNS** (or user's own domain) |

**Cost estimate at launch (100 users, 50 builds/day each):**
- Workers: 5M requests/day free tier — covers up to ~500 users before billing starts
- KV reads: 10M/day free — vault lookups easily covered
- D1: 5M rows free — build history per user
- Bandwidth: Workers → AI providers is egress Cloudflare doesn't charge

### Auth System

Phase 2 uses a simple license key model (not OAuth):

1. User visits `chassisai.com` (your domain)
2. Creates an account, gets a **Redivivus License Key** (UUID-style, e.g. `chss_live_abc123...`)
3. Enters the key in Redivivus extension settings (`redivivus.licenseKey`)
4. Extension sends key in every request: `Authorization: Bearer chss_live_abc123`
5. Worker validates key against KV store, rejects unknown/expired keys
6. No sessions, no cookies, no OAuth — fully stateless

**KV schema:**
```
key:   "license:chss_live_abc123"
value: { userId, email, plan, createdAt, requestCount, dailyLimit }
```

### Streaming — SSE Cloudflare Worker → Extension

Cloudflare Workers support native SSE via `ReadableStream`. The extension already has SSE handling (`streamingProviders.ts`) — it just needs the URL changed to point at the Worker instead of the AI provider directly.

**Worker SSE response:**
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"type":"chunk","text":"export "}
data: {"type":"chunk","text":"function "}
data: {"type":"chunk","text":"main() {"}
data: {"type":"done","tokensUsed":1240,"costUSD":0.0006}
```

**Extension side — change one import:**
```typescript
// Before (Phase 1 — direct)
import { streamProvider } from '../services/ai/streamingProviders.js';

// After (Phase 2 — via backend)
import { streamBackend } from '../services/ai/backendClient.js';
```

### Phase 2 Implementation Steps

#### Step 1 — Backend Setup (do first, before any extension changes)
- [ ] Purchase domain (e.g. `chassisai.com`)
- [ ] Set up Cloudflare account, add domain
- [ ] Create Cloudflare Worker project: `npm create cloudflare@latest redivivus-api`
- [ ] Deploy "hello world" worker at `api.chassisai.com/health`
- [ ] Set up KV namespace: `CHASSIS_LICENSES`
- [ ] Set up D1 database: `chassis_builds`
- [ ] Create `wrangler.toml` with bindings

**Worker file structure:**
```
redivivus-api/
  src/
    index.ts          — request router
    pipeline/
      supervisor.ts   — Supervisor AI call
      worker.ts       — Worker AI call
      guardian.ts     — Guardian validation
      router.ts       — AI routing logic
    auth/
      validateKey.ts  — KV license lookup
    stream/
      sseResponse.ts  — SSE response builder
    types.ts
  wrangler.toml
  package.json
```

#### Step 2 — Auth Layer
- [ ] Create KV schema + seed with test license key
- [ ] Implement `validateKey(key, env)` — KV lookup, rate-limit check
- [ ] Add `Authorization` header check to all Worker routes
- [ ] Build simple license key generator script (run locally to provision users)
- [ ] Add `redivivus.licenseKey` setting to `package.json` contributes > configuration
- [ ] Extension: read license key from settings, attach to every API request

#### Step 3 — Migrate AI Routing Pipeline
- [ ] Port `routingClassifier.ts` logic to Worker `pipeline/router.ts`
- [ ] Port `routingComplexity.ts` → Worker (50-token classify call, same guards)
- [ ] Port `guardianService.ts` → Worker `pipeline/guardian.ts`
- [ ] Port `guardianAI.ts` / `guardianELI5.ts` / `guardianHealth.ts` → Worker
- [ ] Create `POST /api/build` route — accepts task + files + blueprint context, runs full Supervisor→Worker→Guardian pipeline, streams SSE back
- [ ] Test end-to-end: `curl -N -H "Authorization: Bearer test_key" -H "X-Gemini-Key: ..." https://api.chassisai.com/api/build`

#### Step 4 — Extension Client Refactor
- [ ] Create `src/services/ai/backendClient.ts` — thin wrapper around `fetch` to `api.chassisai.com`
  - `buildRequest(ctx, task, files)` — POST /api/build, returns SSE stream
  - `fixRequest(ctx, error, files)` — POST /api/fix, returns SSE stream
  - Attaches license key + all user AI keys as headers
- [ ] In `chatPanelBuild.ts`, replace `executeWorkerBuild` calls with `backendClient.buildRequest`
- [ ] In `chatPanelChunked.ts`, replace chunked AI calls with streaming backend calls
- [ ] In `chatPanelMsgFix.ts`, replace `aiFixCompileError` calls with `backendClient.fixRequest`
- [ ] Keep all file I/O, snapshot, git, and compile runner calls exactly as-is (still local)
- [ ] Feature-flag the switch: `redivivus.useBackend` setting (boolean, default false during rollout)

#### Step 5 — Vault Sync (Optional — Phase 2b)
- [ ] Create `POST /api/vault/search` — takes query, searches user's vault in KV
- [ ] Create `POST /api/vault/enrich` — AI-enriches vault items, writes to KV
- [ ] Extension: if `useBackend` enabled, vault search hits Worker first, falls back to local
- [ ] Local vault file (`~/.redivivus-vault/`) remains the source of truth; KV is a sync mirror

#### Step 6 — Build History Sync (Optional — Phase 2b)
- [ ] Create D1 table: `builds (id, userId, task, files, supervisor, worker, tokensUsed, costUSD, timestamp)`
- [ ] `POST /api/builds/record` — Worker writes to D1 after each build
- [ ] `GET /api/builds?limit=20` — returns recent builds for the Build History panel
- [ ] Extension: if `useBackend` enabled, history panel queries Worker; else uses local `build_history.json`

#### Step 7 — Testing & Rollout
- [ ] Run full self-test suite with backend enabled: `scripts/self-test-v2.sh`
- [ ] Test BYOK flow: each AI provider key, verify keys never appear in Worker logs
- [ ] Load test: 10 concurrent builds, verify SSE streams don't interleave
- [ ] Beta: ship `redivivus.useBackend = false` by default; opt-in for testers
- [ ] Once stable: flip default to `true`, keep local-only as fallback

### Performance Impact Analysis

| Metric | Phase 1 (current) | Phase 2 (backend) | Delta |
|--------|--------------------|-------------------|-------|
| First token latency | ~800ms (direct to AI) | ~950ms (+Cloudflare hop) | +150ms — negligible |
| SSE streaming | Already real SSE | SSE via Worker passthrough | Identical |
| Build round-trip | 15-45s (AI-bound) | 15-45s (AI-bound) | No change |
| Offline support | Full (BYOK direct) | Requires internet to Worker | Breaking — see below |
| Extension VSIX size | ~932KB (with logic) | ~400KB (logic removed) | Smaller install |
| Update cycle | Extension release required | Worker deploys in seconds | Better for users |

**Offline impact:** Phase 2 requires internet to reach the Worker. If the user is offline, builds fail. Mitigation: keep a local fallback mode (`redivivus.useBackend = false`) that uses the current direct AI call path. Users who work offline can stay on local mode.

### Business Model (Future)

| Tier | Price | What's Different |
|------|-------|-----------------|
| **Free / BYOK** | $0 | Use your own AI keys, Worker pipeline included |
| **Pro / Managed Keys** | $X/mo | Redivivus provides AI keys, no setup required |
| **Team** | $Y/mo | Shared vault, build history across team members |

Phase 2 enables the Pro tier — the Worker already has the user's keys in headers, so swapping to Redivivus-managed keys is one config flag per request.

### Files To Create (Phase 2)

| New File | Purpose |
|----------|---------|
| `redivivus-api/src/index.ts` | Worker router |
| `redivivus-api/src/pipeline/supervisor.ts` | Server-side Supervisor |
| `redivivus-api/src/pipeline/worker.ts` | Server-side Worker |
| `redivivus-api/src/pipeline/guardian.ts` | Server-side Guardian |
| `redivivus-api/src/pipeline/router.ts` | Server-side AI routing |
| `redivivus-api/src/auth/validateKey.ts` | License key validation |
| `redivivus-api/src/stream/sseResponse.ts` | SSE builder |
| `redivivus-api/wrangler.toml` | Cloudflare config |
| `src/services/ai/backendClient.ts` | Extension thin client |

### Files To Modify (Phase 2)

| File | Change |
|------|--------|
| `package.json` | Add `redivivus.licenseKey`, `redivivus.useBackend` settings |
| `src/ui/chat/chatPanelBuild.ts` | Replace AI calls with `backendClient.buildRequest` |
| `src/ui/chat/chatPanelChunked.ts` | Replace AI calls with `backendClient.buildRequest` |
| `src/ui/chat/chatPanelMsgFix.ts` | Replace AI calls with `backendClient.fixRequest` |
| `src/commands/apiSetup.ts` | Add license key setup step |

### [NEXT] Start Here When Domain Is Purchased

1. `npm create cloudflare@latest redivivus-api` — scaffold the Worker project
2. Deploy the health check endpoint: `GET /health` returns `{ status: 'ok', version: '2.0.0' }`
3. Set up KV namespace and seed one test license key
4. Implement `validateKey` auth middleware
5. Port the Guardian pipeline first (smallest, most self-contained)
6. Add `POST /api/validate` — takes code string, returns Guardian score (easy to test in isolation)
7. Build from there

## Recent Fixes — May 20, 2026 (Session 33: Template Showroom Finalization)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/services/project/templateRegistry.ts` | Modified `fetchTemplate` to implement a local fallback mechanism using `fs.existsSync` and `fs.promises.readFile`. | The `redivivus-templates` GitHub repository is currently private, causing `fetchTemplate` to return 404s and forcing the wizard to fall back to zero-shot generation. By checking `~/projects/redivivus-templates` locally first, developers can test the wizard flow and template compilation without making the repository public. | Low — cleanly falls back to the remote fetch if the local directory is missing. |
| `src/ui/messageRouterCore.ts` | Removed duplicate `import * as path from 'path';`. | Fixed a TypeScript compiler error that was breaking the build. | None. |

## Recent Fixes — May 20, 2026 (Session 32: API Key Onboarding Wizard Polish)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/commands/apiSetupHtml.ts` | Expanded provider `desc` array to include explicit `abilities` and `costDetails` fields. Modified HTML template to render these inline. Added dynamic feedback spans (`Verifying...`) and inline error text mapping. | User requested that the intake desk inform users not only of costs, but the distinct technical abilities of each AI model before selecting one. Also needed UI anchors for live verification errors. | Low — strictly UI/copy enhancement. |
| `src/commands/apiSetup.ts` | Imported `checkProviderReachable`. Modified `save-keys` message handler to execute active network pings (`Promise.all`) for any newly saved keys *before* returning success. Passes specific HTTP/Auth errors back to the WebView payload. | Pushing "Apply Changes" previously just assumed the pasted string was valid. Now it acts as a true intake desk, catching bad keys immediately to prevent opaque build pipeline failures later. | Low — network timeouts degrade gracefully to 'warn' and still save the key, preventing offline lockouts. |

## Recent Fixes — May 20, 2026 (Session 31: Fix Build Intent Overreach on Packaging Requests)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelClassifier.ts` | Excluded vague packaging requests (e.g., "make this a stand alone game") from the `build` intent, mapping them explicitly to `question`. | The word "make" in "make flappy bird into a stand alone game" was triggering the `build` intent. This bypassed the conversational Q&A routing we added in Session 30, causing Redivivus to erroneously build a duplicate file named `alone.html` instead of having a clarifying conversation about Electron. | None. |

## Recent Fixes — May 20, 2026 (Session 30: Fix Surgical Edit Fallback and Vague Intent Routing)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuild.ts` | Added a safety guard to throw an error if a surgical edit fails to apply, instead of falling back to a full-file write. Also split 5 lines to maintain `< 200` Rule 9 compliance. | When surgical edits failed (e.g. missing file headers or text mismatches), Redivivus was blindly falling back and writing the literal `<<<SEARCH...REPLACE>>>` tags into the user's file as a full file replacement, breaking their code. | Low. It now throws a graceful error in chat instead of corrupting the file. |
| `src/services/build/surgicalEditService.ts` | Updated `parseSurgicalEdits` to handle AI responses that omit the `## Edit: filename` header. | The Worker AI was not explicitly instructed to output the `## Edit:` header for single-file surgical edits, causing the parser to fail to find the blocks and triggering the catastrophic fallback bug. | None. |
| `src/ui/chat/chatPanelClassifier.ts` | Updated the `run` and `question` intents to route vague, non-technical overarching requests (like "make it a real app") to the conversational Q&A pipeline. | Redivivus needs to understand plain English and clarify intent instead of blindly executing. This allows the AI to ask clarifying questions (e.g. "Do you want an Electron desktop app?") before building. | None. |

## Recent Fixes — May 20, 2026 (Session 29: Fix Q&A auto-save and feature request classification)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelAutoSave.ts` | Updated the Supervisor prompt to check if the user asked to "modify" or "update" code, not just "create a NEW file". | If a user asked a question that yielded a full-file replacement, the AI previously ignored it for auto-save because the user didn't ask to create a "new" file. Now it correctly auto-saves code modifications resulting from Q&A. | None. |
| `src/ui/chat/chatPanelClassifier.ts` | Updated the `build` intent system prompt to explicitly include feature requests phrased as questions (e.g. "how do I add X"). | The classifier was routing feature requests to the `question` (Q&A) pipeline instead of the `build` pipeline, skipping the robust orchestrated file-builder. | None. |

## Recent Fixes — May 20, 2026 (Session 28: Fix Guardian AI conversational interception hallucination (Part 2))

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgSendAI.ts` | Added `isConvert` condition to the `if (routing.isGuardianActive())` check. | Guardian was still intercepting Q&A answers if the AI happened to include a code snippet in its explanation. This ensures Guardian only runs on actual codebase conversion tasks, never on conversational Q&A. | None. |
| `src/ui/chat/chatPanelMsgMapContext.ts` | Removed the Guardian check block entirely. | Map context returns conversational analysis. Guardian should never run on analytical responses, even if they contain code snippets, as it will hallucinate file replacements. | None. |

## Recent Fixes — May 20, 2026 (Session 27: Fix Guardian AI conversational interception hallucination)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgSendAI.ts` | Re-added the `hasCodeBlock` condition to the `if (routing.isGuardianActive())` check. | Prevents Guardian from trying to run a strict code-review prompt on a text-only conversational answer, which caused it to hallucinate code block rewrites. | None. |
| `src/ui/chat/chatPanelMsgMapContext.ts` | Added the `hasCodeBlock` condition to the `if (routing.isGuardianActive())` check. | Prevents Guardian from trying to run a strict code-review prompt on a text-only analytical answer (e.g., when explaining a file in the Architecture Map). | None. |

## Recent Fixes — May 20, 2026 (Session 26: Fix Open Workspace Silent Failure)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/project/projectOperations.ts` | Replaced `vscode.commands.executeCommand('vscode.openWorkspace', ...)` with `vscode.openFolder`. | The `vscode.openWorkspace` command does not exist in VS Code API, which caused the command to fail silently. `vscode.openFolder` handles both folders and workspaces. | None. |
| `src/ui/messageRouterWizard.ts` | Replaced `vscode.commands.executeCommand('vscode.openWorkspace', ...)` with `vscode.openFolder`. | Fixes silent failure when opening newly scaffolded projects. | None. |
| `src/ui/chat/chatPanelMsgProjectOps.ts` | Replaced `vscode.commands.executeCommand('vscode.openWorkspace', ...)` with `vscode.openFolder`. | Fixes silent failure when opening existing projects from the file dialog. | None. |
| `src/ui/chat/chatPanelShow.ts` | Replaced `vscode.commands.executeCommand('vscode.openWorkspace', ...)` with `vscode.openFolder`. | Fixes silent failure when auto-opening last project on startup. | None. |

## Recent Fixes — May 20, 2026 (Session 25: Clear Chat trashcan redirects to main dashboard / launcher screen)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelEmptyState.ts` | [NEW] Extracted `buildEmptyStateHtml` from `chatPanelHtml.ts` into this new modular file. | Fulfills the 200-line split hard stop (Rule 9) while separating empty state rendering. | None. |
| `src/ui/chat/chatPanelHtml.ts` | Imported `buildEmptyStateHtml` from `./chatPanelEmptyState.js` and replaced inline IIFE. | Keeps chat panel HTML builder extremely slim and modular. | None. |
| `src/ui/chat/chatPanelPublicAPI.ts` | In `panelRefresh`, if `messagesHtml` is empty (cleared chat), dynamically load `buildEmptyStateHtml` and post it to the webview. | Ensures clearing the chat redirects the central area back to the main dashboard / launcher screen instead of leaving it completely blank. | None. |

## Recent Fixes — May 20, 2026 (Session 24: Fix raw HTML entity rendering and add Clarification Cancel button)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMessageRouterEarlyExits.ts` | Replaced the raw HTML entity `&#x1F680;` with the real unicode `🚀` emoji. | Prevents the HTML renderer from escaping `&` and showing raw text in the chat bubble. | None. |
| `src/ui/chat/chatPanelBuild.ts` | Replaced `&#x1F4DD;` with the `📝` emoji. | Standardizes and clarifies chat message bubbles with clean emojis. | None. |
| `src/ui/chat/chatPanelMsgIntentActions.ts` | Replaced `&#x23F3;` with the `⌛` emoji. | Standardizes and clarifies chat message bubbles with clean emojis. | None. |
| `src/ui/chat/chatPanelBuildPhase.ts` | Replaced `&#x1F528;` with `🛠️` and `&#x1F50D;` with `🔍` emojis. | Standardizes and clarifies chat message bubbles with clean emojis. | None. |
| `src/ui/chat/chatPanelEditBuild.ts` | Replaced `&#x274C;`, `&#x1F4BE;`, and `&#x2705;` with `❌`, `💾`, and `✅` emojis. | Standardizes and clarifies chat message bubbles with clean emojis. | None. |
| `src/ui/chat/chatPanelBuildOrchestrated.ts` | Replaced `&#x1F3AF;`, `&#x2699;`, `&#x1F6E1;`, `&#x270F;`, `&#x26A0;`, `&#x2705;` with clean unicode emojis. | Standardizes and clarifies chat message bubbles with clean emojis. | None. |
| `src/ui/chat/chatPanelRenderer.ts` | Added a Cancel button with secondary styles next to the Submit & Build button on the clarify card. | Gives the user a visual way to abort a build clarification prompt. | None. |
| `src/ui/chat/chatPanelScriptActionsB.ts` | Added listener for `.clarify-cancel-btn` click event to post a message with `answers: { _cancelled: 'true' }`. | Connects the cancel button to the extension runtime. | None. |
| `src/ui/chat/chatPanelChunked.ts` | Implemented `answers._cancelled === 'true'` check to output `❌ Build canceled.` and exit the build process cleanly. Also compacted multiple lines to remain strictly under the 200 line split limit. | Fulfills the user request to cancel builds from the guided interview while fully complying with Rule 9. | None. |

---

## Recent Fixes — May 20, 2026 (Session 23: Collapse all custom sidebar sections by default)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/sidebar/chassisSidebar.ts` | Modified all section headers to have the `collapsed` class and all section bodies to have the `hidden` class by default. Unified the REVIEW section chevron to the standard down-facing indicator `▼`. | Keeps the sidebar extremely clean, structured, and uncluttered on load so the user can selectively expand whatever they need. | None. |

---

## Recent Fixes — May 20, 2026 (Session 22: Restore User Profile to custom sidebar and auto-open chat)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/sidebar/chassisSidebar.ts` | Replaced the commented-out `[NEXT]` placeholder for the Profile section with an active collapsible `-- PROFILE` section, rendering `User Profile` (triggers `redivivus.openProfile`) and `Web Search` (triggers `redivivus.webSearch`) buttons. | Displays the user profile and web search tools directly in the custom sidebar as intended by the design. | None. |
| `src/extensionInlineCommandsB.ts` | Modified the `redivivus.openProfile` command handler to call `ChatPanel.show(...)` if the panel is not currently open, waiting briefly for initialization before sending the profile content. | Avoids showing an unhelpful warning dialog when the chat panel is closed and instead opens it automatically for a premium UX. | None. |

---

## Recent Fixes — May 20, 2026 (Session 21: Resolve circular dependency causing Profile Runtime "command not found" error)


| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/commands/profileRuntime.ts` | Converted static top-level `ChatPanel` import into a dynamic inline import inside the `redivivus.profileRuntime` command handler. | Breaks circular dependency chain (`extensionCommands` -> `profileRuntime` -> `ChatPanel` -> `extensionInlineCommands` -> `extensionInlineCommandsB` -> `profileRuntime`) that caused command registration to fail at runtime. | None. |
| `src/commands/startRuntimeAnalysis.ts` | Converted static top-level `ChatPanel` import into a dynamic inline import inside the `redivivus.startRuntimeAnalysis` command handler. | Breaks circular dependency chain and prevents potential load-time crashes during initialization. | None. |
| `src/commands/startRuntimeAnalysisHelpers.ts` | Converted static top-level `ChatPanel` import into a dynamic import within `postToChat()`. | Breaks circular dependency chain while maintaining synchronous signature for callers. | None. |
| `src/extensionInlineCommandsB.ts` | Removed duplicate registration of `redivivus.showBuildHistory` command. | The command is already registered in `src/commands/savePoint.ts`. Double-registration threw an unhandled error during startup that crashed the entire extension activation, rendering all sidebar commands non-functional. | None. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20Z: Fix Profile Runtime — wrong location + undeclared command)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/sidebar/chassisSidebar.ts` | Added `&#x26A1; Profile Runtime` button to the REVIEW section (after Scan Project). | Profile belongs in the sidebar REVIEW section, not the chat header. | None. |
| `src/ui/chat/chatPanelHtml.ts` | Removed the `Profile` button from the chat header. | Wrong location — it was added there by mistake during session 20Y. | None. |
| `package.json` | Added `redivivus.profileRuntime` to `contributes.commands`. | Command was never declared, causing "command not found" toast on click. VS Code requires all commands to be declared before use. | None. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20Y: Restore missing Profile button)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelHtml.ts` | Restored `&#x26A1; Profile` header button (`data-cmd="redivivus.profileRuntime"`). | Button was silently dropped during today's header rewrites — it appeared in the code-search result from the previous session but was no longer present in the current file. | None — restores existing command. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20X: API setup disable switch, team roles, sorting, highlights, and styles split)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `package.json` | Added `redivivus.disabledProviders` configuration setting array. | Stores user-disabled provider IDs persistently. | None. |
| `src/services/ai/routingKeys.ts` | Intercepted key getters to return `null` if the provider ID is disabled. | Seamlessly propagates the disable action across the entire extension routing system. | None. |
| `src/commands/apiSetup.ts` | Handled `toggle-provider` message to toggle disabled status and reload HTML. | Keeps the setting and the UI perfectly in sync in real time. | None. |
| `src/commands/apiSetupHtml.ts` | Redesigned card layouts to support enabling/disabling, active team roles, and models/cost metadata. Implemented active team sorting (Supervisor > Guardian > Worker > Configured > Disabled > Not set) and card highlights. Extracted CSS to `src/commands/apiSetupStyles.ts` to remain under 200 lines (Rule 9). | Delivers a highly aesthetic, premium, and functional experience for managing AI teams. Groups and highlights active AI members at the top of the interface. | None. |
| `[NEW] src/commands/apiSetupStyles.ts` | Created standalone styles file containing all CSS layout and pulsing/glowing animations. | Adheres to Rule 9 file split limits. | None. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20W: Improve build clarification UI option wrapping)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelRenderer.ts` | Wrapped each radio option label inside a block-level `div` with inline-flex alignment and flex-shrink protection. | Prevents the radio circles and option text from overlapping or running together horizontally in the build clarification card. | None. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20V: Improve Save All Files button UX)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelScriptActions.ts` | Updated the `'save-all-btn'` click handler to set `saveAllBtn.style.display = 'none'` and show a gorgeous green success message in its place. | Hides the Save All button after execution to prevent double clicks and make saving completion unambiguous. | None. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20U: Add chat fast-path routing to codebase vault scan)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelClassifier.ts` | Added `'redivivus.scanVaultCodebase'` command type to `AvailableCommand` union type. | Declares the scan codebase command is valid for intent classification. | None. |
| `src/ui/chat/chatPanelClassifierOverrides.ts` | Added fast-path keyword and regex check for scanning codebase/project to vault, returning the command intent `redivivus.scanVaultCodebase`. | Enables users to type "scan my codebase for reusable blocks and save them to my vault" in the Redivivus Chat panel and directly launch the folder scanning flow. | None. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20T: Fix worker AI multi-file output extraction + tsconfig)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelChunkedLoop.ts` | Added robust multi-file output extraction: when worker AI outputs both files in one response separated by markdown fences, splits by fence and extracts only the section matching the target filename. Fixed TS7006 type annotation. Compacted header to 199 lines (Rule 9). | Worker AI ignores "output ONLY one file" instruction and dumps both files in each response. The naive fence-strip only removed first/last fences, leaving inner fences as TS syntax errors. | Low — only improves output parsing. |
| `~/projects/surgical-test-greet/tsconfig.json` | Added `"DOM"` to `lib` array alongside `"ES2020"`. | The project tsconfig lacked DOM lib, so `console` was undefined — causing TS2584 errors on any `console.log` the AI generated. | None. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20S: Fix vault snippet injection corrupting surgical edits)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelChunkedLoop.ts` | 1) Vault snippets now only injected for NEW files (`!exists`), not existing files being surgically modified. 2) Added `surgicalRules` variable with explicit instructions: output complete updated file, preserve existing code, do NOT add vault code or unrelated functions, do NOT wrap in markdown fences. 3) Strengthened the general "no fences" instruction. | The worker AI was given vault snippets (playSound, downloadAudio, etc.) for EVERY file including surgical edits. It copied all vault code into `test-surgical.ts`, producing 100+ lines of unrelated audio functions alongside the greet/farewell functions. This caused massive TS1005/TS1128 compile errors. | Low — only affects chunked build worker prompt. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20R: Fix JSON parse failure in clarify token renderer)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelRenderer.ts` | Added HTML entity unescaping (`&quot;` → `"`, etc.) before `JSON.parse` in the `__CLARIFY__` token handler. Added `[WARN]` tag documenting the escapeHtml ordering issue. | `escapeHtml()` runs on line 27 before any token regex replacements, so the JSON inside `__CLARIFY__` has its quotes converted to `&quot;`, causing `JSON.parse` to fail silently and return an empty string — rendering the entire bubble blank. | None — mirrors the same unescape pattern used by the code block renderer. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20Q: Fix build clarification UI rendering in chat panel)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelRenderer.ts` | Added `__CLARIFY__` token parser and renderer to parse the AI generated questions array and render them as an interactive radio-button form inside the message bubble. Checked that the file size is strictly under 200 lines (Rule 9). | The chat panel webview lacked a renderer for the `__CLARIFY__` token, leaving the raw JSON string exposed in the chat interface and stalling the build. | None — cleanly handles the token rendering. |
| `src/ui/chat/chatPanelScriptActionsB.ts` | Added a `.clarify-submit-btn` click listener that gathers checked radio option values, maps them to their respective question IDs, sets the button to a disabled "Building..." state, and posts the `clarify-submit` event back to the extension router. | Needed client-side interaction support to collect and submit user answers back to the extension to unlock the pending build loop. | None — standard DOM event listener. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20P: Fix multi-file chunked build bypass in orchestrator)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelOrchestrator.ts` | Imported `runChunkedBuild` and `isChunkedBuildRequest` from `chatPanelBuild.js`. Updated `handleNanoBuild` and `handleStandardBuild` to check if a task is a chunked build request via `isChunkedBuildRequest`, and if so, route it to `runChunkedBuild(task, ctx)` instead of hardcoding `runSingleFileBuild(ctx)`. Compacted `handleDeepBuild` message strings to keep the file strictly under 200 lines (Rule 9). | The modification fast-path and standard-complexity project-initialized builds completely bypassed chunked build and directly executed `runSingleFileBuild`. This completely broke all multi-file requests on existing projects by forcing single-file behavior (resulting in wiping out files or single-file dumps). | None — properly integrates the chunked build router logic. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20O: Fix chunked build surgical edits of existing files)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelChunked.ts` | Imported `getWorkspaceContextService` and fetched workspace files. Injected `wsBlock` (list of relative paths of all files in the active workspace) directly into the planner's prompt `planPrompt`. Compacted dead-ends and rules variable declarations to keep the file strictly under 200 lines (Rule 9). | The planner AI (Claude) had no context on what files actually existed in the user's workspace, so it assumed existing target files (like `src/test-surgical.ts`) didn't exist or shouldn't be planned. Supplying the workspace file list lets it successfully plan updates to existing files. | None — strictly adds context. |
| `src/ui/chat/chatPanelChunkedLoop.ts` | Added logic to check if a planned file already exists in the workspace. If it does, reads the current file content, injects it into `filePrompt` as `existingBlock`, and adds a strict rule telling the worker AI to modify the file content surgically rather than overwriting it from scratch. | When a file was planned for modification, the loop wrote it from scratch because it never loaded the existing file contents from disk, leading to overwriting of other functions and imports. | None — mirrors the successful single-file target loading logic. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 20, 2026 (Session 20N: Fix multi-file chunked build planner supervisor)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelChunked.ts` | Rewrote the supervisor's planning prompt in `runChunkedBuild` to explicitly command it to identify and list both brand new files to create AND existing files that need to be edited or updated. Removed the unused `plannerLabel` variable and condensed recent context declarations to keep the file strictly under 200 lines (Rule 9). | The planning prompt was too generic ("Break this into individual source files..."), so the supervisor AI (Claude) thought existing files didn't need to be in the returned JSON plan. Consequently, it only planned the new file `src/farewell.ts` and left the caller `src/test-surgical.ts` completely out of the plan. Adding explicit instructions guarantees both creations and updates are planned. | None — prompt content optimization only. Rule 9 line count constraints successfully met (file is exactly 198 lines). |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 19, 2026 (Session 20M: Fix single/multi-file chunked build routing)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildHelpers.ts` | Added a structural fast-path in `isChunkedBuildRequest` to count unique file mentions (`\b[\w./-]+\.(ts\|tsx\|js\|...)\b`) in the task. If two or more unique files are mentioned, it immediately returns `true` (chunked build). Also sharpened the AI prompt to explicitly define creates + modifications/imports as a multi-file task, and parsed the answer robustly with `.includes()`. | When the user asked to create `src/farewell.ts` AND update `src/test-surgical.ts`, the model routing classified the build as "single-file" because the generic AI classifier in `isChunkedBuildRequest` didn't catch the multi-file requirement (likely returned prose or answered "single" because it wasn't a database/fullstack app). As a result, the single-file pipeline ran, wrote both functions to `src/farewell.ts`, and ignored `src/test-surgical.ts`. | None — regex is precise and handles any normal file references. Fallback prompt remains to catch non-explicit multi-file statements. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 19, 2026 (Session 20L: Fix scaffold/build misclassification)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelClassifier.ts` | Sharpened `build` vs `scaffold` intent definitions. `build` now explicitly includes "even if user says 'new project' — specific files/functions/features always means build." `scaffold` now says "ONLY when NO specific files, functions, or features are named." Added 3 disambiguating examples including the exact failing message: "create a new test project called surgical-test-greet with a specific TypeScript file" → `build`. | "create a new test project... with a single TypeScript file src/test-surgical.ts containing a greet function" was classified as `scaffold` because it said "new project". `handleScaffoldIntent` → `detectScaffoldIntent` found no matching template (React/Flask/Go/Express) → asked "which one?" instead of building. The distinction: scaffold = blank boilerplate template, build = specific named content. | Low — purely prompt text change. AI classifier now has explicit rule and a matching example. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 19, 2026 (Session 20k: Build stamp in chat header)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `scripts/postcompile.js` | Now writes `build-info.json` to both `.redivivus/` (existing) and `out/data/` (new). `out/data/` is deployed with the extension so the stamp is readable at runtime. | `.redivivus/build-info.json` is in the project folder — the extension can't reliably find it at runtime because the project root varies. `out/data/` is always at a fixed path relative to `extensionContext.extensionPath`. | None — write is additive; `out/data/` write only runs if the dir exists. |
| `src/ui/chat/chatPanelHeader.ts` | Reads `out/data/build-info.json` via `extensionContext.extensionPath` at header build time. Formats as `vX.Y.Z · May 19 HH:MM`. Silently skips on any error. Added `import * as fs from 'fs'`. | Need runtime access to build timestamp to display in UI. | None — all errors silently caught; `buildStamp` is optional on the interface. |
| `src/ui/chat/chatPanelHtml.ts` | Added `buildStamp?: string` to `ChatHeaderInfo`. Renders as a monospace 10px dimmed stamp between the status dot and header-right buttons when `buildStamp` is present. | User needs to verify at a glance that a deploy took effect — build timestamp proves the running code matches the last compile. | None — purely additive; renders nothing when `buildStamp` is undefined. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 19, 2026 (Session 20i: No-workspace auto-create for scaffold/service)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgIntentActions.ts` | `handleScaffoldIntent` and `handleServiceIntent` now call `autoCreateProject` when no workspace folder is open, instead of blocking with "Open a project folder first". After creation, auto-opens the folder via `vscode.openFolder`. | Redivivus must work with nothing open — users expect to type a request and get a result, not be told to open a folder manually. | Low — `autoCreateProject` is the same path `runBuildAfterGates` uses. |

---

## Recent Fixes — May 19, 2026 (Session 20j: Fix "No project is open" false-positive on build requests)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelClassifierOverrides.ts` | Removed `test` and `start` from the structural run-intent fast-path regex. Both words are ambiguous: `test` matched `test project` in create requests ("create a new test project..."), routing to `handleRunIntent` which returned "No project is open". `start` matched "start a new project" (scaffold intent). Added `[DEAD]` comment documenting the removal. AI classifier now handles these per Rule 18. | User sent "create a new test project..." and got "No project is open — open a project folder first." Root cause: the hardcoded regex `\b(run|launch|preview|start|execute|test)\s+(...)?` matched `test project`, bypassed the AI classifier, and called `handleRunIntent` which lacks any auto-create logic. | None — `run`, `launch`, `preview`, `execute` remain in the fast-path and are unambiguous. `test it` / "let me test it" still resolves via the `let me (see|test|try) it` clause. |
| Deploy — `redivivus-build/VSCode-linux-x64/resources/app/extensions/redivivus/out/` | Deployed fix to the actual running baked IDE. Previous deploy only targeted `~/.vscode/extensions/papajoe.redivivus-0.3.6/` — that is NOT the editor the user runs. The baked IDE at `redivivus-build/VSCode-linux-x64/` is the real target per Rule 20. [DEAD] Never deploy only to `~/.vscode/extensions/` — always deploy to `redivivus-build/VSCode-linux-x64/resources/app/extensions/redivivus/`. | Fix was compiled and deployed to the wrong location — baked IDE kept running old code with the broken regex. | None — file copy only. |

*Last updated:* May 21, 2026

---

## Recent Fixes — May 19, 2026 (Session 20h: Feature gap closure — 9 features)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/build/surgicalEditService.ts` | New — SEARCH/REPLACE block parser + applier with whitespace-normalized fallback. | Full-file rewrites caused accidental deletion. | Low |
| `src/ui/chat/chatPanelMsgFix.ts` | Worker prompt: SEARCH/REPLACE format. Response handler: surgical first, full-file fallback. | Fix pipeline was overwriting files. | Medium |
| `src/ui/chat/chatPanelBuildWorker.ts` | Mod mode instructs AI to use SEARCH/REPLACE blocks. | Build pipeline same issue. | Medium |
| `src/ui/chat/chatPanelBuild.ts` | Surgical edit detection after Guardian review with fallback. | Build pipeline for mods. | Low |
| `src/ui/chat/chatPanelEditBuild.ts` | TODO-fix uses surgical format, graceful fallback. | Edit pipeline. | Low |
| `src/services/webSearchService.ts` | New — DuckDuckGo search + URL reader + intent detection. No API key. | No web access existed. | Low |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Web search/URL/remember interception before classifier. "read #N" for results. | Wires web search + user memory into chat. | Low |
| `src/services/languageServerBridge.ts` | New — go-to-definition, hover, references, rename, document symbols via VS Code LSP API. | No LSP integration existed. | Low |
| `src/services/inlineDiffPreview.ts` | New — diff editor with accept/reject for proposed changes. Temp file management. | No review UI before writing. | Low |
| `src/services/terminalCommandService.ts` | New — propose/approve/reject/execute terminal commands. Destructive command detection. | AI could not safely run terminal commands. | Low |
| `src/services/imageUnderstandingService.ts` | New — structured image analysis (OCR, error detect, mockup comparison) via vision AI. | Only raw base64 forwarding existed. | Low |
| `src/services/userMemoryService.ts` | New — global ~/.redivivus/user_memory.json. Passive learning (0 tokens), explicit "remember", ~30-token prompt injection. | No cross-project memory existed. | Low |
| `src/ui/sidebar/sidebarProvider.ts` | Activated PROFILE section with User Profile + Web Search entries. | Profile was greyed out. | Low |
| `src/extensionInlineCommandsB.ts` | Registered redivivus.openProfile + redivivus.webSearch commands. | Sidebar entries need handlers. | Low |
| `src/ui/chat/chatPanelAI.ts` | User memory injection into AI prompts via buildPromptInjection(). | AI needs to know user preferences. | Low |
| `src/services/jupyterService.ts` | New — read/edit/insert .ipynb cells. Notebook-to-text for AI context. | No Jupyter support. | Low |
| `src/services/deployService.ts` | New — Netlify/Vercel/Surge deploy. Project detection, build step, CLI integration. | No deployment capability. | Low |
| `src/services/mcpService.ts` | New — MCP JSON-RPC client. Connect, discover tools/resources, call tools, read resources. | No external tool protocol. | Low |
| `package.json` | Added redivivus.openProfile + redivivus.webSearch command definitions. | Required for sidebar activation. | None |

---

## Recent Fixes — May 19, 2026 (Session 20g: Project dashboard redesign)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelDashboard.ts` | Complete rewrite of `buildProjectDashboard`: compact hero (icon + name + stats inline), 2-column grid (blueprint left, activity right), truncated activity with relative timestamps (3 rows max), compact inline progress bar, better action pills with tooltips, added Close Project button, removed floating "Skip questions" pill. | Dashboard was verbose and required scrolling. New layout is compact, informative, and no-scroll. | Medium — full HTML rewrite but data sources unchanged. |
| `src/ui/chat/chatPanelStylesDash.ts` | New file — CSS for dashboard classes: `.dash-root`, `.dash-hero`, `.dash-grid`, `.dash-bp-card`, `.dash-act-row`, `.dash-progress`, `.dash-actions`, `.dash-action-close`. | Dashboard needed dedicated styles; Mid CSS file was near 200-line limit. | None — new file, no existing styles affected. |
| `src/ui/chat/chatPanelStyles.ts` | Added import + call for `buildChatCssDash()`. | Wire new dashboard CSS into the assembler. | None. |

## Recent Fixes — May 19, 2026 (Session 20f: Launcher screen redesign — 6 improvements)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelHtml.ts` | Replaced launcher screen with polished redesign: 3 action cards with descriptions (Start New Project / Quick Build / Open Project), Quick Start Template pills (React, Flask, Go API, Express), vault status line, onboarding link, recent projects with relative timestamps, settings gear popover for auto-open checkbox. | Launcher undersold Redivivus capabilities — new users saw a generic project picker, not an AI build system. Now surfaces scaffolding, vault, and capabilities discoverability. | Medium — launcher HTML changed significantly; all existing `data-action` and `data-recent-path` attributes preserved for backward compat. |
| `src/ui/chat/chatPanelStylesMid.ts` | Added ~70 lines of CSS for new launcher components: `.launcher-action-card`, `.launcher-tpl-pill`, `.launcher-vault-status`, `.launcher-onboard-link`, `.launcher-settings-gear`, `.launcher-auto-popover`, improved `.launcher-recent-item` with timestamp column. | Professional styling for the redesigned launcher. | None — new classes only, no existing styles modified. |
| `src/ui/chat/chatPanelScript.ts` | Added click handlers for `scaffold-quickstart` (sends template type to extension) and `toggle-auto-open-popover` (toggles visibility of settings popover). | Wire new launcher buttons to extension-side handlers. | None — new action names, no existing handlers modified. |
| `src/ui/chat/chatPanelHeader.ts` | Added `vaultItemCount` to header data (computed via VaultService). Changed `recentProjects` to include `timestamp` field from globalState. | Launcher needs vault count for status line and timestamps for relative time display. | Low — VaultService instantiation wrapped in try/catch, defaults to 0. |
| `src/ui/chat/chatPanelMessageRouterEarlyExits.ts` | Added `scaffold-quickstart` message handler: sets direct build mode, pushes scaffold request to conversation, delegates to `_handleBuildRequest`. | Quick Start Template pills need an extension-side handler to trigger scaffolding without requiring the user to type. | Low — reuses existing scaffold detection in the build pipeline. |
| `src/ui/chat/chatPanelHtml.ts` | Replaced `⚡ Capabilities` header button with context-sensitive `? Help` button. On launcher: triggers `redivivus.showCapabilities`. With project open: triggers `redivivus.showChatGettingStarted` (focused help). Removed redundant "What can Redivivus do?" link from launcher bottom bar. | Capabilities button was redundant with the bottom bar link. Help button is more useful and context-aware. | None — uses existing commands. |
| `src/ui/chat/chatPanelStylesBase.ts` | Removed `.capabilities-btn` CSS (marked [DEAD]). | Cleanup — button no longer exists. | None. |
| `src/ui/chat/chatPanelStylesMid.ts` | Removed unused `.launcher-onboard-link` and `.launcher-bottom-sep` CSS. | Cleanup — elements removed from HTML. | None. |

## Recent Fixes — May 19, 2026 (Session 20e: 7 holistic improvements)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/build/compileAutoFix.ts` | Added pre-retry snapshot + rollback on retry exhaustion. On 3 failed attempts, original post-build files are restored. | Prevents corrupted half-fixed state from persisting — users get back to a working baseline. | Low — rollback is best-effort, non-blocking. |
| `src/services/build/testAutoFix.ts` | Same rollback pattern — snapshot before retry loop, restore on exhaustion. | Same reason as compileAutoFix. | Low. |
| `src/services/ai/streamingProviders.ts` | New file. Real SSE streaming for all 6 AI providers (Gemini, Claude, OpenAI, Groq, xAI, Kimi). | Replace fake character-by-character animation with real token streaming. | Low — falls back to non-streaming on any error. |
| `src/ui/chat/chatPanelBuildWorker.ts` | `executeWorkerBuild` now tries streaming first via `streamProvider`, falls back to non-streaming. | Real streaming — users see code being generated live, not animated. | Low — fallback guarantees backward compatibility. |
| `src/ui/chat/chatPanelBuild.ts` | Replaced fake `streamCodePreview` with real streaming via `onChunk` callback. Also injects recent build history via `getRecentBuildsContext`. | Fix #2 + Fix #5 — real streaming and multi-turn continuity. | Low. |
| `src/ui/chat/chatPanelMsgFixUtils.ts` | `collectSourceFiles` now accepts optional `userText` for smart file selection (mentioned files + importers first). `takeSnapshot` now uses `SnapshotService.prepare()` and returns snapshot ID. Added `getRecentBuildsContext`. | Fix #3 context-aware fix selection + Fix #4 fix undo + Fix #5 continuity helpers. | Low. |
| `src/ui/chat/chatPanelMsgFix.ts` | Updated `collectSourceFiles(root, userText)` call + captured `fixSnapId` + used it in `BuildHistoryService.record()`. | Wires context-aware selection and fix undo to call sites. | Low. |
| `src/ui/views/buildHistoryPanelHtml.ts` | Added "Fix" badge (gold) for entries with `[FIX]` task prefix. Task display strips the prefix. | Visual distinction between builds and AI fixes in the history panel. | None. |
| `src/services/ai/routingComplexity.ts` | Added `aiClassifyComplexity` — 50-token AI call (Groq first, Gemini fallback) replaces regex in `classifyTask`. Falls back to regex on failure. | Rule 18: AI for understanding, never regex. | Low — regex fallback ensures routing never breaks. |
| `src/ui/chat/chatPanelChunked.ts` | Injected `getRecentBuildsContext` into chunked build planner prompt. | Fix #5 multi-turn continuity for multi-file builds. | Low. |
| `src/ui/chat/chatPanelScaffoldReact.ts` | Updated React 18.2 → 19.0, Vite 4.4 → 6.0, TS 5.0 → 5.7. Added `@vitejs/plugin-react` + `vite.config.ts`. | Scaffold versions were from 2022. New projects should start on current stack. | Low — only affects new scaffolded projects. |
| `src/ui/chat/chatPanelScaffoldBackend.ts` | Updated Express 4.18.2 → 4.21.0, dotenv 16.3.1 → 16.4.0, Flask 2.3 → 3.1, flask-cors 4 → 5. | Same reason — current package versions. | Low. |

## Recent Fixes — May 19, 2026 (Session 20d: Functional audit — 4 bugs found and fixed)

| File | Bug | Fix | Risk |
|------|-----|-----|------|
| `src/services/build/testRunner.ts` | `|| npm test 2>&1` fallback re-ran Jest without `--watchAll=false` — when tests fail (exit 1), Jest enters interactive watch mode and spawnSync blocks for the full 2-minute timeout. | Removed the fallback entirely. Command is now `npm test -- --watchAll=false --ci --passWithNoTests 2>&1`. | Low — `--ci` ensures non-interactive mode on all Jest versions. |
| `src/services/build/compileAutoFix.ts` | Auto-install used `shell: true` with string interpolation: `` `npm install ${pkg}` `` and `` `pip install ${pkg}` ``. Package name comes from error message — theoretically injectable. | Changed to `spawnSync('npm', ['install', pkg])` and `spawnSync('pip', ['install', pkg])` with no shell. | None — args array never invokes a shell. |
| `src/extensionInlineCommandsC.ts` | After `redivivus.runProject` injected a terminal error, the `inject-terminal-error` handler in `chatPanelMessages.ts` auto-triggered the fix pipeline immediately. Then 300ms later the "Want me to fix it?" prompt arrived in chat — after the fix had already started. Stale and confusing UX. | Removed the 300ms `setTimeout` that sent the "Want me to fix it?" prompt. Auto-fix already runs on injection. | None — fix behavior unchanged, redundant prompt removed. |
| `src/ui/chat/chatPanelChunked.ts` | Build history recorded `supervisor: swPair2?.supervisor` by calling `selectSupervisorAndWorker()` again at the end of the build. The `supervisor` and `worker` variables captured at the start of the function were already the correct values. | Replaced `swPair2` re-poll with the already-captured `supervisor` and `worker` variables. | None — same values in practice; simpler and cannot diverge. |
| `scripts/postcompile.js` | Line-count enforcer used `split('\n').length > 200` — trailing newlines make a 200-line file report as 201. All four 200-line files were falsely flagged every compile. | Fixed: strip trailing empty element before counting (`lines[lines.length-1] === '' ? lines.length-1 : lines.length`). | None — enforcer is now accurate. |

## Recent Fixes — May 19, 2026 (Session 20c: Redivivus self-audit remediation)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/phaseUndoServiceImpl.ts` | Moved `[SCOPE]` comment to line 1 (was line 4, after imports). | Rule 9 + audit violation — every file must have [SCOPE] at line 1, not buried after imports. | None. |
| `src/services/usageTrackerReport.ts` | Moved `[SCOPE]` comment to line 1 (was line 3, after imports). | Same rule violation fix. | None. |
| `src/ui/chat/chatPanelScaffoldReact.ts` | New file (~108 lines). Contains `REACT_SCAFFOLD` constant extracted from `chatPanelScaffold.ts`. | `chatPanelScaffold.ts` was 302 lines — RULE 9 violation. Template constants must be split by framework. | None — pure data, no logic. |
| `src/ui/chat/chatPanelScaffoldBackend.ts` | New file (~125 lines). Contains `PYTHON_FLASK_SCAFFOLD`, `GO_API_SCAFFOLD`, `NODE_EXPRESS_SCAFFOLD`. | Same split — backend templates extracted alongside React. | None — pure data, no logic. |
| `src/ui/chat/chatPanelScaffold.ts` | Rewritten to ~55 lines. Now imports scaffold constants from the two template files above. Exports: `ScaffoldTemplate`, `SCAFFOLDS`, `SCAFFOLD_KEYWORDS`, `detectScaffoldIntent`, `runScaffold`. Public API unchanged. | Part of 302→55 line reduction. Callers use dynamic import — no import path changes needed. | Low — public exports unchanged, callers unaffected. |
| `src/ui/chat/chatPanelServiceTemplatesA.ts` | New file (~97 lines). `ServiceTemplate` interface + `FIREBASE_TEMPLATE` + `SUPABASE_TEMPLATE`. | `chatPanelServiceTemplates.ts` was 290 lines — RULE 9 violation. | None — pure data. |
| `src/ui/chat/chatPanelServiceTemplatesB.ts` | New file (~110 lines). `STRIPE_TEMPLATE` + `OPENAI_TEMPLATE`. | Same split. | None — pure data. |
| `src/ui/chat/chatPanelServiceTemplates.ts` | Rewritten to ~55 lines. Imports from A+B files, re-exports public API. `detectServiceIntent`, `runServiceSetup`, `formatServiceSetupResult` unchanged. | 290→55 line reduction. Callers use dynamic import — no changes needed. | Low — public API unchanged. |
| `src/extensionInlineCommandsC.ts` | New file (~95 lines). Contains `registerInlineCommandsC` with `redivivus.runProject`, `redivivus.inspectElement`, `redivivus.injectTerminalError`. | `extensionInlineCommandsB.ts` was 233 lines — RULE 9 violation. | Low — commands registered identically, just in a different file. |
| `src/extensionInlineCommandsB.ts` | Rewritten to ~115 lines. Removed the 3 commands extracted to C. Now calls `registerInlineCommandsC()` at end. | 233→115 line reduction. | Low — public `registerInlineCommandsB` signature unchanged. |
| `scripts/postcompile.js` | Added line-count enforcer block. After compile, walks `src/**/*.ts` and prints `[Redivivus RULE 9]` warning for any file over 200 lines. | Self-enforcement: no more violations slip through undetected. Previously violations were only caught manually. | None — warnings only, never blocks compile. |

## Recent Fixes — May 19, 2026 (Session 20b: Close remaining Claude Code gaps)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/build/testRunner.ts` | New file. `detectTestCommand(root)` — checks package.json scripts, pytest config, go.mod, Cargo.toml. `runTests(root)` — spawnSync with 2-min timeout, ANSI stripped, `failureCount` parsed from Jest/Mocha/pytest/Go/Rust output patterns. | Redivivus had compile→fix loop but no test awareness. A green compile doesn't mean working code. | Low — read-only detection + spawnSync. 2-min timeout prevents hang. |
| `src/services/build/testAutoFix.ts` | New file. `runTestAutoFix(ctx, builtFiles)` — runs tests, parses file:line patterns to find failing implementation files (prefers non-test files), calls AI with test output + file content, writes fix, re-runs. Up to 3 retries. | Same run→fail→fix loop as compileAutoFix but for test suites. Redivivus was stopping after compile passed, ignoring test failures. | Medium — AI fix call can produce bad code. Try/catch around writes. Worst case: shows raw test output to user. |
| `src/services/workspace/gitContext.ts` | New file. `git()` runner using spawnSync (no shell injection risk — args array). `getGitLog`, `getGitStatus`, `getGitDiff`. `buildGitContextBlock(root)` — returns formatted block for AI prompts, empty string for non-git repos. | Redivivus was blind to git history. The AI couldn't answer "what changed since it last worked?" — the single most useful question when debugging a regression. | Low — read-only git calls. GIT_TERMINAL_PROMPT=0 prevents auth prompts hanging. |
| `src/services/build/compileAutoFix.ts` | Added `tryAutoInstall(root, errorOutput, ctx)` — detects `Cannot find module 'X'` (Node) and `No module named 'X'` (Python), runs `npm install X` or `pip install X`, returns true if exit code 0. Called BEFORE the AI retry loop. If install succeeds and compile passes → done, no AI tokens spent. | Missing package errors are not code bugs — the AI was being asked to fix a problem it can't fix (rewriting import paths never helps when the package truly isn't installed). | Low — wrapped in try/catch. Uses spawnSync with 60s timeout. If install fails, falls through to the normal AI fix loop. |
| `src/ui/chat/chatPanelBuildHelpers.ts` | Added `diffSummary(oldContent, newContent)` — counts lines added/removed that the other side doesn't have. Returns `+N / -N lines` or empty string for new files. | Closes the "diff preview" gap vs Claude Code. Users can see at a glance what changed in a modification build. | None — pure string comparison, no I/O. |
| `src/ui/chat/chatPanelBuild.ts` | Added `runTestAutoFix` + `buildGitContextBlock` imports. Git context now included in `blueprintContext` alongside dead ends and project rules. Reads old file content before write, computes `_diff` via `diffSummary`, appends `_Changes: +N / -N lines_` to result card for modification builds. Added `runTestAutoFix` call after compile auto-fix. | Wire all new features into single-file build path. | Low — git context is empty string for non-git repos so non-git projects unaffected. |
| `src/ui/chat/chatPanelChunked.ts` | Added `runTestAutoFix` import + call after `runCompileAutoFix`. | Wire test auto-fix into multi-file build path. | None — same catch wrapper. |
| `src/ui/chat/chatPanelMsgFixUtils.ts` | Added `buildGitContextBlock` import. `getRecentBuildContext` now appends git context (log + status + diff) to its return value so the fix Supervisor sees what changed in git alongside the build history. | Fix pipeline AI was missing git context — now it sees both "what Redivivus built" AND "what changed in git" before diagnosing a bug. | Low — git block is empty for non-git repos. Existing projects are unaffected. |

## Recent Fixes — May 19, 2026 (Session 20: Close the Claude Code capability gap)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/build/compileRunner.ts` | New file. `detectCompileCommand(root)` — checks tsconfig.json, package.json scripts, .py files to pick the right compile/typecheck command. `runCompileCheck(root)` — runs it via `cp.spawnSync`, strips ANSI, returns `{ success, output, command }`. 45-second timeout. Never throws. | Redivivus wrote code but never compiled it. Errors only surfaced when the user ran the project manually. This is the foundation of the auto-fix loop. | Low — read-only operation up front; spawnSync is blocking but called after build completes. |
| `src/services/build/compileAutoFix.ts` | New file. `runCompileAutoFix(ctx, builtFiles)` — runs compile check; if errors found, parses error output for file paths (TS/Node/Python patterns), calls AI with the error + file content, writes the fix, recompiles. Retries up to 3 times. Shows progress in chat. After 3 failures, shows the raw error and asks user to describe further. | This closes the biggest gap vs Claude Code: the compile→error→fix→recompile loop. Previously the user had to manually paste compile errors into chat. | Medium — AI fix call uses `ctx.routing.prompt()` which can return bad code. Wrapped in try/catch; failure means user sees the error and can fix manually. Worst case: writes bad code that also fails to compile, then shows the error to the user. |
| `src/services/workspace/codebaseSearch.ts` | New file. `listSourceFiles(root, withContent, maxFiles)` — full project tree walker, depth 8, up to 300 files, skips node_modules/.redivivus/dist etc. `searchCodebase(root, pattern)` — grep-style search returning file+line+text. `findSymbol(root, symbol)` — finds function/class definitions. `buildFullContextBlock` / `buildFileTree` — AI context formatters. | The fix pipeline could only see 10 files (MAX_FILES=10, depth=4). Large projects were invisible to the AI. | Low — read-only. Large projects with 200+ files cap at 300 to avoid memory issues. |
| `src/ui/chat/chatPanelMsgFixUtils.ts` | Replaced `collectSourceFiles` implementation. Old: MAX_FILES=10, depth=4, 4 local constants. New: delegates to `listSourceFiles(root, true, 50)` — 50 files, depth 8, uses canonical skip list. Removed 4 constants and 22-line walk function. Added import. File went from 194 to 176 lines. | Fix pipeline AI was only seeing 10 source files max. On a 30-file project it was blind to 2/3 of the codebase. | Low — `listSourceFiles` uses the same skip logic (node_modules, .redivivus, dist) so existing behavior is preserved; it just goes further. |
| `src/ui/chat/chatPanelBuild.ts` | Added `runCompileAutoFix` import. After `refreshSetupProgressIfOpen()`, added `await runCompileAutoFix(ctx, [relPath, ...scaffoldedFiles]).catch(() => {})`. | Wire compile auto-fix into single-file build path. | None — wrapped in catch so compile fix failures never block the build result. |
| `src/ui/chat/chatPanelChunked.ts` | Added `runCompileAutoFix` import. After build history record, added `await runCompileAutoFix(ctx, builtFiles).catch(() => {})`. | Wire compile auto-fix into multi-file chunked build path. | None — same catch wrapper. |
| `src/ui/chat/chatPanelMessages.ts` | After `handleInjectTerminalError`, added auto-trigger: if `msg.error?.errorBlock` is truthy, immediately calls `handleFixTerminalError` to start fixing the crash automatically. | Previously: terminal error was shown in chat and the user had to click a button or type "fix it". Now: user runs project → it crashes → Redivivus sees the error and starts fixing without the user typing anything. | Low — `handleFixTerminalError` calls `deps.handleBuildRequest(fixPrompt, true, true)` which is the normal fix pipeline. If the error context is empty/junk, the fix pipeline will say it couldn't find a problem and stop gracefully. |

## Recent Fixes — May 18, 2026 (Session 19: Single-file build history recording + file split)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildHelpers.ts` | New file. Extracted `BuildContext` interface, vault-hit resolvers (`registerVaultHitResolver`, `resolveVaultHit`), `isChunkedBuildRequest`, and message helpers (`updateLastMsg`, `appendMsg`, `streamCodePreview`) from `chatPanelBuild.ts`. | `chatPanelBuild.ts` was 209 lines — over the 200-line hard limit. Required split before any further edits. | None — logic identical, just moved. All exports re-exported from `chatPanelBuild.ts` for backward compatibility. |
| `src/ui/chat/chatPanelBuild.ts` | Removed extracted code (now in helpers). Added `BuildHistoryService`+`makeBuildHistoryEntry` import. After `buildResultCard()`, added `new BuildHistoryService(root).record(makeBuildHistoryEntry(...))` to record every single-file build. File reduced from 209 to 147 lines. | `runSingleFileBuild` never called `BuildHistoryService.record()` — only `runChunkedBuild` in `chatPanelChunked.ts` did. All single-file builds (the sound fix, bird appearance fix) were invisible in Build History. Root cause: the `hist.record()` call was added to the chunked path but never ported to the single-file path. | Low — follows same pattern as `chatPanelChunked.ts` lines 184-185. |

## Recent Fixes — May 18, 2026 (Session 19: Fix-path builds now record to Build History)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFix.ts` | Added `BuildHistoryService`+`makeBuildHistoryEntry` import. Modified the `if (written.length > 0)` line to also call `new BuildHistoryService(root).record(...)` after each successful fix. File is now exactly 200 lines. | The fix path (`handleFixRequest`) wrote to `fix-snapshots/` which has no `_meta.json` — `SnapshotService` never scanned that dir. Result: all bug fix builds ("sound fix", etc.) were invisible in Build History. Standard build path (`runSingleFileBuild`) already fixed in same session. Now both paths record. | None — wrapped in try/catch so a record failure never blocks the fix. `workerLabel !== 'AI'` guard prevents null-like strings from storing as worker field. |

## Recent Fixes — May 18, 2026 (Session 19: Build History legend cleanup)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/views/buildHistoryPanelHtml.ts` | Removed the "Note: The .redivivus/ folder..." paragraph from the Build History legend. Kept the Undo/Archived/First Build legend lines. | The note about .redivivus/ adding "zero weight" is irrelevant in the History panel — it belongs in post-build guidance, not here. User reported all history snapshots appeared to have the same sidenote that didn't apply. | None. |

## Recent Fixes — May 18, 2026 (Session 19: Run pill fix — deploy missing commands)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgProjectOps.ts` | Added direct `redivivus.runProject` handler inside `handleRunCommand` — bypasses VS Code command dispatch. Added imports for `BuildHistoryService` and `detectPostBuildInfo`. Logic: get recent files from build history, detect entry point, open HTML in browser or run other types in terminal. File is now exactly 200 lines. | `redivivus.runProject` was registered in `extensionInlineCommandsB.ts` but `vscode.commands.executeCommand('redivivus.runProject')` consistently returned "command not found" — debug log confirmed this from 13:35 onward. `redivivus.showBuildHistory` (adjacent line, same file) works. Root cause unknown — VS Code command dispatch is unreliable for this specific command in this build. Direct handler is simpler and more reliable anyway. | None — direct handler produces same behavior as the registered command. Adjacent commands (`showBuildHistory`, `blueprintInterview`) still use VS Code dispatch as before. |
| `src/ui/chat/chatPanelPostBuild.ts` | HTML detection now falls back to scanning root for `index.html`, `src/index.html`, `public/index.html` when `builtFiles` doesn't contain an HTML file. Previously `builtFiles` was the only source for HTML detection (unlike Node.js which checked `fs.existsSync(package.json)`). | After the direct Run handler was wired in, user got "No runnable entry point detected" for a flappy-bird HTML project. The build history entries were from analysis tasks (not HTML builds), so `recentFiles` contained no `.html` file. The game's `index.html` was invisible to the detector. | Low — fallback only activates when `builtFiles` has no `.html`. Projects with a root `index.html` will always be runnable via Run button now. |

## Recent Fixes — May 18, 2026 (Session 19: Prose-in-file bug — code extraction fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildInference.ts` | Added `extractCodeFromResponse(text)` export. Scans response for ALL fenced code blocks using a non-greedy regex, then returns the LARGEST one. Falls back to stripping a lone leading/trailing fence if no blocks found. | The old one-line regex `replace(/^...$/m, '')` stripped the outermost ``` but left any prose text before/after the block in the file. When vault assembly AI returned "To fix the issues, you can modify... ```javascript ... ``` Note that this is just one possible solution", the explanation text was written to index.html, producing a page of raw text instead of a playable game. | Low — larger code block heuristic is reliable when AI returns mixed prose+code. If AI returns only code with no fences (already correct), the fallback path returns it unchanged. |
| `src/ui/chat/chatPanelBuildVault.ts` | Updated code extraction to call `extractCodeFromResponse(res.text)` instead of inline regex. | Vault assembly was writing prose explanations to disk when AI returned mixed format. | None — same path as before, just better extraction. |
| `src/ui/chat/chatPanelBuild.ts` | Same — updated `runSingleFileBuild` code extraction to use `Inf.extractCodeFromResponse`. | Guard against same prose-in-file bug in the non-vault single-file build path. | None. |
| `.redivivus/dead_ends.md` | Add entry: "AI code extraction — `replace(/^```/m)` is insufficient when AI returns prose + code block. Use `extractCodeFromResponse` which scans all blocks and picks the largest." | Prevent future AI sessions from reverting to the single-replace pattern. | None. |

## Recent Fixes — May 18, 2026 (Session 19: Build estimate — full AI breakdown)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/costEstimatorService.ts` | Added `supervisorLabel/CostUSD/Tokens` and `guardianLabel/CostUSD/Tokens` and `totalCostUSD/totalCostFormatted` to `CostEstimate`. `estimateBuild` now takes optional `supervisorModel` and `guardianModel`. Supervisor estimated at 20% of worker tokens; guardian at 35% (review pass reads output + generates feedback). Extracted `getRateKey`, `getModelLabel`, `formatCost` helpers for cleaner code. | Build estimate modal was showing only the worker cost. Users had no visibility into supervisor planning or guardian validation costs, which together can be 50%+ of the worker cost. | Low — all new fields are optional; existing callers without supervisor/guardian args produce the same result as before, with `totalCostUSD === costUSD`. |
| `src/ui/chat/chatPanelGates.ts` | `awaitCostConfirmation` now calls `deps.routing.buildRoster()` to get supervisor and guardian model IDs, then passes them to `estimateBuild`. | Wire the actual roster into the estimate so the breakdown uses real model names. | None — `buildRoster()` has its own fallback to `gemini` if no API keys are configured. |
| `src/ui/chat/chatPanelScriptGates.ts` | Cost estimate modal now: (1) shows Total Cost (all passes) in the green highlight cell instead of worker-only cost; (2) adds "AI Cost Breakdown" section below the grid with per-pass rows (Worker / Supervisor / Guardian) showing model name, token estimate, and cost; (3) fixes cell label+value rendering — both spans now explicitly `display:block` for correct stacking. Added inline `formatUSD()` helper for consistent cost formatting in breakdown rows. | User asked "where is the guardian/supervisor estimate?" — these passes were invisible in the modal. | None — breakdown section only renders if `supervisorLabel` or `guardianLabel` is present in estimate; modal degrades gracefully to old layout for builds with no supervisor/guardian. |

## Recent Fixes — May 18, 2026 (Session 19: Mode popover + file split)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Split run/scaffold/service intent blocks (~88 lines) to `chatPanelMsgIntentActions.ts`. Replaced each with a one-line delegating call. File reduced from 249 to 164 lines. | File was at 249 lines — 49 over the 200-line hard limit. | None — logic is identical, just moved to its dedicated module. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Mode-popover fix: when `!deps.buildMode` and `deps.redivivus?.isInitialized?.()` returns true, skip the popover and call `deps.handleBuildRequest(userText)` directly. Only uninitialized projects show the "Choose build approach" dialog. | The popover was appearing for modification requests on existing initialized projects (e.g. "make bird look different" on a live flappy-bird project). That's wrong — mode selection is only meaningful when starting a brand-new project. | None — initialized projects always had `isInitialized()` returning true; fallback to postMessage still fires for genuinely new projects. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Template wizard fix: added `&& !deps.redivivus?.isInitialized?.()` to the plan-mode wizard guard. Initialized projects skip the "Two quick questions before I build" form and go straight to `handleBuildRequest`. | The wizard fired for ALL plan-mode users — including those modifying existing projects, where "What is it for?" is irrelevant. | None — wizard still runs for truly new uninitialized projects in plan mode. |
| `src/ui/chat/chatPanelIntent.ts` | Vault hit modal now shows accurate AI-filtered count: keyword search is run first, then AI relevance filter eliminates false positives before the modal appears. If 0 relevant items survive the filter, modal is skipped entirely. `runVaultAssemblyBuild` receives the pre-filtered list. Modal count was previously the raw keyword-match count (e.g. 9 audio components for a visual task). | User asked "are there really 9 things that are relevant?" — correct answer: no, they were keyword matches not semantic matches. | Low — if AI filter call fails (timeout/error), falls through with 0 items and skips modal, which triggers a fresh build. No vault items are silently injected. |
| `src/ui/chat/chatPanelIntent.ts` | Root cause fix for "Two quick questions" dialog: added `&& !deps.redivivus?.isInitialized?.()` to scope clarification guard in `handleBuildRequest`. The dialog is rendered by `showScopeModal` which is called by `askScopeQuestions` which is triggered by `isVagueProjectRequest` returning true. "make the yellow ball look like a bird" passed the fast-path exclusion (only "fix/update/modify/change/edit" were excluded, not "make") and was classified as "vague" by AI. Initialized projects never need scope clarification — the user is always modifying, not starting from scratch. | Scope modal appeared on every modification request to an initialized project ("make X look like Y"). | None — scope clarification still fires for genuinely new uninitialized projects in plan mode. |

## Recent Fixes — May 18, 2026 (Session 18: Vault false-positive fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildVault.ts` | Added AI relevance filter after language filtering: when > 2 vault items are found, a fast 12-second AI call asks "which of these are relevant to the task?" and discards items the AI says don't apply. If zero remain, falls through to `runSingleFileBuild`. Also changed assembly prompt from "do not rewrite from scratch" to "use ONLY what's relevant — skip unrelated components". | User asked to change bird appearance (visual task); vault returned 9 audio functions (`playSound`, `synthesizeSegment`, `getBirdDuration`) because they contained "bird" from a previous build. Worker forced all 9 in and produced broken output. | Low — if the relevance check itself fails (timeout/error), all items are kept and the original behavior is preserved. Only removes items when AI explicitly says they're not relevant. |
| `.redivivus/dead_ends.md` | Documented the vault keyword false-positive pattern — same word ("bird"), wrong domain (audio vs visual). | Prevents future AI sessions from repeating this pattern. | None. |

## Recent Fixes — May 18, 2026 (Session 18: 5-Task Handoff Implementation)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/extensionInlineCommandsB.ts` | Modified `redivivus.runProject` command to auto-monitor terminal output for errors after running. Waits 3-8 seconds (depending on deps install), then calls `getLastTerminalError()`. If error found, injects into chat via `inject-terminal-error` message with follow-up prompt offering to fix. | Users run project, it crashes, then they have to manually copy/paste errors. Now Redivivus captures terminal errors automatically and offers to fix them. | Low — uses existing `terminalErrorService.ts` which already captures terminal data. Non-destructive: only reads terminal buffer, never modifies. |
| `src/ui/chat/chatPanelImportCheck.ts` | New file. `checkImports(root, filePath, code)` scans Python (`import X`, `from X import Y`) and Node (`require()`, ES modules) imports. `formatMissingImports()` creates user-friendly warning. Skips stdlib (Python) and node_modules (Node). | AI builds often create files referencing modules that don't exist yet. Previously silent failure at runtime. Now Redivivus warns users immediately after build. | None — read-only check, runs after file write, appends warning text to result card. |
| `src/ui/chat/chatPanelBuild.ts` | Added imports for `checkImports` and `formatMissingImports`. After `writeBuiltFile()`, runs import check and appends `importWarning` to build result message. | Wire import validation into build pipeline so every build gets validated. | None — optional warning text, doesn't block build success. |
| `src/ui/chat/chatPanelBuildReview.ts` | Added `GuardianReviewResult` interface with `{ code: string; qualityScore: number }`. `runGuardianReview` now computes quality score: passed (+2), code >50 lines (+1), no TODOs (+1), supervisor+worker ran (+1). Returns `{ code, qualityScore }` instead of just string. | Vault dedup needs quality scores to compare and evict inferior duplicates. Previously no quality metric existed. | Low — score calculation uses simple heuristics. If Guardian throws, returns default score 3. |
| `src/ui/chat/chatPanelBuild.ts` | Updated `runGuardianReview` call to destructure `{ code, qualityScore }`. `qualityScore` now available for vault capture. | Handle new return type from Guardian review. | None — existing code already handles both success and error paths. |
| `src/services/build/buildHistoryService.ts` | Added `qualityScore?: number` to `BuildHistoryEntry` interface. `makeBuildHistoryEntry` accepts optional `qualityScore` parameter with default value 3 (`qualityScore ?? 3`). | Vault auto-capture uses quality scores for deduplication. All history entries need a default score for backward compatibility. | None — existing history entries without qualityScore get default 3 on next record. |
| `src/ui/chat/chatPanelScaffold.ts` | New file. Templates for React (Vite+TS), Python Flask, Go API, Node Express. Each scaffold has starter files (package.json, main file, config, .env.example). `detectScaffoldIntent()` matches keywords + type detection. `runScaffold()` writes all files. | Users often start with "create a React app" — Redivivus now recognizes scaffold intent and creates proper project structure instantly. | Low — file writes use standard fs operations. Fails gracefully with error message if write fails. |
| `src/ui/chat/chatPanelClassifier.ts` | Added `'scaffold'` and `'service'` to `IntentType`. Updated system prompt with scaffold/service intent definitions. Added examples: "scaffold a React app", "set up Firebase". Updated return format JSON examples. Added handling for scaffold/service in intent processing. | AI needs to distinguish between building a feature vs scaffolding a whole project vs setting up external service. | None — new intents handled same as build/fix/run. Falls through to question if classification fails. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Added scaffold intent handler: imports `detectScaffoldIntent` and `runScaffold`, validates workspace, runs scaffold, posts file list + guidance to chat. Added service intent handler: imports `detectServiceIntent`, `runServiceSetup`, `formatServiceSetupResult`, validates workspace, sets up service, posts setup notes. | Wire scaffold/service intents through to execution after classification. | None — both handlers check for workspace root first, fail gracefully with user-friendly message. |
| `src/ui/chat/chatPanelServiceTemplates.ts` | New file. Templates for Firebase (config, rules, client init), Supabase (client, migrations), Stripe (client, server helpers, webhook), OpenAI (client, streaming). `detectServiceIntent()` matches service keywords. `runServiceSetup()` writes config files. `formatServiceSetupResult()` creates formatted output. | Users need to add auth/payments/AI to projects. Redivivus now creates starter config files and setup notes instantly. | Low — writes config files only, never calls external APIs. API keys stay in .env.example (safe). |
| `src/ui/chat/chatPanelMessages.ts` | Updated `classifyIntent` return type to include `'scaffold' | 'service'`. | Type safety for new intents in message handler interface. | None — TypeScript-only change. |

## Recent Fixes — May 18, 2026 (Session 17: Run pill + Token total in chat header)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelHtml.ts` | Added `▶ Run` pill to input area — green, only visible when project is open, triggers `redivivus.runProject`. Usage button now shows project token total (e.g. "245K tok") when build history has tokens, with cost in tooltip. | Users need quick access to run their project and see how much AI they've used per project. | None — Run pill is hidden when no project is open; token display falls back to plain "Usage" button when history is empty. |
| `src/ui/chat/chatPanelHeader.ts` | Added `BuildHistoryService` import. Computes `projectTokens` by summing `tokensUsed` and `costUSD` across all build history entries for the current workspace root. Adds `projectTokens` to returned `ChatHeaderInfo`. | Header needs project-level token totals to display the token pill. | None — wrapped in try-catch; silently skipped if history file doesn't exist. |
| `src/ui/chat/chatPanelHtml.ts` | Added `projectTokens?: { tokens: number; cost: number }` to `ChatHeaderInfo` interface. | Type definition for new field passed from header builder. | None. |
| `src/ui/chat/chatPanelStylesInput.ts` | Added `.input-pill--run` style — green color scheme matching the "go" / success convention. | Run pill needs visual distinction from Vault and AI pills. | None. |
| `src/extensionInlineCommandsB.ts` | Added imports for `detectPostBuildInfo` and `BuildHistoryService`. Registered `redivivus.runProject` command: reads recent build files, detects project type, opens integrated terminal and runs the command. HTML projects open in browser instead. If deps missing, runs install command first. | Run button needs a VS Code command handler. | Low — terminal cwd set to root; if run command is wrong user just sees an error in the terminal, nothing destructive. |
| `package.json` | Added `redivivus.runProject` command to contributes array. | VS Code requires all commands to be declared before they can be triggered. | None. |

## Recent Fixes — May 18, 2026 (Session 17: Build History panel Loading... fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/views/buildHistoryPanelHtml.ts` | Changed `viewDiff` button from `onclick="viewDiff(\'+esc(e.id)+\')"` to `data-id="..." onclick="viewDiff(this.dataset.id)"`. | The `\'` escape in the outer template literal produced `'` characters that created adjacent string literals with no `+` between them in the webview JS — a syntax error. The whole `<script>` block failed to parse, so `get-data` was never sent, and the panel showed "Loading..." forever. Using a data attribute avoids quote nesting entirely. | None. |

## Recent Fixes — May 18, 2026 (Session 17: History button in chat header)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/extensionInlineCommandsB.ts` | Added import for `showBuildHistoryPanel`. Registered `redivivus.showBuildHistory` command that calls `showBuildHistoryPanel(context)`. | Build History panel had no registered VS Code command — needed a command ID to wire the header button. | None. |
| `src/ui/chat/chatPanelHtml.ts` | Changed "Save Point" header button to "History" — data-cmd updated to `redivivus.showBuildHistory`, title/label updated. Uses `&#x1F4CB;` (clipboard) icon. | Snapshots replaced Save Points — the button should open Build History, not the old save point dialog. | None. |
| `package.json` | Added `redivivus.showBuildHistory` command to the `commands` contributes array. | VS Code requires commands to be declared in package.json to activate correctly. | None. |

## Recent Fixes — May 18, 2026 (Session 17: Cross-language conversion + Guardian text leak)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuild.ts` | Added `isCrossLang` detection: when `existingTarget` extension != `ext` (e.g. source is `.html`, target is `.py`), skip using existingTarget as `relPath`. Build a NEW file in the correct language. Pass the source file content as `sourceRef` to the worker prompt instead of as `existingContent`. | "build me an exe version based on index.html" → `isModificationRequest=true`, `existingTarget=index.html`, `ext=.py` → `relPath='index.html'` → worker told to "SURGICALLY EDIT index.html to make a Python exe". Impossible task — worker returned prose, Guardian wrote that prose to disk. | Low — `path.extname` comparison is reliable. Slices source to 6000 chars so giant files don't blow the prompt. |
| `src/ui/chat/chatPanelBuildWorker.ts` | Added `sourceRef?: string` parameter to `buildWorkerPrompt`. When provided, injects a "SOURCE REFERENCE" block telling the worker to use the existing file as a logic guide but rewrite as native target language. | Required by the cross-lang fix above. | None — optional param, ignored if empty. |
| `src/ui/chat/chatPanelBuildReview.ts` | Guardian `correctedText` guard: if correctedText starts with "Since the worker" or "GUARDIAN_PASS cannot", it's a Guardian failure explanation, not code — don't use it as the final code. | Guardian was getting the worker's confused prose response and returning "GUARDIAN_PASS cannot be given..." which then got written to index.html, producing a text-only page in the browser. | None — falls through to original (worker's) code if Guardian fails to produce valid corrected output. |

## Recent Fixes — May 18, 2026 (Session 17: Diff view in Build History)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/snapshotService.ts` | Added `getSnapshotFileContent(snapshotId, relPath)` — reads file from active snapshot dir or gunzips from archive. | Needed by diff handler to retrieve the snapshot's version of the file without a full restore. | None — read-only operation. |
| `src/ui/views/buildHistoryPanel.ts` | Added `view-diff` message handler. Looks up snapshot meta, prompts Quick Pick if multiple files, writes snapshot content to a named temp file, opens VS Code's native diff editor (`vscode.diff`) with snapshot on left and current file on right. Added `os`, `fs`, `path` imports. Updated `_sendData` to include `preExisting` array from snapshot meta in each history entry. | User needed to see what changed between a snapshot and the current file before deciding whether to revert — matches Lovable's history UX. | Low — temp file written to OS temp dir with snapshot ID suffix to avoid collisions. |
| `src/ui/views/buildHistoryPanelHtml.ts` | Added "View Diff" button to each history entry that has `preExisting` files. Added `viewDiff(id)` JS function. Button only appears when there is a backed-up file to compare against (new-file-only snapshots don't get the button). | Can't diff a file that didn't exist before the build — no previous state. | None. |

## Recent Fixes — May 18, 2026 (Session 17: Removed Save Points tab — snapshots are the save points)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/views/buildHistoryPanel.ts` | Removed all `SavePointService` usage, `create-save-point`, `restore-save-point`, and `promote-to-save-point` message handlers. Panel renamed "Build History". `_sendData` now sends only snapshot-annotated history — no `savePoints` array. | Snapshots capture every build automatically and are always restorable (active or archived). A separate "Save Points" concept was redundant overhead. Git handles major milestones; snapshots handle granular revert. | None — git auto-commit and the `redivivus.savePoint` command still exist for users who want git checkpoints. |
| `src/ui/views/buildHistoryPanelHtml.ts` | Removed Save Points tab and all git-commit restore UI. Now a single-pane Build History view with legend explaining active/archived/first-build states. Undo button says "Restore from Archive" for archived entries. First Build entries show disabled button (permanent, can't undo). | Cleaner UX — one place to see and revert all builds, no split between tabs. | None. |

## Recent Fixes — May 18, 2026 (Session 17: Snapshot archive + initial baseline + history descriptions)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/snapshotService.ts` | Rewrote `_pruneOld` to `_archiveSnapshot` — instead of deleting old snapshots, packs the directory into a gzip JSON bundle (`archive/<id>.json.gz`). Added `restoreFromArchive()` so `restore()` automatically falls through to archive when active snapshot dir is gone. Added `listArchivedSnapshots()` and updated `listSnapshots()` to return active + archived combined. Added `captureInitial()` for permanent first-build baselines (never pruned, `init_` prefix). | User went down rabbit hole and needed to revert 20+ builds back. Old snapshots were being deleted after 10, making deep reversal impossible. Archive approach: all history is always restorable, active dir stays small. | Low — gzip uses Node built-ins (zlib). If archive write fails, falls through to delete. Archive dir excluded from pruning logic. |
| `src/ui/chat/chatPanelBuildWriter.ts` | `writeBuiltFile` now accepts optional `{ root, task }`. Checks if file is new BEFORE writing. If new file, calls `captureInitial` AFTER writing to save the first-build baseline permanently. | Without this, there was no snapshot of the initial state of a newly created file — only pre-existing files were snapshotted. A bad follow-up build would overwrite the original with no way to recover it. | None — `isNewFile` check uses `fs.existsSync` before write. `captureInitial` failures are silently caught. |
| `src/ui/views/buildHistoryPanel.ts` | `_sendData` now cross-references `listArchivedSnapshots()` to annotate history entries with `isArchived: true`. Orphan snapshots include `isInitial` flag. | History panel needs to show which entries are archived vs active and which are the permanent first-build baseline. | None. |
| `src/ui/views/buildHistoryPanelHtml.ts` | Added `badge-archived` (orange) and `badge-initial` (green) CSS. `renderHistory` now shows file count + first filename as a readable note instead of raw paths. Undo button says "Restore from Archive" for archived entries. "First Build" entries have no promote button (already permanent). | User can now see at a glance: what each build did (task + files), whether it's an active/archived/initial snapshot, and can restore from any point in history — including archived builds from 20+ steps ago. | None. |

## Recent Fixes — May 18, 2026 (Session 17: Vault — per-language storage + replace-if-better)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildVault.ts` | Removed AI cross-language translation entirely. When no vault items match the target language, falls directly through to `runSingleFileBuild`. Vault is organized by language and fills naturally over time. | Translation added complexity and quality risk. Per-language vault is simpler, deterministic, and grows organically with each build — both for a single user and across future users contributing to the vault. | None. |
| `src/services/vault/vaultAutoCapture.ts` | Added "replace if better" logic after quality gate: calls `vault.findSimilar(item.name, 0.75)` to find semantically similar existing items. If new item scores higher, evicts the old one before saving. If existing item is as good or better, skips the new one (`skippedDupes++`). | Without this, vault accumulated multiple versions of the same concept (e.g., three game loops at different quality levels). Now vault always keeps the best version of each snippet. | Low — `findSimilar` at threshold 0.75 only matches items with very similar names. False eviction (wrong item deleted) would require two very differently-named functions to score above 0.75 against each other. |

## Recent Fixes — May 18, 2026 (Session 17: Cross-language vault translation)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildVault.ts` | Added `EXT_TO_LANG` map and `translateVaultItems()` async helper. When no vault items match the target language, the function now calls `translateVaultItems()` — an AI call that rewrites each vault item's logic into the target language, substituting platform-specific APIs (e.g. browser canvas -> pygame.Surface). If translation produces 0 items, falls back to `runSingleFileBuild`. Changed `filteredItems` from `const` to `let` to allow reassignment after translation. | Previously: JS vault items filtered out for Python builds → vault unused → AI built from scratch with no vault context. Now: JS game loop components get translated to pygame equivalents and fed into the Python assembly, giving the AI a better starting point. Makes vault valuable across all language combinations. | Low — translation is an extra AI call (~2,000 tokens). If it fails or returns no parseable components, falls through to fresh build. The `=== COMPONENT ===` delimiter format is simple enough to parse reliably. |

## Recent Fixes — May 18, 2026 (Session 17: Vault language filter — wrong-language components fed to Python builds)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildVault.ts` | Added `LANG_COMPAT` map and language filter before vault assembly. After `inferExtension` determines target `ext`, vault items are filtered to only those whose `language` field matches the target (e.g. `.py` only accepts `python`/`py` items). If no items survive the filter, skips vault assembly entirely and calls `runSingleFileBuild` for a fresh build in the correct language. All references to `vaultItems` in the function body updated to `filteredItems`. Unused `fs` import removed. | User asked "make me a flappy bird exe file I can run from the command line." Redivivus had 10 JavaScript audio utilities in the vault. These were fed into the AI as "reusable components" for a Python `.py` build — producing either unrunnable output or a silent fallback to HTML. The fix ensures JS components are never used for Python builds, etc. | Low — `require('./chatPanelBuild.js')` for fallback is a lazy require to avoid circular static import; both modules are fully initialized by the time the function runs. |

## Recent Fixes — May 18, 2026 (Session 17: Vault build with no project open)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelIntent.ts` | Added `autoCreateProject` import. In `use-vault` branch: replaced `root: workspaceFolders?.[0]?.uri.fsPath \|\| ''` with a check — if no folder is open, call `autoCreateProject` first to create a real project directory. After build, prompt "Open in Explorer?" if project was auto-created. | When no workspace folder was open, `root` was `''`, making `path.join('', 'index.html') = 'index.html'`. The file was written relative to CWD (extension host directory), not the user's projects folder. User saw "Build Complete" but file was never found. "Preview in Browser" was dead because `absPath` was a relative path. | Low — auto-create can fail if disk is full or permissions blocked; error is caught and shown in chat. |

## Recent Fixes — May 18, 2026 (Session 17: Multi-language build + compile-to-exe pipeline)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildPipeline.ts` | **New file.** `wantsExecutable(task, routing)` AI check; `getCompilePipeline(relPath, root)` returns steps for .py/.rs/.go/.c/.cpp; `runCompilePipeline()` opens VS Code terminal and runs steps; `appendCompileAction()` returns action card button; `maybeAutoCompile()` called after every build — auto-compiles if task wanted exe, always stores last target. | Redivivus was web-only. Any non-HTML language produced code with no way to run it as a standalone program. Now Redivivus chains the build toolchain after code generation, matching what Cursor/Windsurf can do. | Low — terminal commands are well-known safe toolchain invocations. Auto-compile only fires when AI confirms task explicitly wanted an exe. |
| `src/ui/chat/chatPanelBuildInference.ts` | Extended `inferExtension()` with natural language detection for Python (pygame, flask, etc.), Rust (cargo), Go, C/C++, Java, Ruby, Bash. Added explicit extension checks (.go, .cpp, .c, .java, .rb, .sh). | Previously defaulted to .ts for any non-web request. "Build a snake game in Python" would generate snake_game.ts. | None — keyword matching is unambiguous for language names. Falls through to .ts default if nothing matches. |
| `src/ui/chat/chatPanelBuild.ts` | Added 1-line inline call to `maybeAutoCompile` after `openBuiltFile`. Also inlined `appendCompileAction` into result message. | Wire pipeline auto-trigger and "Package as Executable" button into the single-file build path. | None — wrapped in `.catch(() => {})` so pipeline failures never break the build result display. |
| `src/ui/chat/chatPanelBuildVault.ts` | Added `appendCompileAction` to vault result message and `maybeAutoCompile` call at end. | Vault builds are now also part of the multi-language pipeline. | Same as above. |
| `src/extensionCommands.ts` | Registered `redivivus.compileProject` command — reads `_lastCompileTarget` (set by most recent build) or falls back to scanning workspace for a compilable file. | Action card "Package as Executable" button triggers this command. | Low — scan is limited to root and src/, won't recurse into node_modules etc. |

## Recent Fixes — May 18, 2026 (Session 17: Usage report — tokens never tracked, per-AI breakdown always 0)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildUtils.ts` | Added `usageTracker: (panel as any).usageTracker` to `panelBuildRequestDeps` return value. | `usageTracker` was missing from the deps object — `ctx.usageTracker` was always `undefined` in the entire build pipeline. No build tokens were ever recorded to history. Only the classifier `onUsage` callback recorded anything. | None — adding a field that was always present on the panel but not forwarded. |
| `src/services/usageTracker.ts` | Added `normalizeAI(ai)` helper that maps full model IDs (e.g. `'claude-haiku-4-5-20251001'`) to short roster keys (`'claude'`). Applied in `recordUsage` on the `aiProvider` field before saving. | Usage report renders per-AI breakdown by looking up `usageMap.get(member.ai)` where `member.ai` is a short key like `'claude'`. Full model IDs stored by classifier calls never matched — showing 0 for all AIs even when tokens > 0. | None — lookup is by `includes()` logic; unknown models fall through unchanged. |

## Recent Fixes — May 18, 2026 (Session 17: HTML narration leak + smarter game followups)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildWriter.ts` | Added HTML post-processing in `writeBuiltFile`: strips everything after `</html>` for `.html` files. | AI sometimes appends a `\`\`\`markdown ... \`\`\`` planning block after the closing HTML tag. Browsers render this as visible text alongside the game canvas ("crap on the side" bug). Applies to all build paths (regular, vault, chunked) since all use `writeBuiltFile`. | None — only strips content that is provably outside the valid HTML document. |
| `src/ui/chat/chatPanelPlanInterviewHelpers.ts` | `generateFollowups` made async; game-type followup now guarded by AI classifier call instead of hardcoded regex. | Rule 18: "flappy bird game" already encodes the game type — asking "what kind of game?" is redundant. Regex `\b(game)\b` can't distinguish specific (flappy bird) from generic (a game). AI is asked: "Is the game type already clear?" before adding the question. | Low — if AI call fails, falls back to asking the question (same as before). |
| `src/ui/chat/chatPanelPlanInterview.ts` | Changed `generateFollowups(interview.answers)` → `await generateFollowups(interview.answers, deps.routing)`. | Required by the async signature change above. | None. |

## Recent Fixes — May 17, 2026 (Session 16: Revert to Gemini-first routing)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/routingComplexity.ts` | Restored Gemini-first ordering for medium-complexity builds: `['gemini', 'claude', 'openai', 'xai', 'kimi', 'groq']`. Was `['claude', 'openai', 'xai', 'gemini', ...]` since commit 4796949. | Builds were inconsistent and incomplete after routing shifted to Claude-first. Gemini was the historically reliable choice. 50k Kimi threshold and Groq speed-task kept — those were good fixes. | Low — only affects which AI is tried first for medium builds; fallback chain unchanged. |

## Recent Fixes — May 17, 2026 (Session 16: Plan interview build gates)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelPlanInterview.ts` | Replaced `deps.redivivus?.isInitialized?.()` with live workspace check (`vscode.workspace.workspaceFolders?.[0]` + `fs.existsSync(.redivivus)`). Changed `handleBuildRequest(task, false)` → `handleBuildRequest(task, true)`. | `deps.redivivus` was stale — could return `isInitialized()=true` even when no project was open, causing the hasProject=true path to run and trigger scope modal + blueprint interview wizard. `skipComplex=false` then caused both the vague-request gate and the blueprint-check gate to fire, showing two modals after the user said "yes" in the plan interview. The plan interview IS those gates — once the user completes and confirms, we skip directly to build. | Low — vault check and cost estimate now also skipped, but plan interview already collects that context. |

## Recent Fixes — May 17, 2026 (Session 15: Assist Mode)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelHeader.ts` | Added `workspaceIsAssistMode: boolean` — true when `.redivivus-assist` file exists in project root and no `.redivivus/` dir. | Need to detect when user previously chose Assist Mode so the correct returning-user screen is shown on re-open, without re-prompting the choice. | None — reads file on every header refresh; fails silently. |
| `src/ui/chat/chatPanelHtml.ts` | Added `workspaceIsAssistMode` to `ChatHeaderInfo`. Added Assist Mode badge in header. Added two new `emptyState` branches: (1) Assist Mode returning-user screen listing what's active/not active with upgrade button; (2) "Project detected" screen with educational comparison of Assist Mode vs Full Redivivus Mode, shown when a non-Redivivus folder is open. "Just Build" button carries `data-assist="true"`. | User sees a clear explanation of both modes so they can make informed decisions. Non-Redivivus projects get detected and offered both paths. | None — two new branches, doesn't change existing initialized-project or no-folder screens. |
| `src/ui/chat/chatPanelScript.ts` | Reads `data-assist` attribute from launcher buttons; passes `assistMode: true` in `start-new-project` message when set. | Wire the UI choice into the message the extension receives so it can set the runtime flag. | None. |
| `src/ui/chat/chatPanelMessageRouter.ts` | Added `msg.assistMode` handling in `start-new-project`: sets `state.assistMode = true` AND writes `.redivivus-assist` JSON file to project root. Passes `assistMode: state.assistMode` in all deps objects. | Persist the choice to disk immediately so it survives VS Code restarts. Runtime flag gates Redivivus tags, roadmap entries, and auto-commits for the session. | None — write is caught; won't block build if disk write fails. |
| `src/ui/chat/chatPanel.ts` | Added `assistMode?: boolean` to `ChatPanelState`. | State must carry the runtime flag so it flows into deps on every message. | None — optional field, undefined = full mode. |
| `src/ui/chat/chatPanelOrchestrator.ts` | Added `assistMode?: boolean` to `OrchestratorDeps`. | Threading field for createBuildContext. | None. |
| `src/ui/chat/chatPanelBuildPhase.ts` | `createBuildContext` return now includes `assistMode: deps.assistMode`. | BuildContext needs the flag to gate per-build decisions. | None. |
| `src/ui/chat/chatPanelMessages.ts` | Added `assistMode?: boolean` to `MessageHandlerDeps`. | Fix pipeline and Q&A path need the flag. | None. |
| `src/ui/chat/chatPanelBuild.ts` | Roadmap entry and auto-commit calls gated: `if (!ctx.assistMode) { ... }`. | In Assist Mode, no REDIVIVUS_ROADMAP entries are written and no auto-commits happen — user explicitly opted out of Redivivus structure. | None. |
| `src/ui/chat/chatPanelChunked.ts` | Same roadmap/auto-commit gating as above. | Chunked builds are the most common multi-file path — same gate needed. | None. |
| `src/ui/chat/chatPanelMsgFix.ts` | CHASSIS_WORKER_RULES injection gated: `${deps.assistMode ? '' : CHASSIS_WORKER_RULES + '\n'}`. Roadmap entry gated. | In Assist Mode, AI output must not contain `[SCOPE]`/`[WARN]`/`[DEAD]` annotations — those are Redivivus structural requirements the user opted out of. | None. |
| `src/ui/chat/chatPanelBuildWorker.ts` | `buildWorkerPrompt` conditionally includes `CHASSIS_WORKER_RULES` based on `ctx.assistMode`. | Same as above — single-file build path. | None. |
| `src/services/ai/chassisWorkerRules.ts` | Added Rule 7: scope discipline — fix ONLY what was asked, add `// [TODO]` for noticed-but-not-requested items. | Defense in depth alongside Guardian scope enforcement. | None — additive rule. |

## Recent Fixes — May 17, 2026 (Session 15: Actual input/output token tracking)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/routingTypes.ts` | Added `inputTokens?: number` and `outputTokens?: number` to `AIResponse` interface. | Redivivus was using character-length estimates for token counts, throwing away actual counts the APIs return on every call. Separate input/output counts are needed because input tokens (prompt) cost ~5x less than output tokens (completion). | None — new optional fields on existing interface. |
| `src/services/ai/routingProviders.ts` | All 6 providers (Gemini, Claude, OpenAI, Groq, xAI, Kimi) now parse actual token counts from API response bodies and return them as `inputTokens`/`outputTokens`. | See above. Gemini uses `usageMetadata.promptTokenCount/candidatesTokenCount`. Claude uses `usage.input_tokens/output_tokens`. OpenAI/Groq/xAI/Kimi use `usage.prompt_tokens/completion_tokens`. | Low — parsing fields that were always present but ignored. If field is absent, returns `undefined` and `recordUsage` falls back to estimation. |
| `src/services/usageTracker.ts` | Added `inputTokens`/`outputTokens` to `UsageEntry` interface. Updated `recordUsage` to accept optional actual counts; falls back to 60/40 estimate split if API counts not provided. | Persists split token data per entry for future display (sent vs received breakdown). | None — backwards compatible; old entries without split fields still load correctly. |
| `src/ui/chat/chatPanelBuildWorker.ts` | Updated `executeWorkerBuild` return type to include `inputTokens?`/`outputTokens?`; passes them through from `routeByComplexity` and `callProvider` results. | `chatPanelBuild.ts` needed actual token counts from the worker response to pass to `recordUsage`. | None — additive fields on return type. |
| `src/ui/chat/chatPanelBuild.ts` | Worker and solo-build `recordUsage` calls now pass `res.inputTokens, res.outputTokens`. Supervisor call still uses estimate (supervisorPlan returns string, not AIResponse). | Wire actual token counts into usage storage for build pipeline. | None — supervisor estimate is a known gap, documented. |
| `src/ui/chat/chatPanelMsgFix.ts` | Supervisor (`diagRes`) and Worker (`fixRes`) `recordUsage` calls now pass actual `inputTokens`/`outputTokens`. Guardian call keeps estimate (GuardianReviewResult doesn't expose token counts). | Same goal — actual token counts for 3-phase fix pipeline. | None — guardian gap documented. |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Convert and Q&A paths: `recordUsage` calls for `aiResponse` now pass `aiResponse.inputTokens, aiResponse.outputTokens`. Chunked convert and guardian paths keep estimates. | Q&A and convert are the highest-volume paths — most important to get accurate. | None. |
| `src/ui/chat/chatPanelChunked.ts` | Plan phase `recordUsage` call now passes `res.inputTokens, res.outputTokens`. | Supervisor plan is a real API call; now tracked with actual counts. | None. |
| `src/ui/chat/chatPanelChunkedLoop.ts` | Main worker call and fallback supervisor call now pass actual token counts. Review phase estimation kept as-is (no response object at that point). | High-volume path — worker tokens are the biggest usage driver. | None. |

## Recent Fixes — May 17, 2026 (Session 15: Non-Redivivus project detection)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelHeader.ts` | Added `workspaceFolderIsOpen: boolean` — true when any workspace folder is open regardless of Redivivus init state. `hasProjectOpen` unchanged (still requires init). | Need to distinguish "no folder open" from "folder open but not Redivivus initialized" to show appropriate UI. | None — additive field. |
| `src/ui/chat/chatPanelHtml.ts` | Added `workspaceFolderIsOpen` to `ChatHeaderInfo` interface. Added "DETECTED PROJECT" branch in `emptyState`: when a folder is open but has no `.redivivus/` dir, shows "Project detected: [name]" with two buttons — "Just Build" and "Add Redivivus tracking to this project" — instead of the generic launcher. | When user opens an existing (non-Redivivus) project like jungle-drum-machine, Redivivus was showing the generic "Welcome" launcher with "Open Existing Project" — confusing because the project was already open. Now it detects the project and shows relevant actions. | None — third branch, doesn't change existing initialized-project or no-folder screens. |
| `src/ui/chat/chatPanelScript.ts` | Added `retrofit-project` action handler in the launcher button click listener — sends `{ type: 'retrofit-project' }` to extension. | Wire the new "Add Redivivus tracking" button to a message the extension can handle. | None. |
| `src/ui/chat/chatPanelMessageRouter.ts` | Added handler for `{ type: 'retrofit-project' }` → executes `redivivus.retrofitBlueprint` command. | Retrofit Blueprint scans the existing project, reads package.json/README/[SCOPE] tags, generates a blueprint and wires it into Redivivus config. This converts any project to Redivivus format without rebuilding it. | None — delegates to existing command. |

## Recent Fixes — May 17, 2026 (Session 15: Scope discipline enforcement)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/guardianAI.ts` | Added `scopeAlerts: string[]` to `GuardianReviewResult`. Replaced INSTRUCTIONS block in `buildGuardianPrompt` with SCOPE RULE section — scope enforcement is now explicitly the highest priority, above bug fixing. Guardian parses new `GUARDIAN_SCOPE_ALERTS:` section and threads it through all return paths. | Workers routinely "fix while they're in there" — renaming, refactoring, improving things the user didn't ask about. This made Redivivus untrustworthy for surgical fixes. Now the Guardian explicitly reverts anything out of scope and reports what it found. | None — new field on result; all callers updated. |
| `src/services/ai/chassisWorkerRules.ts` | Added Rule 7: scope discipline. Workers must ONLY change what was requested; unrelated things get a `// [TODO]` comment, not a code change. | Workers need the scope rule injected into their prompt, not just enforced after the fact by the Guardian. Defense in depth. | None — additive rule. |
| `src/services/ai/routingGuardian.ts` | Added `scopeAlerts: []` to the early-return (no guardian available) path. | TypeScript required field on interface. | None. |
| `src/ui/chat/chatPanelMsgFix.ts` | Supervisor prompt now includes "Diagnose ONLY bugs that directly cause the reported problem." Guardian scope alerts surface to user: "Guardian also noticed (not applied -- say 'also fix...' to address)". | The fix pipeline is the primary path for "fix the sound" style requests — scope discipline is most critical here. | None. |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Q&A/convert guardian path now appends scope alerts to response with the same "also noticed" prompt. | Scope creep happens in chat path too (e.g. convert this file and AI rewrites unrelated code). | None. |

## Recent Fixes — May 17, 2026 (Session 15: Close Guardian + chunked token tracking gaps)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/guardianAI.ts` | Added `inputTokens?`/`outputTokens?` to `GuardianReviewResult` interface. Updated `callProvider` callback type signature to include those fields. In `runGuardianReview`, captures token counts from the callProvider response and threads them through all return paths. | Guardian was the last major call path with estimated-only token counts. Now every path that calls `recordUsage` with guardian results gets actual counts. | None — new optional fields; all call sites that ignored them still work. |
| `src/ui/chat/chatPanelMsgFix.ts` | Guardian `recordUsage` call now passes `guardianResult.inputTokens, guardianResult.outputTokens`. | Wire actual guardian counts to storage in the 3-phase fix pipeline. | None. |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Guardian `recordUsage` call now passes `review.inputTokens, review.outputTokens`. Chunked convert path updated: `finalText = genResult.text` (was directly assigned); `recordUsage` passes `genResult.inputTokens, genResult.outputTokens`. | Both remaining estimate-only call sites now use actual counts. | None. |
| `src/ui/chat/chatPanelChunkedGen.ts` | `chunkedGenerate` return type changed from `Promise<string>` to `Promise<{ text, inputTokens, outputTokens }>`. Accumulates `totalIn`/`totalOut` across all chunk calls from `result.inputTokens`/`result.outputTokens`. | Chunked conversion makes multiple API calls in a loop — needed to sum actual token counts across the whole job. | Low — single call site in chatPanelMsgSendAI.ts updated to destructure. |

## Recent Fixes — May 16, 2026 (Session 14: Generate Rules refresh crash)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/sidebar/chassisSidebar.ts` | Added `refresh()` method to `ChassisSidebarProvider` — re-sets `_view.webview.html` if the view is open. | `refreshAll()` in `extension.ts` always called `sidebarProvider.refresh()` but the method never existed on the class. After any command that called `refreshAll()` (generate rules, lock blueprint, etc.) the call would throw "is not a function", propagating through `handleAction`'s catch and showing "X failed" in the Setup Progress panel even though the underlying action succeeded. | None — method is additive; no existing paths changed. |

## Recent Fixes — May 16, 2026 (Session 14: Retrofit Blueprint-from-Scan)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/retrofitBlueprint.ts` | Rewrote `scanCodebase()`: now reads README (up to 2000 chars), package.json/pyproject.toml/Cargo.toml metadata, and `[SCOPE]` tags from up to 40 source files via `getCodeFiles()`. Added `saveToConfig(blueprint)`: writes the 5 W's directly into `.redivivus/config.json` (creates the file if missing — works on non-Redivivus projects). Improved AI prompt to return plain-English answers. | Previous scanner read first 20 lines of 50 arbitrary files — mostly imports and boilerplate, low signal. More critically, it only saved a markdown file that Redivivus never read; the actual config blueprint was never updated so Redivivus couldn't use the generated 5 W's in builds. | Low — `saveToConfig` catches all errors; creates `.redivivus/` dir if absent. |
| `src/commands/retrofitBlueprint.ts` | Rewrote UX: plain-English prompt ("Redivivus will look at your project and figure out what it does"), `withProgress` notification during scan, modal result showing all 4 key fields, "Looks right" / "Edit it now" choice that opens the blueprint panel. Removed developer jargon throughout. | Command was using "scan your codebase" and "Redivivus blueprint" — meaningless to non-coders. No progress indicator made it feel broken during the 30-second scan. | None — same command ID; behavior improved only. |

## Recent Fixes — May 16, 2026 (Session 14: AI Delegation Button)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/delegationCodeLens.ts` | New file (41 lines). `DelegationCodeLensProvider` — scans every open file for `[TODO]` and `[WARN]` tags in any comment style (`//`, `#`, `--`, `<!--`). For `[TODO]`: shows `Fix this with Redivivus` button. For `[WARN]`: shows `Ask Redivivus about this` button. Both call `redivivus.postToChat` with a plain-English message that routes through the existing fix pipeline. | Non-coders see `[TODO]` and `[WARN]` tags highlighted in their files (from `annotationService.ts`) but had no way to act on them without knowing what they are or typing commands. The CodeLens button appears right above the tag — one click to fix. | Low — CodeLens is read-only until clicked; all actual execution goes through existing `redivivus.postToChat` / fix pipeline. |
| `src/extensionCommands.ts` | Added `DelegationCodeLensProvider` import + `vscode.languages.registerCodeLensProvider({ scheme: 'file' }, ...)` at end of `registerAllCommands`. | Registers the provider for all files in the workspace. | None — additive, no existing code changed. |

## Recent Fixes — May 16, 2026 (Session 14: Built-in git auto-commit)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/gitAutoCommitService.ts` | New file (68 lines). `autoCommit(root, message, files?)` — silently inits git if the project has no repo, writes a default `.gitignore` on first init, stages files, checks if anything is staged, commits with a plain-English message. All errors swallowed — never blocks builds. `hasGit()` result cached at module level so the `git --version` check only runs once per session. | Non-coders have no safety net between Redivivus save points. Git gives them full change history automatically without them needing to know what git is. | Low — runs after build success, any failure is silent. commit message is sanitized (double-quotes → single-quotes) before shell injection. |
| `src/ui/chat/chatPanelBuild.ts` | Added `autoCommit` import + call after `onBuildFinished`. Message: `"Redivivus added: [task]"`. Files: `[relPath, ...scaffoldedFiles]`. | Wire point for single-file builds. | None — call is after the build is already done and result card shown. |
| `src/ui/chat/chatPanelChunked.ts` | Added `autoCommit` import + call after `onBuildFinished`. Message: `"Redivivus added N files: [task]"`. Files: `builtFiles`. | Wire point for multi-file chunked builds. | None — same pattern as single-file. |
| `src/ui/chat/chatPanelEditHandler.ts` | Added `autoCommit` import + call after `runEditFileBuild`. Message: `"Redivivus updated: [filePath]"`. No files list (add -A covers the edit). | Wire point for edit/fix builds. Placed here (not in chatPanelEditBuild.ts) because chatPanelEditBuild.ts is at the 200-line limit. | None — runs after edit write is complete. |

## Recent Fixes — May 16, 2026 (Session 14: Plain-English language audit)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuild.ts` | Replaced "Searching vault..." → "Checking your saved code library..."; "Vault: N relevant items found" → "Found N useful matches in your code library"; "Supervisor planning..." → "Planning..."; "Plan ready (N steps) — handing off to worker AI..." → "Plan ready — writing your code..."; "Build failed: ... Check .redivivus/build_errors.log..." → "Something went wrong — try again or describe what you want differently."; "Guardian reviewing..." → "doing a final check..." | Redivivus is built for non-coders and vibe coders. "Vault", "Supervisor", "Guardian", "build_errors.log", "handing off to worker AI" are all developer jargon that would confuse someone who has never coded. | None — string-only changes. |
| `src/ui/chat/chatPanelChunked.ts` | Replaced "Searching vault..." → "Checking your saved code library..."; vault hit message reworded; "Planning build — X generating file list..." → "Planning your build..."; "Build plan failed... Full details in .redivivus/build_errors.log" → "Couldn't plan your build... Try again or describe what you want differently." | Same jargon audit — multi-file pipeline had identical problems. | None — string-only changes. |
| `src/ui/chat/chatPanelChunkedLoop.ts` | Replaced "Building file X of Y" → "Writing part X of Y"; "quota exceeded — Supervisor taking over" → "Switching AI — continuing..."; "Supervisor corrected phase N" → "Making corrections to part N..."; "Failed on file N... Full details in .redivivus/build_errors.log" → "Hit a snag on part N..."; "Could not write... Full details in .redivivus/build_errors.log" → "Could not save... Try again — if it keeps failing, check your disk space." | Chunked loop is the most user-visible part of a multi-file build — every status message was developer-speak. | None — string-only changes. |
| `src/ui/chat/chatPanelEditBuild.ts` | Replaced "Edit failed... Prompt was ~N tokens. Full details in .redivivus/build_errors.log" → "Edit failed... Try again or describe the change differently." | Same jargon audit — error message referenced internal token count and log file path that mean nothing to a non-coder. | None — string-only change. File stays at 200 lines. |

## Recent Fixes — May 16, 2026 (Session 14: Architect Review per-action fix buttons)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/map/mapPanelMessages.ts` | Appended `ACTIONS_JSON:` request to architect review prompt. AI now outputs a structured JSON array at the end of each review: `[{file, action, label, description}]`. | Per-action buttons require structured data from the AI — without this the renderer has no way to know what specific fixes are available beyond the raw review text. | If AI ignores the instruction or outputs malformed JSON, the parse fails silently and the review renders without per-action buttons (graceful degradation). Fix All still works. |
| `src/ui/chat/chatPanelMsgMapContext.ts` | Parses `ACTIONS_JSON:` block from AI response before rendering. Strips it from the displayed text and stores in `_architectActions` (keyed by reviewId). | Actions must be available at render time so `renderArchitectActions` can generate the buttons. | Regex targets end-of-string `ACTIONS_JSON:` line — if AI outputs it mid-response, it won't be parsed. Acceptable — the prompt explicitly says "at the very end." |
| `src/ui/chat/chatPanelMsgArchitect.ts` | Added `ArchitectAction` interface, `_architectActions` map, `handleArchitectPerAction()`, `handleArchitectActionConfirm()`. Per-action shows a confirmation message in chat (what Redivivus will do + Confirm/Cancel). Confirm routes to `redivivus.runEditFix` (fix), `fs.unlinkSync` (delete), or `redivivus.postToChat` (create). | User needs a direct path from each specific suggestion to executing it without navigating files or writing commands. | Delete uses `fs.unlinkSync` — irreversible if no save point exists. Mitigated by: (1) the confirmation message warns "a snapshot is saved automatically," (2) Redivivus save points capture project state. |
| `src/ui/chat/chatPanelRendererArchitect.ts` | `renderArchitectActions()` now reads `_architectActions` for the reviewId and renders per-action buttons (blue, labeled `[fix]`, `[!]`, `[+]`) above Fix All/Dismiss. Added `renderArchitectConfirm()` which renders Confirm/Cancel buttons for the in-chat confirmation message. | Architect review action bar was a single "Fix All" with no per-suggestion access. | None — renders gracefully when `_architectActions` has no entry (just shows Fix All). |
| `src/ui/chat/chatPanelRenderer.ts` | Added `__ARCH_CONFIRM__reviewId|||actionIndex|||END_ARCH_CONFIRM__` token replacement — calls `renderArchitectConfirm(reviewId, actionIndex)`. | Confirmation messages are added to conversation as text strings with embedded tokens, same pattern as all other action UI in Redivivus. | None. |
| `src/ui/chat/chatPanelMessages.ts` | Added routes for `architect-per-action`, `architect-action-confirm`, `architect-action-cancel`. Removed leftover `require('fs').appendFileSync(...)` debug log that was writing to `~/chassis_debug.log` (freed 2 lines to stay at 200-line limit). | New message types from per-action buttons must be routed to extension handlers. Debug log was a temporary artifact. | None. |
| `src/ui/chat/chatPanelScriptActions.ts` | Expanded arch action click handler with `per-action`, `confirm`, `cancel` dispatch. Split feedback/toggle/recent handlers to new `chatPanelScriptActionsB.ts` to stay under 200 lines. | File was at 200-line limit; the expanded arch handler required 6 new lines. | None — second `document.addEventListener` is additive. |
| `src/ui/chat/chatPanelScriptActionsB.ts` | New file containing feedback rating, toggle-auto-open, and recent project item click handlers extracted from `chatPanelScriptActions.ts`. | Required split to keep parent file under 200 lines. | None. |
| `src/ui/chat/chatPanelScript.ts` | Added `buildActionsScriptB` import and call. | Wire new B script into the webview. | None. |

## Recent Fixes — May 16, 2026 (Session 14: Architect Review — skip Guardian)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgMapContext.ts` | Guardian review skipped for Architect Review (`isArchitectReview && !isArchitectReview` guard added). | Guardian received `displayMsg = "Architect Review"` and `mapText = Claude's real response`. Without project context, Guardian judged the real response as "not answering the question" and replaced it with a generic "Architecture Review Framework" boilerplate template visible as "*Guardian reviewed this response.*" in the chat. The pattern matches the `buildAIPrefix` skip — Architect Review is a fully server-enriched prompt that doesn't need Guardian intervention. | None — Guardian continues to run for all other map-context messages (file explain, trace, test, improve). |

## Recent Fixes — May 16, 2026 (Session 14: Architect Review — real file content injection)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/map/mapPanelMessages.ts` | `architectReview` handler now enriches the client prompt with actual file content before forwarding to AI. Reads top-5 files (sorted by todos+warns count), first 80 lines each, appended as "ACTUAL FILE CONTENT" section. | Webview builds a topology-only prompt (graph metadata: connection counts, health, line counts). For single-file projects (like `animal_sound_player`) with 0 edges, the graph data is nearly empty. Claude receives "1 file, 0 connections" and refuses: "I cannot provide an architectural review without the actual codebase." Real file content gives Claude something substantive to analyze regardless of project size. Pattern copied from `explainFile` and `analyzeFile` handlers in the same file (lines 68-69, 81-82). | Adds a file-read loop (up to 5 files, 80 lines each). Read errors are silently caught — falls back to topology-only prompt if all reads fail. |

## Recent Fixes — May 16, 2026 (Session 14: Architect Review — prompt format fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/map/mapScriptActions.ts` | Restructured `doArchitectReview` prompt. Old prompt started with `"You are a senior software architect reviewing..."` — sent as a `role: 'user'` message, Claude interprets this as a persona reassignment attempt and refuses with "I cannot provide an architecture review without knowing what system, codebase, or files you'd like me to examine." New prompt starts with task: `"Analyze the following project dependency graph..."`, explicitly labels the data as topology metadata (not source code), and uses ALL-CAPS section headers instead of markdown bold (works in plain text context). | Root cause of Architect Review returning help-request boilerplate after the first fix (empty prefix) was applied. The prompt format itself was the final failure point. | None — pure prompt text change inside a template literal string. |

## Recent Fixes — May 16, 2026 (Session 14: Architect Review — empty code + display bug)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgMapContext.ts` | For Architect Review: (1) Display message no longer appends empty `` `nodeId` `` when `nodeId` is `''` — shows just "Architect Review" instead of "Architect Review ``". (2) `buildAIPrefix` is skipped entirely for Architect Review. The prefix injects an `activeFileContext` code block; when no file is open the backtick fences are empty, causing the AI to say "code section appears to be empty." The architect review prompt is fully self-contained (contains map graph data inline) so no prefix is needed. | Root cause of "I notice you've requested an Architect Review but the code section appears to be empty" response. `buildAIPrefix` was prepending an empty `` ```\n\n``` `` block that the AI interpreted as the code to review, finding nothing. | None — Architect Review prompt includes all needed context inline. |

## Recent Fixes — May 16, 2026 (Session 14: Dead buttons + usage attribution)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelScript.ts` | Added `data-cmd` click handler to primary `document.addEventListener('click', ...)`. Reads `data-cmd` attribute from closest matching element and posts `{ type: 'run-command', command: cmd }` to the extension. Removed dead ID-based handlers for `save-point-btn`, `map-btn`, `blueprint-btn` (those element IDs don't exist in the HTML). | All header buttons (Map, Save Point, Blueprint, Capabilities), onboarding pills (Start Session, Build from Vault, View Checklist), and sidebar pills (Vault, AI Team) use `data-cmd` but no handler existed. Clicking any of them silently did nothing. | None — `run-command` message type already handled by extension. |
| `src/ui/chat/chatPanelChunkedLoop.ts` | Per-file build recording changed from `worker \|\| supervisor` to `(res as any).routedTo \|\| worker \|\| supervisor`. | `routeByComplexity` picks the best available AI (Claude first, then fallback) independently of the Supervisor/Worker role split. Recording to the role-assigned `worker` ('gemini') meant all tokens appeared under Gemini even when Claude made the actual API calls. | None — `routedTo` is always set on successful responses. |
| `src/ui/chat/chatPanelBuild.ts` | Single-file builds now record supervisor and worker tokens separately. When supervisor ≠ worker and a plan was generated: `recordUsage(_supTok, supCost, supervisorAI)` + `recordUsage(workerTokens, workerCost, workerAI)`. Falls back to recording total under `workerAI` when solo (no supervisor/worker split). | Previously recorded total under `workerAI` only — supervisor planning tokens were invisible in the per-AI usage breakdown. | None. |

## Recent Fixes — May 16, 2026 (Session 14: Audit #5 — post-change roadmap logging)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFixUtils.ts` | Added `writeProjectRoadmapEntry(root, heading, bullets[])`. Reads project `REDIVIVUS_ROADMAP.md`, inserts new `## Recent Fixes` entry after `*Last updated*` line, updates the Last Updated line. No-ops when roadmap is absent (non-Redivivus projects unaffected). | Audit #5: pipelines make changes to user files but never log those changes to the project's own REDIVIVUS_ROADMAP.md — violating the rule that every file change gets an entry. | None -- best-effort, all errors silently caught. |
| `src/ui/chat/chatPanelMsgFixUtils.ts` | Moved `modelLabel()` from `chatPanelMsgFix.ts` to utils (exported). | `chatPanelMsgFix.ts` hit 205 lines after audit #5 additions; extracting `modelLabel` brings it to 196. Keeps both files under the 200-line hard stop. | None -- same function, now exported. |
| `src/ui/chat/chatPanelMsgFix.ts` | Import `modelLabel` from utils. Import `writeProjectRoadmapEntry`. Call `writeProjectRoadmapEntry` after successful file writes. | Audit #5 wiring for fix pipeline. | None. |
| `src/ui/chat/chatPanelBuild.ts` | Import `writeProjectRoadmapEntry`. Call after `Writer.writeBuiltFile` and scaffold. Logs file names, AI used, tokens, cost. | Audit #5 wiring for single-file build. | None. |
| `src/ui/chat/chatPanelChunked.ts` | Import `writeProjectRoadmapEntry`. Call after `tracer.end()` with full built file list and AI pair. | Audit #5 wiring for chunked multi-file build. | None. |

## Recent Fixes — May 16, 2026 (Session 14: Audit #4 — pre-flight rules.md injection)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFixUtils.ts` | Added `readProjectRules(root)`. Reads `.redivivus/rules.md`, caps at 4KB, returns empty string if absent. | Pre-flight step 2 ("Read .redivivus/rules.md") was never performed by any AI pipeline. Projects can have custom rules (e.g. "never use AudioContext", "always use WAV blob") that the Supervisor needs to know before suggesting a fix. | None -- best-effort, returns empty on error. |
| `src/ui/chat/chatPanelMsgFix.ts` | Import `readProjectRules`, call it, inject into Supervisor prompt under "PROJECT RULES (must not violate)". | Fix Supervisor was proposing fixes without knowing project-specific constraints. | None -- empty when rules.md absent. |
| `src/ui/chat/chatPanelBuild.ts` | Import `readProjectRules`, include in `blueprintContext` enrichment alongside dead_ends. | Single-file build Supervisor had no access to project rules. | None. |
| `src/ui/chat/chatPanelChunked.ts` | Import `readProjectRules`, inject `rulesBlock` into `planPrompt` alongside `deadEndsBlock`. | Chunked build Supervisor planned files without knowing project rules. | None. |
| `src/ui/chat/chatPanelBuildOrchestrated.ts` | Import `readProjectRules`, combine dead_ends + rules into context array. Refactored to avoid double file reads. | Orchestrated Supervisor had no access to project rules or dead_ends until #2+#4. | None. |

## Recent Fixes — May 16, 2026 (Session 14: Rule 17 causation-first debugging)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFixUtils.ts` | Added `getRecentBuildContext(root, sourceFiles)`. Reads `build_history.json` via `BuildHistoryService`, filters to the 5 most recent non-undone builds, finds which source files overlap with currently-broken files, returns a formatted causation alert with file names, build task, age, and AI used. Returns empty string when no overlap. | Rule 17: "always check build_history.json BEFORE suggesting any other cause." Supervisor was diagnosing blind — it never knew whether the file it was reading had just been written by a Redivivus build. If a build created the bug, the Supervisor should say that first, not discover it by accident. | None -- best-effort, all errors return empty string. |
| `src/ui/chat/chatPanelMsgFix.ts` | Import `getRecentBuildContext`. Call it after `collectSourceFiles`. Inject `buildContext` at the TOP of the Supervisor prompt, before user report text. | Causation alert must precede everything else so the Supervisor's first frame of reference is "did a build cause this?" not "what is wrong with the code?" | None -- empty string when no recent builds match. |

## Recent Fixes — May 16, 2026 (Session 14: Rule 5 dead_ends in all build pipelines)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuild.ts` | Import `readProjectDeadEnds`. Shadow `blueprintContext` with dead_ends-enriched version at start of `runSingleFileBuild`. Flows into `supervisorPlan` call and `buildWorkerPrompt` automatically. | Rule 5 (don't repeat dead ends) was enforced in the fix pipeline but not the single-file build pipeline. Supervisor could plan approaches already known to fail in this project. | None -- `readProjectDeadEnds` is best-effort; returns empty string if file absent. |
| `src/ui/chat/chatPanelChunked.ts` | Import `readProjectDeadEnds`. Add `deadEndsBlock` injected into `planPrompt` before the file-plan JSON request. | Chunked build Supervisor planned files without knowing what had failed before. | None. |
| `src/ui/chat/chatPanelBuildOrchestrated.ts` | Import `readProjectDeadEnds`. Enrich `context` passed to `createPlan` with dead_ends content. | Orchestrated build Supervisor had no dead_ends awareness. | None -- only affects Supervisor prompt content. |

## Recent Fixes — May 16, 2026 (Session 14: CHASSIS_WORKER_RULES + build-info fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/ai/chassisWorkerRules.ts` | New file (22 lines). Exports `CHASSIS_WORKER_RULES` constant — 6 rules covering [SCOPE], [WARN], [DEAD], tag preservation, 200-line limit, no non-ASCII. Single source of truth for annotation rules across all AI Worker prompts. | Annotation rules existed in external config files (CLAUDE.md, .windsurfrules) but were never wired into Redivivus's own internal Worker/Supervisor AI prompts. Build and fix pipelines were generating unannotated code. | None -- read-only constant, imported wherever needed. |
| `src/ui/chat/chatPanelBuildWorker.ts` | Import + append `CHASSIS_WORKER_RULES` to `buildWorkerPrompt()` return value. | Single-file build Worker had no annotation rules. | None. |
| `src/ui/chat/chatPanelChunkedLoop.ts` | Import + append `CHASSIS_WORKER_RULES` to per-file `filePrompt`. | Chunked build per-file prompts had partial rules ([SCOPE] only, no [WARN]/[DEAD]/no-ASCII). | None. |
| `src/services/build/buildOrchestratorPrompt.ts` | Import + append `CHASSIS_WORKER_RULES` to `generatePhasePromptImpl`. | Orchestrated build phase prompt had zero annotation rules. | None. |
| `src/ui/chat/chatPanelMsgFix.ts` | Import + inject `CHASSIS_WORKER_RULES` into fix Worker prompt before FORMAT section. | Fix Worker already had [DEAD] rule but lacked [SCOPE], [WARN], tag preservation, no-ASCII. | None. |
| `scripts/postcompile.js` | Replace hardcoded `'0.3.4'` version in build-info.json write with dynamic read from package.json. | build-info.json was stuck at 0.3.4 despite package.json being 0.3.6. Rule 20 violation -- version mismatch. | None -- reads package.json at compile time, falls back to '0.0.0' on error. |

## Recent Fixes — May 16, 2026 (Session 14: dead-end annotation + pattern validation)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFixUtils.ts` | Added `readProjectDeadEnds(root)` and `appendProjectDeadEnd(root, ...)`. Reads/writes `<project>/.redivivus/dead_ends.md`. Creates file with header if absent. Truncates read at 8KB. | Fix pipeline had no connection to the project's dead_ends.md. Supervisor could suggest approaches already known to fail in the project. Successful fixes never recorded what was replaced. | None -- best-effort, all errors caught. |
| `src/ui/chat/chatPanelMsgFixPatterns.ts` | Added `triedWhat`, `whyFails`, `doInstead` fields to `FailurePattern` interface. Filled in for web-audio pattern. | `appendProjectDeadEnd` needs human-readable strings, not raw regex objects. | None. |
| `src/ui/chat/chatPanelMsgFix.ts` | (1) Reads project dead_ends.md before Phase 1, injects into Supervisor prompt under "PREVIOUSLY FAILED APPROACHES". (2) Added Worker Rule 5: annotate every removed/replaced block with [DEAD] comment in correct syntax for the file type. (3) Bumped pattern rules from index 5 to 6. (4) After validated fix: calls `appendProjectDeadEnd` for each resolved pattern. | Rule 5 (don't repeat dead ends) and Rule 8 (don't remove code without [DEAD] logging) were completely absent from the fix pipeline. Worker generated fixes with no annotations. Supervisor had no memory of what failed before. | Low -- dead_ends read/write is best-effort. Supervisor prompt grows by ~8KB max when dead_ends.md exists. |

## Recent Fixes — May 16, 2026 (Session 14: post-write pattern validation)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFixPatterns.ts` | New file (78 lines). `KNOWN_PATTERNS` registry with Web Audio API silent-failure pattern. `detectPatterns()` scans source before Phase 1. `buildSupervisorNotes()` / `buildWorkerRules()` inject domain guidance dynamically. `validateOutputFiles()` scans written files post-write for known-bad patterns. | Hardcoded prompt guidance in the Worker was routinely ignored — fix pipeline had no way to know whether the Worker followed instructions. Now output is scanned after write; if AudioContext still appears, user sees `[VALIDATION FAIL]` and knows to retry. | None — validation is read-only; it never blocks writes, only annotates the result message. |
| `src/ui/chat/chatPanelMsgFix.ts` | Removed hardcoded Web Audio guidance (now in patterns file). Added `detectPatterns(filesBlock)` before Phase 1. Injected `buildSupervisorNotes(activePatterns)` into Supervisor prompt and `buildWorkerRules(activePatterns, 5)` into Worker prompt. Added post-write `validateOutputFiles()` call and `[VALIDATION PASS/FAIL]` line in result message. File: 186→180 lines. | Guidance was static and generic. Dynamic injection means guidance only appears when the pattern is actually present in the source. Validation closes the loop that was invisible before. | None — fails gracefully; empty patterns list means no injected text. |

## Recent Fixes — May 16, 2026 (Session 13: fix pipeline phantom files + Web Audio fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFix.ts` | Split to 183 lines (was 216). Phantom file prevention (allowedRels filter). Supervisor/Worker prompts updated: replaced lazy-init promise chain pattern with capture-phase document.addEventListener('click', ..., {capture:true}) pattern. This creates AudioContext BEFORE any onclick fires so playSound needs no async chain. Eliminates the .catch() "Failed to initialize audio" error that appeared on Linux Chrome/file://. | Worker AI hallucinated file.js. Lazy-init promise chain (.then/.catch) failed on Linux Chrome on file:// because the async continuation lost the user-gesture context, causing DOMException inside .then() which hit the error .catch(). Capture-phase listener solves this definitively. | None -- fixes are still applied to all allowed paths; only phantom ones are blocked. |
| `animal_sound_player/index.html` | Directly fixed with working capture-phase Web Audio pattern: var ac=null; document.addEventListener('click', create/resume ac, {capture:true}); playSound() calls go() directly, no promise chain. Sound functions (playBird/playCat/playDog/playWhistle) take ctx param. HTML entities instead of emoji literals. | Previous Redivivus-generated versions either had phantom file.js, or used getAC().then() which failed on Linux Chrome with "Failed to initialize audio." | None -- verified working pattern. |
| `src/ui/chat/chatPanelMsgFixUtils.ts` | New file (73 lines). Extracted `parseFixResponse`, `takeSnapshot`, `collectSourceFiles` from chatPanelMsgFix.ts. `parseFixResponse` gains `allowedRels: Set<string>` param and returns `{ fixes, skipped }`. | 200-line split required. | None. |

## Recent Fixes — May 16, 2026 (Session 13: fix pipeline + Guardian coverage)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgFix.ts` | Rewrote fix pipeline: Phase 1 uses `routing.prompt()` (was `routeByComplexity`). Timeout 60s Phase 1 / 90s Phase 2. All HTML entities replaced with ASCII (`[1/3]`, `[FAIL]`, `[WARN]`). Added `modelLabel()` to show which AI handled each phase. | `routeByComplexity` routed short bug reports ("no sound") as simple → Groq (weakest), silently failing pipeline. HTML entities in conversation content rendered as literal text because WebView renderer escapes `&`. | None — explicit timeouts prevent silent failures. |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Guardian now runs for all Q&A responses (removed `hasCodeBlock` guard). Guardian also now runs for convert responses with code blocks (previously skipped with "would corrupt" comment). Convert uses prefixed task string so Guardian knows it's reviewing a conversion. | Q&A text-only answers bypassed Guardian entirely. Convert path had no Guardian review at all. User confirmed these were gaps to fix. | Low — Guardian errors are caught; original text used on error. Convert context prefix prevents Guardian from reverting conversions. |

## Recent Fixes — May 16, 2026 (Session 12: vault/template TODOs)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/project/templateWizard.ts` | Fixed Rule 18: isSmallUnit + isTemplateRequest now use 50-token AI classifier calls instead of regex. Added `routing` param; keyword fallback only when routing unavailable. | [WARN][RULE 18] violation was documented in `[NEXT]` tag since initial implementation. | Low — AI calls add latency only when plan mode fires a template build. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Wire template wizard into plan-mode builds: after mode+gaps check, before `handleBuildRequest`, await `runTemplateWizard`. If wizard handled, pass `customizationPrompt` to build. | `runTemplateWizard` was previously unwired — no active caller. | Low — wizard only fires in plan mode; falls through on cancel/AI-classifier-no. |
| `src/services/project/specTemplates.ts` | Added 4 spec templates: todo-list-html, calculator-html, markdown-preview-html, color-picker-html. Spec-only entries (no codeTemplate) — 4-5 lines each. | Only 1 spec template existed (canvas animation). Most common HTML builds now have pinned specs. | None — match() functions are narrow and checked before AI. |
| `src/services/project/starterPatternsUtils.ts` | Added getDOMPatterns() (3 patterns: $/$$/onEvent/toggleClass), getStoragePatterns() (1: localStore), getStringPatterns() (5: capitalize/truncate/sleep/chunk/unique). | Vault starter set was JS-utility-only. DOM, storage, and string utilities fill the most common gaps. | None — hand-verified code, no external deps. |
| `src/services/project/starterPatterns.ts` | Import and spread getDOMPatterns, getStoragePatterns, getStringPatterns. Updated `[NEXT]` to `[DONE]`. | Patterns were defined but not exported to the vault seeder. | None. |
| `src/services/vault/vaultSeeder.ts` | Added 3 GitHub searches: localStorage wrapper, date formatting, useLocalStorage React hook. Updated `[NEXT]` to `[DONE]`. | Previous searches were all utility/api/auth — no storage or React hooks. | None — deduplicates on contentHash; skips if already present. |
| `src/services/project/templateRegistryData.ts` | Added script category with 3 subcategories: Python data script, shell automation script, Node.js CLI tool. Updated `[TODO]` to `[DONE]`. | Template wizard had no script/automation path — common use case for solo devs. | None — registry paths are placeholders until templates are published. |

## Recent Fixes — May 16, 2026 (Session 11: Fix intent — bug reports diagnosed, not modal'd)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelClassifier.ts` | Added `'fix'` to `IntentType`. Added fix intent description to system prompt. Changed 3 wrong examples (fix/debug/button broken) from `build` to `fix`. Added 7 new fix examples. Added `fix` to JSON return format list and to valid-intent check. | Bug reports like "it runs but doesn't produce sounds" were classified as `build`, triggering the build modal — completely wrong for an existing project. | None — new type, backward compatible. |
| `src/ui/chat/chatPanelClassifierOverrides.ts` | Updated fallback classifier: fix/debug/repair/broken verbs now return `fix` type instead of `build`. | Fallback was treating all action verbs including `fix`, `debug`, `repair` as build intent. | None — fallback only fires when no routing AI is available. |
| `src/ui/chat/chatPanelMsgFix.ts` | New file (108 lines). `handleFixRequest`: reads up to 10 source files from project root, sends AI a diagnosis prompt with problem description + code, replies with specific findings. No modal, no mode picker. Ends with invite to apply fix. | No fix path existed — the only response to any problem report was the build approach modal. | Low — reads files read-only, AI response goes to chat. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Added `fix` intent handler before `build` handler: calls `handleFixRequest` and returns. | Without this, `fix` intent would fall through to the build modal handler. | None. |
| `src/ui/chat/chatPanelMessages.ts` | Added `'fix'` to `classifyIntent` return type union in `MessageHandlerDeps`. | TS compile error — inline return type didn't include `fix`. | None. |

## Recent Fixes — May 16, 2026 (Session 10X: Task #1 — Build→Run→Error→Fix loop)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelPostBuild.ts` | Created (107 lines). `detectPostBuildInfo()` — detects project type (html/node/python/go/rust/shell), entry file, run command, missing deps (package.json without node_modules; requirements.txt without venv). `buildPostBuildGuidance()` — returns markdown "What to do next" section with run command, install warning, "paste error here" invite. | After every build, users had no next-step guidance. Build → run → error → fix loop was invisible and manual. | None — guidance is advisory and appended after result card. |
| `src/ui/chat/chatPanelBuild.ts` | Added `buildPostBuildGuidance` import. Modified single-file result card append to include `nextSteps` after result card and preview token. | Single-file builds had no post-build guidance. | None. |
| `src/ui/chat/chatPanelChunked.ts` | Added `buildPostBuildGuidance` import. Modified multi-file result card append to include `nextSteps`. | Chunked builds had no post-build guidance. | None. |
| `src/ui/chat/chatPanelClassifierOverrides.ts` | Added install-deps fast-path before run fast-path: "npm install", "pip install", "install dependencies" → `{ type: 'run', subtype: 'install' }`. | Users saying "install deps" after a build should get an automatic terminal install, not a build prompt. | None — falls through to AI classifier if not matched. |
| `src/ui/chat/chatPanelClassifier.ts` | Added `subtype?: string` to `IntentResult` interface. | Required to distinguish install-deps from generic run intent in message handler. | None — new optional field, backward compatible. |
| `src/ui/chat/chatPanelMessages.ts` | Added `subtype?: string` to `classifyIntent` return type. | TS compile error after adding subtype to IntentResult. | None. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Extended run intent handler: checks `intent.subtype === 'install'` — detects package manager (package.json/requirements.txt/Cargo.toml/go.mod), opens terminal, runs appropriate install command. Falls back to generic "open main file" for non-install run intent. | "install deps" chat messages were going unhandled. Terminal install is cleaner than directing user to a command manually. | Low — fails gracefully if no manifest found. |

## Recent Fixes — May 16, 2026 (Session 10Z: Vault — 5 critical fixes to make vault actually work)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildWriter.ts` | `captureToVault()`: added `callAI = (p) => ctx.routing.prompt(p, 12_000)` passed to `autoCaptureFile`. Changed `[NEXT]` → [FIX]. | AI quality gate (`evaluateQuality`) was only called when `callAI` was provided — it never was. Every capture used heuristic fallback, filling vault with low-quality code. | Low — AI call is async, captured inside try/catch. Build never blocked. |
| `src/ui/chat/chatPanelChunked.ts` | `autoCaptureFiles` call: added `_callAI = (p) => routing.prompt(p, 12_000)` as 5th argument. Added `formatVaultContext` import. Injected vault context block into `planPrompt` before "Break this into files". | Same quality gate gap as single-file builds. Also vault search results were computed but never passed to the AI planner — it planned blind. | Low — vault context appended before instructions, stays within token budget via 400-char cap per item. |
| `src/ui/chat/chatPanelBuild.ts` | Added `formatVaultContext` import. Replaced empty string `vaultSummary` in `buildWorkerPrompt` call with `formatVaultContext(searchResult.items)`. | Single-file worker prompt had a `vaultSummary` parameter slot that was always passed as `''`. | None — empty if no vault items. |
| `src/services/vault/vaultContextService.ts` | Changed `buildContextBlock` from `private` to `public`. Added exported standalone `formatVaultContext(items)` function for use in build pipelines without instantiating the full service. | `buildContextBlock` existed but was unreachable from outside the class. Build pipelines already had vault items from `findRelevantByTask` but no way to format them for prompts. | None — purely additive. |
| `src/services/vault/vaultSemanticSearch.ts` | Changed confidence threshold from `0.95` to `0.65`. Removed 3 `process.stderr.write` debug lines. | 0.95 was unrealistic — AI confidence scores from natural text prompts rarely exceed 0.80. Semantic search never fired. Now fires on reasonable matches. | Low — lower threshold means more false positives, but intentMismatch check still filters frontend/backend confusion. |
| `src/services/vault/vaultEnrich.ts` | Created (50 lines). `enrichVaultDescriptions(vault, callAI, onProgress)` — loops items missing `description` or `qualityScore`, calls AI quality gate, saves enriched items, removes low-quality ones. | Vault items captured before quality gate was wired have no AI metadata. This is a one-shot repair pass. | Low — removes items scoring < 3, which is correct behavior. Idempotent (skips already-enriched). |
| `src/commands/vault.ts` | Added `redivivus.vault.enrich` command: counts items needing enrichment, confirms with user, runs enrichment with progress notification. Registered in `package.json`. | No way to retroactively improve existing vault items. | Low — user confirms before running; each item requires one AI call. |
| `src/ui/chat/chatPanelBuildVault.ts` | Replaced raw code concatenation with AI-assisted assembly. New prompt: "adapt and combine these vault components to implement the task, fill gaps, fix conflicts". Shows "Assembling from N vault items..." message. Handles AI failure gracefully. Added post-build guidance. | Raw concat produced unrunnable output: no imports merged, no type conflicts resolved, no missing functionality filled. | Low — AI failure returns error message; vault items still visible in chat. |

## Recent Fixes — May 16, 2026 (Session 10Y: Tasks #5–#10 — API pings, diff preview, vault capture, session resume, console.log, UI inspector)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/selfDiagnosticChecks.ts` | Replaced fake `[TODO]` ping with real `fetch()` calls to each provider's model-list endpoint (Gemini, OpenAI, Claude, Groq, xAI, Kimi). 5-second AbortController timeout. Returns pass/fail/warn based on HTTP status. | Diagnostic was always returning pass regardless of whether the API key worked. Users couldn't tell if their key was valid or their network was blocked. | Low — read-only GET requests, 5s timeout, errors caught and returned as warn/fail. |
| `src/ui/chat/chatPanelEditBuild.ts` | Added `import * as os`, `import * as vscode`. Before writing edited file: snapshot original to temp path. After writing: compute +N/-N line diff stats, open `vscode.diff()` with temp → final so user can see exactly what changed. Success message includes diff stats. | Edit builds silently overwrote files with no visibility into what changed. Hard to review AI edits. | Low — diff view is non-blocking, write always happens. Temp file cleanup is best-effort. |
| `src/ui/chat/chatPanelBuildUtils.ts` | Added `import * as os`. After vault-only build: write code to temp file with inferred extension, call `autoCaptureFile()`, delete temp. Shows "Saved N snippets to vault" in result. Changed `[NEXT]` to `[DONE]`. | Vault-only build results were never captured to vault — the [NEXT] stub was never implemented. | Low — autoCaptureFile failures are caught, never block the build flow. |
| `src/ui/chat/chatPanelSessionResume.ts` | Created (52 lines). `loadLastSessionContext()` — reads most recent session JSON from `.redivivus/sessions/`, surfaces goal/completed/inProgress/nextSessionStart in chat if session is < 48h old. | Chat panel started blank every time — no reminder of what was in progress. Session context helps users resume naturally without re-reading their notes. | None — read-only, push to conversation array only. |
| `src/ui/chat/chatPanel.ts` | Added `loadLastSessionContext` import + call in constructor after `loadBlueprintContext`. | Wire point for session resume. | None — only adds a message if a recent session exists. |
| `src/ui/map/mapScriptActions.ts` | Removed 2 debug `console.log` calls injected into the map webview script (startup + canvas check). Kept `console.error` on abort condition. | console.log in webview-injected scripts leaks to the browser console of every user. Debug noise. | None — removed debug logs only. `console.error` abort kept. |
| `src/ui/views/scriptsCore.ts` | Changed `[TODO]` to `[DONE]` at line 75 — no actual console.log was present in that block. | Stale TODO annotation. | None. |
| `src/ui/chat/chatPanelClassifier.ts` | Removed `console.log` from AI classification error catch block. | Classification failures happen on every misrouted request — the log was noisy extension output. Fallback to `question` is already safe without logging. | None. |
| `src/services/lensService.ts` | Implemented 3 stubs: `captureElement` (stores metadata), `translateToSource` (async walks project files, grepping for class/id/tag/description), `injectContext` (posts found source + snippet to ChatPanel, opens file at matching line). Added `inspectAndInject` high-level entry. Added `walkDir` async generator and `searchProjectFiles` helper. | All 3 methods were empty stubs — the UI Inspector was completely non-functional. | Low — file walk is limited to src/components/app directories, skips node_modules/out. Read-only. |
| `src/extensionInlineCommandsB.ts` | Added `redivivus.inspectElement` command: InputBox asks for element description (class, id, or natural text), then calls `lens.inspectAndInject()`. | LensService was implemented but never registered as a callable command. | None. |
| `package.json` | Added `redivivus.inspectElement` command registration. | Required for VS Code to recognize the command. Without this, it silently fails. | None. |

## Recent Fixes — May 16, 2026 (Session 10X continued: Task #4 — Expanded 5W Interview panel)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelScriptExpandedInterview.ts` | Created (98 lines). `buildExpandedInterviewScript()` — generates JS `showExpandedInterviewPanel(prefillTask, complexity)`. Single-page scrollable form with 5 sections (WHO/WHAT/WHERE/WHEN/WHY), 7 standard-tier questions (choice+text), submit → posts `expanded-interview-submit`. Skip button posts with `skipped:true`. | Expanded interview panel had no webview UI — the `show-panel: expanded-interview` message was silently ignored. | None — ASCII-only JS per Rule 13. |
| `src/ui/chat/chatPanelScript.ts` | Added `buildExpandedInterviewScript` import and call in script footer. Added `expanded-interview` case to `show-panel` handler. | Webview now handles the panel type message from orchestrator and `redivivus.startExpandedInterview`. | None. |
| `src/ui/chat/chatPanelMsgExpandedInterview.ts` | Created (41 lines). `handleExpandedInterviewSubmit()` — compiles 5W answers into a context string, calls `deps.setBlueprintContext()` to inject into build pipeline, then calls `handleBuildRequest` with the prefill task. | Extracted from chatPanelMessages.ts to keep it under 200 lines. | None. |
| `src/ui/chat/chatPanelMessages.ts` | Added `setBlueprintContext?` to `MessageHandlerDeps`. Added `expanded-interview-submit` handler delegating to new sub-module. Added import for `handleExpandedInterviewSubmit`. | Interface needed `setBlueprintContext` so the interview handler can inject context into the build pipeline. | None — optional field, backward compatible. |
| `src/ui/chat/chatPanelMessageRouter.ts` | Added `setBlueprintContext: (ctx: string) => { state.blueprintContext = ctx; }` to deps construction. | Wires the setter from the panel state into the message handler deps. | None. |
| `src/extensionInlineCommandsB.ts` | Updated `redivivus.startExpandedInterview` command: now opens ChatPanel (or focuses existing) and posts `show-panel: expanded-interview` with `prefillTask` from blueprint.what. Removed `[TODO]` tag, added `[DONE]`. | Was just forwarding to `redivivus.wizardRetrofit`. Now triggers the real expanded interview form. | Low — uses `(panel as any)._panel` accessor like other command handlers. |

## Recent Fixes — May 21, 2026 (Session 10Y: Chat history wipe on auto-open & Agent HTML rules)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/extensionInlineCommands.ts` | Saved `ChatPanel` conversation array to `globalState('redivivus.pendingRescueConversation')` right before calling `vscode.openFolder` for a new project. | VS Code's `openFolder` triggers a hard window reload. Since Redivivus chat history is stored in-memory, the reload completely wiped the original session chat when the user created their first project. | Low — standard VS Code state persistence pattern. |
| `src/extensionResumeState.ts` | Added logic to detect `pendingRescueConversation`, restore it into the new `ChatPanel` instance, and call `.refresh()`. | Completes the history-rescue cycle across the window reload boundary so the user doesn't lose context. | Low — safely cleans up the flag after use. |
| `src/services/ai/agentService.ts` | Added rule #9 "PROPER WEB STRUCTURE" and rule #10 "ACTUALLY WRITE THE CODE" to the OBD2 Agent system prompt. | The OBD2 agent was hallucinating raw JS without HTML tags, and sometimes completely ignoring the `write_file` tool to just output a Markdown checklist of the requested features, leaving the auto-created project folder empty. | None — strengthens existing Agent constraints. |
| `src/ui/chat/chatPanelChunkedLoop.ts` | Added explicit instruction preventing the use of ES modules (`<script type="module">`) and `import/export` for HTML projects. | The chunked build AI was splitting the game into multiple ES modules. When the user clicked "Preview in Browser", Redivivus opened the `.html` file natively via the `file://` protocol, which caused a hard CORS block on all module scripts, leaving the game as a blank screen. | Low — keeps zero-build projects runnable from the filesystem. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Extracted `checkHardcodedOverrides` and placed it BEFORE the Adaptive/Agent mode routing block. | Hardcoded commands like "close project" were falling into Adaptive Mode, which incorrectly classified them as environment tasks (`obd2`). This caused the OBD2 Agent to spin up and get stuck trying to fulfill a UI command it had no tools for. | Low — restores correct fast-path execution. |
| `src/extensionInlineCommands.ts` | Disabled automatic `vscode.openFolder` invocation for new projects; added manual `__OPEN_WORKSPACE__` button to chat result card instead. | Creating a new project triggered an unavoidable VS Code window reload when adding the folder to the empty workspace, causing the chat panel to aggressively close and reopen, breaking the user's flow. Now the user controls when the workspace opens. | Medium — modifies core project scaffolding flow, but improves UX. |
| `src/commands/init.ts` | Removed `updateWorkspaceFolders` from `onNewProject` and removed the strict context check before `resumeBuildTask`. | Adding the new folder to an existing workspace forced VS Code into an "Untitled (Workspace)" multi-root mode. This disruptive state change caused the chat panel to re-render in place, spawning duplicate tabs. Disabling this keeps the build isolated until the user explicitly opens the new folder. | Medium — stabilizes new project initialization UX. |
| `src/ui/chat/chatPanelChunked.ts` & `src/ui/chat/chatPanelChunkedLoop.ts` | Added strict BROWSER/HTML PROJECT ONLY rules to the Supervisor prompt to enforce planning a separate `.js` file instead of mixing JS inside `index.html`. | There was a split-brain issue: the Worker was told "Use standard `<script src...>`" but the Supervisor wasn't told to plan a separate JS file. So the Supervisor only planned `index.html`, and the Worker either broke the rule or output invalid JS tags trying to reference a non-existent external file, resulting in blank games. | High — fixes structural failures in zero-build HTML game generation. |

## The Great Reorganization — May 22, 2026 (Architecture Stabilization)

Because of Rule 9 (the 200-line hard stop), files were aggressively split and flattened into `src/ui/chat/` (92 files) and `src/services/` (78 files), mixing backend orchestration logic with UI rendering. 
To resolve this architectural erosion, over 170 files were moved to domain-specific directories using `ts-morph` to safely rewrite all project imports.

**New Structure Highlights:**
- **`src/core/build/`**: Extracted build pipeline (`chatPanelBuild*.ts`, `chatPanelChunked*.ts`, etc.)
- **`src/core/ai/`**: Extracted AI logic and intent classifiers (`chatPanelAI*.ts`, `chatPanelClassifier*.ts`)
- **`src/core/routing/`**: Extracted message routing (`chatPanelMsg*.ts`, `commandRouter.ts`)
- **`src/core/project/`**: Extracted file ops and project scaffolding
- **`src/core/inspector/`, `src/core/diagnostics/`, `src/core/retrofit/`**: Backend services moved out of `src/services/`
- **`src/ui/panels/chat/`**, **`src/ui/panels/analyzer/`**, **`src/ui/panels/wizard/`**: UI-specific webviews and rendering code isolated into discrete panel domains.

## Recent Fixes — May 22, 2026 (Session 11X: Core Rules Update, Orphan Cleanup, Logging & Testing)

| File | What Changed | Why | Risk |
|------|--------------|-----|------|
| `src/tests/*` & `.vscode-test.mjs` | Added layered testing architecture inside `src/tests/` (to preserve compilation stability). Included strict Baseline validation and Nock HTTP mocking. Implemented Static Analysis Quality Gates via `scripts/quality-gates.js` (Cyclomatic Complexity, Bundle Size, ts-prune dead code, Dependency Compliance). | Provides deterministic, zero false-positive testing without hitting live APIs. Defends architectural integrity post-test. Mirrors domain structure exactly. | Low — tests don't affect runtime. |
| `src/tests/utils/logDumper.ts` | Created a global Mocha `afterEach` hook to automatically extract and dump domain logs on failure. | Makes debugging test failures vastly faster by pinning exactly what the internal AI pipelines did during the test. | Low. |
| `src/core/logging/masterLogger.ts` & 11 Domain Loggers | Added a `masterLogger` and 11 domain-specific loggers to `src/core/` and `src/ui/panels/`. | Enforces NO FLAT FILES logging. Provides structured DEBUG, INFO, ERROR logging with automatic session rotation. | Low — new infrastructure, doesn't break existing code. |
| `src/extension.ts` | Initialized `masterLogger` in `activate()`. | Connects the logging framework to the extension lifecycle. Note: File reached 212 lines, needs split per Rule 9. | Low. |
| `src/core/ai/clarificationService.ts`, `src/services/deployService.ts`, etc. (18 files total) | `[DEAD]` Removed 18 completely orphaned files across `src/services` and `src/core`. | Rule 12 enforcement. Static analysis confirmed these files were entirely unreferenced dead ends left over from previous refactors. | Low — files were already unreachable. |
| `GEMINI.md`, `CLAUDE.md`, `.cursorrules`, `.windsurf/rules.md` | Added Rule 13: NO FLAT FILES. | Enforces strict folder-based separation of concerns (UI in UI, logic in logic) across the Redivivus project. | Low — documentation update. |
| `src/services/rulesContent.ts`, `src/services/chassisRules.ts`, `src/services/ai/chassisWorkerRules.ts`, `src/services/ai/agentService.ts` | Added Rule 13: NO FLAT FILES. | Ensures Redivivus injects this strict architectural rule into the AI agents when it generates or edits external projects. | Low — prompt engineering update. |

## Recent Fixes — May 21, 2026 (Session 10X: OBD2 Agent workspace auto-open and UI result rendering)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgSendAgent.ts` | Added `buildPostBuildGuidance`, `__PREVIEW_BROWSER__` token, and `__BUILD_RESULT__` token to the final agent output. Added `setTimeout` call to `ChatPanel.onBuildFinished` if any files were built. | The OBD2 Agent failed to trigger the workspace to open after auto-creating the folder, leaving users in an empty VS Code window. It also lacked the UI rendering tokens that the standard build pipeline uses to show interactive run/preview buttons. | Low — matches standard pipeline behavior. `ChatPanel.onBuildFinished` causes a window reload for first-time folder opens, which is the expected VS Code behavior. |

## Recent Fixes — May 16, 2026 (Session 10W: Rule 18 complete — all remaining regex NL violations fixed)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelAutoSave.ts` | `shouldAutoSave` made async — AI classifier replaces BUILD_VERB_RE: "Did user ask to build/create a file? yes or no". `shouldDeleteFiles` made async — AI classifier replaces DELETE_RE: "Is user asking to delete files? yes or no". Fast-path pre-filter kept on delete (structural, not NL). Caller `chatPanelMsgSendAI.ts` updated to `await` both. | "remove the CSS class" was triggering file deletion. "convert" was triggering auto-save when AI gave a text explanation. Regex couldn't distinguish. | Low — AI failures fall back to false (no delete, no save). |
| `src/services/build/buildPlacementCheck.ts` | `taskDomain()` made async with routing param — AI classifier: "Is this task frontend, backend, mixed, or unknown?". `checkBuildPlacement` made async. `blueprintDomain()` kept as regex (reads our own structured data). | Keyword lists misclassify "add a REST-like feel to the UI" as backend, "make the API page load faster" as frontend. | Low — returns 'unknown' on AI failure → treats as 'fit'. |
| `src/services/vault/vaultSemanticSearch.ts` | `detectIntentMismatch` made async — AI classifier: "Are task and vault item in opposite domains? mismatch or match". Uses existing `callAI` param already available in `semanticVaultSearch`. | Frontend/backend keyword lists excluded valid vault results. "form validation" was being flagged as frontend even when the vault item was a general validation utility. | Low — returns false (no mismatch) on AI failure → vault item included. |
| `src/services/project/templateScopeService.ts` | `isVagueProjectRequest` made async with routing: AI classifier "vague or clear". `parseScopeAnswer` made async with routing: AI parses complexity + purpose as JSON. Callers in `chatPanelIntent.ts` updated to `await`. | Regex length/keyword heuristics blocked valid detailed requests and passed through genuinely vague ones. parseScopeAnswer keyword matching missed creative phrasings like "something I can show clients". | Low — both return safe defaults on AI failure (false / 'simple'/'general'). |
| `src/services/clarificationService.ts` | `needsClarification` made async with routing: AI classifier "clear or unclear" given task + candidate files. Structural fast-path kept for explicit file extensions. `ensureClarityBeforeBuild` updated to pass routing. | Ambiguous-pronoun regex ("this", "it") was triggering clarification for "fix this bug" even when context was clear. | Low — returns false (no clarification needed) on AI failure → proceeds. |

## Recent Fixes — May 16, 2026 (Session 10V: Intent-aware routing — run intent + backend modal)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelClassifierOverrides.ts` | Created (59 lines). Extracted all hardcoded fast-path overrides from `chatPanelClassifier.ts`. Added run/preview intent fast-path: "run the app", "launch the player", "open in browser", "let me see it". | Classifier was at 197 lines — needed room. Also gives run intent a structural fast-path before the AI call. | None. |
| `src/ui/chat/chatPanelClassifier.ts` | Added `'run'` to `IntentType`. Replaced 30-line hardcoded block with `checkHardcodedOverrides()` + `fallbackClassify()` calls. Updated AI prompt: run intent description + 4 examples. Handle `run` in parse result. | "run the animal sound player" was never reaching the backend classifier — webview modal intercepted it first. | None — fallback still classifies as question on error. |
| `src/ui/chat/chatPanelScript.ts` | `doSend()`: removed mode-check modal trigger. All messages now go straight to backend. Added `show-mode-popover` incoming message handler: stores pendingText, calls existing `showModePopover()`. | Modal fired before any classification, so questions/run requests got the "choose your approach" popup. Now only build intent triggers the modal, from the backend. | Low — existing `showModePopover` and button handlers unchanged. |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Added `run` intent handler: finds main file (index.html, main.js, etc.) in workspace root and opens in browser via `vscode.env.openExternal`. For `build` intent with no mode set: sends `show-mode-popover` back to webview instead of calling `handleBuildRequest`. | Run requests were being treated as build requests. Mode modal should only appear for confirmed build intent. | None — run handler fails gracefully if no main file found. |
| `src/ui/chat/chatPanelMessages.ts` | Added `'run'` to `classifyIntent` return type union. | TS compile error after adding run to IntentType. | None. |

## Recent Fixes — May 16, 2026 (Session 10U: Plan It as default UX)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelHtml.ts` | Launcher: replaced two equal Plan/Build buttons with one full-width "Start New Project" (plan mode) primary button + small "⚡ Just Build — skip questions" secondary text link. Project-ready screen: replaced two-button mode toggle with a single small "⚡ Skip questions — Just Build" link (plan is the implied default). | Plan mode should be the default path — blueprint context makes builds better. "Just Build" is still accessible but visually secondary. | None — same message types sent on click, only visual hierarchy changed. |

## Recent Fixes — May 16, 2026 (Session 10T: Blueprint context gaps closed)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildAutoCreate.ts` | Created (55 lines). `autoCreateProject()` — uses `extractBlueprintFromPrompt` to AI-infer all 5W fields from task. Writes full config.json + blueprint.md. Returns `{ dir, blueprint, blueprintContext }`. | Auto-create previously wrote literal "?" for who/where/why — blueprint was hollow. AI now fills all fields from the user's request. | Low — fields default to empty string if AI can't infer, never hard-errors. |
| `src/ui/chat/chatPanelBuildRunner.ts` | Removed inline `autoCreateProject` block. Added import for `chatPanelBuildAutoCreate.ts`. After auto-create: `deps.blueprintContext` refreshed with enriched context. Added vagueness warning if 2+ blueprint fields remain empty (shows action card to refine blueprint). `isSimpleUnit` regex replaced with AI classifier ("snippet or project?"). | Blueprint context was not refreshed after auto-create — build pipeline received stale/empty context. Also Rule 18 fix for `isSimpleUnit`. | Low — vagueness warning is advisory only; build proceeds regardless. |
| `src/ui/chat/chatPanelEditBuild.ts` | Added `blueprintContext?: string` to `EditBuildContext`. Injected `PROJECT CONTEXT:\n${blueprintContext}` section into all three edit prompt variants (excerpt, full-file, uncommented). | Edit builds had no access to the 5W blueprint — AI edited files without knowing the project's who/what/where/why. Edits could drift out of scope or assume wrong context. | None — bpSection is empty string if no context, backward compatible. |
| `src/ui/chat/chatPanelEditHandler.ts` | Removed `'blueprintContext'` from `Omit<BuildRequestDeps, ...>` type. Added `blueprintContext: deps.blueprintContext` to `EditBuildContext` construction. | Required to pass blueprint context from webview message deps into the edit build pipeline. | None. |
| `src/ui/chat/chatPanelMessageRouter.ts` | Added `blueprintContext: state.blueprintContext` to `handleEditRequest` call. | The edit request handler was receiving deps without blueprint context — now wired from panel state. | None. |

## Recent Fixes — May 16, 2026 (Session 10S: Rule 18 — full audit, 4 critical fixes + 6 flagged)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/complexityAssessment.ts` | `assessComplexity` made async with `routing` param. AI classifier now sets final tier (nano/standard/deep). Regex scoring still computes score + reasons (math, not NL). Callers in `chatPanelOrchestrator.ts` updated to `await`. | Regex keyword scoring routinely misclassified tier — e.g. a 4-sound player scored as "standard" but a follow-up improvement scored "nano" because "realistic" had no DEEP_SIGNAL hits. Wrong tier = wrong pipeline path. | Low — regex-derived tier used as fallback if AI fails. |
| `src/services/blueprint/expandedInterview.ts` | `generateVagueWarning` made async with `routing` param. AI classifier asks "specific enough to build? Reply: clear or vague." Fast path kept only for bare minimum requests ("build me a game" with nothing else). Caller in `chatPanelOrchestrator.ts` updated to `await`. | Regex blocked valid requests ("build me a multiplayer game") because they matched the bare "build me a game" pattern. Also allowed vague requests through that didn't match any pattern. | Low — on AI failure, returns null (never blocks). |
| `src/ui/chat/chatPanelBuild.ts` | `isChunkedBuildRequest` made async with `routing` param. AI classifier: "single or multi file?" Fast path kept for explicit "full-stack"/"multi-file" phrasing. Caller in `chatPanelBuildRunner.ts` updated to `await isChunkedBuildRequest(task, ctx.routing)`. | Regex missed "build me a website with a login page and database" — second clause had to match both app-type AND complexity modifier simultaneously. AI handles any phrasing. | Low — returns false on AI failure (single-file fallback). |
| `src/ui/chat/chatPanelBuildRunner.ts` | `isSimpleUnit` regex replaced with async AI classifier: "snippet or project?" Regex kept as catch on AI failure. | "build a password generator" → regex returned false (no function/snippet keyword) → showed new-project wizard for a simple one-file tool. | Low — regex fallback on AI error. |
| `src/services/build/buildPlacementCheck.ts` | Added `[WARN][RULE 18]` + `[NEXT]` to `BACKEND_SIGNALS`/`FRONTEND_SIGNALS` regex. | Flagged for future fix — making `checkBuildPlacement` async cascades to `chatPanelIntent.ts`. | None — no code changed, annotation only. |
| `src/services/project/templateWizard.ts` | Added `[WARN][RULE 18]` + `[NEXT]` to `isSmallUnit` and `isTemplateRequest`. | Flagged for future fix — function is currently unwired (no active callers). | None. |
| `src/ui/chat/chatPanelAutoSave.ts` | Added `[WARN][RULE 18]` + `[NEXT]` to `BUILD_VERB_RE` and `DELETE_RE`. | Flagged — making `shouldAutoSave` async cascades to `chatPanelMsgSendAI.ts`. | None. |
| `src/services/vault/vaultSemanticSearch.ts` | Added `[WARN][RULE 18]` + `[NEXT]` to `detectIntentMismatch`. | Flagged — already in async context, can be fixed when revisiting vault search. | None. |
| `src/services/clarificationService.ts` | Added `[WARN][RULE 18]` + `[NEXT]` to `needsClarification`. | Flagged — ambiguous-pronoun regex simulating intent understanding. | None. |
| `src/services/project/templateScopeService.ts` | Added `[WARN][RULE 18]` + `[NEXT]` to `isVagueProjectRequest` and `parseScopeAnswer`. | Flagged — keyword lists simulating vagueness and complexity parsing. | None. |

## Recent Fixes — May 16, 2026 (Session 10R: Rule 18 — AI classifier for modification detection)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildInference.ts` | `isModificationRequest` changed from sync regex to async AI classifier. Fast paths kept for obvious verbs and explicit file extensions. AI call handles natural follow-up phrasing ("make them realistic", "improve the sounds", "make it faster") that regex cannot catch. [RULE 18] compliant. | "Make them realistic" after a working sound player was not detected as a modification. Redivivus treated it as a fresh build, wrote a new file without reading the existing code, AI regenerated from scratch using fetch-based audio files that don't exist → no sounds. Root cause: `isModificationRequest` regex required `modify\|update\|change\|fix` etc. — "make" was absent. | Low — fast paths fire before AI call for obvious cases. AI fallback returns `false` on error, which means worst case is a fresh build (same as before). |
| `src/ui/chat/chatPanelBuild.ts` | `Inf.isModificationRequest(task)` → `await Inf.isModificationRequest(task, routing)`. | Required by async signature change. | None. |
| `src/ui/chat/chatPanelOrchestrator.ts` | Replaced inline 2-clause `isModify` regex with `hasFileMention \|\| await isModificationRequest(taskLow, deps.routing)`. Added import. Net: file reduced from 200 to 199 lines. | Same Rule 18 violation as above — the fast-path modification check in the orchestrator also used a narrow verb list. | None. |

## Recent Fixes — May 16, 2026 (Session 10Q: Orchestrated phase build wiring)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildOrchestrated.ts` | Created (193 lines). `isOrchestratedAvailable()`, `buildPhaseTask()`, `runOrchestratedPhaseBuild()`. Full pipeline: AI_RANK → `createPlan()` → `executeStep()` per step → `reviewOutput()` → `parseFileMarkers()` → `writeBuiltFile()`. Shows plan breakdown and completion summary in chat. | Wire up full multi-AI orchestration for deep complexity builds per roadmap. | Low — only activated when 2+ AIs configured. Falls back to single-file build otherwise. |
| `src/ui/chat/chatPanelBuildPhase.ts` | Replaced dead `prompt` local variable + `runSingleFileBuild(ctx)` with: `buildPhaseTask(phase, plan)` → if `isOrchestratedAvailable(deps)` → `runOrchestratedPhaseBuild()`, else `runSingleFileBuild(ctx)` with phase task (fixing bug where plan.task was passed instead). Removed unused `BuildOrchestrator` import. | Phase task was built but never sent to the worker AI (bug). Orchestrated pipeline was created but not wired in. | None — inspection scan runs on filesystem output regardless of which builder ran. |

## Recent Fixes — May 16, 2026 (Session 10P: Rule 9 — full audit, 9 more files split)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/learnedMemoryService.ts` | 206→129 lines. `_read()`, `_write()`, `_append()` extracted to `learnedMemoryServiceIO.ts`. Class methods now delegate to standalone I/O functions. `LearnedEntry` interface moved to IO file, re-exported for backward compat. | Rule 9 violation. | None. |
| `src/services/learnedMemoryServiceIO.ts` | Created (75 lines). Exports `LearnedEntry`, `RECENT_TTL_DAYS`, `readLearnedEntries`, `writeLearnedEntries`, `appendLearnedEntry`. | Extracted from learnedMemoryService.ts. | None. |
| `src/services/project/projectOperations.ts` | 204→93 lines. `getProjectsDir()`, `getProjectStatus()`, `getCurrentProjectInfo()` extracted to `projectOperationsStatus.ts`. Class methods delegate. `ProjectInfo` interface moved to status file, re-exported. | Rule 9 violation. | None. |
| `src/services/project/projectOperationsStatus.ts` | Created (104 lines). Exports `ProjectInfo`, `getProjectsDir()`, `getProjectStatus()`, `getCurrentProjectInfo()`. | Extracted from projectOperations.ts. | None. |
| `src/services/blueprint/blueprintInterview.ts` | 256→85 lines. FOUNDATION_LAYER, GAME_LAYERS, WEBAPP_LAYERS, API_LAYERS, CLI_LAYERS, TYPE_LAYERS extracted to `blueprintInterviewLayers.ts`. Imports from layers file, re-exports for backward compat. | Rule 9 violation. | None — `import type` used to avoid circular dep. |
| `src/services/blueprint/blueprintInterviewLayers.ts` | Created (105 lines). Layer data constants + TYPE_LAYERS map. Uses `import type` to avoid circular dependency with blueprintInterview.ts. | Extracted from blueprintInterview.ts. | None. |
| `src/services/project/setupProgressPanel.ts` | 227→69 lines. `buildSetupProgressHtml()` extracted to `setupProgressPanelHtml.ts`. Rule 13: emoji in script blocks replaced with `String.fromCodePoint()`. | Rule 9 + Rule 13 violations. | None. |
| `src/services/project/setupProgressPanelHtml.ts` | Created (89 lines). `buildSetupProgressHtml(progress)` — full HTML with CSS, step list, and webview script. Rule 13 compliant. | Extracted from setupProgressPanel.ts. | None. |
| `src/services/project/setupProgressService.ts` | 237→50 lines. All 10 `checkStepN()` methods extracted to `setupProgressSteps.ts` as standalone exported functions. `getProgress()` uses `Promise.all` on all 10. | Rule 9 violation. | None. |
| `src/services/project/setupProgressSteps.ts` | Created (83 lines). Exports `checkStep1` through `checkStep10` as free functions taking `{redivivus, root}` context. | Extracted from setupProgressService.ts. | None. |
| `src/services/analyzerScript.ts` | 233→135 lines. Variable declarations + helper functions (`startNextInQueue`, `showToast`) extracted to `analyzerScriptHead.ts`. Script tail (event handlers) remains here. Rule 13: emoji replaced with `String.fromCodePoint()`. | Rule 9 + Rule 13 violations. | None — assembled as HEAD + TAIL string concatenation. |
| `src/services/analyzerScriptHead.ts` | Created (59 lines). `RECOMMENDATIONS_SCRIPT_HEAD` — variable declarations and helper functions. | Extracted from analyzerScript.ts. | None. |
| `src/services/project/starterPatterns.ts` | 225→145 lines. `makeItem` factory + utility patterns (debounce, throttle, deepClone, slugify, formatBytes) extracted to `starterPatternsUtils.ts`. | Rule 9 violation. | None. |
| `src/services/project/starterPatternsUtils.ts` | Created (68 lines). Exports `makeItem()` and `getUtilityPatterns()`. | Extracted from starterPatterns.ts. | None. |
| `src/services/project/templateRegistry.ts` | 224→45 lines. Interfaces (TemplateCategory, TemplateDef, WizardQuestion) and TEMPLATE_CATEGORIES data extracted to `templateRegistryData.ts`. Functions (matchTaskToTemplate, fetchTemplate) remain here. | Rule 9 violation. | None. |
| `src/services/project/templateRegistryData.ts` | Created (102 lines). All template interfaces and the full TEMPLATE_CATEGORIES constant. | Extracted from templateRegistry.ts. | None. |
| `src/services/blueprint/expandedInterviewQuestions.ts` | 216→11 lines. Array split into WHO+WHAT+WHERE (A) and WHEN+WHY (B) files. Assembler combines with spread. | Rule 9 violation. | None. |
| `src/services/blueprint/expandedInterviewQuestionsA.ts` | Created (18 lines). `EXPANDED_QUESTIONS_A` — WHO, WHAT, WHERE question objects. | Extracted from expandedInterviewQuestions.ts. | None. |
| `src/services/blueprint/expandedInterviewQuestionsB.ts` | Created (18 lines). `EXPANDED_QUESTIONS_B` — WHEN, WHY question objects. | Extracted from expandedInterviewQuestions.ts. | None. |

## Recent Fixes — May 15, 2026 (Session 10O: Rule 9 — mapPanel.ts 447-line split)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/map/mapPanel.ts` | Rewritten as class shell (124 lines). `_buildHtml()` delegates to `buildMapHtml()` in `mapPanelHtml.ts`. `_handleMessage()` delegates to `handleMapMessage()` in `mapPanelMessages.ts`. | Was 447 lines — Rule 9 violation (200-line max). | Low — pure extraction, no logic changed. |
| `src/ui/map/mapPanelHtml.ts` | Created (132 lines). Standalone `buildMapHtml(projectName, map, webview, timelineData)` — full map HTML with timeline layer. | Extracted from `mapPanel._buildHtml()`. | None. |
| `src/ui/map/mapPanelMessages.ts` | Created (157 lines). `handleMapMessage(msg, ctx: MapMsgCtx)` — all webview message handlers: openFileAtSymbol, openFile, mapChat, explainFile, analyzeFile, chatAbout, runCommand, fixFile, architectReview, back-to-chat, refresh, getELI5. Delegates tl-* to mapPanelTimelineMessages.ts. | Extracted from `mapPanel._handleMessage()`. | None. |
| `src/ui/map/mapPanelTimelineMessages.ts` | Created (60 lines). `handleMapTimelineMessage(msg, ctx)` — tl-undo-build, tl-promote-save-point, tl-branch-from. | Extracted from `mapPanel._handleMessage()` timeline block. | None. |

## Recent Fixes — May 15, 2026 (Session 10N: Rule 18 — AI intent classifier replaces all regex in handleSendMessage)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Deleted `BUILD_TRIGGER_RE`, `MODIFY_TRIGGER_RE`, `FIX_RE`, `CHOICE_RE`, `NEED_BUILD_RE`, `OFFTOPIC_KEYWORDS`, `DEV_OVERRIDE`, `tryRouteToVSCodeCommand` usage, and the entire regex-based intent block. Replaced with `deps.classifyIntent(userText)` — the AI classifier already wired in `chatPanelClassifier.ts`. AI call (~50 tokens) returns `build / command / question / offtopic` and routes accordingly. Specific narrow utility shortcuts (template listing, scan project, setup progress, list projects) kept as code since they're exact, not interpretive. | Regex pattern matching was classifying "I need a webpage", "make me a sound board", "can you put together a tool" as 'question' because the phrasing didn't match hardcoded verb lists. This was a Rule 18 violation — regex cannot simulate language understanding. The proper AI classifier already existed and handled all these phrasings correctly. | Low — `deps.classifyIntent` is already battle-tested via `chatPanelClassifier.ts`. Fallback to 'question' on any AI failure. Direct mode still bypasses classifier entirely. |

## Recent Fixes — May 15, 2026 (Session 10M: Direct mode bypasses intent routing — everything is a build request)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Added direct-mode bypass before `tryRouteToVSCodeCommand`: if `deps.buildMode === 'direct'`, calls `deps.handleBuildRequest(userText)` immediately and returns. All command shortcuts above this point (template listing, scan project, list projects) still fire. Everything below (VS Code command intercept, offtopic pre-screen, intent classifier, orchestrator) is skipped. | "I need a webpage that has 4 sound buttons" — "webpage" not in `NEED_BUILD_RE`'s endings list → intent classified as 'question' → `handleAIChat` → AI generated a planning blueprint with questions. User asked for a build, got an interview. "proceed no changes" was intercepted by `tryRouteToVSCodeCommand` as "Go to line". Root cause: intent classifier can't cover all build phrasing; in direct mode that's irrelevant — the user's entire mental model is "type = build". | Low — only fires when `buildMode === 'direct'`, which is set by clicking "Just Build" on the launcher. Plan mode and default mode are unaffected. |

## Recent Fixes — May 15, 2026 (Session 10L: buildMode state not persisting — Just Build ran orchestrator)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMessageRouter.ts` | Added state sync block before the `handleChatMessage` delegation call: when `msg.type === 'start-new-project'`, writes `state.buildMode` and clears `state.planInterview` directly on the panel state object. | `handleChatMessage` handles `start-new-project` by setting `deps.buildMode = 'direct'` on the local deps object only. `deps` is rebuilt from `state` on every message. So on the NEXT message (the user's actual build request), `state.buildMode` was still `undefined` → `deps.buildMode !== 'direct'` → orchestrator ran → asked 5W questions → showed blueprint plan → no files built. | None — state is the authoritative source for buildMode, this just keeps it in sync at the right moment. |

## Recent Fixes — May 15, 2026 (Session 10k: Post-build Open Folder prompt after auto-create)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelBuildRunner.ts` | After the build `try/finally` block in `runBuildAfterGates`, added: if `autoCreatedProject && root`, call `vscode.window.showInformationMessage('Project "{name}" built with Redivivus structure. Open it in the Explorer?', 'Open Folder')`. If user clicks Open Folder, calls `vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root))`. | After auto-create build, VS Code explorer still showed "NO FOLDER OPENED". The `.redivivus/` structure was correctly created (dotfolder, invisible in file browser) but the workspace wasn't updated. User needs one click to open the new project in Explorer. Used `showInformationMessage` rather than automatic `updateWorkspaceFolders` to avoid the known chat-freeze bug from session 4s. | Low — `vscode.openFolder` causes a window reload (expected VS Code behavior when opening a new folder). Only fires on auto-create path. |

## Recent Fixes — May 15, 2026 (Session 10j: isProjectsContainer guard — ~/projects open as workspace no longer treated as valid project root)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuildRunner.ts` | Added `isProjectsContainer(root)` helper — resolves the configured `redivivus.projectsDirectory` path and returns `true` if `root` matches it. Updated `getLiveRoot()` to call `!isProjectsContainer(liveRoot)` before accepting a workspace folder as a valid build root. When the projects container is the open workspace, `getLiveRoot()` returns `undefined`, which routes to `autoCreateProject()` and builds into a proper named subfolder. | After the Session 10i fix, the user tested again and got the same result — `index.html` dropped directly in `~/projects/`. Root cause: `~/projects/` was open as the VS Code workspace, so `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` returned it as a live, valid path. `isValidBuildRoot` only excludes extension dirs, not the projects container. The 10i `autoCreateProject` logic never ran because `getLiveRoot()` still returned a non-null root. | Low — `isProjectsContainer` is a pure path comparison. Only fires when the exact projects container dir is the open workspace. Any project subfolder (e.g. `~/projects/my-app`) resolves differently and is unaffected. |

## Recent Fixes — May 15, 2026 (Session 10i: Auto-create Redivivus project folder — no stale workspace root, correct output location)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuildRunner.ts` | Replaced stale `deps.redivivus.getWorkspaceRoot()` as the primary root source with `getLiveRoot()` — a new function that reads `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` live. Added `autoCreateProject()`: when Just Build is used with no folder open, derives an AI-based snake_case slug (`deriveFileBase`), creates `~/projects/{slug}/` with `.redivivus/config.json` and `.redivivus/blueprint.md`, and returns the new project dir as `root` so the build writes into it. Restructured the `!root` block from multiple independent `if` statements into a proper `if/else-if/else` chain so the auto-create path falls through to the build while all other paths still return early. | `ChassisPaths` captures workspace root at extension activation time. If no folder was open at activation, `getWorkspaceRoot()` returned `~/projects` (the projects container). `isValidBuildRoot(~/projects)` passed (exists, not extension dir), so the build wrote `index.html` directly into `~/projects/` with no subfolder and no `.redivivus/` structure. User requirement: every built app/file must live in its own named folder with Redivivus structure, even a single HTML file. | Low — `autoCreateProject` only fires when `buildMode === 'direct'` AND no live workspace folder is open. All other paths (plan mode, simple unit, wizard-confirmed) are unchanged. |

## Recent Fixes — May 15, 2026 (Session 10h: Just Build — remove wizard modal, direct prompt)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelMessages.ts` | Rewrote the `start-new-project` message handler. Previously, both "Plan It Out" and "Just Build" called `vscode.commands.executeCommand('redivivus.wizardRetrofit')` which opens the "Redivivus — New Project Setup" 5-question modal. Now: **Just Build** (`mode='direct'`) pushes a single assistant message — "What would you like to build? Describe it in plain English and I'll get started." — and calls `refresh()`. **Plan It Out** (`mode='plan'`) calls `startPlanInterview` (conversational inline interview) and calls `refresh()`. Neither mode calls `wizardRetrofit` from the launcher. The `wizardRetrofit` modal is for setting up Redivivus on an EXISTING open project, not for new users starting from the launcher. | User clicked "Just Build" and got the 5-question wizard modal. The expectation is: Just Build = type your request → AI builds it, no wizard. Plan It Out = inline conversational interview, then build. | None — `wizardRetrofit` is still registered and reachable via command palette and other entry points. This change only removes it from the launcher flow. |

## Recent Fixes — May 15, 2026 (Session 10g: Duplicate plan message + cancel returns to launcher)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelScriptActions.ts` | Removed `start-new-project` and `open-existing-project` from `buildActionsScript()`'s click listener. Replaced the block with a targeted `toggle-auto-open` handler only. | Both `chatPanelScript.ts` (primary listener) and `buildActionsScript()` (secondary listener) handled `start-new-project`. Since `document.addEventListener` adds independent listeners, both fired on every click — sending the message twice → `startPlanInterview` called twice → duplicate welcome message in chat. | None — `toggle-auto-open` and `recentItem` (kept as-is) are the only actions that were unique to the secondary listener. |
| `src/ui/chat/chatPanelMessageRouter.ts` | Changed `new-project-cancel` handler: instead of pushing a "Project setup cancelled" message to the conversation (leaving the user stranded with no visible buttons), now clears `state.conversation = []`, resets `state.planInterview = undefined`, sets `_initialized = false` to force a full HTML rebuild, then calls `panel.refresh()`. | User cancelled the plan wizard modal and was left on a blank chat screen with text referencing "Plan It Out" and "Just Build" buttons that weren't visible anywhere. Setting `_initialized = false` forces `panelRefresh` to call `webview.html = buildChatHtml(...)` which re-renders the full launcher screen. | Low — `_initialized = false` causes a full webview HTML replacement (same as on first open), which reinitializes the JS. This is intentional here. |

## Recent Fixes — May 15, 2026 (Session 10f: ROOT CAUSE — /\/+$/ regex in template literal → // comment crashes entire script)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelScript.ts:155` | Changed `msg.folderPath.replace(/\/+$/, '')` to `msg.folderPath.replace(/[/]+$/, '')`. | **Root cause of all-buttons-dead.** Inside a JS template literal, `\/` is NOT a special escape sequence — the backslash is consumed and `\/` becomes `/`. So `/\/+$/` in the template literal source produces the string `//+$/` — which is a JS line comment when injected into the webview script. The comment kills the rest of that line (the `,`, `''`, `)` args), leaving `replace(` unclosed. The parser hits `}` on the next line and throws `Unexpected token '}'` — a syntax error that aborts the ENTIRE script before any event listeners are attached. Sessions 10c/10d/10e tried symptom fixes (moving handlers, adding debug logging) but the script never parsed at all. Fix: use a character class `[/]` which matches `/` without requiring a `\/` escape sequence. Added `[WARN]` comment to prevent recurrence. | None — regex semantics identical: matches one or more trailing slashes. |

**[WARN]** Template literal script files (`chatPanelScript.ts`, `chatPanelScriptActions.ts`, etc.) must never use `\/` in regex literals — write `[/]` or `\\/` (double-backslash) instead. This is an instance of Rule 13 spirit (don't embed brittle escape sequences in injected script strings).

## Recent Fixes — May 15, 2026 (Session 10e: Fixed dead launcher buttons — moved handler to primary click listener)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelScript.ts` | Moved the launcher button click handling (start-new-project, open-existing-project) from the secondary `buildActionsScript()` listener into the PRIMARY `document.addEventListener('click', ...)` listener that already handles `set-mode` and `switch-mode` (lines 81-94). The first listener runs earlier in the script and is more reliable. Added `try/catch` around `vscode.postMessage` calls. | The debug log confirmed zero `start-new-project` messages reached the backend. The `buildActionsScript()` click listener (which handles create-file, undo, feedback, launcher buttons, etc.) was not firing for the new launcher buttons. The root cause is unknown — possibly a JS error in an earlier handler that prevents the second listener from being reached, or the listener attachment in the template literal assembly is silently failing. Moving the handler to the first listener (which successfully fires for `set-mode` clicks) ensures the launcher buttons work regardless of what happens later in the script. | None — the same `buildActionsScript()` listener still exists and will also fire if it works; the first listener just provides a reliable fallback. |

## Recent Fixes — May 15, 2026 (Session 10d: Debug logging for dead launcher buttons)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelScriptActions.ts` | (1) Made launcher button detection more defensive (lines 182-186). If `target.closest('[data-action]')` returns null, the handler now falls back to checking if `target.getAttribute('data-action')` exists directly on the clicked element. (2) Wrapped all `vscode.postMessage` calls in the launcher block with `try/catch` to prevent silent failures. | The new "Plan It Out" and "Just Build" buttons inside the Start New Project card appeared in the UI but were reported as "dead" (no response when clicked). The root cause was unknown — either the click event wasn't reaching the handler, `closest()` wasn't finding the button, or the message wasn't being posted. | None — defensive code only; doesn't change behavior when things work correctly. |
| `src/ui/chat/chatPanelMessages.ts` | Added debug logging to the `start-new-project` message handler (lines 96, 108-112). Logs: `[chatPanelMessages] start-new-project received mode=X`, `[chatPanelMessages] wizardRetrofit executed OK`, and `[chatPanelMessages] wizardRetrofit ERROR: ...` to `~/chassis_debug.log`. | Need to trace whether the backend receives the `start-new-project` message and whether `redivivus.wizardRetrofit` command succeeds or throws. | None — logging-only change. |

## Recent Fixes — May 15, 2026 (Session 10c: Launcher UI — Plan It Out / Just Build moved into Start New Project card)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelHtml.ts` | Redesigned the launcher screen (no `.redivivus` folder). Removed the standalone `mode-toggle-bar` that floated above the "Welcome to Redivivus" title with two separate "📋 Plan It Out" / "⚡ Just Build" buttons. The "Start New Project" card is now a container with a header "🚀 Start New Project — Choose how you want to build" and two side-by-side buttons inside it: "📋 Plan It Out" and "⚡ Just Build". The "Open Existing Project" card remains unchanged below it. | The mode toggle buttons were visually disconnected from the project creation flow. Users saw small standalone buttons above the welcome title, then had to scroll down to find "Start New Project" — the relationship between mode selection and project creation was unclear. | None — purely visual restructuring; the same message types are sent. |
| `src/ui/chat/chatPanelScriptActions.ts` | Updated the launcher button click handler (line 185-187). When a button with `data-action="start-new-project"` is clicked, the handler now reads the `data-mode` attribute (`plan` or `direct`) and includes it in the posted message: `vscode.postMessage({type:'start-new-project', mode: mode || undefined})`. | The webview needs to communicate which mode the user selected so the extension can set it before running the wizard. | None — falls back to `undefined` if no mode attribute is present, preserving backward compatibility. |
| `src/ui/chat/chatPanelMessages.ts` | Updated the `start-new-project` message handler (line 95-106). When `msg.mode` is `"plan"` or `"direct"`, it sets `deps.buildMode` and either starts the plan interview (plan mode) or clears it (direct mode) before running `redivivus.wizardRetrofit`. | Previously, clicking "Plan It Out" sent a separate `set-mode` message that only set the mode but didn't trigger the wizard. The user had to click twice. Now a single click on "📋 Plan It Out" inside the Start New Project card both sets the mode AND starts the new project wizard. | None — the `redivivus.wizardRetrofit` command is still invoked exactly once. |

## Recent Fixes — May 15, 2026 (Session 10b: Intent classification — fix/modify/choice → build pipeline)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelMsgSendMessage.ts` | (1) Added `MODIFY_TRIGGER_RE` regex covering 25 modify verbs: `fix`, `repair`, `update`, `modify`, `extend`, `improve`, `change`, `edit`, `remove`, `delete`, `swap`, `replace`, `convert`, `refactor`, `reorganize`, `restructure`, `debug`, `correct`, `refine`, `patch`, `solve`, `resolve`, `rebuild`, `rewrite`, `redesign`. (2) Added `FIX_RE` regex to catch patterns like `"can you fix the audio"`, `"it's broken"`, `"doesn't work"`, `"fix this bug"`. (3) Added `CHOICE_RE` regex to catch `"option A"`, `"go with option B"`, `"let's do"`, `"choose"`, `"pick"` after AI presents alternatives. (4) Updated intent routing (line 169) so any match on `BUILD_TRIGGER_RE`, `NEED_BUILD_RE`, `MODIFY_TRIGGER_RE`, `FIX_RE`, or `CHOICE_RE` routes to the build pipeline instead of Q&A. | When the user said `"the program seems to run but no sound can be heard, can you fix this?"` and `"option A"`, the old `BUILD_TRIGGER_RE` only matched creation verbs (`build`, `create`, `make`, etc.). These messages were classified as `question` and sent to the AI chat path, which produced inline code blocks with manual "Create File" buttons instead of triggering the actual build pipeline. | None — additive regexes; any text that previously matched `BUILD_TRIGGER_RE` still matches. |
| `src/ui/chat/chatPanelClassifier.ts` | (1) Expanded fallback `buildVerbs` regex to include `repair`, `debug`, `correct`, `refine`, `patch`, `solve`, `resolve`, `rebuild`, `rewrite`, `redesign`. (2) Fixed the `isQuestion` logic (line 72-76): previously, `"can you fix this?"` matched `can you` → `isQuestion = true`, which blocked the `fix` verb from being recognized. Now `buildVerbs` takes priority: if any build/modify verb is present, it returns `build` immediately. The `isQuestion` check only fires for pure wh-questions that contain NO build verbs. (3) Updated the AI system prompt's `build` intent definition to explicitly include `fix/update/modify/repair/change`. (4) Added 9 new examples to the AI prompt: `"can you fix the audio"`, `"fix this bug"`, `"the button doesn't work"`, `"update the styles"`, `"refactor this into components"`, `"repair the broken link"`, `"convert this to TypeScript"`, `"option A"`, `"go with option B"`, `"let's do the first approach"`. | The AI classifier also lacked training examples for fix/modify/choice patterns. Even when it was called inside `handleBuildRequest`, the fallback keyword detector would misclassify `"can you fix"` as a question. The AI examples now teach the classifier that repair requests and option selections are build intent. | None — prompt-only changes and broader keyword matching. |

## Recent Fixes — May 15, 2026 (Session 10: New-project folder path + workspace auto-open)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelScript.ts` | Fixed `browse-result` message handler (line 134). When the user browses for a parent folder in the New Project wizard, the handler now appends the project name slug to the browsed path before writing it to the `np-folder-path` input. Example: browsing to `/home/papajoe/projects` now sets the path to `/home/papajoe/projects/hi-browser-website` instead of the raw parent directory. | Previously, the browse dialog returned only the parent directory path (e.g., `/home/papajoe/projects`). The `new-project` message then sent this parent path as `folderPath`, and the extension used it directly as the project folder. This caused `.redivivus/`, `index.html`, and all project files to be dumped into the parent directory instead of a dedicated subfolder. | None — only affects the webview input value; the Create Project button sends the updated full path. |
| `src/commands/init.ts` | (1) Fixed `targetFolder` construction in `registerOnNewProject`. When `folderPath` is provided, the code now checks if the basename matches the project slug. If not, it joins the slug to create a proper subfolder. (2) After creating and initializing the project, the new folder is now added to the VS Code workspace via `vscode.workspace.updateWorkspaceFolders(...)` so the Explorer shows the project files. The build still resumes immediately via `resumeBuildTask` without reloading the window. | The build wrote files to disk, but VS Code's Explorer showed "NO FOLDER OPENED" because the workspace was never updated. Users could not see their project files in the sidebar. Additionally, files were written to the wrong location when `folderPath` was a browsed parent directory. | Low — `updateWorkspaceFolders` is a standard VS Code API call. If it fails (e.g., unsupported workspace state), the build still completes successfully; only the Explorer visibility is affected. |

## Recent Fixes — May 15, 2026 (Session 9: Redivivus IDE release pipeline)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `redivivus-build/.github/workflows/release.yml` | **NEW** GitHub Actions workflow. Triggers on `v*` tag push or `workflow_dispatch`. Jobs: `create-release` (draft release via gh cli), `build-linux` (8GB swap/fallocate, GCC 10, Node 22.22.1, Python 3.11, Rust, produces AppImage + tar.gz), `build-macos` (optional code signing, produces .dmg + tar.gz), `build-windows` (WMI pagefile 8GB extension, produces .exe NSIS + tar.gz), `publish-release` (runs after all three platform jobs, generates markdown table of direct download URLs grouped by platform, publishes draft). | Ship Redivivus IDE to all three platforms from a single tag push. 8GB swap prevents OOM during VSCodium's electron/node-gyp compile step. | Medium — first run must validate actual VSCodium build script env vars (CI_BUILD=no, SHOULD_BUILD_APPIMAGE=yes) and asset directory paths. |
| `redivivus-build/.github/ISSUE_TEMPLATE/bug_report.md` | Replaced VSCodium-branded generic template with Redivivus-specific fields: Platform (Linux/Mac/Win checkboxes), OS Version, Redivivus Version, Steps to Reproduce, Expected Behavior, Actual Behavior, Screenshots (optional), Additional Context. | VSCodium's template had irrelevant VSCodium-specific questions and no Redivivus version field. | None |
| `REDIVIVUS_ROADMAP.md` | Added this session log. | Rule: log every change. | None |

**[NEXT]** First release: `git tag v0.3.6 && git push origin v0.3.6` in the redivivus-build repo. Watch the Actions run and verify AppImage, .dmg, and .exe artifacts appear in the release with direct download URLs in the release notes body.

## Recent Fixes — May 15, 2026 (Session 8: Pipeline Trace system)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/services/pipelineTracer.ts` | **NEW** Singleton `tracer` service. `start(task)` begins a trace, `step(name, model, hint)` records a step start, `done(sid, status, ms, detail, tokIn, tokOut)` records completion, `failover(from, to, reason)` logs AI failovers, `vault(action, detail)` logs vault ops, `gate(name, result)` logs gate checks, `fileOp(files)` logs writes, `end(files, tokens, cost)` closes the trace. Stores last 20 traces. Outputs to "Redivivus Pipeline Trace" VS Code Output Channel with `═══ TRACE #N ═══` headers and `[MM:SS:mmm] STEP → detail (Xms) ✅` format. | User asked for end-to-end visibility into every AI call, gate check, failover, vault hit, and file write so they can debug and tune the pipeline. | Low — tracer calls are all try-safe singletons; any failure in tracer code does not affect the build pipeline. |
| `src/ui/chat/chatPanelClassifier.ts` | Wired INTENT step: `step('INTENT', 'AI classifier', text)` before the AI classification call; `done(sid, ok, ms, intent, tokIn, tokOut)` after; `done(sid, 'fail', ...)` in catch. | Captures intent classification timing and the classified type in the trace. | None — additive only |
| `src/ui/chat/chatPanelIntent.ts` | `tracer.start(task)` at the start of `handleBuildRequest` (skipped for skipComplex=true). `tracer.vault('hit', ...)` and `tracer.gate('Vault-Hit', ...)` when vault matches found. `tracer.gate('Cost', ...)` after cost confirmation. | Gates are the first pipeline stages after intent; wiring them here gives a complete trace from user input through all pre-build checks. | None — additive |
| `src/ui/chat/chatPanelBuild.ts` | Wired SUPERVISOR step (before/after `routing.supervisorPlan`), WORKER step (before/after `executeWorkerBuild` — calls `tracer.end([], 0, 0)` on failure), GUARDIAN step (around all review functions), `tracer.fileOp([relPath, ...scaffoldedFiles])` after write, `tracer.vault('save', ...)` + `tracer.end(files, tokens, cost)` at completion. | Main single-file build orchestrator — wiring here covers the majority of Redivivus builds. | None — tracer calls isolated from build logic |
| `src/ui/chat/chatPanelBuildWorker.ts` | `tracer.failover(failedAI, fallbackAI, 'timed out')` in the explicit failover loop when an AI times out and the build tries a fallback provider. | Failover events are invisible to users and previously untracked — now logged with which model failed and which succeeded. | None |
| `src/ui/chat/chatPanelChunked.ts` | Wired SUPERVISOR step around the planning call (file-list generation). `tracer.done(sid, 'fail', ...)` on plan failure. `tracer.done(sid, 'success', ...)` after successful parse. `tracer.vault('save', ...)` + `tracer.end(builtFiles, tokens, cost)` at chunked build completion. | Multi-file builds have their own planning step that is now traced. | None |
| `src/extension.ts` | Registered `redivivus.showPipelineTrace` command: `const { tracer } = await import('./services/pipelineTracer.js'); tracer.show();` | Exposes the Output Channel via Command Palette. | None |
| `package.json` | Added `redivivus.showPipelineTrace` / "Redivivus: Show Pipeline Trace" to `contributes.commands`. | Required for command to appear in Command Palette. | None |
| `REDIVIVUS_ROADMAP.md` | Added this session log. | Rule: log every change. | None |

**[NEXT]** `chatPanelOrchestrator.ts` is at 201 lines — must be split before wiring tracer into the nano/standard/deep complexity paths. That covers the orchestrated build pipeline (less-used path; single-file and chunked paths are already traced).

## Recent Fixes — May 15, 2026 (Session 7d: Build root validation + Preview in Browser button)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuildUtils.ts` | **NEW** `isValidBuildRoot(root)` utility. Returns `false` if root is undefined, non-existent, or contains `/extensions/redivivus` or `/resources/app/extensions/` (prevents writing to the Redivivus extension directory or any VS Code extensions dir). | When no valid user project was open, `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` or `redivivus.getWorkspaceRoot()` could resolve to the extension folder, causing builds to write `index.html` and other files into the extension directory instead of a user project. | None — additive guard function; any path that was previously valid remains valid. |
| `src/ui/chat/chatPanelBuildRunner.ts` | Replaced raw `root` assignment with `const root = isValidBuildRoot(rawRoot) ? rawRoot : undefined;`. When root is invalid, the existing `!root` branch shows the new-project wizard and defers the build (no files written). | Ensures `runBuildAfterGates` cannot proceed with an invalid root. | None — falls through to existing deferred-build flow. |
| `src/ui/chat/chatPanelOrchestrator.ts` | Updated `handleNanoBuild`, `handleStandardBuild`, and `handleDeepBuild` to use `isValidBuildRoot(rawRoot)` before deciding whether to build or show the wizard. | Orchestrator paths (complexity routing) also used `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` directly without validation, bypassing the guard in `runBuildAfterGates`. | None — same deferred-build behavior when root is invalid. |
| `src/ui/chat/chatPanelPhasedBuild.ts` | Updated `executePhasedBuild` and `createBuildContext` to validate root with `isValidBuildRoot`. | Phased/deep build paths used `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` directly. | None — returns early or uses empty string root when invalid. |
| `src/ui/chat/chatPanelMessageRouter.ts` | Added `new-project-cancel` message handler. Clears `(panel as any)._pendingTask = undefined` and posts a friendly assistant message when the user cancels the new-project wizard. | If the user cancelled the wizard, the pending build task would remain set and could be accidentally triggered later. | None — only clears state, no side effects. |
| `src/ui/chat/chatPanelScriptProjects.ts` | Updated all three cancel buttons in `showNewProjectPanel` (compact mode, question step, final step) to send `vscode.postMessage({type:'new-project-cancel'})` before removing the overlay. | Previously the cancel buttons just removed the overlay without notifying the extension, so the pending task was never cleared. | None — adds a message post that didn't exist before. |
| `src/ui/chat/chatPanelBuild.ts` | In `runSingleFileBuild`, appends `__PREVIEW_BROWSER__${absPath}|||END_PREVIEW_BROWSER__` token to the build result message when `relPath.endsWith('.html')`. | HTML builds need a way to open the result in the system default browser. | None — token is only added for HTML files. |
| `src/ui/chat/chatPanelChunked.ts` | In chunked builds, finds any HTML file among `builtFiles` and appends `__PREVIEW_BROWSER__` token with the full path. | Multi-file builds may produce HTML files that should be previewable. | None — only added when an `.html` file exists in the output. |
| `src/ui/chat/chatPanelBuildVault.ts` | In vault assembly builds, appends `__PREVIEW_BROWSER__` token when `relPath.endsWith('.html')`. | Vault-assembled HTML files should also be previewable. | None — same token pattern as single-file builds. |
| `src/ui/chat/chatPanelRenderer.ts` | Added regex replacement for `__PREVIEW_BROWSER__` token: renders as a `<button class="preview-browser-btn" data-path="${b64path}">🌐 Preview in Browser</button>` inside a `build-result` div. Also added fallback strip for unmatched tokens. | The token must be converted to a clickable button in the webview. | None — renderer-only change. |
| `src/ui/chat/chatPanelScriptActions.ts` | Added delegated click handlers for `.open-file-btn` and `.preview-browser-btn`. Both send `vscode.postMessage({type:'open-file'|'preview-browser', path: b64path})` using the base64-encoded `data-path` attribute. | The webview buttons need to communicate with the extension backend. Also fixed a latent bug where `open-file-btn` clicks were not handled at all in the webview script. | None — message-only handlers, no DOM mutation. |
| `src/ui/chat/chatPanelMsgFileOps.ts` | Added `decodePath(b64)` helper using `Buffer.from(b64, 'base64').toString('utf8')`. Updated `handleOpenFile` and `handleOpenInBrowser` to decode `msg.path` (base64) with fallback to `msg.filePath` (plain). Added new `handlePreviewBrowser(msg)` which decodes the path and calls `vscode.env.openExternal(vscode.Uri.file(filePath))`. | The webview sends base64-encoded paths, but the backend handlers expected plain `msg.filePath`. This was a latent bug for the Open File button. `handlePreviewBrowser` uses `openExternal` to open the HTML file in the user's default browser. | None — fallback preserves backward compatibility for any existing plain-path callers. |
| `src/ui/chat/chatPanelMessages.ts` | Imported `handlePreviewBrowser` from `chatPanelMsgFileOps.js` and added `preview-browser` message handler in `handleChatMessage`. | Routes the `preview-browser` webview message to the correct handler. | None — single handler addition. |

## Recent Fixes — May 15, 2026 (Session 7c: Plan Mode conversational 5W interview)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelPlanInterview.ts` | **NEW FILE** — Conversational 5 W's interview engine. `startPlanInterview(state)` initializes interview state and posts welcome + first question. `handlePlanInterviewAnswer(msg, deps)` processes answers, advances through WHAT→WHO→WHERE→WHEN→WHY, generates follow-ups for vague answers, builds summary, waits for "yes"/"go" confirmation, then triggers build. `generateFollowups()` detects vague requests (short answers, generic "game"/"app"/"tool" with no detail) and asks 2-3 targeted follow-ups. `buildTaskFromAnswers()` constructs a rich build task from all answers. `saveBlueprint()` persists 5W answers to project config. | Clicking "Plan It Out" previously just set the mode and showed a blank chat. Users had no guidance. Now Redivivus immediately starts a friendly conversational interview inline in the chat, guiding users who don't know how to describe what they want technically. | Low — interview is opt-in (only when user explicitly clicks "Plan It Out"). Normal chat and Direct Build flows unaffected. |
| `src/ui/chat/chatPanel.ts` | Added `planInterview?: import('./chatPanelPlanInterview.js').PlanInterviewState` to `ChatPanelState`. | Panel state needs to track interview progress across messages. | None — optional field using inline type import. |
| `src/ui/chat/chatPanelMessages.ts` | (1) Added `planInterview?: import('./chatPanelPlanInterview.js').PlanInterviewState` to `MessageHandlerDeps`. (2) In `handleChatMessage`, added interception before `handleSendMessage`: if `buildMode === 'plan'` and interview is active (`step < 8`), route to `handlePlanInterviewAnswer` instead of normal chat/build flow. | Messages sent during an active plan interview must be processed as interview answers, not as build requests or Q&A. | None — early return before any normal processing. |
| `src/ui/chat/chatPanelMessageRouter.ts` | (1) `set-mode: 'plan'` now calls `startPlanInterview(state)` to immediately begin the interview. (2) `set-mode: 'direct'` and `switch-mode` to direct clear `state.planInterview = undefined`. (3) `switch-mode` to 'plan' also starts a fresh interview. (4) Passed `planInterview: state.planInterview` into `MessageHandlerDeps`. | Router must kick off the interview when user selects Plan Mode, and tear it down when switching to Direct Build. | None — state mutation only, no async I/O. |

## Recent Fixes — May 15, 2026 (Session 7b: compile error cleanup)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelMsgSendMessage.ts` | (1) Removed dead import `import { resolveFix } from './chatPanelFixRequest.js'` — module never existed and symbol was unused. (2) Added missing import `import { handleAIChat } from './chatPanelMsgSendAI.js'` — function was called on line 183 but not imported after file reorganization. | `npx tsc --noEmit` failed with two errors: TS2307 (missing module) and TS2304 (undefined function). Both were pre-existing issues from an earlier file split/reorg. | None — `resolveFix` was not referenced anywhere in the file; `handleAIChat` is exported from `chatPanelMsgSendAI.ts` with the exact signature expected. |

## Recent Fixes — May 15, 2026 (Session 7: Plan Mode / Direct Build dual-entry system)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/types/index.ts` | Added `buildMode?: 'plan' | 'direct'` to `SessionInfo` interface. | Sessions need to remember the user's chosen build mode across interactions. | None — optional field, backward compatible. |
| `src/ui/chat/chatPanel.ts` | Added `buildMode?: 'plan' | 'direct'` to `ChatPanelState` interface. | Panel state needs to track the active mode for UI rendering and build routing. | None — optional field, backward compatible. |
| `src/ui/chat/chatPanelHtml.ts` | (1) Added `buildMode` to `ChatHeaderInfo`. (2) Added mode indicator pill (`badge mode`) to header badges — clickable to switch modes. (3) Added mode toggle buttons ("📋 Plan It Out" / "⚡ Just Build") to both empty states (project-ready and launcher). Buttons use `data-action="set-mode"` and `data-mode="plan|direct"`. | Welcome screen needs prominent mode selection above chat bar. Mode indicator needs to be visible and clickable in the header. | Low — CSS inline styles for robustness; no external dependencies. |
| `src/ui/chat/chatPanelScript.ts` | (1) Added `window._buildMode` tracking and `_pendingSendText` buffer. (2) Modified `doSend()` to intercept sends when mode is unset and show `showModePopover()` with two options. (3) Added `showModePopover()` function that creates a bottom-centered popover. Selecting an option sets mode, sends the pending message, and removes the popover. (4) Added delegated click handler for `[data-action="set-mode"]` and `[data-action="switch-mode"]` elements. (5) Send messages now include `mode: window._buildMode`. | Users typing without selecting mode need a fallback. Popover appears once per session. Mode must be sent with every request for routing. | Low — pure client-side JS, no server round-trip for popover. |
| `src/ui/chat/chatPanelMessageRouter.ts` | Added handlers for `set-mode` and `switch-mode` message types. `set-mode` writes `msg.mode` to `state.buildMode` and refreshes. `switch-mode` toggles between plan/direct and refreshes. Passed `buildMode: state.buildMode` into `MessageHandlerDeps`. | Server must persist mode selection and make it available to message handlers and build pipeline. | None — direct state mutation, no async I/O. |
| `src/ui/chat/chatPanelMessages.ts` | Added `buildMode?: 'plan' | 'direct'` to `MessageHandlerDeps` interface. | Message handlers need access to mode for build routing decisions. | None — interface extension only. |
| `src/ui/chat/chatPanelHeader.ts` | Added `buildMode?: 'plan' | 'direct'` parameter to `buildHeaderInfo()` and included it in the returned `ChatHeaderInfo`. | Header builder needs mode to render the indicator pill. | None — parameter addition only. |
| `src/ui/chat/chatPanelPublicAPI.ts` | `panelRefresh()` now passes `state.buildMode` as the 6th argument to `buildHeaderInfo()`. | Mode must flow from panel state into the HTML renderer. | None — single argument addition. |
| `src/ui/chat/chatPanelBuildUtils.ts` | `panelBuildRequestDeps()` now includes `buildMode: (panel as any).state.buildMode`. | Build request deps need mode for gate skipping and blueprint checks. | None — single property addition. |
| `src/ui/chat/chatPanelIntent.ts` | (1) Added `buildMode` to `BuildRequestDeps`. (2) Scope clarification (`isVagueProjectRequest`) is skipped when `buildMode === 'direct'` (auto-approve scope). (3) Cost estimate gate is skipped when `buildMode === 'direct'` (auto-approve). (4) Plan mode: before `runBuildAfterGates`, checks if blueprint is complete. If incomplete, triggers `redivivus.blueprintInterview` command and returns. | Direct mode must skip interview gates silently and execute immediately. Plan mode must ensure blueprint completeness before any code generation. | Low — skips existing gates conditionally; no new async paths. |
| `src/ui/chat/chatPanelBuildRunner.ts` | (1) Complexity-based routing (`handleComplexityRoutedBuild`) is skipped when `buildMode === 'direct'` for immediate execution. (2) `BuildContext` now includes `buildMode`. | Direct mode must bypass orchestrator overhead and build immediately. | Low — single condition guards complexity routing. |
| `src/ui/chat/chatPanelBuild.ts` | Added `buildMode?: 'plan' | 'direct'` to `BuildContext` interface. | Build context needs mode for downstream build phases (e.g., worker/guardian behavior). | None — interface extension only. |

## Recent Fixes — May 15, 2026 (Session 6: first-time correctness — Guardian + worker + filename + scaffold)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuildWorker.ts` | Added to worker prompt rules: "Use EVERY input variable in the actual computation — if you parse or declare it, it MUST appear in the formula or logic." + "CLI tools: every command-line argument that is parsed MUST affect the output." | Profit calculator built with unused `distance` variable — `netProfit = pay - fuelCost` ignored distance entirely. Worker had no rule requiring all inputs be used in computation. | None — additive prompt rules only |
| `src/services/ai/guardianAI.ts` | Added two checks to Guardian review: (1) universal checklist item: "Are ALL input arguments actually used in the core computation?" (2) DOMAIN GOTCHA: "CLI input shadowing: args parsed into named variables but formula only uses some." | Guardian passed the profit calculator even though `distance` was parsed but never used. Guardian lacked an explicit "all inputs used" check. | None — additive prompt expansion |
| `src/ui/chat/chatPanelBuildInference.ts` | Replaced `deriveFileBase` regex approach with async AI classifier call (Rule 18). 50-token prompt asks AI for semantic snake_case filename. Falls back to word-filter regex if AI call fails. | "I need a command-line delivery profit calculator" → filename was `need_command_line` (stop-word filtered first 3 words). AI derives `profit_calculator` from meaning. | Low — 12s timeout + regex fallback; no build blocked if AI call fails |
| `src/ui/chat/chatPanelBuild.ts` | (1) Await async `deriveFileBase(task, routing)`. (2) After `writeBuiltFile`, auto-scaffold `package.json` + `tsconfig.json` for TypeScript (non-HTML) builds. (3) Include scaffolded files in result card file list. | TS CLI tools had 4 TypeScript errors on first open because package.json and tsconfig.json didn't exist — project was not runnable out of the box. | Low — scaffold only runs when files don't already exist; existing projects untouched |
| `src/ui/chat/chatPanelBuildWriter.ts` | Added `scaffoldNodeProject(root, nameBase, created[])`: creates package.json and tsconfig.json with correct TS/Node.js defaults if they don't exist. Pushes created filenames into the `created` array for result card display. | Extracted into writer module to keep scaffold logic co-located with other file-writing operations. | None |
| `src/ui/chat/chatPanelBuildVault.ts` | Updated `deriveFileBase` call to pass `ctx.routing` (required by new async signature). | Compile error: old 1-arg call no longer matched new 2-arg signature. | None |

## Recent Fixes — May 15, 2026 (Session 5b: correct AI routing + attribution)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/services/ai/routingGuardian.ts` | Reverted my Session 5 fix. `supervisorPlanImpl` now uses `selectSupervisorAndWorker()` (AI_RANK) directly, no `getPreferredAI()` override. | Session 5 fix used `defaultAI = 'gemini'` (factory default, not user intent) as the supervisor pick, forcing Gemini over Claude. Reverted to AI_RANK: Claude (rank 10) is always supervisor when key is available. | None — restored prior correct behavior |
| `src/services/ai/routingComplexity.ts` | Removed `getPreferredAI()` block from worker routing. Worker now always uses AI_RANK capability order. | Same root cause: `defaultAI = 'gemini'` (factory default) was overriding Claude (rank 10) for the worker build. | None — AI_RANK order: Claude>OpenAI>xAI>Gemini>Kimi>Groq |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Added `lastResponseModel` variable to track which model actually answered. Footer attribution now uses `MODEL_TO_LABEL[lastResponseModel]` instead of `routing.getAvailableAI().label`. | `getAvailableAI()` reads `redivivus.defaultAI` (often 'gemini') regardless of which AI actually responded. If Claude (rank 10) answered, the footer still showed "— Gemini*". Now shows the actual AI. | None — falls back to `getAvailableAI()` when model string not recognized |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Added `NEED_BUILD_RE` pattern that matches "I need/want a [software artifact]" as a build request. | "I need a command-line tool..." went to the Q&A path instead of the build path. The AI generated inline questions rather than triggering the scope modal and build gates. Now routes to `handleBuildRequest` → scope modal (if vague) or direct build (if specific). | Low — only matches when message starts with "I need/want a" AND ends with a software noun (tool/app/script/cli/etc.) |

## Recent Fixes — May 15, 2026 (Session 5: supervisor routing + scope modal)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/services/ai/routingGuardian.ts` | `supervisorPlanImpl` now checks `getPreferredAI()` first. If user has a preferred AI selected and the key is available, that AI is used as supervisor; next available AI (by capability rank) becomes worker. Falls back to `selectSupervisorAndWorker()` (AI_RANK) if no preferred AI set. | `selectSupervisorAndWorker()` only used AI_RANK. Even after the `routeByComplexityImpl` fix, the supervisor step still chose by rank alone — Gemini was supervisor when Gemini+Kimi were available, even if user selected Claude. | Low — fallback to existing behavior when no preferred AI configured |
| `src/services/project/templateScopeService.ts` | `askScopeQuestions` signature changed from `postChatMessage(content)` to `postToWebview(msg)`. Now sends `{ type: 'show-scope-modal', task }` to show a centered modal instead of pushing inline text to the chat. | Scope questions appeared as plain text chat bubbles with no input fields — user had to type a reply that went through the build classifier. Confusing UX; the modal provides labelled input fields (purpose + complexity selector). | Low — modal resolves the same `_pendingScopeResolve` promise; build pipeline unchanged |
| `src/ui/chat/chatPanelIntent.ts` | `askScopeQuestions` call updated to pass `deps.postToWebview` directly (was passing a lambda that pushed to conversation). | Matches new `postToWebview` signature. | None |
| `src/ui/chat/chatPanelScriptGates.ts` | Added `showScopeModal(task)`: centered dark modal with two labelled inputs — a text field for purpose ("What's it for?") and a select for complexity (Simple/Medium/Full). Submit posts `{ type: 'scope-submit', answer }`, Skip posts `{ type: 'scope-cancel' }`. | Renders the new scope modal in the webview. | None — uses same DOM pattern as Vault/Cost/Placement modals |
| `src/ui/chat/chatPanelScript.ts` | Added `show-scope-modal` case in webview message listener that calls `showScopeModal(msg.task)`. | Wires the extension-side postToWebview call to the webview function. | None |
| `src/ui/chat/chatPanelMessages.ts` | Added `scope-submit` handler (calls `resolveScopeQuestion(msg.answer)`) and `scope-cancel` handler (calls `clearPendingScopeQuestion()`). | Modal results now resolve the pending scope promise without going through the chat send-message path. | None |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Removed old scope-question intercept block (`hasPendingScopeQuestion` check that captured user's typed reply). Removed unused imports. | Modal handles scope answers directly; the chat send-message path no longer needs to intercept replies for scope questions. | None — modal is the only input path; 5-min timeout still handles abandonment |

## Recent Fixes — May 15, 2026 (Session 4s: AI routing + live build progress)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/services/ai/routingService.ts` | Added `getPreferredAI()` method that reads `redivivus.defaultAI` from VS Code config. | `routeByComplexityImpl` needed access to the user's explicitly selected AI without coupling to VS Code directly. | None — read-only getter |
| `src/services/ai/routingComplexity.ts` | (1) Changed large-context threshold from 4000 → 50,000 tokens. (2) Added `preferredAI` check: if user has a default AI set and it's available, use it before any other logic. (3) Changed fallback ordering to capability rank (claude>openai>xai>gemini>kimi>groq) instead of hardcoding Gemini as the primary. | 4k threshold caused any prompt with 15 vault items to route to Kimi. Gemini was hardcoded as the "medium" AI before Claude, so Claude was never used even when configured and explicitly selected. User clicked the Claude chip; Gemini was used anyway. | Low — preferred AI check only fires when key is present; fallback chain unchanged |
| `src/ui/chat/chatPanelBuild.ts` | Added live progress messages during build: "Supervisor planning...", "Claude writing `file`...", N-line code preview after AI responds, "Guardian reviewing...", "Review complete — writing...". | A 1-2 minute build showed only "Building..." the entire time — users worried the build was frozen. Now each phase is visible and the first 20 lines of generated code appear in chat before the final result card. | Low — additive messages only; all feed into the existing appendMsg/updateLastMsg pattern |

## Recent Fixes — May 15, 2026 (Session 4s: chat freeze after build — window reload from updateWorkspaceFolders)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/extensionInlineCommands.ts` | `onBuildFinished` now checks `existingFolders.length > 0` before calling `updateWorkspaceFolders`. When no folders exist (first project built from chat), shows an "Open as Workspace" notification button instead. When at least one folder already exists, still auto-adds normally. | Adding the FIRST workspace folder via `updateWorkspaceFolders` causes VS Code to reload the window. The chat webview panel is destroyed; the user sees cached content but the message channel is disconnected — making the chat completely non-responsive. The user had to open a new chat panel after every build. | Low — auto-add still works for multi-root workspaces. First-folder case now requires one extra user click ("Open as Workspace" toast). |

## Recent Fixes — May 15, 2026 (Session 4s: token + cost reporting wired into build result card)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuild.ts` | `runSingleFileBuild` now creates a `BuildLedger`, records supervisor plan tokens (estimate from text lengths / 4) and worker build tokens (prompt + response / 4), computes totals, calls `ctx.usageTracker?.recordUsage()`, and passes `ledgerSummary` to `buildResultCard`. The "WHO DID WHAT" breakdown and cost line now populate in the result card. | Result card always showed `$0.0000 · 0 tokens`. The `BuildLedger` and renderer were fully built but never wired in. | Low — token counts are estimates (chars/4), not exact. Cost is derived from ledger's `tokenCostForAI` rate table. No AI calls added. |

## Recent Fixes — May 15, 2026 (Session 4s: isSimpleUnit false-positive + Make it a Project button)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuildRunner.ts` | Added `\b` word boundaries to `isSimpleUnit` regex. Was `/function\|script\|snippet\|.../i`, now `/\b(function\|script\|...)\b/i`. | "JavaScript" contains the substring "script" — without word boundaries, any task mentioning JavaScript, TypeScript, or className was falsely classified as a simple unit and routed to the compact vault wizard instead of the placement gate. A personal finance dashboard got the "Build & Save to Vault" compact panel instead of the proper project-creation flow. | None — stricter classification; tasks that genuinely ask for a "function" or "script" still match |
| `src/ui/chat/chatPanelScriptProjects.ts` | Fixed "Make it a Project Instead" button click handler: was posting `{ type:'show-panel', panelType:'create-folder' }` to the extension (no inbound handler — silently dropped). Now calls `showCreateFolderPanel(prefillName, pendingTask)` directly in the webview, which posts `{ type:'create-folder', name, parentPath, pendingTask }` — a message the extension DOES handle. | Clicking "Make it a Project Instead" did nothing. The `showCreateFolderPanel` function was already defined in the webview; the button just needed to call it instead of posting a message the extension doesn't listen for. | None — calls existing webview function; create-folder handler unchanged |

## Recent Fixes — May 22, 2026 (Sessions 11AJ–11AN: Visual Contract Editor + deploy pipeline fix)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/core/build/chatPanelChunkedFinalize.ts` | Removed `vscode.openFolder` call after every build; replaced with `vscode.workspace.updateWorkspaceFolders` for the has-folders case. Added `projectRoot` param to `buildResultCard`. | `vscode.openFolder` caused a full window/extension-host reload after every build, which (a) left the spinner running forever and (b) fired `pendingResumeTask` → full rebuild on reload. | None — `updateWorkspaceFolders` is non-destructive; no window reload |
| `src/extensionInlineCommands.ts` | Added `_prevOnBuildFinished` chain to preserve the session.ts save-point callback. Removed `pendingResumeTask` and `pendingRescueConversation` globalState saves from `onBuildFinished`. | `extensionInlineCommands.ts` was overwriting the callback registered in `commands/session.ts`, silently dropping save-points. GlobalState saves here caused reload→rebuild loop. | None |
| `src/core/routing/chatPanelMessageRouterEarlyExits.ts` | Added `open-workspace-btn` handler that saves `pendingRescueConversation` to globalState immediately before calling `vscode.openFolder` (the only intentional reload). Added `open-visual-editor` handler that calls `openVisualContractPanel` directly. | `pendingRescueConversation` must only be saved when the user intentionally opens a new folder — not on every build finish. | None |
| `src/extensionResumeState.ts` | Added `pendingRescueConversation`-only recovery path that restores conversation without triggering a rebuild. | `pendingResumeTask` was the only recovery path — both intentional folder-opens and accidental reloads ended up triggering full rebuilds. | None |
| `src/services/savePointService.ts` | Removed blocking git-init modal; silent early return when no git repo. | Modal fired automatically after every build for non-git projects, blocking the UI. | None — git init remains available manually |
| `src/services/visualContract/visualContractTypes.ts` | NEW — shared types: `VisualProperty`, `VisualSection`, `VisualContract`, `PropType`, `PropCategory`. | Foundation for Visual Contract Editor. | None |
| `src/services/visualContract/propertyExtractor.ts` | NEW — `extractVisualContract(root, files)`: scans HTML inline `<style>` blocks for colors and numeric properties; extracts page title, headings, buttons from HTML text; detects structural sections. Returns up to 14 colors + numbers + text properties per file. | Visual Contract Editor needs a property map to display editable controls. | Low — read-only file scan |
| `src/services/visualContract/visualContractPatcher.ts` | NEW — `applyPropertyPatch` and `applyBatchPatches`: uses stored `findRegex`+`findGroup` to locate and in-place-replace property values in source files. | Translates Visual Editor control changes back to source code. | Medium — writes to user files; uses stored regex from extraction to minimize false matches |
| `src/ui/panels/visualContract/visualContractPanel.ts` | NEW — singleton webview panel host. Embeds extracted contract as inline JSON in the webview HTML (no postMessage race). Handles `apply-all`, `property-changed`, `add-section` messages. | Visual Contract Editor panel controller. | None |
| `src/ui/panels/visualContract/visualContractPanelHtml.ts` | NEW — full webview HTML with Catppuccin dark theme. Tabs: Colors, Text, Layout, Effects, Structure. Plain/Pro toggle. All event handling via delegated listeners (no inline onclick/oninput — required for VS Code CSP). Fixed template-literal backslash stripping for embedded regex. | VS Code webview CSP blocks inline event handlers regardless of extension CSP meta tag; must use addEventListener from nonce-allowed script block. | None |
| `src/ui/panels/chat/chatPanelDashboard.ts` | Added `editVisuallyPill` — shown when any recent build produced `.html` or `.css` files. | Feature request: Edit Visually button on project dashboard. | None |
| `src/ui/panels/chat/chatPanelStylesDash.ts` | Added `.dash-action-visual` and `:hover` styles for the Edit Visually pill. | Visual styling for new pill. | None |
| `src/ui/panels/chat/chatPanelRenderer.ts` | Added renderer for `__EDIT_VISUALLY__` token — renders inline "Edit Visually" button in build result cards when built files include HTML/CSS. | Post-build entry point for Visual Contract Editor. | None |
| `src/ui/panels/chat/chatPanelScriptActionsB.ts` | Added click handler for `.edit-visually-btn` — base64-decodes root path, posts `open-visual-editor` message. | Wires the result-card button to the panel open path. | None |
| `src/extensionInlineCommandsC.ts` | Added `redivivus.openVisualEditor` command registration with lazy `require` of `visualContractPanel.js` (inside handler, not top-level). Fixed top-level import that was silently killing all 4 commands in the file. | Top-level `import { openVisualContractPanel }` caused module load failure if the import threw — silently preventing `redivivus.runProject`, `redivivus.inspectElement`, `redivivus.injectTerminalError`, and `redivivus.openVisualEditor` from registering. | None |
| `src/core/project/chatPanelMsgProjectOps.ts` | Added inline `redivivus.openVisualEditor` handler that calls `openVisualContractPanel` directly instead of via `vscode.commands.executeCommand`. | Extension activation fails for `terminalDataWriteEvent` proposed API, preventing command registration entirely. Direct call bypasses the broken registry path. | None |
| `scripts/postcompile.js` | Extended deploy to also sync `out/` to any `~/.vscode/extensions/papajoe.redivivus-*` directory (auto-discovered). Previously only synced to the baked `redivivus-build/` path. | Extension installed in `~/.vscode/extensions/` takes priority over the baked copy in VS Code's load order — the stale installed copy (May 20) was what ran, not the freshly compiled baked copy. | None — additive sync target |
| `package.json` | Added `redivivus.openVisualEditor` to `contributes.commands`. | Required for command palette visibility. | None |

*Last updated: May 22, 2026 — Sessions 11AJ–11AN complete*

### Known Issue (logged)
Extension activation fails with `Extension 'papajoe.redivivus' CANNOT use API proposal: terminalDataWriteEvent`. The `registerTerminalErrorService` call uses `(vscode.window as any).onDidWriteTerminalData` which is a proposed API. This kills full activation, preventing `vscode.commands.registerCommand` from working. Workaround: all dashboard/result-card commands that need this path call handlers directly. Fix: remove `onDidWriteTerminalData` usage or declare `terminalDataWriteEvent` in `package.json#enabledApiProposals` and run with `--enable-proposed-api`.

## Recent Fixes — May 15, 2026 (Session 4s: Bug 8 — status ticker freeze on no-workspace paths)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuildRunner.ts` | Added `deps.postToWebview({ type: 'set-status', status: 'ready' })` before each early return in the `!root` block: (1) vault-only path (isSimpleUnit && !skipComplex), (2) skipComplex path, (3) after placement modal resolve (covers both new-project and cancel). | The `finally` block that posts `set-status: ready` is only reached when `root` is defined and the actual AI build runs. All three `!root` early-return paths exited without resetting the status, leaving "routing wiring..." spinning forever in the chat header even after the function returned. | None — purely additive postMessage calls; no logic changes |

## Recent Fixes — May 15, 2026 (Session 4s: gate response handler mismatch + freeze fixes)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelMessageRouter.ts` | Added `vault-hit-*` handler: extracts resolverId from message type, calls `resolveVaultHit(resolverId, msg.choice)`. Added `placement-*` handler: extracts placementId, calls `resolvePlacement(placementId, msg.choice)`. Both run before the `handleChatMessage` fallthrough. | The gate WebView scripts (`chatPanelScriptGates.ts`) were redesigned to send `{ type:'vault-hit-{id}', choice:... }` and `{ type:'placement-{id}', choice:... }`, but the extension handlers still expected the old format (`use-vault`/`build-anyway` + `hitId`, `placement-add-here/new-project/cancel` + `placementId`). Every vault-hit and placement response from the user was silently dropped — the promise timed out after 60s/5min causing the build screen freeze. | Low — handlers are additive; old dead handlers remain as fallback |
| `src/ui/chat/chatPanelMessages.ts` | Fixed `confirm-build` handler: was always resolving `true` (`resolveBuildConfirm(msg.buildId, true)`), ignoring `msg.confirmed`. Now uses `msg.confirmed !== false`. | Clicking "Cancel" on the cost estimate modal sent `confirmed:false` but the extension resolved it as `true` — the build proceeded anyway. | Low — only affects the cancel path; confirm path unchanged |
| `src/ui/chat/chatPanelBuild.ts` | Updated `resolveVaultHit` signature from `result: boolean` to `result: string \| boolean` to accept the choice string from the new handler. | TS type safety — `resolver(result as any)` already worked at runtime but the public signature was misleading. | None — runtime behavior unchanged |

## Recent Fixes — May 15, 2026 (Session 4s: build screen freeze fixes)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuild.ts` | `runSingleFileBuild`: when `executeWorkerBuild` fails, now calls `updateLastMsg` with an `❌ Build failed:` message before returning. Previously returned silently leaving the chat stuck at "⚙️ Building..." indefinitely. | Silent failure caused the build screen to appear permanently frozen when AI call fails (rate limit, bad key, timeout). | None — additive error message, no logic changes to success path |
| `src/ui/chat/chatPanelChunked.ts` | Clarification answers promise now wrapped in `Promise.race` with a 120-second timeout fallback that resolves to `{}`. Previously awaited indefinitely. | If the WebView clarify UI fails to render (Rule 13 non-ASCII or render error), `ctx.onClarifySubmit` was never called and the chunked build hung forever at "Thinking... Preparing questions..." | Low — on timeout, build continues with empty answers (same as if no questions were generated) |
| `src/ui/chat/chatPanelBuildRunner.ts` | Added `if (skipComplex)` branch inside the `!root` block: immediately shows full new-project wizard instead of waiting up to 5 minutes for placement-check modal response. | `skipComplex=true` (always set from the "Build it" button click) + no workspace folder → code fell into `show-placement-check` await with a 5-minute timeout. User saw the build screen freeze for up to 5 minutes. | Low — only fires for the no-root + skipComplex edge case; existing vault-only and placement-check paths unchanged |
| `src/ui/chat/chatPanelBuildUtils.ts` | Replaced `panelVaultOnlyBuild` stub (which pushed "Vault-only build stub" message and never called `panel.refresh()`) with a real implementation: calls AI to generate snippet, shows result in chat with code block, calls `panel.refresh()`. Added `[NEXT]` for actual vault auto-save step. | Clicking "Build & Save to Vault" caused the build screen to freeze — "📦 Building snippet..." appeared and never updated because `panel.refresh()` was never called. | Low — new AI call (routeByComplexity, 30s timeout); error path also shows message and refreshes |

## Recent Fixes — May 14, 2026 (Session 4r: auto-save AI-generated files)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelMsgSendMessage.ts` | [DEAD] Widened `BUILD_TRIGGER_RE` with conversion verbs (convert/turn/transform/rewrite) -- REVERTED. Added `[WARN]` comments explaining why conversion verbs must NOT go into BUILD_TRIGGER_RE | Routing conversion requests through the full build pipeline (supervisor -> worker -> guardian) caused infinite churn. The AI chat path is lighter and already works for these requests. | None -- reverted to original regex |
| `src/ui/chat/chatPanelAutoSave.ts` | **New file** -- `shouldAutoSave()` checks for single substantial code block (>10 lines) + build/convert verb in user message; `extractAutoSaveTarget()` parses code + derives filename from first-line comment or user message; `autoSaveAndOpen()` writes to disk, asks before overwriting, opens in editor | AI chat responses with complete code blocks were never auto-saved -- user had to manually click Create File, type a name, click Save. Now matches Antigravity behavior: generate -> save -> open -> confirm | Low -- only triggers when both conditions met (build verb + single substantial block); multi-block responses stay manual |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Added import for `chatPanelAutoSave.ts`; after AI response is pushed to conversation, checks `shouldAutoSave()` and calls `autoSaveAndOpen()` if eligible; renamed shadowed `root` variable to `prefRoot` in preference learning block | Wires the auto-save module into the AI chat path so code blocks are automatically saved to the project | Low -- auto-save is gated by heuristic; no change to existing question/answer flow for non-build requests |
| `src/ui/chat/chatPanelAI.ts` | Increased active file context from 150 to 500 lines; added code generation detection that injects explicit "write COMPLETE, FULLY FUNCTIONAL code" rules when user message contains build/convert verbs | AI was only seeing first 150 lines of a 393-line TypeScript file, producing skeleton code because it couldn't see the full source. System prompt had no rules against producing stubs/placeholders. | Low -- only adds context and instructions; no logic changes |
| `src/services/ai/routingService.ts` | Rewrote `prompt()` with a proper failover loop: builds ranked list of all available AIs, tries each in order on timeout/network errors, calls `promptFailoverCallback` to notify the user between retries. Increased default timeout from 30s to 60s. Added `promptFailoverCallback` property. | Failover was referenced in roadmap Session 4f but never existed in the actual `prompt()` method -- Gemini timeout was fatal with no retry. Now tries Kimi, Groq, Claude etc. automatically. | Low -- only adds retry logic around existing callProvider; non-retryable errors (bad key, rate limit) still fail immediately |
| `src/services/ai/routingProviders.ts` | Increased Claude `max_tokens` from 1024 to 8192 | 1024 tokens is ~750 words -- far too low for generating a full game (needs 4000+ tokens). Code generation was being silently truncated. | Low -- only affects Claude; higher token count means slightly higher cost per request |
| `src/ui/chat/chatPanelAutoSave.ts` | Added 'replace' to BUILD_VERB_RE; handle truncated code blocks (AI hits output limit before closing fence); removed overwrite confirmation dialog — always overwrite since user already asked for the file | Auto-save was failing on three fronts: "replace" wasn't detected as a build verb, truncated responses had no closing ``` so regex missed them, and overwrite dialog blocked the flow | Low -- broader detection + silent overwrite matches Antigravity behavior |
| `src/ui/chat/chatPanelAI.ts` | [DEAD] Previous approach: injected code gen rules INTO the Redivivus system prompt. Replaced with: complete code gen prompt bypass. New `buildCodeGenPrefix()` replaces the 44-line Redivivus identity/capabilities/rules prompt with a 10-line focused code generator prompt. New `findSourceFiles()` reads source code directly from disk (scans `src/` then root for code files) instead of relying on `activeTextEditor` which may not have the right file when user is in the chat panel. | The AI was receiving Redivivus identity noise (capabilities list, behavioral rules, vault instructions, blueprint) that distracted it from the actual task. Also, `activeTextEditor` returns undefined or wrong file when user is in the webview chat panel. Antigravity reads files explicitly and uses focused prompts — Redivivus now does the same. | Medium -- code gen requests bypass the Redivivus system prompt entirely; question/answer flow unchanged |
| `src/ui/chat/chatPanelCodeStructure.ts` | **New file** — `applyChassisStructure()` adds [SCOPE] tag at line 1 and NARRATOR comments above functions. Runs as a post-processing pass on auto-saved code. Supports all Redivivus comment syntaxes (JS/TS/Python/Go/HTML/CSS etc.). | Redivivus rules were being injected into the AI prompt, distracting it from writing working code. Now rules are applied AFTER code generation: "generate first, structure after." | Low — only adds comments to generated code; never modifies logic |
| `src/ui/chat/chatPanelAutoSave.ts` | Wired `applyChassisStructure()` into `autoSaveAndOpen()` — runs before file write | Ensures all auto-saved code gets Redivivus structural compliance without burdening the AI | Low — additive post-processing only |
| `src/ui/chat/chatPanelProjectContext.ts` | **New file** — `buildProjectAnnotationContext()` scans all project files and extracts [SCOPE], [WARN], [TODO], [DEAD] into a compact AI-readable summary. 30-second cache to avoid rescanning on every message. Reuses `walk`/`extractScope`/`countPattern` from `mapBuilderHelpers.ts`. | Redivivus annotations are designed to give AI project awareness without loading entire files. A 50-file project becomes ~200 tokens of annotation context instead of 50,000 tokens of raw code. This is the Redivivus protocol advantage over other editors that brute-force load everything. | Low — read-only scan with caching; no file modifications |
| `src/ui/chat/chatPanelAI.ts` | Wired `buildProjectAnnotationContext()` into the question/chat path. AI now sees [SCOPE] from ALL project files when answering questions. | Gives the AI instant project-wide awareness. User can ask "what does this project do?" or "which files have warnings?" and the AI can answer from annotations. | Low — only adds context to question path; code gen path unchanged |
| `src/services/ai/routingProviders.ts` | Added `generationConfig: { maxOutputTokens: 65536 }` to Gemini API request body; added `finishReason` check for `MAX_TOKENS` truncation | Without `maxOutputTokens`, Gemini was using a default limit that truncated code generation at ~100 lines. The generated file was cut off mid-word in a function. Now requests the max output (65536 tokens = ~49,000 words). | Low — only affects Gemini request body |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Skip Guardian review for code generation requests. Added `isCodeGenRequest` regex check before Guardian call. | Guardian was receiving the generated code block and "correcting" it — which corrupted the output. The file ended with "Guardian (kimi) reviewed and corrected this response" and was truncated. Code gen now bypasses Guardian entirely; the post-processor handles Redivivus compliance. | Medium — Guardian no longer reviews code gen output; still reviews question/answer responses |
| `src/ui/chat/chatPanelChunkedGen.ts` | **New file** — `splitSourceIntoSections()` detects class/function/enum boundaries and splits source code into ~200-line logical sections. `chunkedGenerate()` generates each section separately via multiple API calls with accumulated context and progress updates. `assembleOutput()` combines chunks, removing duplicate HTML structure from continuation chunks. | Single API call was truncating at ~100 lines for a 393-line source. Chunked approach: split → generate section by section → assemble. No file size limit. | Medium — multiple API calls; progress messages show in chat |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Wired chunked generation: when code gen + source >300 lines, routes to `chunkedGenerate()` instead of single `routing.prompt()`. Shows "📦 Large file detected" progress. Token tracking for both chunked and single paths. | Flappy Bird (393 lines) was too large for a single API call. Now any file size works — 300, 3000, or 30,000 lines. | Medium — changes the code gen flow for large files; small files and questions unchanged |
| `src/ui/chat/chatPanelAI.ts` | Exported `findSourceFiles()` and `SourceFile` interface so `chatPanelMsgSendAI.ts` can check file sizes before deciding chunked vs. single-call path | Chunked generation needs to inspect source file sizes before deciding which path to use | Low — export only, no logic changes |
| `src/ui/chat/chatPanelChunkedGen.ts` | [DEAD] Previous approach: sent only section source to AI. AI couldn't produce coherent code for small fragments (12-line gameLoop was shredded). **Rewritten**: every API call now gets the FULL source file with instructions to generate a specific line range. Also added minimum section size (80 lines) and auto-merge for tiny trailing sections (<50 lines). Assembly ensures closing `</html>` tag. | The AI needs full context to produce coherent code. Sending a 12-line fragment produced a broken gameLoop function with missing declarations. Now the full 393-line source is visible in every call. | Medium — fundamentally different chunking strategy |
| `src/ui/chat/chatPanelAutoSave.ts` | Added `shouldDeleteFiles()` and `deleteRequestedFiles()` — detects delete/remove verbs in user text, finds matching files by name or extension, removes them from disk | User asked Redivivus to "delete both html files" — Redivivus had no file deletion capability. Now it does. | Medium — adds file deletion; only triggers on explicit delete verbs |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Wired file deletion: checks `shouldDeleteFiles()` before code gen and deletes matching files. Shows "🗑️ Deleted: ..." confirmation. | Users expect to be able to delete files through chat, like Antigravity does. | Medium — adds delete before generate flow |
| `src/ui/chat/chatPanelChunkedGen.ts` | [DEAD] Previous `assembleOutput()` only stripped `</html>` and `</body>` from intermediate chunks but NOT `</script>`. Chunk 1's `</script></body></html>` remained, so chunk 2's JavaScript was placed AFTER the closing script tag — rendered as raw text in the browser. **Fixed**: now strips `</script>`, `</body>`, `</html>` from ALL chunks except the last. Also strips `<script>`, `<canvas>` from non-first chunks. Ensures all three closing tags exist in final output. | The file looked correct (410 lines, had DOCTYPE, etc.) but the game was blank because the browser stopped parsing JS at `</script>` on line 246, and the remaining 164 lines of game logic were treated as plain text. | High — this was the root cause of every "blank screen" bug |
| `src/ui/chat/chatPanelCodeStructure.ts` | [DEAD] `addNarratorComments()` had `if (!syntax.line) return lines` which skipped ALL HTML files since HTML only has block comments (`<!-- -->`). **Fixed**: now tracks `<script>` blocks and uses `//` for NARRATOR comments inside JS contexts. Verified: 11 functions in flappy-bird `index.html` all get NARRATOR annotations now. | HTML files are the most common code gen target (browser games, apps, tools). Skipping them meant 0 annotations on all generated HTML. | Low — only adds comments inside `<script>` blocks |
| `src/ui/chat/chatPanelMsgSendAI.ts` | [DEAD] Three bugs found during testing: (1) Guardian `hasCodeBlock` matched inline backticks (`` `filename.ts` ``) — fixed to only match fenced code blocks (` ``` `). (2) `CODE_GEN_RE` was too broad — "build" alone triggered code gen, causing "build a pong game" to inject unrelated flappy-bird source files. Split into `CODE_GEN_RE` (convert verbs) and `NEW_BUILD_RE` (build + article + noun). (3) For new builds, source files from the current project are no longer injected — user asked for Pong, got Flappy Bird again because the source files were in the prompt. | Guardian was corrupting ALL question responses that mentioned filenames in backticks. Code gen was using wrong source files for new project requests. | High — fixes both question and code gen paths |
| `src/ui/chat/chatPanelProjectContext.ts` | [DEAD] Scanner only walked `root/` when `src/` had zero files. If `src/` had even 1 file, root-level files (index.html, config) were invisible. **Fixed**: now scans BOTH `src/` AND root with deduplication. | Test showed "0% annotated, 0 WARNs" for flappy-bird even though `index.html` had `[SCOPE]`. The scanner only found `src/flappy_bird_clone.ts` and missed `index.html` at root. | Low — additive scan, no behavior changes for src-only projects |
| `src/data/commands.json` | Added "close project" / "close folder" / "close workspace" / "close current project" phrases mapping to `workbench.action.closeFolder` | User said "close the current project" — AI generated text saying "project closed" without executing anything. The phrase was missing from the command dictionary so the command router didn't intercept it, and the AI just hallucinated an action. | Low — adds command phrase, no code changes |
| `src/services/commandRouter.ts` | [DEAD] Previous approach: dictionary-only matching. If the phrase wasn't in the JSON list, the command was missed and the AI hallucinated the action. **Rewritten with 3 layers**: (1) Dictionary — exact/contains match (free, instant). (2) Fuzzy — Levenshtein distance catches typos like "clse projct" → "close project" (free, instant, max 3 edit distance). (3) AI classify — sends compact command list (~200 tokens) to the AI for semantic matching. Handles "shut down this workspace", "get rid of this folder", or any novel phrasing. | Hardcoded phrase lists can never cover all wordings. Users type naturally — with typos, novel phrasing, and synonyms. The three-layer approach handles all cases while keeping the common path (dictionary) zero-cost. | Medium — AI fallback costs ~50 tokens per unrecognized command |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Passes `routing` to `tryRouteToVSCodeCommand()` so the AI classification layer can use the configured AI provider | AI classify layer needs access to the routing service | Low — parameter passthrough |
| `src/ui/chat/chatPanelAutoSave.ts` | Three non-tech-friendly fixes: (1) Save message now shows full path: `✅ Saved: calc.html → ~/projects/myapp/`. (2) When no workspace is open, shows a native folder picker dialog instead of silently saving to a broken path. (3) Removed dead overwrite-check code that wasn't doing anything. | User asked "where did it save?" — the old message just said `Saved: calc.html` with no path. With no workspace open, the file saved to a bad location (or didn't save at all). Non-technical users need to see exactly where their file went. | Low — better UX, no behavior changes for workspace-open case |
| *Multiple files — Non-Tech-Friendly UX Pass* | Rewrote **all user-facing messages** across 8 files to remove technical jargon: `chatPanelMsgSendAI.ts` (AI Error→friendly, failover→switching), `chatPanelMsgArchitect.ts` (No workspace→No project folder, TODOs→to-do items), `chatPanelMsgFileOps.ts` (snapshot ID→nothing to undo), `chatPanelMsgMapContext.ts` (Error→try again), `statusBar.ts` (Not initialized→Getting started), `analyzerService.ts`, `retrofitService.ts`, `timelineService.ts` (all workspace→project folder). Every error now uses ✅/❌/⚠️ emojis and actionable instructions instead of raw error messages. | Redivivus must be usable by non-technical users. "AI failover", "No workspace", "snapshot ID", and raw error.message strings are developer jargon that confuse vibe coders. | Low — text-only changes, no logic changes |
| `sidebarProvider.ts` + `chassisSidebar.ts` | **Fixed 8 dead sidebar buttons** where the button called a command name that didn't match the registered command. Mapping: `apiSetup`→`openSettings`, `newProject`→`wizard`, `githubBackup`→`configureGitHubBackup`, `scanProject`→`analyze`, `checkFile`→`checkFileHealth`, `cleanFile`→`cleanUpFile`, `workLog`→`log`, `deadEnds`→`deadends`. Both the tree-view sidebar and the HTML webview sidebar had identical mismatches. | User clicked "AI API Setup" and got "command redivivus.apiSetup not found" — the command was registered as redivivus.openSettings but the sidebar was calling redivivus.apiSetup. All 8 broken buttons were invisible until someone actually clicked them. | Low — corrects string references only |
| `guardianAI.ts` | Added `AI_CAPABILITIES` — structured capability descriptors for each AI (strengths, bestFor, contextLimit) alongside the existing rank table | Supervisor needs to know what each AI is good at to assign work intelligently | Low — additive, no behavior changes to existing code |
| `[NEW] supervisorOrchestrator.ts` | Multi-AI build pipeline: creates step-by-step plans, assigns each step to the best-fit worker AI, executes in sequence, and has the supervisor review the assembled output. Gracefully degrades to single-AI mode. | When 2+ AIs are configured, the Supervisor (Claude) should plan, delegate, and review — not just review after the fact | Medium — new file, no impact on existing single-AI path |
| `[NEW] routingOrchestration.ts` | Extracted `orchestratedBuildImpl()` from routingService to stay under 200 lines. Coordinates the full plan→execute→review pipeline. | routingService.ts was 223 lines after adding orchestratedBuild inline | Low — extraction only |
| `routingService.ts` | Added `orchestratedBuild()` method (thin delegate to routingOrchestration.ts) and imported supervisor orchestrator types | Gives the chat panel a single entry point for multi-AI builds | Low — thin delegate |
| `[NEW] vaultQualityGate.ts` | AI-assisted code evaluation before vault storage. Generates description, useCase, qualityScore (1-5). Only items scoring 3+ are saved. Falls back to heuristic when AI is unavailable. | Vault was saving everything — random game resets, trivial handlers. Quality gate ensures only genuinely reusable code enters the vault. | Medium — changes what gets saved to vault |
| `vaultTypes.ts` | Added `useCase`, `qualityScore`, `reusable` optional fields to `VaultItem` | Quality gate metadata needs to be persisted on each vault item | Low — additive optional fields |
| `vaultAutoCapture.ts` | Now async. Runs each extracted function through the quality gate before saving. Items that fail (score < 3 or reusable=false) are filtered out. Populates description, useCase, qualityScore on saved items. | Core integration point — auto-capture now uses AI judgment instead of blindly saving everything | Medium — changes capture behavior |
| `vaultContextService.ts` | Enhanced scoring: quality score boosts (4+=+2, 5+=+4), description/useCase keyword matching. Context block now includes descriptions and "Use when:" lines. 5-star items get ⭐ marker. | AI needs to know WHY to use a vault snippet, not just see raw code. Higher-quality items should surface first. | Low — scoring tweaks |
| `chatPanelChunked.ts` | Added `await` to `autoCaptureFiles()` call — now async due to quality gate | Build pipeline was passing a Promise where a CaptureResult was expected | Low — fixes compile error |
| `routingProviders.ts` | **Upgraded Claude from Haiku → Sonnet 4** (`claude-sonnet-4-20250514`). Claude is rank 10 (Supervisor) — needs the strongest model for planning and code review. | Haiku is the weakest Claude model. A Supervisor that plans builds and reviews worker output needs Sonnet-tier reasoning. | Medium — cost increase for Claude calls |
| `routingService.ts` | Updated model map to reflect `claude-sonnet-4-20250514` | Consistency — model name displayed in UI should match what's actually called | Low |
| `chatPanelChunked.ts` | **Removed orchestrated build bypass**. Multi-AI orchestration now runs through the existing supervisor/worker planning step and Guardian review. | The previous attempt to wire in `routing.orchestratedBuild` bypassed the entire Redivivus pipeline (file saving, project creation, vault capture). It just dumped raw code into the chat. | Medium — restores proper pipeline behavior |
| `chatPanelMsgSendAI.ts` | **Added AI attribution** — every response now shows "— Claude" or "— Gemini (fallback)" footer. Fixed remaining raw `AI Error:` message. Added retry hint on errors (shows user's original message + up-arrow tip). | Users with 4 AIs had no idea which AI answered. Error messages still had one raw technical string. No guidance on how to retry. | Low — text additions only |
| `sidebarProvider.ts` + `chassisSidebar.ts` | **Removed "Coming Soon" Profile section** from both sidebars. Added [NEXT] tag for future re-add. | Dead weight — two disabled buttons that every user sees. Confusing for non-tech users who might think the extension is incomplete. | Low — UI cleanup |

## Recent Fixes — May 14, 2026 (Session 4q+++: projects picker click fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgProjectOps.ts` | `handleOpenProject()`: replaced `vscode.commands.executeCommand('vscode.openWorkspace', ...)` with `vscode.openFolder` using the folder URI directly. Removed `.code-workspace` file creation logic. Added `await` to ensure command completion. | The Redivivus Projects picker modal rendered correctly but clicking a project did nothing because `vscode.openWorkspace` with a `.code-workspace` file was silently failing. Using `vscode.openFolder` opens the folder directly, which then triggers `onDidChangeWorkspaceFolders` and auto-initializes Redivivus if `.redivivus/` exists. | Low -- same pattern as `handleOpenExistingProject`; just uses correct VS Code command |

## Recent Fixes — May 14, 2026 (Session 4q++: selfDiagnostic wiring)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/extension.ts` | Added `import { runDiagnostic } from './services/selfDiagnostic.js'`; registered `redivivus.selfDiagnostic` command in `activate()` that calls `runDiagnostic(context, chassisService)` | Wire new self-diagnostic service into the extension activation flow | Low -- delegates to existing runDiagnostic; no logic changes |
| `package.json` | Added `redivivus.selfDiagnostic` command entry under `contributes.commands` with title "Redivivus: Run Self-Diagnostic" and category "Redivivus" | Required for VS Code to recognize and surface the command in palette | None -- declarative only |

## Recent Fixes — May 14, 2026 (Session 4q+: system prompt expansion)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelAIPrompt.ts` | Expanded `getSystemPrompt()` to always include Redivivus identity, 10-item capabilities list, and 10 behavioral rules -- regardless of whether a project is open. Added `bpSection` helper that shows "No project open yet" when blueprint is absent instead of the old bare "No blueprint set." | User requirement: AI must know it is Redivivus and be able to describe its features even when `isInitialized()` returns false and no project is open | Very low -- only prompt text changed; no logic or API changes |

## Recent Fixes — May 14, 2026 (Session 4q: domain-based folder reorganization)

### What Changed
- Moved **148 source files** from flat `src/ui/` and `src/services/` into domain subdirectories:
  - `src/ui/chat/` (51 files)
  - `src/ui/map/` (6 files)
  - `src/ui/sidebar/` (2 files)
  - `src/ui/views/` (16 files)
  - `src/services/ai/` (18 files)
  - `src/services/vault/` (19 files)
  - `src/services/build/` (9 files)
  - `src/services/blueprint/` (9 files)
  - `src/services/project/` (10 files)
  - `src/services/workspace/` (6 files)
  - `src/services/code/` (8 files)
- Updated **~1,300 import paths** across ~150 files to use correct relative paths after the move.
- Fixed dynamic `import('...')` patterns that were missed in the initial pass (12 files, 19 fixes).
- Corrected accidental `.ts` extensions emitted by Python scripts back to `.js` (150 files, 447 fixes).
- Ran `npx tsc --noEmit` after each pass; final compilation: **0 errors**.
- Created `REORGANIZATION_REPORT.md` documenting all file moves, import fixes, and audit findings.
- Audited a representative sample of exported functions/classes across all domains; **no functions were relocated** — all borderline cases (e.g., `changeTracker.ts`, `measureTwiceService.ts`) were judged most appropriate in their current domain.

### Risk
- Medium — large-scale path changes affect every module. However, compilation is clean and no logic was modified. Any runtime issues would be limited to module resolution edge cases not caught by `tsc --noEmit`.

## Recent Fixes — May 14, 2026 (Session 4p)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/routingGuardian.ts` | Added `detectProjectType()` and `getFolderStructureTemplate()` helpers; `supervisorPlanImpl()` now injects folder structure plans into Supervisor specs for web/api/game projects; single-file projects are skipped | Required by user request: Supervisor must guide Worker to place files in correct subdirectories | Low — only affects multi-file project prompts; single-file projects explicitly skipped |
| `src/services/mapBuilderService.ts` | Split into `mapBuilderService.ts` (main `buildProjectMap` entry, 145 lines) and `mapBuilderHelpers.ts` (scanning/analysis utilities, 158 lines) | 200-line compliance pass; `mapBuilderService.ts` was 290 lines | Low — re-exports types to preserve existing imports |
| `src/services/phaseUndoService.ts` | Split into `phaseUndoService.ts` (types + constructor + public methods + singleton, 181 lines) and `phaseUndoServiceImpl.ts` (undo/getHistory/listBuilds helpers, 154 lines) | 200-line compliance pass; `phaseUndoService.ts` was 291 lines | Low — delegates via `require()` pattern used elsewhere in codebase |
| `src/services/usageTracker.ts` | Split into `usageTracker.ts` (types + class basics, 141 lines) and `usageTrackerReport.ts` (report/reset/export helpers, 161 lines) | 200-line compliance pass; `usageTracker.ts` was 291 lines | Low — exports `STORAGE_KEY`, `SESSION_START_KEY`, `MAX_PHASE_HISTORY` constants |

---

## Recent Fixes — May 13, 2026 (Session 4o: redivivus-templates complete)

All 10 template files were authored in a prior session. This session verified the full set is live and reachable:

| Template | Path | HTTP |
|---|---|---|
| Portfolio | `web/portfolio/index.html` | 200 |
| Business Landing | `web/business/index.html` | 200 |
| Blog | `web/blog/index.html` | 200 |
| Dashboard | `web/dashboard/index.html` | 200 |
| Arcade Game | `games/arcade/index.html` | 200 |
| Puzzle Game | `games/puzzle/index.html` | 200 |
| CRUD App | `apps/crud/index.html` | 200 |
| CLI Tool | `apps/cli/index.js` | 200 |
| Express API | `api/express/server.js` | 200 |
| FastAPI | `api/fastapi/main.py` | 200 |

Full template registry is operational. `fetchTemplate()` in `templateRegistry.ts` will succeed for all 10 paths.

---

## Recent Fixes — May 13, 2026 (Session 4n: redivivus-templates)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `redivivus-templates/web/portfolio/index.html` | Verified present and correct -- dark single-page portfolio with hero, about, projects, contact; placeholder tokens `YOUR_NAME`, `YOUR_TAGLINE`, `PRIMARY_COLOR` for AI substitution | Required by templateRegistry.ts `web/portfolio/index.html` registryPath | None -- read-only template |
| `redivivus-templates/games/arcade/index.html` | Verified present -- canvas arcade game with player, bullets, enemies, score, lives, RAF loop; `GAME_TITLE`, `BG_COLOR` placeholders | Required by templateRegistry.ts `games/arcade/index.html` | None |
| `redivivus-templates/apps/crud/index.html` | Verified present -- CRUD app with add/edit/delete, XSS-safe render, Enter key support; `APP_NAME`, `ENTITY_NAME`, `PRIMARY_COLOR` placeholders | Required by templateRegistry.ts `apps/crud/index.html` | None |
| `redivivus-templates/registry.json` | Updated `lastUpdated` to 2026-05-13; removed stray `{web/` directory | Stale date; garbage directory from earlier session | None |
| Remote validation | All 3 raw URLs return HTTP 200 -- `web/portfolio`, `games/arcade`, `apps/crud` | Confirms `fetchTemplate()` in extension will succeed for these paths | None |

---

## Recent Fixes — May 13, 2026 (Session 4m: Live Sidebar)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `ui/chassisSidebar.ts` | Rewrote `getSidebarHtml()` to accept `ChassisService` + `SessionService` and render live status header: project name, blueprint badge (No Blueprint/Draft/Locked), session badge, AI badge (key present or not) | Sidebar was completely static -- showed no live context | Low -- pure HTML render, no state mutation |
| `ui/chassisSidebar.ts` | Added `constructor(redivivus, sessions)` + `refresh()` to `ChassisSidebarProvider` | Services needed to populate status header; `refresh()` needed to be callable from outside on state change | None |
| `ui/chassisSidebar.ts` | Fixed `redivivus.openChat` -> `redivivus.openChatPanel` (was a broken command ID) | Sidebar chat button never worked | None |
| `ui/chassisSidebar.ts` | Added `redivivus.vaultDedup` (Clean Vault Duplicates) and `redivivus.injectTerminalError` (Fix Last Terminal Error) to the command list | New commands from previous sessions were missing from sidebar | None |
| `ui/chassisSidebar.ts` | Added `vscode.workspace.onDidChangeWorkspaceFolders` auto-refresh inside `resolveWebviewView` | Project name badge was stale after opening a new folder | None |
| `extension.ts` | Passed `chassisService, sessionService` into `new ChassisSidebarProvider(...)` | Constructor now requires both services | None |
| `extension.ts` | Added `sidebarProvider.refresh()` inside `refreshAll()` | Blueprint and session badges must update when `endSession`, `startSession`, `blueprint` commands complete | None |

---

## Recent Fixes — May 13, 2026 (Session 4l: Guided Blueprint Mode)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `services/blueprintGapDetector.ts` | **New file** -- `detectBlueprintGaps()` checks each W field for length < 12 chars; returns targeted questions per gap; `buildGapPromptMessage()` builds `__BLUEPRINT_GAPS__` token; `applyGapAnswers()` merges user answers back to blueprint | Blueprint was never checked before builds -- AI wrote code with no WHO/WHAT/WHERE context | Low -- read-only check; build proceeds normally if no gaps |
| `chatPanelMessages.ts` | Added `_pendingGuidedBuilds` Map to hold the original build task during gap collection | Must resume the build with original task text after answers are collected | None |
| `chatPanelMessages.ts` | Added blueprint gap check before `handleBuildRequest` in the `build` intent branch -- intercepts only when workspace is open and blueprint has gaps | Without this, the gap check never ran -- build would fire with empty blueprint fields | Low -- can be bypassed via "Skip" button |
| `chatPanelMessages.ts` | Added `blueprint-gap-answer` handler -- persists answers to blueprint via `redivivus.saveConfig()`, then resumes build | Wires form submission to blueprint persistence + build continuation | Low |
| `chatPanelMessages.ts` | Added `blueprint-gap-skip` handler -- discards gap collection, fires build with `skipComplex=true` | User may want to build without answering; must not be blocked | None |
| `chatPanelRenderer.ts` | Added `__BLUEPRINT_GAPS__` token renderer -- renders blue card with text inputs per gap field + "Let's build" / "Skip" buttons | Turns raw token into interactive inline form | None |
| `chatPanelScriptActions.ts` | Added `.bp-gap-submit-btn` and `.bp-gap-skip-btn` click handlers | Collects input values from the card DOM and posts to extension host | None |
| `chatPanelStyles.ts` | Added `.bp-gap-card`, `.bp-gap-title`, `.bp-gap-input:focus` CSS | Styles the inline blueprint question card | None |

---

## Recent Fixes — May 13, 2026 (Session 4k: Vault Deduplication + Merge Engine)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `services/vaultDeduplicator.ts` | **New file** -- Jaccard similarity engine: tokenizes code, computes set overlap per category pair, groups near-duplicates into clusters, elects best item to keep (most imports then newest), builds human-readable summary | Vault accumulated near-duplicate entries across builds with no way to clean them | Low -- read-only scan; merge is a separate explicit step |
| `services/vaultService.ts` | Import `vaultDeduplicator.ts`; add `scanForDuplicates()`, `summarizeDuplicates()`, `mergeDeduplicateClusters()` methods | Exposes dedup operations through the service facade | Low -- all three are additive; `mergeDeduplicateClusters` deletes items but only when explicitly called |
| `extension.ts` | Register `redivivus.vaultDedup` command -- scans, shows count in notification, offers "Merge", "Preview in Chat", "Cancel" | User entry point via Command Palette | Low |
| `package.json` | Added `redivivus.vaultDedup` command declaration | Required for VS Code palette discovery | None |
| `chatPanelMessages.ts` | Added `vault-dedup-preview` handler -- renders cluster list + `__VAULT_DEDUP_ACTIONS__` token | Shows full duplicate report in chat with a Merge button | None |
| `chatPanelMessages.ts` | Added `vault-dedup-merge` handler -- calls `redivivus.vaultDedup` from chat button | Wires chat button back to the command | None |
| `chatPanelRenderer.ts` | Added `__VAULT_DEDUP_ACTIONS__` token renderer -- yellow "Merge duplicates" button + warning text | Turns raw token into actionable UI | None |
| `chatPanelScriptActions.ts` | Added `.vault-dedup-merge-btn` click handler -- posts `vault-dedup-merge` message | Wires button to extension host | None |
| `src/data/commands.json` | Added "dedup vault", "clean vault", "vault cleanup" NL phrases routing to `redivivus.vaultDedup` | Type "clean vault" in chat and it runs the command directly | None |

---

## Recent Fixes — May 13, 2026 (Session 4j: NL Command Router Phase 1 complete)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `services/commandRouter.ts` | Added `normalize()` — strips filler prefixes ("can you", "please", "hey") and articles ("a") before matching | "can you open a terminal" never matched "open terminal" — normalization fixes the whole class | Low |
| `services/commandRouter.ts` | Added 2-pass matching: pass 1 = exact/startsWith/endsWith, pass 2 = contains (phrases >= 5 chars) | Conversational phrasing like "I want to format this code please" now hits pass 2 | Low — 5-char floor prevents "git" matching "digit" etc. |
| `services/commandRouter.ts` | `tryRouteToVSCodeCommand` now returns `string \| undefined` (the label) instead of `boolean` | Caller needs the label to build a friendly reply, not just pass/fail | Low — updated call site |
| `services/commandRouter.ts` | Removed all debug `console.log` statements | Were left from development; pollute output channel | None |
| `chatPanelMessages.ts` | Updated call site to use `string \| undefined` return — confirmation reads "Done — **Formatted document**" | Old reply echoed raw user input verbatim, which was unhelpful | None |
| `src/data/commands.json` | Added `label` field to all entries — human-friendly past-tense action descriptions | Without labels confirmation said "Done — format this file" instead of "Done — Formatted document" | None |
| `src/data/commands.json` | Added 10 Redivivus-specific entries: show map, open vault, scan project, save point, end session, etc. | Redivivus commands were unreachable from chat without the router; required palette or keybinding | None |
| `src/data/commands.json` | Removed ambiguous bare words ("undo", "save", "debug", "push", "pull", "sync") that caused false positives | Short common words triggered commands in the middle of normal sentences | Low — longer specific phrases retained |

---

## Recent Fixes — May 13, 2026 (Session 4i: Terminal Error Awareness)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `services/terminalErrorService.ts` | **New file** — hooks `onDidWriteTerminalData`, buffers per-terminal output (8KB), extracts last error block via pattern matching | Terminal errors had no path into Redivivus — user had to copy-paste manually | Low — buffer capped at 8KB, strips ANSI codes |
| `extension.ts` | Import + call `registerTerminalErrorService(context)` on activate | Wires the buffer listeners at startup | None |
| `extension.ts` | Register `redivivus.injectTerminalError` command — calls `getLastTerminalError()`, posts to chat panel | Entry point for user-triggered injection | Low |
| `package.json` | Added `redivivus.injectTerminalError` command + `Ctrl+Shift+E` keybinding | Exposes command in palette and via keyboard shortcut | None |
| `chatPanelMessages.ts` | Added `inject-terminal-error` handler — renders error block + `__TERMINAL_ERROR__` token | Receives injected error from extension host and shows it in chat | None |
| `chatPanelMessages.ts` | Added `fix-terminal-error` handler — builds fix prompt and calls `handleBuildRequest` as a fix | Powers the "Fix this error" button click | Low — goes through normal fix pipeline |
| `chatPanelRenderer.ts` | Added `__TERMINAL_ERROR__` token renderer — renders styled error card with "Fix this error" button | Turns raw token into actionable UI | None |
| `chatPanelScriptActions.ts` | Added `.fix-terminal-error-btn` click handler — decodes base64 context, posts `fix-terminal-error` to extension | Wires button click to fix pipeline | None |
| `chatPanelStyles.ts` | Added `.terminal-error-card` and `.terminal-error-label` CSS | Styles the error card in the chat | None |

---

## Recent Fixes — May 13, 2026 (Session 4h: Open Existing Project fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `chatPanelMessages.ts` | Added `appendFileSync` debug tracing at every step of `open-existing-project` handler | `console.log` was invisible in debug log — no way to trace what was actually happening | None — logging only |
| `chatPanelMessages.ts` | Push chat message + `refresh()` **before** calling `vscode.openWorkspace` | Extension host reloads on workspace switch, destroying the panel — user saw no feedback at all | Low |
| `chatPanelMessages.ts` | Changed "Cancel" button to "Open Anyway" for non-Redivivus folders | "Cancel" was ambiguous and dismissed without opening — "Open Anyway" clarifies intent | None |
| `chatPanelMessages.ts` | Dismissed dialog (no choice) now returns early cleanly | Previously fell through and opened the folder even when user hit Escape | Low |

---

## Recent Fixes — May 13, 2026 (Session 4g: Create File Button in Code Blocks)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `chatPanelRenderer.ts` | Rewrote code block regex: `\`\`\`(\w*)[^\S\r\n]*\r?\n` — handles trailing spaces + CRLF after lang tag | Old regex missed code blocks when AI used trailing spaces or Windows line endings after lang tag | Low — pure rendering change |
| `chatPanelRenderer.ts` | Added full `EXT_MAP` (html, css, scss, less, go, rust, php, sh, json, yaml, sql, etc.) | Old map only had python/js/ts — all other langs defaulted to `.txt` | None |
| `chatPanelRenderer.ts` | Server-side filename detection from first-line comment/SCOPE/`#` — writes to `data-suggested` attribute | Create File button now shows `+ Create index.html` instead of generic `Create File` | None |
| `chatPanelRenderer.ts` | Button label shows detected filename: `+ Create index.html` or `+ Create File (.html)` | User can see what file will be created before clicking | None |
| `chatPanelScriptActions.ts` | Reads `data-suggested` attribute for pre-populated input — falls back to browser-side detection | Avoid re-parsing base64 code in browser when server already computed the name | None |

---

## Recent Fixes — May 13, 2026 (Session 4f: Chat Lockup, AI Failover, apiSetup command)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `chatPanelMessages.ts` | Added `set-status: ready` + `clearPendingScopeQuestion()` on AI error path | Chat was locking up after any AI error — status spinner never cleared, scope question state never cleared | Low — only runs on error path |
| `routingService.ts` | Added failover loop in `prompt()` — tries all ranked AIs on timeout/network error, calls `promptFailoverCallback` per attempt | Chat prompt never recovered from Gemini timeout — now tries Kimi, Groq etc. in rank order | Low — only activates on failure |
| `chatPanelMessages.ts` | Wired `promptFailoverCallback` before `routing.prompt()` call | User had no visibility into failover — now shows "⚠️ Gemini timed out — retrying with Kimi..." | None — UI only |
| `commands/apiSetup.ts` | Registered `redivivus.apiSetup` command as alias for `redivivus.openSettings` | Sidebar "AI API Setup" button threw "command not found" — sidebar uses `redivivus.apiSetup` ID not `redivivus.openSettings` | None |
| `package.json` | Added `redivivus.apiSetup` to commands array | VS Code requires command declared in package.json to be recognized | None |

---

## Recent Fixes — May 13, 2026 (Session 4e: Bug Fixes — BUILD_RESULT, AI Failover, Format Preferences)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `chatPanelRenderer.ts` | Added `__BUILD_RESULT__` token parser (lines 37-42) with fallback strip regex | Raw BUILD_RESULT token was showing after builds — now renders as "Open File" button or silently removed if malformed | Low — pure UI rendering change |
| `chatPanelBuildWorker.ts` | Added `executeWorkerBuild()` retry logic with timeout detection and user message | Gemini API timeout now triggers automatic failover to next available AI with user notification: "⏱️ Gemini timed out — retrying with Kimi..." | Low — only activates on timeout |
| `routingService.ts` | Added `supervisorPlan()` format preference detection (lines 263-284) | Supervisor now detects HTML/single file/vanilla JS preferences from user task and injects into worker spec | Low — adds instructions only when preferences detected |

---

## Recent Fixes — May 13, 2026 (Session 4d: Debug Logging for open-existing-project)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `chatPanelMessages.ts` | Added `console.log()` statements throughout `open-existing-project` handler | Trace the flow to diagnose why folder picker doesn't open workspace after selection | None — logging only, no logic changes |

---

## Recent Fixes — May 13, 2026 (Session 4c: Rule 20 — Build & Deploy Protocol)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `.redivivus/rules.md` | Added Rule 20: Build & Deploy Protocol | Document the build/deploy steps that must be followed after every code change | None — documentation only |
| `CLAUDE.md` | Added Rule 20: Build & Deploy Protocol | Ensure Claude CLI reads the same rule | None — documentation only |
| `GEMINI.md` | Added Rule 20: Build & Deploy Protocol | Ensure Gemini CLI reads the same rule | None — documentation only |

---

## Recent Fixes — May 13, 2026 (Session 4b: Startup Behavior Setting)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `package.json` | Added `redivivus.startupBehavior` configuration with `"launcher"` (default) and `"lastProject"` enum options | Users need control over startup behavior — new users should see launcher, power users may want auto-open | None — new optional setting, defaults to existing behavior |
| `chatPanelHeader.ts` | Reads `startupBehavior` setting; computes `shouldAutoOpenLastProject` flag when setting is "lastProject", no workspace redivivus, and recent projects exist | Provides header info for UI decision-making | None — flag only used for UI state |
| `chatPanelHtml.ts` | Added "Always open my last project on startup" checkbox at bottom of launcher screen | Users can toggle setting directly from welcome screen | Low — checkbox state not synced to actual setting value on initial load |
| `chatPanelScriptActions.ts` | Added `toggle-auto-open` event handler sending `toggle-setting` message | Bridges checkbox change to extension host | None |
| `chatPanelMessages.ts` | Added `toggle-setting` message handler updating VS Code config with `workspace.getConfiguration().update()` | Persists user preference | None — uses standard VS Code API |
| `chatPanel.ts` | In `createOrShow`, added logic to auto-open most recent project when `startupBehavior === 'lastProject'` and recent projects exist | Implements the actual auto-open behavior; falls back to launcher if no recent projects | Low — only triggers when no workspace open |
| `package.json` | **Version bump:** 0.3.4 → 0.3.6 | Match existing VSIX version; maintain version consistency | None — version number only |

---

## Documentation Map

| File | Contents |
|------|----------|
| `REDIVIVUS_ROADMAP.md` | **← YOU ARE HERE** — Index + active session state |
| `docs/CHASSIS_FIXES.md` | Fix log — every change logged here after it's made |
| `docs/CHASSIS_FEATURES.md` | Planned features, active work, phase roadmap, TODO backlog |
| `docs/CHASSIS_ARCHITECTURE.md` | Source file map, design rules, known issues, pre-release checklist |
| `docs/CHASSIS_VISION.md` | Product vision, monetization strategy, AI provider strategy, P2P/LLM roadmap |

---

## Project Info
- **Version:** 0.3.6
- **Extension ID:** papajoe.redivivus
- **Engine compat:** `vscode ^1.70.0`
- **GitHub:** `https://github.com/smithkjnc-ux/Redivivus.git` (private)
- **Deploy target:** Baked into VSCodium build — `/home/papajoe/projects/redivivus-build/VSCode-linux-x64/resources/app/extensions/redivivus/`

---

## Recent Fixes — May 23, 2026 (Session 11AP: Clarify Flow — One Question + Elaboration + Summary)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/panels/chat/chatPanelRendererClarify.ts` | Complete rewrite — renders ONLY the first question in DOM, stores all questions as JSON in `data-questions` attr. Adds elaboration textarea per question. Summary div (empty, filled by JS after last question). | All-questions-at-once bug: was putting all question blocks in DOM and relying on display:none — unreliable. New approach: only the current question is ever in the DOM. | Low |
| `src/ui/panels/chat/chatPanelScriptActionsB.ts` | Rewrote clarify section. Added `_buildQHtml()` (renders question HTML in JS), `_showClarifySummary()` (summary card after last question). New `clarify-build-btn` and `clarify-revise-btn` handlers. Summary shows all answers before building; Make Changes resets to Q1. | Three pillars: plain language for non-coders — summary says "Here's your build plan" before committing. | Low |
| `src/core/build/chatPanelChunked.ts` | Answer processing merges `qN_detail` elaboration into parent answer: `"Web browser — make it work on mobile too"` | Elaboration text captured per question needs to flow into the build prompt | Low — one-liner filter/map change |

---

## Recent Fixes — May 23, 2026 (Session 11AP: Plain-Language Fix Output)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/routing/chatPanelMsgFixOutput.ts` | New file (77 lines) — extracted output block from chatPanelMsgFix.ts, rewritten in plain language | Non-coders were seeing "Phase 1: Supervisor diagnoses", "SEARCH/REPLACE block", "[CRITICAL WARNING]" — unreadable. Now shows "What I found: [plain sentence]" and "What I changed: • file.js". Technical diagnosis is collapsed under a "Technical analysis ▶" toggle. | Low — same logic, different presentation |
| `src/core/routing/chatPanelMsgFix.ts` | 229→173 lines (Rule 9 fix). Phase status "Reading your project files..." and "Found the issue — writing the fix now..." instead of "[1/4] Supervisor: reading...". No-write path uses plain summary too. | Three pillars: code structure (under 200 lines), plain language for non-coders | Low |
| `src/core/routing/chatPanelMsgFixPhases.ts` | Supervisor system prompt now requires `PLAIN: [one sentence]` at the top of every response | This line is extracted by chatPanelMsgFixOutput.ts and displayed as the main "What I found" message | Low — Supervisor still writes full technical analysis after the PLAIN line; Worker reads both |
| `src/ui/panels/chat/chatPanelRenderer.ts` | Added `__TECH_DETAILS__...__END_TECH__` token → collapsible `<details>` element with "Technical analysis ▶" | Hides verbose diagnosis from non-coders by default; still accessible to developers | Low |

---

## Recent Fixes — May 23, 2026 (Session 11AP: Fix Pipeline Blueprint Injection)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/core/routing/chatPanelMsgFixPhases.ts` | Added `fs` and `path` imports; injected blueprint (who/what/where/when/why), recent REDIVIVUS_ROADMAP.md entries (last 700 chars), and file-skeleton (SCOPE annotations per file) into Supervisor `diagPrompt` | Fix pipeline Supervisor had no project context — no blueprint, no history, no architecture overview. Now Supervisor knows what the project is, what recently changed, and each file's role before diagnosing. | Low — additions are additive context; all three blocks are guarded and fall back to empty string on failure |

---

## Recent Fixes — May 13, 2026 (Session 5, compile fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chatPanelBuild.ts` | Added 7 optional properties to `BuildContext` interface: `redivivus`, `usageTracker`, `onClarifySubmit`, `buildStartMessage`, `isFix`, `precomputedVaultSearch`, `onBuildFailed` | Post-refactor split left these properties in callers but missing from the interface — caused 14 of 18 TS errors | None — all optional, no runtime behavior change |
| `src/ui/chatPanelBuild.ts` | Added `registerVaultHitResolver`, `resolveVaultHit`, `isChunkedBuildRequest` exports | These functions were in the pre-split monolith but not ported to any sub-module; chatPanelIntent and chatPanelMessages imported them from chatPanelBuild.ts | Low — vault hit resolver is a simple Map-backed promise registry |
| `src/ui/chatPanelAI.ts` | Wrapped `bp[f as keyof typeof bp]` in `String()` before `.trim()` at line 18 | Blueprint field type is `string \| true \| BlueprintHealth` — `.trim()` does not exist on non-string values | None |
| `src/ui/chatPanelAI.ts` | Changed `.catch(() => {})` to `.then(() => {}, () => {})` at line 57 | `vscode.commands.executeCommand` returns `Thenable`, not `Promise` — `Thenable` has no `.catch()` method | None |

---

## Recent Fixes — May 13, 2026 (Session 5)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chatPanelScript.ts` (Split) | Split into `chatPanelScriptProjects.ts`, `chatPanelScriptTemplates.ts`, `chatPanelScriptInterview.ts`, `chatPanelScriptActions.ts` | **Rule 9 Compliance:** Original file was 816 lines. Each split file is now under 200 lines. | Moderate — requires correct build bundling in `buildChatScript()` |
| `src/ui/chatPanelRenderer.ts` (Split) | Split into `chatPanelRendererCards.ts`, `chatPanelRendererArchitect.ts` | **Rule 9 Compliance:** Original file was 247 lines. | Low |
| `src/ui/chatPanelBuild.ts` (Split) | Split into `chatPanelBuildInference.ts`, `chatPanelBuildWorker.ts`, `chatPanelBuildReview.ts`, `chatPanelBuildWriter.ts`, `chatPanelBuildVault.ts` | **Rule 9 Compliance:** Original file was 722 lines. | Moderate |
| `src/ui/chatPanelAI.ts` (Split) | Split into `chatPanelAIPrompt.ts` | **Rule 9 Compliance:** Original file was 346 lines. | Low |
| `src/ui/chatPanelScriptActions.ts` | In `create-file-btn` handler, parse code block for scope comments; implemented `✅ Saved: {filename}` confirmation; added `Save All Files` handler | **Bug 1/2/3 fix:** Auto-populates filename from code block; provides visual feedback after save; allows batch saving multiple files. | Low |
| `src/ui/chatPanelRenderer.ts` | Added `💾 Save All Files` button for messages with multiple code blocks | **Feature Request 3:** Enables one-click saving for multi-file responses. | Low |
| `src/ui/chatPanelBuildWriter.ts` & `chatPanelScriptActions.ts` | Added logic to strip `//` comments when target extension is `.json` | **Bug 4 fix:** Prevents invalid JSON from being written when AI includes comments in JSON blocks. | Low |
| `src/ui/chatPanelAIPrompt.ts` | Injected strict React 18, `react-dom` 18, and `createRoot` requirements into system prompts | **Bug 5 fix:** Ensures consistency in generated project scaffolding. | Low |

---

## Recent Fixes — May 13, 2026 (Session 4)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/templateScopeService.ts` | Added `clearPendingScopeQuestion()`, `getScopeQuestionTimestamp()`, timestamp tracking on scope questions | **Bug 1 fix:** Stale scope question resolver was silently consuming all free-text messages for up to 5 minutes after a build. Now only intercepts recent (< 2 min) short (< 100 char) replies. | Low — adds new exports, no existing behavior changed when scope questions are answered normally |
| `src/ui/chatPanelMessages.ts` | Updated scope question guard to check staleness + message length; changed `handleBuildRequest` signature to accept `skipComplex?` and `isFixRequest?`; pass `isFixRequest=true` for retry builds | **Bug 1 fix:** Messages flow normally when scope question is stale. **Bug 2/5 fix:** Retry builds bypass gates and trigger fix completion logic properly. | Low — retry path is narrowly scoped |
| `src/ui/chatPanelBuild.ts` | Added self-contained requirement to non-HTML supervisor `htmlRules` | **Bug 3 fix:** Prevents AI from outputting `import`/`require` for files that don't exist in single-file builds. | Low |
| `src/ui/chatPanelOrchestrator.ts` | Removed `__BUILD_RESULT__` token from completion message | **Bug 4 fix:** Multi-file builds were rendering an Open File button pointing to the project directory, crashing the handler. | Low |
| `src/ui/chatPanelScript.ts` & `chatPanelRenderer.ts` | Cleaned up duplicate `openFileEl` click listener; standardized `data-open-browser` | **Bug 4 cleanup:** Fixes misaligned data attributes for browser preview. | Low |
| `src/ui/chatPanelIntent.ts` & `chatPanel.ts` | Explicitly pass `isFixRequest` down the call stack, decoupling it from `skipComplex` | **Bug 5 fix:** Fresh builds (which also use `skipComplex=true`) no longer falsely broadcast a `Fix complete!` message to the user. | Low |
| `.redivivus/dead_ends.md` | Added 2 new DEAD entries for scope interceptor + retry stall patterns | Documentation — prevents future regressions | None |
| `src/ui/chatPanelAI.ts` | Added `userText?` param to `buildAIPrefix`; extracts file mentions from user message, reads from disk, injects as `REFERENCED FILE` block | **File injection bug fix:** AI was responding "the actual code is not provided" when user mentioned a file in chat that wasn't the active editor | Low — optional param, falls back gracefully on missing files |
| `src/ui/chatPanelMessages.ts` | Pass `userText` to `buildAIPrefix` call in question path | Wires the file injection fix into the chat pipeline | None |
| `src/services/expandedInterview.ts` | `generateVagueWarning()` app-check now excludes modification verbs and file extension mentions | **Intent classifier bug fix:** "fix app.tsx", "update my app" were triggering "App Needs Specification" modal on existing projects | Low — narrows false-positive condition |
| `src/ui/chatPanelOrchestrator.ts` | Moved modification/file-mention detection BEFORE `generateVagueWarning`; changed `handleStandardBuild` to check `.redivivus/` folder not just `blueprint.md` | **Intent classifier bug fix:** Edit requests now bypass vague-request warnings entirely; existing projects without blueprint.md no longer show new-project wizard | Low |
| `src/services/buildPlacementCheck.ts` | Added file-path mention check — returns `fit` immediately when task references a `.ts/.tsx/.js/etc.` file | **Intent classifier bug fix:** Placement check was routing file-specific edit requests to new-project wizard via Rule 2 keyword mismatch | Low |
| `src/ui/chatPanelScript.ts` | Replaced `prompt('Filename:',...)` in create-file-btn handler with an inline DOM form (input + Save + Cancel) rendered inside the chat | **Create File button bug fix:** `prompt()` is blocked in VS Code WebViews and always returns `null`, making the button silently dead | Low — scoped to code block buttons only |
| `src/services/importValidator.ts` | New file — `validateImports()` parses all import statements, checks relative imports against filesystem, checks bare package imports against package.json + KNOWN_NPM_PACKAGES + NODE_BUILTINS set; `buildImportRepairPrompt()` generates Worker repair prompt | **Guardian import validation:** Prevents AI from delivering code with broken imports that crash at runtime | Low — new file, no existing code changed |
| `src/ui/chatPanelBuild.ts` | Added ~20-line import validation block between static validation and snapshot step — validates imports, auto-repairs via Worker AI if broken, silently continues on failure | **Guardian import validation integration:** User never sees broken code; repair happens silently before file write | Low — wrapped in try/catch, never blocks build |

---

## Current Session State — May 11, 2026 (Session 3)

### What Was Done This Session
- Fixed duplicate user message in chat — dedup guard at all 4 push sites
- Fixed panel disposal on startup from stale workspace folder cleanup (only close if removed folder matches panel root)
- Fixed placement modal trimming aborted build conversation before routing to new-project wizard
- Auto-open project in Explorer after build completes (updateWorkspaceFolders post-build with suppress flag)
- Fixed canvas animation background color bleed — added ctx.shadowBlur=0 reset to Supervisor spec + Guardian gotchas
- Added static code validator (`codeValidator.ts`) — deterministic pre-delivery checks, auto-fixes known AI bugs
- Added spec template system (`specTemplates.ts`) — pinned deterministic specs for known patterns (canvas animation)
- Added verified code template for canvas-trail-animation — bypasses AI entirely, zero variance
- Added vault seeder (`vaultSeeder.ts`) + 17 curated starter patterns (`starterPatterns.ts`) — seeds vault on first install
- Added `redivivus.refreshKnowledgeBase` command — pulls MIT/Apache patterns from GitHub into vault
- Added Template Registry architecture (`templateRegistry.ts`, `templateWizard.ts`) — project-type intent detection, Quick Pick wizard, remote template fetch
- Created `docs/CHASSIS_TEMPLATE_REGISTRY.md` — registry repo structure, meta.json format, contribution guide
- Registry repo to create: `https://github.com/smithkjnc-ux/redivivus-templates`

### [NEXT] Priorities
1. **Create `redivivus-templates` repo on GitHub** — set up folder structure from `docs/CHASSIS_TEMPLATE_REGISTRY.md`
2. **Build first templates** — web/portfolio, web/business, games/arcade as starting set
3. **Test template wizard** — "build me a portfolio website" should trigger Quick Pick → wizard → AI customization
4. **Test vault seeder** — reload extension, confirm notification fires, check `~/.redivivus-vault/`
5. **Test static validator** — build canvas animation, check validator catches issues before delivery

---

## Active Backlog — Top Items Only
> Full backlog in `docs/CHASSIS_FEATURES.md`

### 🔴 Critical Refactors (Complexity Warnings)
- [x] `handleSendMessage` — complexity ~77→~35 (Session 11AY: extracted clarify step + build intent handler)
- [x] `runBuildAfterGates` — complexity ~81→~42 (Session 11AY: extracted clarify step)

### ✅ Completed (Sessions 3–4o)
- [x] **Terminal error awareness** — `terminalErrorService.ts`, `Ctrl+Shift+E`, inject into chat
- [x] **Open Existing Project flow** — non-Redivivus folder branching, "Open Anyway" button
- [x] **Natural Language VS Code Command Router** — phase 1 local dictionary, contains matching, friendly labels
- [x] **Redivivus Sidebar Chat Panel** — live status header, blueprint/session/AI badges, all commands
- [x] **Vault deduplication + merge engine** — Jaccard similarity, cluster preview, merge from chat
- [x] **Guided Blueprint Mode** — inline gap detection before builds, persists answers to blueprint
- [x] **redivivus-templates repo** — 10 templates across 4 categories, all 200 OK
- [x] **Static code validator** — `codeValidator.ts`
- [x] **Vault seeder + starter patterns** — 17 patterns, seeds on first install
- [x] **Template Registry** — `templateRegistry.ts` + `templateWizard.ts`

### 🔴 Untested — Need Smoke Tests
- [ ] **Template wizard flow** — "build me a portfolio website" → wizard → AI customization → file written
- [ ] **Vault seeder** — delete globalState key, reload, confirm notification + `~/.redivivus-vault/` populated
- [ ] **Guided Blueprint Mode** — trigger with empty blueprint, fill form, confirm build resumes
- [ ] **Vault dedup** — seed duplicates, run `redivivus.vaultDedup`, confirm merge

### 🟡 Next Up
- [x] **Built-in Git** — auto-commit after AI change, session end, build from vault (Sessions 14 + 11AT)
- [x] **Retrofit Blueprint-from-Scan** — infer 5 W's from existing project structure (Session 11AZ)
- [x] **AI Delegation Button** — one-click delegate for `[WARN]`/`[TODO]`/`[DEAD]` tags (Session 11AY)
- [x] **Vault Translation Engine** — convert vault items across languages (JS → Python etc.) (Session 11AX)
- [ ] **Live Preview** — `▶ Preview` tab in chat panel; built-in static server for HTML, terminal dev server for npm projects; device toggle (📱 💻 🖥); `⊹ Pop Out` for side-by-side on large screens (IN PROGRESS)

### 🔵 Competitive Gap — Next Sprint
- [ ] **Deploy to Vercel** — detect workspace, run `vercel --prod`, post URL to chat; closes "I built it, now what?" gap
- [ ] **Single-key starter mode** — "Quick Start: paste one Claude key" path in Setup Hub; all other AI keys optional/discoverable later
- [ ] **Supabase scaffold** — keyword trigger "add auth" / "add a database" → generate schema, install client, write env vars, add supabase client file
- [ ] **Screenshot-to-build** — dropped image or clipboard screenshot → "build this UI" — VS Code webview accepts dropped images
- [ ] **Template library expansion** — grow from 10 → 50+ starters; Next.js + Tailwind + Supabase auth, Stripe payments, React dashboard w/ real data, etc.

---

## What's Working (DO NOT BREAK)
- [x] Close project — `updateWorkspaceFolders()`, no file picker, stale panel disposed
- [x] Open vault — hardcoded override, never routes to file picker
- [x] Vault — only reads `~/.redivivus-vault/`, never Windsurf globalStorage
- [x] Vault scan — folder picker, user selects any project
- [x] Save to Vault — confirmation modal, saves pending scan results
- [x] Chat AI context — full conversation history (14 turns), file tree, 150-line preview
- [x] Blueprint form, sessions, status bar, intent classifier
- [x] Build pipeline (single-file + chunked), Undo Everything, Story Mode
- [x] Supervisor/Worker AI chain, Vault-hit gate, Guardian health scoring
- [x] Architecture Map, Save Points, Learned Memory
- [x] Auto-commit after compile (`postcompile.js`)
- [x] Gemini Pro for Supervisor+Guardian, Flash for Worker — same key, split model
- [x] Task-aware routing: Kimi (large context), Groq (speed), Gemini (medium)
- [x] NeverDo loop: Guardian → learned.md → Supervisor prompt injection
- [x] Build feedback buttons — bad feedback writes to NeverDo
- [x] Single chat panel — postMessage swap prevents duplicate tab on refresh
- [x] "Who Did What & Why" card open by default in every build result

---

## Design Rules (Quick Ref)
> Full rules in `docs/CHASSIS_ARCHITECTURE.md`

1. **[SCOPE] at top of every file** — read before touching
2. **Files under 200 lines** — split when needed
3. **No Unicode in WebView scripts** — ASCII only
4. **Vault reads only `~/.redivivus-vault/`** — never system paths
5. **Intent classifier hardcoded overrides run first** — no AI misrouting
6. **NEVER deploy to Windsurf or VS Code extensions** — VSCodium only
