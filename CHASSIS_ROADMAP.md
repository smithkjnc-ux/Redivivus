# CHASSIS — Roadmap Index
> **Rule:** Every AI working on CHASSIS MUST read this file first AND update `docs/CHASSIS_FIXES.md` before ending any session. No exceptions.

*Last updated: May 16, 2026 — Session 10Z: Vault fully functional — quality gate wired, context injected into builds, semantic threshold fixed, AI enrichment command, assembly build uses AI*

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
| `src/commands/vault.ts` | Added `chassis.vault.enrich` command: counts items needing enrichment, confirms with user, runs enrichment with progress notification. Registered in `package.json`. | No way to retroactively improve existing vault items. | Low — user confirms before running; each item requires one AI call. |
| `src/ui/chat/chatPanelBuildVault.ts` | Replaced raw code concatenation with AI-assisted assembly. New prompt: "adapt and combine these vault components to implement the task, fill gaps, fix conflicts". Shows "Assembling from N vault items..." message. Handles AI failure gracefully. Added post-build guidance. | Raw concat produced unrunnable output: no imports merged, no type conflicts resolved, no missing functionality filled. | Low — AI failure returns error message; vault items still visible in chat. |

## Recent Fixes — May 16, 2026 (Session 10Y: Tasks #5–#10 — API pings, diff preview, vault capture, session resume, console.log, UI inspector)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/services/selfDiagnosticChecks.ts` | Replaced fake `[TODO]` ping with real `fetch()` calls to each provider's model-list endpoint (Gemini, OpenAI, Claude, Groq, xAI, Kimi). 5-second AbortController timeout. Returns pass/fail/warn based on HTTP status. | Diagnostic was always returning pass regardless of whether the API key worked. Users couldn't tell if their key was valid or their network was blocked. | Low — read-only GET requests, 5s timeout, errors caught and returned as warn/fail. |
| `src/ui/chat/chatPanelEditBuild.ts` | Added `import * as os`, `import * as vscode`. Before writing edited file: snapshot original to temp path. After writing: compute +N/-N line diff stats, open `vscode.diff()` with temp → final so user can see exactly what changed. Success message includes diff stats. | Edit builds silently overwrote files with no visibility into what changed. Hard to review AI edits. | Low — diff view is non-blocking, write always happens. Temp file cleanup is best-effort. |
| `src/ui/chat/chatPanelBuildUtils.ts` | Added `import * as os`. After vault-only build: write code to temp file with inferred extension, call `autoCaptureFile()`, delete temp. Shows "Saved N snippets to vault" in result. Changed `[NEXT]` to `[DONE]`. | Vault-only build results were never captured to vault — the [NEXT] stub was never implemented. | Low — autoCaptureFile failures are caught, never block the build flow. |
| `src/ui/chat/chatPanelSessionResume.ts` | Created (52 lines). `loadLastSessionContext()` — reads most recent session JSON from `.chassis/sessions/`, surfaces goal/completed/inProgress/nextSessionStart in chat if session is < 48h old. | Chat panel started blank every time — no reminder of what was in progress. Session context helps users resume naturally without re-reading their notes. | None — read-only, push to conversation array only. |
| `src/ui/chat/chatPanel.ts` | Added `loadLastSessionContext` import + call in constructor after `loadBlueprintContext`. | Wire point for session resume. | None — only adds a message if a recent session exists. |
| `src/ui/map/mapScriptActions.ts` | Removed 2 debug `console.log` calls injected into the map webview script (startup + canvas check). Kept `console.error` on abort condition. | console.log in webview-injected scripts leaks to the browser console of every user. Debug noise. | None — removed debug logs only. `console.error` abort kept. |
| `src/ui/views/scriptsCore.ts` | Changed `[TODO]` to `[DONE]` at line 75 — no actual console.log was present in that block. | Stale TODO annotation. | None. |
| `src/ui/chat/chatPanelClassifier.ts` | Removed `console.log` from AI classification error catch block. | Classification failures happen on every misrouted request — the log was noisy extension output. Fallback to `question` is already safe without logging. | None. |
| `src/services/lensService.ts` | Implemented 3 stubs: `captureElement` (stores metadata), `translateToSource` (async walks project files, grepping for class/id/tag/description), `injectContext` (posts found source + snippet to ChatPanel, opens file at matching line). Added `inspectAndInject` high-level entry. Added `walkDir` async generator and `searchProjectFiles` helper. | All 3 methods were empty stubs — the UI Inspector was completely non-functional. | Low — file walk is limited to src/components/app directories, skips node_modules/out. Read-only. |
| `src/extensionInlineCommandsB.ts` | Added `chassis.inspectElement` command: InputBox asks for element description (class, id, or natural text), then calls `lens.inspectAndInject()`. | LensService was implemented but never registered as a callable command. | None. |
| `package.json` | Added `chassis.inspectElement` command registration. | Required for VS Code to recognize the command. Without this, it silently fails. | None. |

## Recent Fixes — May 16, 2026 (Session 10X continued: Task #4 — Expanded 5W Interview panel)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelScriptExpandedInterview.ts` | Created (98 lines). `buildExpandedInterviewScript()` — generates JS `showExpandedInterviewPanel(prefillTask, complexity)`. Single-page scrollable form with 5 sections (WHO/WHAT/WHERE/WHEN/WHY), 7 standard-tier questions (choice+text), submit → posts `expanded-interview-submit`. Skip button posts with `skipped:true`. | Expanded interview panel had no webview UI — the `show-panel: expanded-interview` message was silently ignored. | None — ASCII-only JS per Rule 13. |
| `src/ui/chat/chatPanelScript.ts` | Added `buildExpandedInterviewScript` import and call in script footer. Added `expanded-interview` case to `show-panel` handler. | Webview now handles the panel type message from orchestrator and `chassis.startExpandedInterview`. | None. |
| `src/ui/chat/chatPanelMsgExpandedInterview.ts` | Created (41 lines). `handleExpandedInterviewSubmit()` — compiles 5W answers into a context string, calls `deps.setBlueprintContext()` to inject into build pipeline, then calls `handleBuildRequest` with the prefill task. | Extracted from chatPanelMessages.ts to keep it under 200 lines. | None. |
| `src/ui/chat/chatPanelMessages.ts` | Added `setBlueprintContext?` to `MessageHandlerDeps`. Added `expanded-interview-submit` handler delegating to new sub-module. Added import for `handleExpandedInterviewSubmit`. | Interface needed `setBlueprintContext` so the interview handler can inject context into the build pipeline. | None — optional field, backward compatible. |
| `src/ui/chat/chatPanelMessageRouter.ts` | Added `setBlueprintContext: (ctx: string) => { state.blueprintContext = ctx; }` to deps construction. | Wires the setter from the panel state into the message handler deps. | None. |
| `src/extensionInlineCommandsB.ts` | Updated `chassis.startExpandedInterview` command: now opens ChatPanel (or focuses existing) and posts `show-panel: expanded-interview` with `prefillTask` from blueprint.what. Removed `[TODO]` tag, added `[DONE]`. | Was just forwarding to `chassis.wizardRetrofit`. Now triggers the real expanded interview form. | Low — uses `(panel as any)._panel` accessor like other command handlers. |

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
| `src/ui/chat/chatPanelBuildInference.ts` | `isModificationRequest` changed from sync regex to async AI classifier. Fast paths kept for obvious verbs and explicit file extensions. AI call handles natural follow-up phrasing ("make them realistic", "improve the sounds", "make it faster") that regex cannot catch. [RULE 18] compliant. | "Make them realistic" after a working sound player was not detected as a modification. CHASSIS treated it as a fresh build, wrote a new file without reading the existing code, AI regenerated from scratch using fetch-based audio files that don't exist → no sounds. Root cause: `isModificationRequest` regex required `modify\|update\|change\|fix` etc. — "make" was absent. | Low — fast paths fire before AI call for obvious cases. AI fallback returns `false` on error, which means worst case is a fresh build (same as before). |
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
| `src/services/project/setupProgressSteps.ts` | Created (83 lines). Exports `checkStep1` through `checkStep10` as free functions taking `{chassis, root}` context. | Extracted from setupProgressService.ts. | None. |
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
| `src/ui/chat/chatPanelBuildRunner.ts` | After the build `try/finally` block in `runBuildAfterGates`, added: if `autoCreatedProject && root`, call `vscode.window.showInformationMessage('Project "{name}" built with CHASSIS structure. Open it in the Explorer?', 'Open Folder')`. If user clicks Open Folder, calls `vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root))`. | After auto-create build, VS Code explorer still showed "NO FOLDER OPENED". The `.chassis/` structure was correctly created (dotfolder, invisible in file browser) but the workspace wasn't updated. User needs one click to open the new project in Explorer. Used `showInformationMessage` rather than automatic `updateWorkspaceFolders` to avoid the known chat-freeze bug from session 4s. | Low — `vscode.openFolder` causes a window reload (expected VS Code behavior when opening a new folder). Only fires on auto-create path. |

## Recent Fixes — May 15, 2026 (Session 10j: isProjectsContainer guard — ~/projects open as workspace no longer treated as valid project root)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuildRunner.ts` | Added `isProjectsContainer(root)` helper — resolves the configured `chassis.projectsDirectory` path and returns `true` if `root` matches it. Updated `getLiveRoot()` to call `!isProjectsContainer(liveRoot)` before accepting a workspace folder as a valid build root. When the projects container is the open workspace, `getLiveRoot()` returns `undefined`, which routes to `autoCreateProject()` and builds into a proper named subfolder. | After the Session 10i fix, the user tested again and got the same result — `index.html` dropped directly in `~/projects/`. Root cause: `~/projects/` was open as the VS Code workspace, so `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` returned it as a live, valid path. `isValidBuildRoot` only excludes extension dirs, not the projects container. The 10i `autoCreateProject` logic never ran because `getLiveRoot()` still returned a non-null root. | Low — `isProjectsContainer` is a pure path comparison. Only fires when the exact projects container dir is the open workspace. Any project subfolder (e.g. `~/projects/my-app`) resolves differently and is unaffected. |

## Recent Fixes — May 15, 2026 (Session 10i: Auto-create CHASSIS project folder — no stale workspace root, correct output location)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuildRunner.ts` | Replaced stale `deps.chassis.getWorkspaceRoot()` as the primary root source with `getLiveRoot()` — a new function that reads `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` live. Added `autoCreateProject()`: when Just Build is used with no folder open, derives an AI-based snake_case slug (`deriveFileBase`), creates `~/projects/{slug}/` with `.chassis/config.json` and `.chassis/blueprint.md`, and returns the new project dir as `root` so the build writes into it. Restructured the `!root` block from multiple independent `if` statements into a proper `if/else-if/else` chain so the auto-create path falls through to the build while all other paths still return early. | `ChassisPaths` captures workspace root at extension activation time. If no folder was open at activation, `getWorkspaceRoot()` returned `~/projects` (the projects container). `isValidBuildRoot(~/projects)` passed (exists, not extension dir), so the build wrote `index.html` directly into `~/projects/` with no subfolder and no `.chassis/` structure. User requirement: every built app/file must live in its own named folder with CHASSIS structure, even a single HTML file. | Low — `autoCreateProject` only fires when `buildMode === 'direct'` AND no live workspace folder is open. All other paths (plan mode, simple unit, wizard-confirmed) are unchanged. |

## Recent Fixes — May 15, 2026 (Session 10h: Just Build — remove wizard modal, direct prompt)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelMessages.ts` | Rewrote the `start-new-project` message handler. Previously, both "Plan It Out" and "Just Build" called `vscode.commands.executeCommand('chassis.wizardRetrofit')` which opens the "CHASSIS — New Project Setup" 5-question modal. Now: **Just Build** (`mode='direct'`) pushes a single assistant message — "What would you like to build? Describe it in plain English and I'll get started." — and calls `refresh()`. **Plan It Out** (`mode='plan'`) calls `startPlanInterview` (conversational inline interview) and calls `refresh()`. Neither mode calls `wizardRetrofit` from the launcher. The `wizardRetrofit` modal is for setting up CHASSIS on an EXISTING open project, not for new users starting from the launcher. | User clicked "Just Build" and got the 5-question wizard modal. The expectation is: Just Build = type your request → AI builds it, no wizard. Plan It Out = inline conversational interview, then build. | None — `wizardRetrofit` is still registered and reachable via command palette and other entry points. This change only removes it from the launcher flow. |

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
| `src/ui/chat/chatPanelMessages.ts` | Added debug logging to the `start-new-project` message handler (lines 96, 108-112). Logs: `[chatPanelMessages] start-new-project received mode=X`, `[chatPanelMessages] wizardRetrofit executed OK`, and `[chatPanelMessages] wizardRetrofit ERROR: ...` to `~/chassis_debug.log`. | Need to trace whether the backend receives the `start-new-project` message and whether `chassis.wizardRetrofit` command succeeds or throws. | None — logging-only change. |

## Recent Fixes — May 15, 2026 (Session 10c: Launcher UI — Plan It Out / Just Build moved into Start New Project card)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelHtml.ts` | Redesigned the launcher screen (no `.chassis` folder). Removed the standalone `mode-toggle-bar` that floated above the "Welcome to CHASSIS" title with two separate "📋 Plan It Out" / "⚡ Just Build" buttons. The "Start New Project" card is now a container with a header "🚀 Start New Project — Choose how you want to build" and two side-by-side buttons inside it: "📋 Plan It Out" and "⚡ Just Build". The "Open Existing Project" card remains unchanged below it. | The mode toggle buttons were visually disconnected from the project creation flow. Users saw small standalone buttons above the welcome title, then had to scroll down to find "Start New Project" — the relationship between mode selection and project creation was unclear. | None — purely visual restructuring; the same message types are sent. |
| `src/ui/chat/chatPanelScriptActions.ts` | Updated the launcher button click handler (line 185-187). When a button with `data-action="start-new-project"` is clicked, the handler now reads the `data-mode` attribute (`plan` or `direct`) and includes it in the posted message: `vscode.postMessage({type:'start-new-project', mode: mode || undefined})`. | The webview needs to communicate which mode the user selected so the extension can set it before running the wizard. | None — falls back to `undefined` if no mode attribute is present, preserving backward compatibility. |
| `src/ui/chat/chatPanelMessages.ts` | Updated the `start-new-project` message handler (line 95-106). When `msg.mode` is `"plan"` or `"direct"`, it sets `deps.buildMode` and either starts the plan interview (plan mode) or clears it (direct mode) before running `chassis.wizardRetrofit`. | Previously, clicking "Plan It Out" sent a separate `set-mode` message that only set the mode but didn't trigger the wizard. The user had to click twice. Now a single click on "📋 Plan It Out" inside the Start New Project card both sets the mode AND starts the new project wizard. | None — the `chassis.wizardRetrofit` command is still invoked exactly once. |

## Recent Fixes — May 15, 2026 (Session 10b: Intent classification — fix/modify/choice → build pipeline)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelMsgSendMessage.ts` | (1) Added `MODIFY_TRIGGER_RE` regex covering 25 modify verbs: `fix`, `repair`, `update`, `modify`, `extend`, `improve`, `change`, `edit`, `remove`, `delete`, `swap`, `replace`, `convert`, `refactor`, `reorganize`, `restructure`, `debug`, `correct`, `refine`, `patch`, `solve`, `resolve`, `rebuild`, `rewrite`, `redesign`. (2) Added `FIX_RE` regex to catch patterns like `"can you fix the audio"`, `"it's broken"`, `"doesn't work"`, `"fix this bug"`. (3) Added `CHOICE_RE` regex to catch `"option A"`, `"go with option B"`, `"let's do"`, `"choose"`, `"pick"` after AI presents alternatives. (4) Updated intent routing (line 169) so any match on `BUILD_TRIGGER_RE`, `NEED_BUILD_RE`, `MODIFY_TRIGGER_RE`, `FIX_RE`, or `CHOICE_RE` routes to the build pipeline instead of Q&A. | When the user said `"the program seems to run but no sound can be heard, can you fix this?"` and `"option A"`, the old `BUILD_TRIGGER_RE` only matched creation verbs (`build`, `create`, `make`, etc.). These messages were classified as `question` and sent to the AI chat path, which produced inline code blocks with manual "Create File" buttons instead of triggering the actual build pipeline. | None — additive regexes; any text that previously matched `BUILD_TRIGGER_RE` still matches. |
| `src/ui/chat/chatPanelClassifier.ts` | (1) Expanded fallback `buildVerbs` regex to include `repair`, `debug`, `correct`, `refine`, `patch`, `solve`, `resolve`, `rebuild`, `rewrite`, `redesign`. (2) Fixed the `isQuestion` logic (line 72-76): previously, `"can you fix this?"` matched `can you` → `isQuestion = true`, which blocked the `fix` verb from being recognized. Now `buildVerbs` takes priority: if any build/modify verb is present, it returns `build` immediately. The `isQuestion` check only fires for pure wh-questions that contain NO build verbs. (3) Updated the AI system prompt's `build` intent definition to explicitly include `fix/update/modify/repair/change`. (4) Added 9 new examples to the AI prompt: `"can you fix the audio"`, `"fix this bug"`, `"the button doesn't work"`, `"update the styles"`, `"refactor this into components"`, `"repair the broken link"`, `"convert this to TypeScript"`, `"option A"`, `"go with option B"`, `"let's do the first approach"`. | The AI classifier also lacked training examples for fix/modify/choice patterns. Even when it was called inside `handleBuildRequest`, the fallback keyword detector would misclassify `"can you fix"` as a question. The AI examples now teach the classifier that repair requests and option selections are build intent. | None — prompt-only changes and broader keyword matching. |

## Recent Fixes — May 15, 2026 (Session 10: New-project folder path + workspace auto-open)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelScript.ts` | Fixed `browse-result` message handler (line 134). When the user browses for a parent folder in the New Project wizard, the handler now appends the project name slug to the browsed path before writing it to the `np-folder-path` input. Example: browsing to `/home/papajoe/projects` now sets the path to `/home/papajoe/projects/hi-browser-website` instead of the raw parent directory. | Previously, the browse dialog returned only the parent directory path (e.g., `/home/papajoe/projects`). The `new-project` message then sent this parent path as `folderPath`, and the extension used it directly as the project folder. This caused `.chassis/`, `index.html`, and all project files to be dumped into the parent directory instead of a dedicated subfolder. | None — only affects the webview input value; the Create Project button sends the updated full path. |
| `src/commands/init.ts` | (1) Fixed `targetFolder` construction in `registerOnNewProject`. When `folderPath` is provided, the code now checks if the basename matches the project slug. If not, it joins the slug to create a proper subfolder. (2) After creating and initializing the project, the new folder is now added to the VS Code workspace via `vscode.workspace.updateWorkspaceFolders(...)` so the Explorer shows the project files. The build still resumes immediately via `resumeBuildTask` without reloading the window. | The build wrote files to disk, but VS Code's Explorer showed "NO FOLDER OPENED" because the workspace was never updated. Users could not see their project files in the sidebar. Additionally, files were written to the wrong location when `folderPath` was a browsed parent directory. | Low — `updateWorkspaceFolders` is a standard VS Code API call. If it fails (e.g., unsupported workspace state), the build still completes successfully; only the Explorer visibility is affected. |

## Recent Fixes — May 15, 2026 (Session 9: CHASSIS IDE release pipeline)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `chassis-build/.github/workflows/release.yml` | **NEW** GitHub Actions workflow. Triggers on `v*` tag push or `workflow_dispatch`. Jobs: `create-release` (draft release via gh cli), `build-linux` (8GB swap/fallocate, GCC 10, Node 22.22.1, Python 3.11, Rust, produces AppImage + tar.gz), `build-macos` (optional code signing, produces .dmg + tar.gz), `build-windows` (WMI pagefile 8GB extension, produces .exe NSIS + tar.gz), `publish-release` (runs after all three platform jobs, generates markdown table of direct download URLs grouped by platform, publishes draft). | Ship CHASSIS IDE to all three platforms from a single tag push. 8GB swap prevents OOM during VSCodium's electron/node-gyp compile step. | Medium — first run must validate actual VSCodium build script env vars (CI_BUILD=no, SHOULD_BUILD_APPIMAGE=yes) and asset directory paths. |
| `chassis-build/.github/ISSUE_TEMPLATE/bug_report.md` | Replaced VSCodium-branded generic template with CHASSIS-specific fields: Platform (Linux/Mac/Win checkboxes), OS Version, CHASSIS Version, Steps to Reproduce, Expected Behavior, Actual Behavior, Screenshots (optional), Additional Context. | VSCodium's template had irrelevant VSCodium-specific questions and no CHASSIS version field. | None |
| `CHASSIS_ROADMAP.md` | Added this session log. | Rule: log every change. | None |

**[NEXT]** First release: `git tag v0.3.6 && git push origin v0.3.6` in the chassis-build repo. Watch the Actions run and verify AppImage, .dmg, and .exe artifacts appear in the release with direct download URLs in the release notes body.

## Recent Fixes — May 15, 2026 (Session 8: Pipeline Trace system)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/services/pipelineTracer.ts` | **NEW** Singleton `tracer` service. `start(task)` begins a trace, `step(name, model, hint)` records a step start, `done(sid, status, ms, detail, tokIn, tokOut)` records completion, `failover(from, to, reason)` logs AI failovers, `vault(action, detail)` logs vault ops, `gate(name, result)` logs gate checks, `fileOp(files)` logs writes, `end(files, tokens, cost)` closes the trace. Stores last 20 traces. Outputs to "CHASSIS Pipeline Trace" VS Code Output Channel with `═══ TRACE #N ═══` headers and `[MM:SS:mmm] STEP → detail (Xms) ✅` format. | User asked for end-to-end visibility into every AI call, gate check, failover, vault hit, and file write so they can debug and tune the pipeline. | Low — tracer calls are all try-safe singletons; any failure in tracer code does not affect the build pipeline. |
| `src/ui/chat/chatPanelClassifier.ts` | Wired INTENT step: `step('INTENT', 'AI classifier', text)` before the AI classification call; `done(sid, ok, ms, intent, tokIn, tokOut)` after; `done(sid, 'fail', ...)` in catch. | Captures intent classification timing and the classified type in the trace. | None — additive only |
| `src/ui/chat/chatPanelIntent.ts` | `tracer.start(task)` at the start of `handleBuildRequest` (skipped for skipComplex=true). `tracer.vault('hit', ...)` and `tracer.gate('Vault-Hit', ...)` when vault matches found. `tracer.gate('Cost', ...)` after cost confirmation. | Gates are the first pipeline stages after intent; wiring them here gives a complete trace from user input through all pre-build checks. | None — additive |
| `src/ui/chat/chatPanelBuild.ts` | Wired SUPERVISOR step (before/after `routing.supervisorPlan`), WORKER step (before/after `executeWorkerBuild` — calls `tracer.end([], 0, 0)` on failure), GUARDIAN step (around all review functions), `tracer.fileOp([relPath, ...scaffoldedFiles])` after write, `tracer.vault('save', ...)` + `tracer.end(files, tokens, cost)` at completion. | Main single-file build orchestrator — wiring here covers the majority of CHASSIS builds. | None — tracer calls isolated from build logic |
| `src/ui/chat/chatPanelBuildWorker.ts` | `tracer.failover(failedAI, fallbackAI, 'timed out')` in the explicit failover loop when an AI times out and the build tries a fallback provider. | Failover events are invisible to users and previously untracked — now logged with which model failed and which succeeded. | None |
| `src/ui/chat/chatPanelChunked.ts` | Wired SUPERVISOR step around the planning call (file-list generation). `tracer.done(sid, 'fail', ...)` on plan failure. `tracer.done(sid, 'success', ...)` after successful parse. `tracer.vault('save', ...)` + `tracer.end(builtFiles, tokens, cost)` at chunked build completion. | Multi-file builds have their own planning step that is now traced. | None |
| `src/extension.ts` | Registered `chassis.showPipelineTrace` command: `const { tracer } = await import('./services/pipelineTracer.js'); tracer.show();` | Exposes the Output Channel via Command Palette. | None |
| `package.json` | Added `chassis.showPipelineTrace` / "CHASSIS: Show Pipeline Trace" to `contributes.commands`. | Required for command to appear in Command Palette. | None |
| `CHASSIS_ROADMAP.md` | Added this session log. | Rule: log every change. | None |

**[NEXT]** `chatPanelOrchestrator.ts` is at 201 lines — must be split before wiring tracer into the nano/standard/deep complexity paths. That covers the orchestrated build pipeline (less-used path; single-file and chunked paths are already traced).

## Recent Fixes — May 15, 2026 (Session 7d: Build root validation + Preview in Browser button)

| File | What Changed | Why | Risk |
|------|-------------|------|------|
| `src/ui/chat/chatPanelBuildUtils.ts` | **NEW** `isValidBuildRoot(root)` utility. Returns `false` if root is undefined, non-existent, or contains `/extensions/chassis` or `/resources/app/extensions/` (prevents writing to the CHASSIS extension directory or any VS Code extensions dir). | When no valid user project was open, `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` or `chassis.getWorkspaceRoot()` could resolve to the extension folder, causing builds to write `index.html` and other files into the extension directory instead of a user project. | None — additive guard function; any path that was previously valid remains valid. |
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
| `src/ui/chat/chatPanelPlanInterview.ts` | **NEW FILE** — Conversational 5 W's interview engine. `startPlanInterview(state)` initializes interview state and posts welcome + first question. `handlePlanInterviewAnswer(msg, deps)` processes answers, advances through WHAT→WHO→WHERE→WHEN→WHY, generates follow-ups for vague answers, builds summary, waits for "yes"/"go" confirmation, then triggers build. `generateFollowups()` detects vague requests (short answers, generic "game"/"app"/"tool" with no detail) and asks 2-3 targeted follow-ups. `buildTaskFromAnswers()` constructs a rich build task from all answers. `saveBlueprint()` persists 5W answers to project config. | Clicking "Plan It Out" previously just set the mode and showed a blank chat. Users had no guidance. Now CHASSIS immediately starts a friendly conversational interview inline in the chat, guiding users who don't know how to describe what they want technically. | Low — interview is opt-in (only when user explicitly clicks "Plan It Out"). Normal chat and Direct Build flows unaffected. |
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
| `src/ui/chat/chatPanelIntent.ts` | (1) Added `buildMode` to `BuildRequestDeps`. (2) Scope clarification (`isVagueProjectRequest`) is skipped when `buildMode === 'direct'` (auto-approve scope). (3) Cost estimate gate is skipped when `buildMode === 'direct'` (auto-approve). (4) Plan mode: before `runBuildAfterGates`, checks if blueprint is complete. If incomplete, triggers `chassis.blueprintInterview` command and returns. | Direct mode must skip interview gates silently and execute immediately. Plan mode must ensure blueprint completeness before any code generation. | Low — skips existing gates conditionally; no new async paths. |
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
| `src/ui/chat/chatPanelMsgSendAI.ts` | Added `lastResponseModel` variable to track which model actually answered. Footer attribution now uses `MODEL_TO_LABEL[lastResponseModel]` instead of `routing.getAvailableAI().label`. | `getAvailableAI()` reads `chassis.defaultAI` (often 'gemini') regardless of which AI actually responded. If Claude (rank 10) answered, the footer still showed "— Gemini*". Now shows the actual AI. | None — falls back to `getAvailableAI()` when model string not recognized |
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
| `src/services/ai/routingService.ts` | Added `getPreferredAI()` method that reads `chassis.defaultAI` from VS Code config. | `routeByComplexityImpl` needed access to the user's explicitly selected AI without coupling to VS Code directly. | None — read-only getter |
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
| `src/ui/chat/chatPanelAI.ts` | [DEAD] Previous approach: injected code gen rules INTO the CHASSIS system prompt. Replaced with: complete code gen prompt bypass. New `buildCodeGenPrefix()` replaces the 44-line CHASSIS identity/capabilities/rules prompt with a 10-line focused code generator prompt. New `findSourceFiles()` reads source code directly from disk (scans `src/` then root for code files) instead of relying on `activeTextEditor` which may not have the right file when user is in the chat panel. | The AI was receiving CHASSIS identity noise (capabilities list, behavioral rules, vault instructions, blueprint) that distracted it from the actual task. Also, `activeTextEditor` returns undefined or wrong file when user is in the webview chat panel. Antigravity reads files explicitly and uses focused prompts — CHASSIS now does the same. | Medium -- code gen requests bypass the CHASSIS system prompt entirely; question/answer flow unchanged |
| `src/ui/chat/chatPanelCodeStructure.ts` | **New file** — `applyChassisStructure()` adds [SCOPE] tag at line 1 and NARRATOR comments above functions. Runs as a post-processing pass on auto-saved code. Supports all CHASSIS comment syntaxes (JS/TS/Python/Go/HTML/CSS etc.). | CHASSIS rules were being injected into the AI prompt, distracting it from writing working code. Now rules are applied AFTER code generation: "generate first, structure after." | Low — only adds comments to generated code; never modifies logic |
| `src/ui/chat/chatPanelAutoSave.ts` | Wired `applyChassisStructure()` into `autoSaveAndOpen()` — runs before file write | Ensures all auto-saved code gets CHASSIS structural compliance without burdening the AI | Low — additive post-processing only |
| `src/ui/chat/chatPanelProjectContext.ts` | **New file** — `buildProjectAnnotationContext()` scans all project files and extracts [SCOPE], [WARN], [TODO], [DEAD] into a compact AI-readable summary. 30-second cache to avoid rescanning on every message. Reuses `walk`/`extractScope`/`countPattern` from `mapBuilderHelpers.ts`. | CHASSIS annotations are designed to give AI project awareness without loading entire files. A 50-file project becomes ~200 tokens of annotation context instead of 50,000 tokens of raw code. This is the CHASSIS protocol advantage over other editors that brute-force load everything. | Low — read-only scan with caching; no file modifications |
| `src/ui/chat/chatPanelAI.ts` | Wired `buildProjectAnnotationContext()` into the question/chat path. AI now sees [SCOPE] from ALL project files when answering questions. | Gives the AI instant project-wide awareness. User can ask "what does this project do?" or "which files have warnings?" and the AI can answer from annotations. | Low — only adds context to question path; code gen path unchanged |
| `src/services/ai/routingProviders.ts` | Added `generationConfig: { maxOutputTokens: 65536 }` to Gemini API request body; added `finishReason` check for `MAX_TOKENS` truncation | Without `maxOutputTokens`, Gemini was using a default limit that truncated code generation at ~100 lines. The generated file was cut off mid-word in a function. Now requests the max output (65536 tokens = ~49,000 words). | Low — only affects Gemini request body |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Skip Guardian review for code generation requests. Added `isCodeGenRequest` regex check before Guardian call. | Guardian was receiving the generated code block and "correcting" it — which corrupted the output. The file ended with "Guardian (kimi) reviewed and corrected this response" and was truncated. Code gen now bypasses Guardian entirely; the post-processor handles CHASSIS compliance. | Medium — Guardian no longer reviews code gen output; still reviews question/answer responses |
| `src/ui/chat/chatPanelChunkedGen.ts` | **New file** — `splitSourceIntoSections()` detects class/function/enum boundaries and splits source code into ~200-line logical sections. `chunkedGenerate()` generates each section separately via multiple API calls with accumulated context and progress updates. `assembleOutput()` combines chunks, removing duplicate HTML structure from continuation chunks. | Single API call was truncating at ~100 lines for a 393-line source. Chunked approach: split → generate section by section → assemble. No file size limit. | Medium — multiple API calls; progress messages show in chat |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Wired chunked generation: when code gen + source >300 lines, routes to `chunkedGenerate()` instead of single `routing.prompt()`. Shows "📦 Large file detected" progress. Token tracking for both chunked and single paths. | Flappy Bird (393 lines) was too large for a single API call. Now any file size works — 300, 3000, or 30,000 lines. | Medium — changes the code gen flow for large files; small files and questions unchanged |
| `src/ui/chat/chatPanelAI.ts` | Exported `findSourceFiles()` and `SourceFile` interface so `chatPanelMsgSendAI.ts` can check file sizes before deciding chunked vs. single-call path | Chunked generation needs to inspect source file sizes before deciding which path to use | Low — export only, no logic changes |
| `src/ui/chat/chatPanelChunkedGen.ts` | [DEAD] Previous approach: sent only section source to AI. AI couldn't produce coherent code for small fragments (12-line gameLoop was shredded). **Rewritten**: every API call now gets the FULL source file with instructions to generate a specific line range. Also added minimum section size (80 lines) and auto-merge for tiny trailing sections (<50 lines). Assembly ensures closing `</html>` tag. | The AI needs full context to produce coherent code. Sending a 12-line fragment produced a broken gameLoop function with missing declarations. Now the full 393-line source is visible in every call. | Medium — fundamentally different chunking strategy |
| `src/ui/chat/chatPanelAutoSave.ts` | Added `shouldDeleteFiles()` and `deleteRequestedFiles()` — detects delete/remove verbs in user text, finds matching files by name or extension, removes them from disk | User asked CHASSIS to "delete both html files" — CHASSIS had no file deletion capability. Now it does. | Medium — adds file deletion; only triggers on explicit delete verbs |
| `src/ui/chat/chatPanelMsgSendAI.ts` | Wired file deletion: checks `shouldDeleteFiles()` before code gen and deletes matching files. Shows "🗑️ Deleted: ..." confirmation. | Users expect to be able to delete files through chat, like Antigravity does. | Medium — adds delete before generate flow |
| `src/ui/chat/chatPanelChunkedGen.ts` | [DEAD] Previous `assembleOutput()` only stripped `</html>` and `</body>` from intermediate chunks but NOT `</script>`. Chunk 1's `</script></body></html>` remained, so chunk 2's JavaScript was placed AFTER the closing script tag — rendered as raw text in the browser. **Fixed**: now strips `</script>`, `</body>`, `</html>` from ALL chunks except the last. Also strips `<script>`, `<canvas>` from non-first chunks. Ensures all three closing tags exist in final output. | The file looked correct (410 lines, had DOCTYPE, etc.) but the game was blank because the browser stopped parsing JS at `</script>` on line 246, and the remaining 164 lines of game logic were treated as plain text. | High — this was the root cause of every "blank screen" bug |
| `src/ui/chat/chatPanelCodeStructure.ts` | [DEAD] `addNarratorComments()` had `if (!syntax.line) return lines` which skipped ALL HTML files since HTML only has block comments (`<!-- -->`). **Fixed**: now tracks `<script>` blocks and uses `//` for NARRATOR comments inside JS contexts. Verified: 11 functions in flappy-bird `index.html` all get NARRATOR annotations now. | HTML files are the most common code gen target (browser games, apps, tools). Skipping them meant 0 annotations on all generated HTML. | Low — only adds comments inside `<script>` blocks |
| `src/ui/chat/chatPanelMsgSendAI.ts` | [DEAD] Three bugs found during testing: (1) Guardian `hasCodeBlock` matched inline backticks (`` `filename.ts` ``) — fixed to only match fenced code blocks (` ``` `). (2) `CODE_GEN_RE` was too broad — "build" alone triggered code gen, causing "build a pong game" to inject unrelated flappy-bird source files. Split into `CODE_GEN_RE` (convert verbs) and `NEW_BUILD_RE` (build + article + noun). (3) For new builds, source files from the current project are no longer injected — user asked for Pong, got Flappy Bird again because the source files were in the prompt. | Guardian was corrupting ALL question responses that mentioned filenames in backticks. Code gen was using wrong source files for new project requests. | High — fixes both question and code gen paths |
| `src/ui/chat/chatPanelProjectContext.ts` | [DEAD] Scanner only walked `root/` when `src/` had zero files. If `src/` had even 1 file, root-level files (index.html, config) were invisible. **Fixed**: now scans BOTH `src/` AND root with deduplication. | Test showed "0% annotated, 0 WARNs" for flappy-bird even though `index.html` had `[SCOPE]`. The scanner only found `src/flappy_bird_clone.ts` and missed `index.html` at root. | Low — additive scan, no behavior changes for src-only projects |
| `src/data/commands.json` | Added "close project" / "close folder" / "close workspace" / "close current project" phrases mapping to `workbench.action.closeFolder` | User said "close the current project" — AI generated text saying "project closed" without executing anything. The phrase was missing from the command dictionary so the command router didn't intercept it, and the AI just hallucinated an action. | Low — adds command phrase, no code changes |
| `src/services/commandRouter.ts` | [DEAD] Previous approach: dictionary-only matching. If the phrase wasn't in the JSON list, the command was missed and the AI hallucinated the action. **Rewritten with 3 layers**: (1) Dictionary — exact/contains match (free, instant). (2) Fuzzy — Levenshtein distance catches typos like "clse projct" → "close project" (free, instant, max 3 edit distance). (3) AI classify — sends compact command list (~200 tokens) to the AI for semantic matching. Handles "shut down this workspace", "get rid of this folder", or any novel phrasing. | Hardcoded phrase lists can never cover all wordings. Users type naturally — with typos, novel phrasing, and synonyms. The three-layer approach handles all cases while keeping the common path (dictionary) zero-cost. | Medium — AI fallback costs ~50 tokens per unrecognized command |
| `src/ui/chat/chatPanelMsgSendMessage.ts` | Passes `routing` to `tryRouteToVSCodeCommand()` so the AI classification layer can use the configured AI provider | AI classify layer needs access to the routing service | Low — parameter passthrough |
| `src/ui/chat/chatPanelAutoSave.ts` | Three non-tech-friendly fixes: (1) Save message now shows full path: `✅ Saved: calc.html → ~/projects/myapp/`. (2) When no workspace is open, shows a native folder picker dialog instead of silently saving to a broken path. (3) Removed dead overwrite-check code that wasn't doing anything. | User asked "where did it save?" — the old message just said `Saved: calc.html` with no path. With no workspace open, the file saved to a bad location (or didn't save at all). Non-technical users need to see exactly where their file went. | Low — better UX, no behavior changes for workspace-open case |
| *Multiple files — Non-Tech-Friendly UX Pass* | Rewrote **all user-facing messages** across 8 files to remove technical jargon: `chatPanelMsgSendAI.ts` (AI Error→friendly, failover→switching), `chatPanelMsgArchitect.ts` (No workspace→No project folder, TODOs→to-do items), `chatPanelMsgFileOps.ts` (snapshot ID→nothing to undo), `chatPanelMsgMapContext.ts` (Error→try again), `statusBar.ts` (Not initialized→Getting started), `analyzerService.ts`, `retrofitService.ts`, `timelineService.ts` (all workspace→project folder). Every error now uses ✅/❌/⚠️ emojis and actionable instructions instead of raw error messages. | CHASSIS must be usable by non-technical users. "AI failover", "No workspace", "snapshot ID", and raw error.message strings are developer jargon that confuse vibe coders. | Low — text-only changes, no logic changes |
| `sidebarProvider.ts` + `chassisSidebar.ts` | **Fixed 8 dead sidebar buttons** where the button called a command name that didn't match the registered command. Mapping: `apiSetup`→`openSettings`, `newProject`→`wizard`, `githubBackup`→`configureGitHubBackup`, `scanProject`→`analyze`, `checkFile`→`checkFileHealth`, `cleanFile`→`cleanUpFile`, `workLog`→`log`, `deadEnds`→`deadends`. Both the tree-view sidebar and the HTML webview sidebar had identical mismatches. | User clicked "AI API Setup" and got "command chassis.apiSetup not found" — the command was registered as chassis.openSettings but the sidebar was calling chassis.apiSetup. All 8 broken buttons were invisible until someone actually clicked them. | Low — corrects string references only |
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
| `chatPanelChunked.ts` | **Removed orchestrated build bypass**. Multi-AI orchestration now runs through the existing supervisor/worker planning step and Guardian review. | The previous attempt to wire in `routing.orchestratedBuild` bypassed the entire CHASSIS pipeline (file saving, project creation, vault capture). It just dumped raw code into the chat. | Medium — restores proper pipeline behavior |
| `chatPanelMsgSendAI.ts` | **Added AI attribution** — every response now shows "— Claude" or "— Gemini (fallback)" footer. Fixed remaining raw `AI Error:` message. Added retry hint on errors (shows user's original message + up-arrow tip). | Users with 4 AIs had no idea which AI answered. Error messages still had one raw technical string. No guidance on how to retry. | Low — text additions only |
| `sidebarProvider.ts` + `chassisSidebar.ts` | **Removed "Coming Soon" Profile section** from both sidebars. Added [NEXT] tag for future re-add. | Dead weight — two disabled buttons that every user sees. Confusing for non-tech users who might think the extension is incomplete. | Low — UI cleanup |

## Recent Fixes — May 14, 2026 (Session 4q+++: projects picker click fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelMsgProjectOps.ts` | `handleOpenProject()`: replaced `vscode.commands.executeCommand('vscode.openWorkspace', ...)` with `vscode.openFolder` using the folder URI directly. Removed `.code-workspace` file creation logic. Added `await` to ensure command completion. | The CHASSIS Projects picker modal rendered correctly but clicking a project did nothing because `vscode.openWorkspace` with a `.code-workspace` file was silently failing. Using `vscode.openFolder` opens the folder directly, which then triggers `onDidChangeWorkspaceFolders` and auto-initializes CHASSIS if `.chassis/` exists. | Low -- same pattern as `handleOpenExistingProject`; just uses correct VS Code command |

## Recent Fixes — May 14, 2026 (Session 4q++: selfDiagnostic wiring)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/extension.ts` | Added `import { runDiagnostic } from './services/selfDiagnostic.js'`; registered `chassis.selfDiagnostic` command in `activate()` that calls `runDiagnostic(context, chassisService)` | Wire new self-diagnostic service into the extension activation flow | Low -- delegates to existing runDiagnostic; no logic changes |
| `package.json` | Added `chassis.selfDiagnostic` command entry under `contributes.commands` with title "CHASSIS: Run Self-Diagnostic" and category "CHASSIS" | Required for VS Code to recognize and surface the command in palette | None -- declarative only |

## Recent Fixes — May 14, 2026 (Session 4q+: system prompt expansion)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chat/chatPanelAIPrompt.ts` | Expanded `getSystemPrompt()` to always include CHASSIS identity, 10-item capabilities list, and 10 behavioral rules -- regardless of whether a project is open. Added `bpSection` helper that shows "No project open yet" when blueprint is absent instead of the old bare "No blueprint set." | User requirement: AI must know it is CHASSIS and be able to describe its features even when `isInitialized()` returns false and no project is open | Very low -- only prompt text changed; no logic or API changes |

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

## Recent Fixes — May 13, 2026 (Session 4o: chassis-templates complete)

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

## Recent Fixes — May 13, 2026 (Session 4n: chassis-templates)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `chassis-templates/web/portfolio/index.html` | Verified present and correct -- dark single-page portfolio with hero, about, projects, contact; placeholder tokens `YOUR_NAME`, `YOUR_TAGLINE`, `PRIMARY_COLOR` for AI substitution | Required by templateRegistry.ts `web/portfolio/index.html` registryPath | None -- read-only template |
| `chassis-templates/games/arcade/index.html` | Verified present -- canvas arcade game with player, bullets, enemies, score, lives, RAF loop; `GAME_TITLE`, `BG_COLOR` placeholders | Required by templateRegistry.ts `games/arcade/index.html` | None |
| `chassis-templates/apps/crud/index.html` | Verified present -- CRUD app with add/edit/delete, XSS-safe render, Enter key support; `APP_NAME`, `ENTITY_NAME`, `PRIMARY_COLOR` placeholders | Required by templateRegistry.ts `apps/crud/index.html` | None |
| `chassis-templates/registry.json` | Updated `lastUpdated` to 2026-05-13; removed stray `{web/` directory | Stale date; garbage directory from earlier session | None |
| Remote validation | All 3 raw URLs return HTTP 200 -- `web/portfolio`, `games/arcade`, `apps/crud` | Confirms `fetchTemplate()` in extension will succeed for these paths | None |

---

## Recent Fixes — May 13, 2026 (Session 4m: Live Sidebar)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `ui/chassisSidebar.ts` | Rewrote `getSidebarHtml()` to accept `ChassisService` + `SessionService` and render live status header: project name, blueprint badge (No Blueprint/Draft/Locked), session badge, AI badge (key present or not) | Sidebar was completely static -- showed no live context | Low -- pure HTML render, no state mutation |
| `ui/chassisSidebar.ts` | Added `constructor(chassis, sessions)` + `refresh()` to `ChassisSidebarProvider` | Services needed to populate status header; `refresh()` needed to be callable from outside on state change | None |
| `ui/chassisSidebar.ts` | Fixed `chassis.openChat` -> `chassis.openChatPanel` (was a broken command ID) | Sidebar chat button never worked | None |
| `ui/chassisSidebar.ts` | Added `chassis.vaultDedup` (Clean Vault Duplicates) and `chassis.injectTerminalError` (Fix Last Terminal Error) to the command list | New commands from previous sessions were missing from sidebar | None |
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
| `chatPanelMessages.ts` | Added `blueprint-gap-answer` handler -- persists answers to blueprint via `chassis.saveConfig()`, then resumes build | Wires form submission to blueprint persistence + build continuation | Low |
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
| `extension.ts` | Register `chassis.vaultDedup` command -- scans, shows count in notification, offers "Merge", "Preview in Chat", "Cancel" | User entry point via Command Palette | Low |
| `package.json` | Added `chassis.vaultDedup` command declaration | Required for VS Code palette discovery | None |
| `chatPanelMessages.ts` | Added `vault-dedup-preview` handler -- renders cluster list + `__VAULT_DEDUP_ACTIONS__` token | Shows full duplicate report in chat with a Merge button | None |
| `chatPanelMessages.ts` | Added `vault-dedup-merge` handler -- calls `chassis.vaultDedup` from chat button | Wires chat button back to the command | None |
| `chatPanelRenderer.ts` | Added `__VAULT_DEDUP_ACTIONS__` token renderer -- yellow "Merge duplicates" button + warning text | Turns raw token into actionable UI | None |
| `chatPanelScriptActions.ts` | Added `.vault-dedup-merge-btn` click handler -- posts `vault-dedup-merge` message | Wires button to extension host | None |
| `src/data/commands.json` | Added "dedup vault", "clean vault", "vault cleanup" NL phrases routing to `chassis.vaultDedup` | Type "clean vault" in chat and it runs the command directly | None |

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
| `src/data/commands.json` | Added 10 CHASSIS-specific entries: show map, open vault, scan project, save point, end session, etc. | CHASSIS commands were unreachable from chat without the router; required palette or keybinding | None |
| `src/data/commands.json` | Removed ambiguous bare words ("undo", "save", "debug", "push", "pull", "sync") that caused false positives | Short common words triggered commands in the middle of normal sentences | Low — longer specific phrases retained |

---

## Recent Fixes — May 13, 2026 (Session 4i: Terminal Error Awareness)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `services/terminalErrorService.ts` | **New file** — hooks `onDidWriteTerminalData`, buffers per-terminal output (8KB), extracts last error block via pattern matching | Terminal errors had no path into CHASSIS — user had to copy-paste manually | Low — buffer capped at 8KB, strips ANSI codes |
| `extension.ts` | Import + call `registerTerminalErrorService(context)` on activate | Wires the buffer listeners at startup | None |
| `extension.ts` | Register `chassis.injectTerminalError` command — calls `getLastTerminalError()`, posts to chat panel | Entry point for user-triggered injection | Low |
| `package.json` | Added `chassis.injectTerminalError` command + `Ctrl+Shift+E` keybinding | Exposes command in palette and via keyboard shortcut | None |
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
| `chatPanelMessages.ts` | Changed "Cancel" button to "Open Anyway" for non-CHASSIS folders | "Cancel" was ambiguous and dismissed without opening — "Open Anyway" clarifies intent | None |
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
| `commands/apiSetup.ts` | Registered `chassis.apiSetup` command as alias for `chassis.openSettings` | Sidebar "AI API Setup" button threw "command not found" — sidebar uses `chassis.apiSetup` ID not `chassis.openSettings` | None |
| `package.json` | Added `chassis.apiSetup` to commands array | VS Code requires command declared in package.json to be recognized | None |

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
| `.chassis/rules.md` | Added Rule 20: Build & Deploy Protocol | Document the build/deploy steps that must be followed after every code change | None — documentation only |
| `CLAUDE.md` | Added Rule 20: Build & Deploy Protocol | Ensure Claude CLI reads the same rule | None — documentation only |
| `GEMINI.md` | Added Rule 20: Build & Deploy Protocol | Ensure Gemini CLI reads the same rule | None — documentation only |

---

## Recent Fixes — May 13, 2026 (Session 4b: Startup Behavior Setting)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `package.json` | Added `chassis.startupBehavior` configuration with `"launcher"` (default) and `"lastProject"` enum options | Users need control over startup behavior — new users should see launcher, power users may want auto-open | None — new optional setting, defaults to existing behavior |
| `chatPanelHeader.ts` | Reads `startupBehavior` setting; computes `shouldAutoOpenLastProject` flag when setting is "lastProject", no workspace chassis, and recent projects exist | Provides header info for UI decision-making | None — flag only used for UI state |
| `chatPanelHtml.ts` | Added "Always open my last project on startup" checkbox at bottom of launcher screen | Users can toggle setting directly from welcome screen | Low — checkbox state not synced to actual setting value on initial load |
| `chatPanelScriptActions.ts` | Added `toggle-auto-open` event handler sending `toggle-setting` message | Bridges checkbox change to extension host | None |
| `chatPanelMessages.ts` | Added `toggle-setting` message handler updating VS Code config with `workspace.getConfiguration().update()` | Persists user preference | None — uses standard VS Code API |
| `chatPanel.ts` | In `createOrShow`, added logic to auto-open most recent project when `startupBehavior === 'lastProject'` and recent projects exist | Implements the actual auto-open behavior; falls back to launcher if no recent projects | Low — only triggers when no workspace open |
| `package.json` | **Version bump:** 0.3.4 → 0.3.6 | Match existing VSIX version; maintain version consistency | None — version number only |

---

## Documentation Map

| File | Contents |
|------|----------|
| `CHASSIS_ROADMAP.md` | **← YOU ARE HERE** — Index + active session state |
| `docs/CHASSIS_FIXES.md` | Fix log — every change logged here after it's made |
| `docs/CHASSIS_FEATURES.md` | Planned features, active work, phase roadmap, TODO backlog |
| `docs/CHASSIS_ARCHITECTURE.md` | Source file map, design rules, known issues, pre-release checklist |
| `docs/CHASSIS_VISION.md` | Product vision, monetization strategy, AI provider strategy, P2P/LLM roadmap |

---

## Project Info
- **Version:** 0.3.6
- **Extension ID:** papajoe.chassis
- **Engine compat:** `vscode ^1.70.0`
- **GitHub:** `https://github.com/smithkjnc-ux/CHASSIS.git` (private)
- **Deploy target:** Baked into VSCodium build — `/home/papajoe/projects/chassis-build/VSCode-linux-x64/resources/app/extensions/chassis/`

---

## Recent Fixes — May 13, 2026 (Session 5, compile fix)

| File | What Changed | Why | Risk |
|------|-------------|-----|------|
| `src/ui/chatPanelBuild.ts` | Added 7 optional properties to `BuildContext` interface: `chassis`, `usageTracker`, `onClarifySubmit`, `buildStartMessage`, `isFix`, `precomputedVaultSearch`, `onBuildFailed` | Post-refactor split left these properties in callers but missing from the interface — caused 14 of 18 TS errors | None — all optional, no runtime behavior change |
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
| `.chassis/dead_ends.md` | Added 2 new DEAD entries for scope interceptor + retry stall patterns | Documentation — prevents future regressions | None |
| `src/ui/chatPanelAI.ts` | Added `userText?` param to `buildAIPrefix`; extracts file mentions from user message, reads from disk, injects as `REFERENCED FILE` block | **File injection bug fix:** AI was responding "the actual code is not provided" when user mentioned a file in chat that wasn't the active editor | Low — optional param, falls back gracefully on missing files |
| `src/ui/chatPanelMessages.ts` | Pass `userText` to `buildAIPrefix` call in question path | Wires the file injection fix into the chat pipeline | None |
| `src/services/expandedInterview.ts` | `generateVagueWarning()` app-check now excludes modification verbs and file extension mentions | **Intent classifier bug fix:** "fix app.tsx", "update my app" were triggering "App Needs Specification" modal on existing projects | Low — narrows false-positive condition |
| `src/ui/chatPanelOrchestrator.ts` | Moved modification/file-mention detection BEFORE `generateVagueWarning`; changed `handleStandardBuild` to check `.chassis/` folder not just `blueprint.md` | **Intent classifier bug fix:** Edit requests now bypass vague-request warnings entirely; existing projects without blueprint.md no longer show new-project wizard | Low |
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
- Added `chassis.refreshKnowledgeBase` command — pulls MIT/Apache patterns from GitHub into vault
- Added Template Registry architecture (`templateRegistry.ts`, `templateWizard.ts`) — project-type intent detection, Quick Pick wizard, remote template fetch
- Created `docs/CHASSIS_TEMPLATE_REGISTRY.md` — registry repo structure, meta.json format, contribution guide
- Registry repo to create: `https://github.com/smithkjnc-ux/chassis-templates`

### [NEXT] Priorities
1. **Create `chassis-templates` repo on GitHub** — set up folder structure from `docs/CHASSIS_TEMPLATE_REGISTRY.md`
2. **Build first templates** — web/portfolio, web/business, games/arcade as starting set
3. **Test template wizard** — "build me a portfolio website" should trigger Quick Pick → wizard → AI customization
4. **Test vault seeder** — reload extension, confirm notification fires, check `~/.chassis-vault/`
5. **Test static validator** — build canvas animation, check validator catches issues before delivery

---

## Active Backlog — Top Items Only
> Full backlog in `docs/CHASSIS_FEATURES.md`

### ✅ Completed (Sessions 3–4o)
- [x] **Terminal error awareness** — `terminalErrorService.ts`, `Ctrl+Shift+E`, inject into chat
- [x] **Open Existing Project flow** — non-CHASSIS folder branching, "Open Anyway" button
- [x] **Natural Language VS Code Command Router** — phase 1 local dictionary, contains matching, friendly labels
- [x] **CHASSIS Sidebar Chat Panel** — live status header, blueprint/session/AI badges, all commands
- [x] **Vault deduplication + merge engine** — Jaccard similarity, cluster preview, merge from chat
- [x] **Guided Blueprint Mode** — inline gap detection before builds, persists answers to blueprint
- [x] **chassis-templates repo** — 10 templates across 4 categories, all 200 OK
- [x] **Static code validator** — `codeValidator.ts`
- [x] **Vault seeder + starter patterns** — 17 patterns, seeds on first install
- [x] **Template Registry** — `templateRegistry.ts` + `templateWizard.ts`

### 🔴 Untested — Need Smoke Tests
- [ ] **Template wizard flow** — "build me a portfolio website" → wizard → AI customization → file written
- [ ] **Vault seeder** — delete globalState key, reload, confirm notification + `~/.chassis-vault/` populated
- [ ] **Guided Blueprint Mode** — trigger with empty blueprint, fill form, confirm build resumes
- [ ] **Vault dedup** — seed duplicates, run `chassis.vaultDedup`, confirm merge

### 🟡 Next Up
- [ ] **Built-in Git** — auto-commit after AI change, session end, build from vault
- [ ] **Retrofit Blueprint-from-Scan** — infer 5 W's from existing project structure
- [ ] **AI Delegation Button** — one-click delegate for `[WARN]`/`[TODO]` tags
- [ ] **Vault Translation Engine** — convert vault items across languages (JS → Python etc.)

---

## What's Working (DO NOT BREAK)
- [x] Close project — `updateWorkspaceFolders()`, no file picker, stale panel disposed
- [x] Open vault — hardcoded override, never routes to file picker
- [x] Vault — only reads `~/.chassis-vault/`, never Windsurf globalStorage
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
4. **Vault reads only `~/.chassis-vault/`** — never system paths
5. **Intent classifier hardcoded overrides run first** — no AI misrouting
6. **NEVER deploy to Windsurf or VS Code extensions** — VSCodium only
