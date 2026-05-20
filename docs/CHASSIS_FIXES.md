# CHASSIS — Fix Log & Session History
> [SCOPE] Chronological record of all bug fixes, session changes, and technical decisions.
> See CHASSIS_ROADMAP.md for the index. See CHASSIS_FEATURES.md for planned work.
> **Rule:** Every change — no matter how small — gets an entry here before the session ends.

---

*Last updated: May 20, 2026 (Session 32: Enhance Agent Mode Context and Features)*

---

## May 20, 2026 — Session 32 (Agent Mode UX: Enhance Agent Mode Context and Features)

- **Feature: Agent Mode Result Cards** — `src/ui/chat/chatPanelMsgSendMessage.ts` & `src/services/ai/agentService.ts`: Surfaced the standard CHASSIS Result Card UI in Agent Mode by injecting a `BuildLedger` to track total tokens across ReAct loop iterations and wiring it into `buildResultCard`.
- **Fix: Missing Build History** — `src/services/ai/agentTools.ts` & `src/ui/chat/chatPanelMsgSendMessage.ts`: Added `SnapshotManager` triggers to the `write_file` agent tool so the first modification creates a save point, and wired the resulting snapshot to `BuildHistoryService` so Agent Mode builds appear in the History panel.
- **Fix: Path Hallucination and Aggressive Instructions** — `src/services/ai/agentService.ts` & `src/ui/chat/chatPanelMsgSendMessage.ts`: Added aggressive "ZERO MANUAL INSTRUCTIONS" and "NO HALLUCINATIONS" constraints to the system prompt to force the agent to use `run_command` instead of writing fallback text tutorials. Additionally, injected a `vscode.workspace.findFiles` tree into `projectContext` so the Agent knows the exact file structure and stops guessing incorrect paths (e.g., `src/renderer.js` instead of `rendering.js`).

---

## May 20, 2026 — Session 31 (UX Intent Routing: Fix Build Intent Overreach on Packaging Requests)

- **Fix: "Make" keyword triggering erroneous builds** — `src/ui/chat/chatPanelClassifier.ts`: In Session 30, I updated the `run` and `question` intents to handle vague packaging requests like "turn this into an app". However, the user typed: *"I want to make flappy bird into a stand alone game..."*. Because the `build` intent rule was instructed to trigger whenever the user asks to "make" something, the classifier overrode the Session 30 rule and routed this request straight into the `build` pipeline. 
  - **The Result:** The Supervisor AI tried to parse a filename from the prompt, incorrectly extracted the word "alone" from "stand alone", inferred an HTML extension, and literally built a new duplicate file called `alone.html` containing the game code.
  - **The Resolution:** Added an explicit override rule to the `build` intent system prompt, barring it from handling vague packaging requests (e.g. "make an executable") and explicitly routing them to `question`. Also added several hardcoded examples to ensure the classifier learns the pattern.

---

## May 20, 2026 — Session 30 (Surgical Edits & UX: Fix Surgical Edit Fallback and Vague Intent Routing)

- **Fix: Surgical Edit Fallback Data Corruption** — `src/ui/chat/chatPanelBuild.ts` & `src/services/build/surgicalEditService.ts`: When the Worker AI generated `<<<SEARCH...REPLACE>>>` blocks without a `## Edit: filename` header, the parser failed to find any edits. Consequently, `usedSurgical` evaluated to false. The catastrophic bug was that CHASSIS then fell back to a full-file write, but the code payload it wrote was the literal, unparsed `<<<SEARCH...REPLACE>>>` tags, completely destroying the user's file.
  - **Resolution 1:** Updated `parseSurgicalEdits` to assign headerless blocks to the default target file.
  - **Resolution 2:** Added a strict safety guard in `chatPanelBuild.ts`. If surgical edits are detected but fail to apply, it now throws a graceful error (`Surgical edit failed`) instead of writing the raw tags.
- **Fix: Vague Intent Classification** — `src/ui/chat/chatPanelClassifier.ts`: Vague, non-technical overarching requests (like "make it a real app" or "I want to run it when I click it") were being incorrectly routed to the `run` pipeline (which just opens the browser). I updated the system prompt to explicitly route these ambiguous non-code requests to the `question` intent. This allows the AI to fall back to conversational Q&A, clarify the user's goal (e.g., "Do you want an Electron desktop app?"), and explain the process before building.
- **Rule 9 Enforcement:** Trimmed 5 lines from `src/ui/chat/chatPanelBuild.ts` to ensure it remains under the 200-line limit (currently 199 lines).

---

## May 20, 2026 — Session 29 (Auto-Save & Intent Routing: Fix Q&A auto-save and feature request classification)

- **Fix: Feature requests phrased as questions routed to Q&A instead of Build** — `src/ui/chat/chatPanelClassifier.ts`: The intent classifier was heavily biased toward treating any input phrased as a question (e.g., "is there a way to make the bird more realistic?") as the `question` intent. I updated the system prompt to explicitly define feature requests and code modifications as `build` requests, ensuring they are routed to the robust orchestrated file-builder pipeline where changes are automatically applied.
- **Fix: Q&A Code Snippets did not auto-save** — `src/ui/chat/chatPanelAutoSave.ts`: When a message did legitimately route to Q&A, and the AI responded with a full file replacement block, the `shouldAutoSave` guard was blocking the save. The guard asked the Supervisor AI, "Did the user ask to build, create, or generate a **new** file or program?" Since the user was asking to *modify* an existing file, the Supervisor correctly answered "No", disabling auto-save. I updated the prompt to check if the user asked to "build, create, generate, **modify, or update** code/files," ensuring valid code blocks generated during Q&A can now trigger the auto-save pipeline.

---

## May 20, 2026 — Session 28 (Guardian Hallucination Part 2: Fix Guardian AI conversational interception hallucination)

- **Fix: Guardian AI still intercepted Q&A if the AI explanation included a code block** — `src/ui/chat/chatPanelMsgSendAI.ts` & `src/ui/chat/chatPanelMsgMapContext.ts`: My previous fix added `hasCodeBlock` to the Guardian check, but conversational answers often include code snippets to explain concepts (e.g., "Yes, you can do this by adding: `code snippet`"). This caused Guardian to trigger anyway and replace the entire conversational answer with a sterile codebase review patch. I completely removed Guardian from Map Context (which is always analytical) and mandated that Guardian only runs in standard chat if `isConvert` is true (i.e. the user explicitly asked to rewrite a file, not a Q&A question).

---

## May 20, 2026 — Session 27 (Guardian Hallucination: Fix Guardian AI conversational interception hallucination)

- **Fix: Guardian AI hallucinated code block rewrites when evaluating non-code conversational answers** — `src/ui/chat/chatPanelMsgSendAI.ts` & `src/ui/chat/chatPanelMsgMapContext.ts`: Re-introduced the `hasCodeBlock` guard into the `if (routing.isGuardianActive())` condition. The Guardian AI is strictly prompted to perform a code-review (i.e. "CODE TO REVIEW:"). When the hasCodeBlock guard was previously removed for Q&A, Guardian intercepted text-only conversational answers, evaluated them as code, and routinely hallucinated code patches to replace the conversation. Guardian now correctly skips text-only responses and only reviews responses containing fenced code blocks.

---

## May 20, 2026 — Session 26 (Open Workspace Fix: Fix Open Workspace Silent Failure)

- **Fix: "vscode.openWorkspace" command does not exist** — `src/services/project/projectOperations.ts`, `src/ui/messageRouterWizard.ts`, `src/ui/chat/chatPanelMsgProjectOps.ts`, `src/ui/chat/chatPanelShow.ts`: Replaced multiple usages of `vscode.commands.executeCommand('vscode.openWorkspace', ...)` with `vscode.commands.executeCommand('vscode.openFolder', ...)`. There is no such command as `vscode.openWorkspace` in the VS Code API, which caused opening scaffolded projects, existing projects from dialog, and auto-opening on startup to silently fail. The built-in `vscode.openFolder` correctly handles both directory URIs and `.code-workspace` file URIs.

---

## May 20, 2026 — Session 25 (Clear Chat Redirect: Clear Chat trashcan redirects to main dashboard / launcher screen)

- **Architecture: Extracted empty state HTML building to respect Rule 9** — `src/ui/chat/chatPanelEmptyState.ts` [NEW]: Created a dedicated empty state module, keeping `chatPanelHtml.ts` extremely slim and strictly under the 200 lines limit.
- **UX: Integrated Empty State in chat panel HTML builder** — `src/ui/chat/chatPanelHtml.ts`: Replaced the massive inline `emptyState` IIFE with a clean, delegated call to `buildEmptyStateHtml(header, progress)`.
- **UX: Clear Chat redirects central area to main dashboard / launcher screen** — `src/ui/chat/chatPanelPublicAPI.ts`: Modified `panelRefresh()` so that when `messagesHtml` is empty (indicating a cleared chat history), it dynamically loads and injects the dashboard or launcher screen HTML rather than leaving the chat webview's central body completely blank.

---

## May 20, 2026 — Session 24 (UI Polish & Build Cancel: Fix raw HTML entities & add Clarification Cancel button)

- **UX: Replaced all HTML entities with clean unicode emojis in chat** — Replaced raw codes like `&#x1F680;`, `&#x23F3;`, `&#x1F528;`, `&#x1F50D;`, `&#x274C;`, `&#x1F4BE;`, `&#x2705;`, `&#x1F3AF;`, `&#x2699;`, `&#x1F6E1;` with their real emoji counterparts (`🚀`, `⌛`, `🛠️`, `🔍`, `❌`, `💾`, `✅`, `🎯`, `⚙️`, `🛡️`). This avoids HTML escaping issues and ensures gorgeous, unescaped emoji rendering in all chat bubbles.
- **UX: Added Cancel button to Build Clarification Card** — `src/ui/chat/chatPanelRenderer.ts` & `src/ui/chat/chatPanelScriptActionsB.ts`: Rendered a cancel button next to "Submit & Build" and wired its click handler to post a message containing `answers: { _cancelled: 'true' }`.
- **Feature: Handled Clarification cancellation** — `src/ui/chat/chatPanelChunked.ts`: Handled the cancellation message by aborting the build pipeline gracefully, updating the assistant's message bubble to `❌ Build canceled.`, and setting status back to ready. Also compacted the file's code to stay strictly under the 200 line limit.

---

## May 20, 2026 — Session 23 (Sidebar Collapse: Collapse all custom sidebar sections by default)

- **UX: Collapse all custom sidebar sections by default** — `src/ui/sidebar/chassisSidebar.ts`: Modified all 7 section headers to include the `collapsed` class and all 7 section bodies to include the `hidden` class by default. Unified the REVIEW section chevron to the standard down-facing indicator `▼` (`&#9660;`) to behave consistently with other sections during rotation. This results in an incredibly clean, neat, and highly customizable UI experience where the user only expands the sections they want to work with.

---

## May 20, 2026 — Session 22 (Profile View: Restore User Profile to custom sidebar and auto-open chat)


- **Feature: Restored User Profile section to the custom sidebar** — `src/ui/sidebar/chassisSidebar.ts`: Replaced the commented-out `[NEXT]` placeholder for the Profile section with an active collapsible `-- PROFILE` section, rendering `User Profile` (triggers `chassis.openProfile`) and `Web Search` (triggers `chassis.webSearch`) buttons directly in the custom sidebar.
- **UX: Auto-open chat panel on Profile request** — `src/extensionInlineCommandsB.ts`: Modified the `chassis.openProfile` command handler so that if the chat panel is not open, it automatically calls `ChatPanel.show(...)` and waits briefly for the panel to initialize before rendering the user memory profile. This gives a highly responsive, premium UX.

---

## May 20, 2026 — Session 21 (Profile Runtime: Resolve circular dependency causing "command not found" error)


- **Fix: profileRuntime command fails to find at runtime with "command not found" toast** — Converted static top-level imports of `ChatPanel` into dynamic inline imports inside `src/commands/profileRuntime.ts`, `src/commands/startRuntimeAnalysis.ts`, and `src/commands/startRuntimeAnalysisHelpers.ts`. This breaks the circular dependency chain (`extensionCommands` -> `profileRuntime` -> `ChatPanel` -> `extensionInlineCommands` -> `extensionInlineCommandsB` -> `profileRuntime`) that caused command registration to fail or be skipped at load time, while maintaining signature compatibility.

- **Fix: Extension activation crashed entirely on startup** — Found that `chassis.showBuildHistory` was being registered in both `src/commands/savePoint.ts` and `src/extensionInlineCommandsB.ts`. Because it was registered twice, the VS Code extension host threw an unhandled duplicate command error on startup which completely halted extension activation, rendering the sidebar non-functional. Removed the duplicate registration from `src/extensionInlineCommandsB.ts` to restore clean activation.

---

## May 20, 2026 — Session 20X (API Setup: Disable switches, active team sorting, glowing highlights, and split styles)

- **Feature: Persistent ability to disable any configured AI provider** — `package.json`: Added `chassis.disabledProviders` setting schema to store array of user-disabled provider IDs. `src/services/ai/routingKeys.ts`: Intercepted all provider API key getters (`getGeminiKey()`, `getClaudeKey()`, etc.) to return `null` if the provider's ID is in the disabled list. This propagates the disabled state flawlessly across all supervisors, worker planners, and guardians.

- **Feature: Interactive enable/disable actions in the UI** — `src/commands/apiSetup.ts`: Implemented `toggle-provider` message handler which receives the ID, toggles its state in settings, and reloads the HTML instantly to keep the UI perfectly updated.

- **Feature: Dynamic team role badges, metadata, active sorting, and card highlights** — `src/commands/apiSetupHtml.ts`: Upgraded card rendering to instantiate `RoutingService` and dynamically display current roles (`🎯 Supervisor`, `⚙️ Worker`, `🛡️ Guardian`). Implemented custom rank sorting prioritizing active roles at the very top of the list (`Supervisor > Guardian > Worker > Configured > Disabled > Not configured`). Added a beautiful active visual highlight (active focus border left, inset shadow glow) and a pulsing green CSS active dot indicator.

- **Architecture: Split CSS stylesheet to standalone styles file to respect Rule 9** — `src/commands/apiSetupStyles.ts`: Created new styling module starting with a valid `[SCOPE]` tag containing all CSS and keyframes declarations, successfully keeping `apiSetupHtml.ts` under the 200 lines limit!

---

## May 20, 2026 — Session 20W (Build Clarification: Vertically Stacked Option Labels)

- **Fix: Build clarification radio choices were running together horizontally** — `src/ui/chat/chatPanelRenderer.ts`: Wrapped each `<label>` inside a block-level `<div>` with `display:block;margin-bottom:6px;` to force options onto their own distinct vertical lines, regardless of any global label inline-flex overrides. Set `display:inline-flex` and `flex-shrink:0` on the label/input to align the radio dot and option text perfectly.


## May 16, 2026 — Session 14l (Architect Review: Per-Action Fix Buttons)

- **Feature: Each architect review suggestion now has its own fix button** — Previously the review showed only one "Fix All" button. Now each quick-win recommendation from the AI has a `[fix]`, `[!]` (delete), or `[+]` (create) button rendered above Fix All in the action bar.

- **Flow: AI → structured actions → per-action buttons → in-chat confirmation → execute:**
  1. `src/ui/map/mapPanelMessages.ts`: Architect review prompt now includes `ACTIONS_JSON:` request — AI outputs a JSON array at the end of each review: `[{file, action, label, description}]`
  2. `src/ui/chat/chatPanelMsgMapContext.ts`: Parses and strips `ACTIONS_JSON:` from the response before rendering. Stores actions in `_architectActions` keyed by `reviewId`
  3. `src/ui/chat/chatPanelRendererArchitect.ts`: `renderArchitectActions()` reads `_architectActions` and renders per-action buttons (blue) above Fix All/Dismiss. New `renderArchitectConfirm()` renders Confirm/Cancel for the in-chat confirmation step
  4. `src/ui/chat/chatPanelRenderer.ts`: Added `__ARCH_CONFIRM__reviewId|||actionIndex|||END_ARCH_CONFIRM__` token → `renderArchitectConfirm()`
  5. `src/ui/chat/chatPanelMsgArchitect.ts`: Added `ArchitectAction` type, `_architectActions` map, `handleArchitectPerAction()` (shows confirmation in chat: "Delete `file.js`? ... A snapshot is saved automatically. [Confirm] [Cancel]"), `handleArchitectActionConfirm()` (executes: delete via `fs.unlinkSync`, fix via `chassis.runEditFix`, create via `chassis.postToChat`)
  6. `src/ui/chat/chatPanelMessages.ts`: Routes `architect-per-action`, `architect-action-confirm`, `architect-action-cancel`. Also removed leftover debug log writing to `~/chassis_debug.log`
  7. `src/ui/chat/chatPanelScriptActions.ts`: Expanded arch click handler; split feedback/toggle/recent to `chatPanelScriptActionsB.ts` (file was at 200-line limit)
  8. `src/ui/chat/chatPanelScriptActionsB.ts`: New file with extracted handlers
  9. `src/ui/chat/chatPanelScript.ts`: Wired `buildActionsScriptB()`

- **Graceful degradation**: If the AI omits or malforms `ACTIONS_JSON:`, no per-action buttons appear — Fix All still works exactly as before.

---

## May 16, 2026 — Session 14k (Architect Review: Skip Guardian)

- **Fix: Guardian was intercepting and replacing the Architect Review response with a generic "Architecture Review Framework" template** — `src/ui/chat/chatPanelMsgMapContext.ts`: Added `&& !isArchitectReview` to the Guardian review guard. Guardian was being called with `displayMsg = "Architect Review"` (the user bubble text) and `mapText = Claude's actual response`. Guardian has no project context, so it evaluated "does this response adequately answer 'Architect Review'?" without knowing what the project is. It always decided "no" (because the response couldn't possibly know the specific system without Guardian's context), and replaced the real review with its own generic "Architecture Review Framework" template — visible as "*Guardian reviewed this response.*" at the bottom of the chat bubble. Same fix pattern as the `buildAIPrefix` skip (Session 14h): Architect Review is a purpose-built, server-enriched prompt and bypasses both the AI prefix injection and Guardian correction. Other map-context messages (file explain, trace, test, improve) are unaffected.

---

## May 16, 2026 — Session 14j (Architect Review: Real File Content Injection)

- **Fix: Claude still refusing after prompt-format fix — "I cannot provide a complete architectural review without access to the actual codebase"** — `src/ui/map/mapPanelMessages.ts`: The `architectReview` message handler previously forwarded the client-built topology prompt directly to the AI. Topology data alone (connection counts, health scores, line counts) is not enough for Claude to perform a real review — especially for single-file projects like `animal_sound_player` where the graph has 1 node and 0 edges, giving Claude almost nothing to analyze. Fix: the handler now reads the top 5 project files (sorted by todos+warns, first 80 lines each) from the filesystem server-side and appends them as an "ACTUAL FILE CONTENT" section to the prompt before forwarding. Pattern mirrors the existing `explainFile` (line 68) and `analyzeFile` (line 81) handlers which have always done server-side file reads. Read errors are silently caught — the prompt falls back to topology-only if files are unreadable.

---

## May 16, 2026 — Session 14i (Architect Review: Prompt Format Fix)

- **Fix: Architect Review responded "I cannot provide an architecture review without knowing what system, codebase, or files you'd like me to examine"** — `src/ui/map/mapScriptActions.ts`: The `doArchitectReview` prompt previously opened with `"You are a senior software architect reviewing a project dependency map.\n\n"`. `routing.prompt(text)` sends the entire string as a single `role: 'user'` message with no system prompt. Claude receives a user message that opens with "You are a..." and interprets it as a persona-reassignment attempt — which it refuses, responding with a help-request boilerplate asking for files and code. Fixed by removing the "You are..." opener entirely and restructuring the prompt to be task-first: `"Analyze the following project dependency graph and give a structural assessment. This is file topology metadata (connections, line counts, health scores) -- not source code.\n\n..."`. The explicit "this is topology metadata, not source code" framing prevents Claude from triggering its code-review training (which requires actual code to be present). Also switched section headers from markdown bold (`**SECTION:**`) to ALL-CAPS plain text (`SECTION:`) for cleaner rendering in the chat panel. Grammar fix: "1 files" → "1 file" via ternary. Note: this prompt fix works in addition to the prefix fix from 14h (both are required).

---

## May 16, 2026 — Session 14h (Architect Review: Empty Code Block + Display Bug)

- **Fix: Architect Review always responded "code section appears to be empty"** — `src/ui/chat/chatPanelMsgMapContext.ts`: Architect Review now skips `buildAIPrefix` entirely. The prefix function injects an `activeFileContext` fenced code block into every prompt. When no file is open in the editor, those backtick fences are empty. The AI then reads the empty `` ```\n\n``` `` as "the code you want reviewed" and responds that it's empty. The architect review prompt is fully self-contained (it embeds map graph data inline: hotspots, orphans, health issues, oversized files, layer violations), so the prefix adds nothing useful and the empty code block was actively harmful. `isArchitectReview` flag selects `prefix = ''` at build time.

- **Fix: User bubble showed "Architect Review `" with dangling backtick** — `src/ui/chat/chatPanelMsgMapContext.ts`: Display message construction now checks `nodeId` before appending the backtick-wrapped node name. For Architect Review, `nodeId` is intentionally empty (the review covers the whole project, not one file), so the old code produced "Architect Review ``" — an empty code span. Now produces just "Architect Review" when `nodeId` is empty.

---

## May 16, 2026 — Session 14g (Dead Buttons + Usage Attribution Fix)

- **Fix: All header buttons, onboarding pills, and sidebar pills were dead (clicked silently)** — `src/ui/chat/chatPanelScript.ts`: Added a `data-cmd` click handler to the primary `document.addEventListener('click', ...)` block. Any element with a `data-cmd` attribute now posts `{ type: 'run-command', command: cmd }` to the extension. Also removed dead ID-based handlers for `save-point-btn`, `map-btn`, `blueprint-btn` — those element IDs no longer exist in the HTML (the buttons switched to `data-cmd` in a previous refactor). Affected buttons: 🗺️ Map, 💾 Save Point, 📋 Blueprint, ⚡ Capabilities, ▶️ Start Session, 🏗️ Build from Vault, 📊 View Checklist, ⊞ Vault pill, AI Team pill.

- **Fix: All token usage attributed to Gemini regardless of which AI made the call** — `src/ui/chat/chatPanelChunkedLoop.ts`: Per-file build recording changed from `worker || supervisor` (the role-assigned AI) to `(res as any).routedTo || worker || supervisor` (the actual AI that made the API call). `routeByComplexity` picks the best available AI independently of the role split — if Claude is configured, it picks Claude for per-file builds, but the old code always recorded to `worker` ('gemini'). `src/ui/chat/chatPanelBuild.ts`: Single-file builds now record supervisor and worker tokens separately instead of lumping both under `workerAI`. When a supervisor plan is generated (`spec != null`) and supervisor ≠ worker: `recordUsage(supervisorTokens, cost, supervisorAI)` + `recordUsage(workerTokens, cost, workerAI)`. Falls back to total-under-worker for solo mode. Claude tokens will now appear correctly in the usage breakdown.

---

## May 16, 2026 — Session 14f (Rules Audit #5: Post-Change Roadmap Logging)

- **Feature: All build and fix pipelines now write to the project's CHASSIS_ROADMAP.md after every file change** — `src/ui/chat/chatPanelMsgFixUtils.ts`: Added `writeProjectRoadmapEntry(root, heading, bullets[])`. Reads the project's `CHASSIS_ROADMAP.md`, inserts a new `## Recent Fixes -- DATE (heading)` entry immediately before the first existing `## ` heading, and updates the `*Last updated*` line. No-ops silently when `CHASSIS_ROADMAP.md` is absent, so non-CHASSIS projects are unaffected. Also moved `modelLabel()` here from `chatPanelMsgFix.ts` (exported) to keep `chatPanelMsgFix.ts` under 200 lines after the additions. `src/ui/chat/chatPanelMsgFix.ts`: Import `modelLabel` and `writeProjectRoadmapEntry`; call `writeProjectRoadmapEntry` after successful file writes with file list + AI attribution. `src/ui/chat/chatPanelBuild.ts`: Import `writeProjectRoadmapEntry`; call after `Writer.writeBuiltFile` with file, AI, tokens, cost. `src/ui/chat/chatPanelChunked.ts`: Import `writeProjectRoadmapEntry`; call after `tracer.end()` with full built file list and supervisor/worker pair. Pipelines were making changes to user project files but never logging those changes to the project's CHASSIS_ROADMAP.md — a direct violation of the rule that every file change must be logged.

---

## May 16, 2026 — Session 14e (Rules Audit #4: Pre-flight rules.md Injection)

- **Feature: All pipelines now inject .chassis/rules.md into Supervisor prompt** — `src/ui/chat/chatPanelMsgFixUtils.ts`: Added `readProjectRules(root)`. Reads `.chassis/rules.md`, caps at 4KB, returns empty string when absent. `src/ui/chat/chatPanelMsgFix.ts`: Import `readProjectRules`, call it before Phase 1, inject into Supervisor prompt under "PROJECT RULES (must not violate)". `src/ui/chat/chatPanelBuild.ts`: Reads rules and includes in `blueprintContext` enrichment alongside dead_ends. `src/ui/chat/chatPanelChunked.ts`: Adds `rulesBlock` to `planPrompt` alongside `deadEndsBlock`. `src/ui/chat/chatPanelBuildOrchestrated.ts`: Reads rules once via destructuring to avoid double file reads; injects into `context` passed to `createPlan`. Pre-flight step "Read `.chassis/rules.md`" existed in CLAUDE.md for external editors but was never performed by any internal pipeline. Projects can have custom rules (e.g. "never use AudioContext", "always use WAV blob") that the Supervisor needs before suggesting a fix or planning a build.

---

## May 16, 2026 — Session 14d (Rules Audit #3: Rule 17 Causation-First Debugging)

- **Feature: Fix Supervisor now reads build_history.json before diagnosing bugs** — `src/ui/chat/chatPanelMsgFixUtils.ts`: Added `getRecentBuildContext(root, sourceFiles)`. Reads build history via `BuildHistoryService`, filters to the 5 most recent non-undone builds, finds which source files overlap with currently-broken files, and returns a formatted causation alert with file names, build task, age, and AI used. Returns empty string when no overlap exists. `src/ui/chat/chatPanelMsgFix.ts`: Import and call `getRecentBuildContext` after `collectSourceFiles`. Inject `buildContext` at the TOP of the Supervisor prompt before all other context. Rule 17 states "always check build_history.json BEFORE suggesting any other cause" — but the fix Supervisor was diagnosing blind, never knowing whether the file it was reading had just been written by a CHASSIS build. If a build introduced the bug, the Supervisor's first frame should be "this was recently built" not "what is wrong with this code."

---

## May 16, 2026 — Session 14c (Rules Audit #2: Dead_ends in All Build Pipelines)

- **Feature: All build pipelines now read .chassis/dead_ends.md before Supervisor plans** — `src/ui/chat/chatPanelBuild.ts`: Import `readProjectDeadEnds`. Shadow `blueprintContext` at the start of `runSingleFileBuild` with a dead_ends-enriched version; this flows into `supervisorPlan` and `buildWorkerPrompt` automatically. `src/ui/chat/chatPanelChunked.ts`: Import `readProjectDeadEnds`. Add `deadEndsBlock` injected into `planPrompt` before the file-plan JSON request. `src/ui/chat/chatPanelBuildOrchestrated.ts`: Import `readProjectDeadEnds`. Enrich `context` passed to `createPlan` with dead_ends content; combined with rules injection in same refactor. Rule 5 (don't repeat dead ends) was enforced in the fix pipeline but completely absent from all three build pipelines. A Supervisor planning a new build had no knowledge of approaches already known to fail in the project.

---

## May 16, 2026 — Session 14b (Rules Audit #1b: Dead-End Annotation Loop + Pattern Validation)

- **Feature: Fix pipeline annotates removed code with [DEAD] and writes successful fixes to dead_ends.md** — `src/ui/chat/chatPanelMsgFixUtils.ts`: Added `readProjectDeadEnds(root)` (reads `.chassis/dead_ends.md`, caps at 8KB, creates with header if absent) and `appendProjectDeadEnd(root, patternName, triedWhat, whyFails, doInstead)` (appends structured entry to dead_ends.md). `src/ui/chat/chatPanelMsgFixPatterns.ts`: Added `triedWhat`, `whyFails`, `doInstead` fields to `FailurePattern` interface; filled in for the web-audio-linux pattern. `src/ui/chat/chatPanelMsgFix.ts`: (1) Reads project dead_ends.md before Phase 1 and injects into Supervisor prompt under "PREVIOUSLY FAILED APPROACHES". (2) Added Worker Rule 5: annotate every removed/replaced block with [DEAD] comment in correct syntax for the file type. (3) After successful validated fix: calls `appendProjectDeadEnd` for each resolved pattern. Rule 5 and Rule 8 were completely absent from the fix pipeline — Worker was generating fixes with no [DEAD] annotations and Supervisor had no memory of what had failed before.

- **Feature: Post-write pattern validation closes the fix loop** — `src/ui/chat/chatPanelMsgFixPatterns.ts`: New file (78 lines). `KNOWN_PATTERNS` registry with Web Audio API silent-failure pattern. `detectPatterns(sourceText)` scans source before Phase 1. `buildSupervisorNotes()` / `buildWorkerRules()` inject domain guidance dynamically only when the pattern is present. `validateOutputFiles(fixes)` scans written files post-write for known-bad patterns. `src/ui/chat/chatPanelMsgFix.ts`: Removed hardcoded Web Audio guidance (now in patterns file). Added `detectPatterns(filesBlock)` before Phase 1. Added post-write `validateOutputFiles()` call and `[VALIDATION PASS/FAIL]` line in result message. Hardcoded prompt guidance was routinely ignored — the fix pipeline had no way to verify whether the Worker followed instructions. Now output is scanned after write; if the bad pattern still appears, the user sees `[VALIDATION FAIL]` and knows to retry.

---

## May 16, 2026 — Session 14a (Rules Audit #1: CHASSIS_WORKER_RULES + Build-Info Version Fix)

- **Feature: CHASSIS_WORKER_RULES constant injected into all AI Worker prompts** — `src/services/ai/chassisWorkerRules.ts`: New file (22 lines). Exports `CHASSIS_WORKER_RULES` — 6 rules covering [SCOPE] at line 1 of new files, [WARN] above fragile logic, [DEAD] above every removed block, preservation of all existing annotation tags, 200-line file limit with required splits, and no non-ASCII characters in script blocks. Single source of truth across all pipelines. `src/ui/chat/chatPanelBuildWorker.ts`: Import and append to `buildWorkerPrompt()` return value. `src/ui/chat/chatPanelChunkedLoop.ts`: Import and append to per-file `filePrompt`. `src/services/build/buildOrchestratorPrompt.ts`: Import and append to `generatePhasePromptImpl` before return. `src/ui/chat/chatPanelMsgFix.ts`: Import and inject into fix Worker prompt before FORMAT section. Annotation rules existed in external config files (CLAUDE.md, .windsurfrules) but were never wired into CHASSIS's own internal AI prompts. Build and fix pipelines were generating unannotated code with no [SCOPE], [WARN], or [DEAD] markers.

- **Fix: build-info.json version stuck at 0.3.4 despite package.json being 0.3.6** — `scripts/postcompile.js`: Replace hardcoded `'0.3.4'` with dynamic read from `package.json`. Now reads `package.json` at compile time and falls back to `'0.0.0'` on error. Rule 20 violation — version mismatch between build metadata and actual package version.

---

## May 11, 2026 — Session 3o (Scan/Analyze Intent Intercept)

- **Fix: "scan ryppel for problems" going to AI and returning nonsense** — `chatPanelMessages.ts`: Phrases like "scan [project] for problems", "analyze the project", "check my project", "project health" were hitting the intent classifier and being routed to the build/question pipeline. AI responded with "no code was provided" type errors. Added hardcoded pre-screen intercept that matches these patterns and calls `chassis.analyze` directly (zero tokens, instant response), same pattern as the scan/template/setup intercepts above it.

---

## May 12, 2026 — Session 3p (Named Workspace Fix)

- **Fix: "Untitled (Workspace)" showing instead of project name** — `projectOperations.ts`, `messageRouterWizard.ts`, `chatPanelMessages.ts`: Changed from `vscode.openFolder(uri, false)` to `vscode.openWorkspace(wsUri, false)` which properly opens the `.code-workspace` file as a named workspace. The Explorer sidebar will now show "RYPPEL" instead of "UNTITLED (WORKSPACE)". This is the correct VS Code API for opening workspace files — it preserves the workspace name, enables proper extension activation, and looks professional.

---

## May 12, 2026 — Session 3zb (File Dialog Safe Default Path)

- **Fix: File dialog defaults to stale project path** — `chatPanelMessages.ts`: VS Code's built-in `workbench.action.files.openFile` command remembers the last opened folder. When that folder was the deleted `self-playing-snake-pong` project, it caused the "Oops! Something went wrong" error. Switched to `vscode.window.showOpenDialog()` API with explicit `defaultUri` set to the user's home directory (`os.homedir()`). This ensures the dialog opens to a safe, existing location.

---

## May 13, 2026 — Session 4d (Debug Logging for open-existing-project)

- **Added debug logging to trace open-existing-project issue** — `chatPanelMessages.ts`: Added `console.log()` statements at key points in the handler: when handler starts, when dialog returns, which folder was selected, when workspace file is created, and when `vscode.openWorkspace` is called. This will help diagnose why the folder picker doesn't open the workspace after selection.

---

## May 13, 2026 — Session 4c (Rule 20 — Build & Deploy Protocol)

- **Added Rule 20 to all rules files** — `.chassis/rules.md`, `CLAUDE.md`, `GEMINI.md`: Documented the Build & Deploy Protocol that must be followed after every code change: always run `npm run compile`, always copy both `out/` AND `package.json` when deploying, never copy `out/` without `package.json`, ensure version matches current release (0.3.6), and register new commands/settings in `package.json` contributes section.

---

## May 13, 2026 — Session 4b (Startup Behavior Setting)

- **Feature: Add chassis.startupBehavior setting** — Multiple files modified:
  - `package.json`: Added `chassis.startupBehavior` configuration with two options: `"launcher"` (default) and `"lastProject"`. Includes proper enum descriptions for VS Code Settings UI.
  - `chatPanelHeader.ts`: Reads the startupBehavior setting and computes `shouldAutoOpenLastProject` flag (only true when setting is "lastProject", workspace has no .chassis folder, and at least one recent project exists)
  - `chatPanelHtml.ts`: Added "Always open my last project on startup" checkbox at the bottom of the launcher screen with `data-action="toggle-auto-open"` attribute
  - `chatPanelScriptActions.ts`: Added event handler for the checkbox that sends `toggle-setting` message to the extension
  - `chatPanelMessages.ts`: Added message handler for `toggle-setting` that updates the VS Code configuration with `vscode.workspace.getConfiguration('chassis').update()`
  - `chatPanel.ts`: Added startup behavior logic in `createOrShow` — when setting is "lastProject" and recent projects exist, auto-opens the most recent project. Falls back to launcher when no recent projects exist.

---

## May 13, 2026 — Session 4 (Welcome Screen Redesign)

- **Feature: Complete welcome screen redesign** — Multiple files modified:
  - `chatPanelHeader.ts`: Added `workspaceHasChassis` check (detects `.chassis/` folder in workspace) and `recentProjects` retrieval from globalState
  - `chatPanelHtml.ts`: New launcher screen with three options: 🚀 Start New Project, 📂 Open Existing Project, 🕐 Recent Projects. Shows "Welcome to CHASSIS - What would you like to build today?" when no `.chassis/` folder detected. Shows "Ready to Build: {projectName}" only when project is initialized.
  - `chatPanelScriptActions.ts`: Added event listeners for launcher buttons (`data-action` attributes) and recent project items (`data-recent-path`)
  - `chatPanelMessages.ts`: Added message handlers for `start-new-project`, `open-existing-project`, and `open-recent-project`. Implemented recent projects tracking in globalState (stored as `chassis.recentProjects` array with max 10 items)
  - `chatPanel.ts`: Updated `buildHeaderInfo` call to pass `extensionContext` for recent projects access
  - `chatPanelHtml.ts`: Added `workspaceHasChassis` and `recentProjects` fields to `ChatHeaderInfo` interface

---

## May 12, 2026 — Session 3za (Hardcoded File Dialog Intercept)

- **Fix: AI still using wrong command for file dialog** — `chatPanelMessages.ts`: Even with updated prompt and examples, Gemini was still using `quickOpen` instead of `files.openFile`. Added hardcoded pre-screen intercept: if user says "yes/yeah/sure/ok/please/go ahead" and the last assistant message mentioned "file picker", CHASSIS bypasses the AI entirely and directly executes `workbench.action.files.openFile` to open the native OS file dialog.

---

## May 12, 2026 — Session 3z (Proper File Dialog)

- **Fix: User wants actual file picker dialog, not quick open** — `chatPanelAI.ts`: The previous implementation used `workbench.action.quickOpen` which shows a list of recently opened files. Added proper OS file picker: `workbench.action.files.openFile` — this opens the native file dialog. Added it to the system prompt examples, to `SAFE_AUTO_EXECUTE_COMMANDS`, and to `commandLabel` with a 📂 icon.

---

## May 12, 2026 — Session 3y (Stale Project + Command Hallucination Fix)

- **Fix: Modal tried to open non-existent project path** — `chatPanel.ts`: The path `/home/papajoe/projects/self-playing-snake-pong` was stored in `chassis.lastActiveProject` from a previous session, but that folder no longer exists. When CHASSIS tried to restore the "last active project," it caused errors. Added check to clear stale `lastActiveProject` reference if the folder no longer exists.
- **Fix: AI hallucinated fake command `workbench.action.files.openFileTap`** — `chatPanelAI.ts`: The AI made up a command ID that doesn't exist. Added explicit instruction: "CRITICAL: ONLY use commands from the examples above or the CHASSIS COMMANDS list. NEVER make up command IDs." Also added `quickOpen` to the examples list for file picker scenarios.

---

## May 12, 2026 — Session 3x (Explicit No-File Instructions)

- **Fix: AI still claims it can format when no file is open** — `chatPanelAI.ts`: Even with the NO FILE OPEN context, Gemini was still responding "I can format the current active file." Added explicit system prompt instruction: "IMPORTANT: Check the 'ACTIVE FILE' or 'NO FILE OPEN' section below. If NO file is open and the user asks to format/review/edit a file, tell them no file is open and offer to open the file picker." This makes it crystal clear what the AI should do.

---

## May 12, 2026 — Session 3w (No File Open Context)

- **Fix: AI doesn't know when no file is open** — `chatPanelAI.ts`: When no editor was active, the AI received no file context at all — just silence. It would say "I can format the current document" without knowing there was no file to format. Two fixes: 1) Added explicit `--- NO FILE OPEN ---` context when `activeTextEditor` is null, telling the AI "No editor is currently active. No file to format, edit, or review." 2) Moved `activeFileContext` to the TOP of the prompt (right after project info) instead of at the very end, so the AI knows the file state before deciding what to do.

---

## May 12, 2026 — Session 3v (Chat Refresh Bug Fix)

- **Fix: AI responses with commands not showing in chat** — `chatPanelMessages.ts`: When the AI response contained a command like `[[COMMAND:editor.action.formatDocument]]`, the code would auto-execute the command but skip calling `refresh()` because `executedCommand=true`. This meant the assistant message was pushed to the conversation array but never rendered in the UI — the user saw nothing. The logic assumed command execution would handle UI updates, but chat messages still need to be displayed. Changed `if (!executedCommand) { refresh(); }` to always call `refresh()`.

---

## May 12, 2026 — Session 3u (AI Error Handling Fix)

- **Fix: "format the current file" produced no response** — `chatPanelMessages.ts`: When AI API calls fail (network error, invalid key, rate limit, etc.), the code was not checking `aiResponse.success` — it would continue with empty `finalText` and push an empty assistant message to the conversation. Users saw no error, just silence. Added explicit error check: if `!aiResponse.success`, push an error message to chat showing the actual error from the AI provider (e.g., "Gemini API error 429: rate limit exceeded").

---

## May 12, 2026 — Session 3t (VS Code Command Access - Real)

- **Fix: AI claimed VS Code command access but it didn't actually work** — `chatPanelAI.ts`: The system prompt claimed CHASSIS could "execute all VS Code commands" including format document, change theme, toggle word wrap, etc. But the `SAFE_AUTO_EXECUTE_COMMANDS` list only had 16 commands, mostly CHASSIS-specific. Expanded the safe auto-execute list to include: `editor.action.formatDocument`, `editor.action.toggleWordWrap`, `workbench.action.selectTheme`, `workbench.action.terminal.new`, zoom commands, panel toggle, etc. Also added user-friendly labels for these commands. Now when the AI responds with `[[COMMAND:workbench.action.selectTheme]]`, it actually works.

---

## May 12, 2026 — Session 3s (Accurate AI Capabilities)

- **Fix: AI claims false capabilities like "full VS Code command access"** — `chatPanelAI.ts`: System prompt was telling the AI it could execute "all VS Code commands" including "opening the terminal, formatting a document, changing themes, or running Git commands." This is false — CHASSIS only has access to its own registered commands. Rewrote system prompt with **accurate** capabilities: write/generate code, explain code, scan projects, create save points, track sessions, access vault, run CHASSIS commands. AI can now brag accurately about what it actually does.

---

## May 12, 2026 — Session 3r (Guardian Over-Correction + Chat Clear)

- **Fix: "what can you do?" returns meta-nonsense** — `chatPanelMessages.ts`: Guardian AI was running on ALL responses including simple chat questions. The Guardian prompt is designed for code review, so it treated conversational answers as code and "corrected" them into commentary about AI capabilities. Added condition to only run Guardian when response contains code blocks OR when the original question was a build request. Chat responses now bypass Guardian entirely.
- **Fix: Reload not clearing chat** — `chatPanel.ts`: Build history cards were being restored on panel creation, causing old messages to persist across reloads. Commented out build history restoration for clean testing. Now chat starts fresh on every extension reload.

---

## May 12, 2026 — Session 3q (Windsurf-Style Responsiveness)

- **Fix: CHASSIS feels slower than Windsurf** — `chatPanelMessages.ts`, `chatPanelIntent.ts`: Two changes to make CHASSIS as responsive as Windsurf:
  1. **Intent routing**: Replaced AI-driven intent classification with simple regex fast-path. Only messages matching explicit build triggers (`build|create|make|generate|write|add|implement|code|develop|produce` + object) go to the build pipeline. Everything else defaults to chat mode instantly - no AI classification latency.
  2. **Cost modal auto-approve**: Small builds (< 3k tokens, < $0.01) skip the cost estimate modal entirely for instant execution.
  
  Result: Most questions and small requests now get immediate AI responses without any gates, matching Windsurf's "type and get answer" experience.

---

## May 11, 2026 — Session 3n (Fix All Queue Watchdog)

- **Fix: "Fixing 2/15" stops dead after API timeout** — `analyzerScript.ts`: When the Gemini API timed out mid-batch, `buildFailed` was being posted to `RecommendationsPanel` but not always reaching it (race between panel init and message delivery). Added a client-side watchdog timer: each time `startNextInQueue` dispatches an item, a 3-minute `setTimeout` is armed. If `buildFinished` or `buildFailed` never arrives, the watchdog fires, marks the item as timed-out, and calls `startNextInQueue` to continue the batch. Both `buildFinished` and `buildFailed` handlers call `clearWatchdog()` to cancel it on normal completion. This makes Fix All self-healing against network timeouts.

---

## May 11, 2026 — Session 3m (Template List Intent + Duplicate Panel Fix)

- **Fix: "open ryppel" showing "Untitled (Workspace)" and CHASSIS not initializing** — `projectOperations.ts`, `messageRouterWizard.ts`, `chatPanelMessages.ts`: Reverted `updateWorkspaceFolders` approach (it creates a multi-root workspace, skips extension activation events, leaves CHASSIS uninitialized). Correct fix: pre-create a `<projectName>.code-workspace` file before calling `vscode.openFolder` — VS Code only shows the "save workspace?" dialog for untitled workspaces; once a `.code-workspace` file exists it opens cleanly as a named single-folder workspace. Applied to all three open-folder paths. Also pre-created `ryppel.code-workspace` for the existing ryppel project.
- **Fix: "open ryppel" / project switching showing native "Save workspace?" dialog"** — [DEAD] `updateWorkspaceFolders` approach did not work — created Untitled multi-root workspace instead. — `projectOperations.ts`, `messageRouterWizard.ts`: Both used `vscode.commands.executeCommand('vscode.openFolder', uri)` which triggers the native OS-level "Do you want to save your workspace configuration?" dialog whenever there is no `.code-workspace` file. Replaced with `vscode.workspace.updateWorkspaceFolders(0, removedCount, { uri })` which swaps the workspace folder in-place with no dialog. Falls back to openFolder only if updateWorkspaceFolders returns false.
- **Fix: "What templates do you have?" generating JavaScript code** — `chatPanelMessages.ts`: Intent classifier routed template-list questions to the build pipeline, so the AI wrote JS code instead of listing templates. Added hardcoded pre-screen intercept (zero tokens, no AI call) that matches patterns like "what templates", "show me templates", "what can you build", "what project types". Pulls actual `TEMPLATE_CATEGORIES` from `templateRegistry.ts` and formats a clean markdown list with fallback if import fails.

---

## May 11, 2026 — Session 3l (Feedback Flow — Had Problems Retry)

- **Fix: "Had problems" button did nothing visible** — `chatPanelRenderer.ts`, `chatPanelScript.ts`, `chatPanelMessages.ts`: The "Had problems" button revealed a plain text input + "Send Feedback" with no action feedback and no follow-up. Upgraded to: (1) textarea with placeholder examples, (2) "Try Again with Fix" blue primary button that re-runs `handleBuildRequest` with the user's note as context (no cost gate on retry), (3) "Just Log It" secondary button for silent logging, (4) inline confirmation text replaces the box on submit. Also fixed feedback box background from VS Code theme variables to hardcoded dark theme colors.

---

## May 11, 2026 — Session 3k (Surgical Edit + Collapse Detection)

- **Fix: AI collapsing existing file on modification (15-line rewrite bug)** — `chatPanelBuild.ts`: Two changes: (1) `modificationRules` now includes explicit line count floor ("your output MUST be at least N lines"), surgical-only instructions, and specific rules for CSS/HTML/JS insertion (append to existing blocks, never create new ones, never move existing code). Supervisor now also receives the existing file content so it plans a surgical spec not a rewrite spec. (2) Post-generation collapse detection: if the AI returns a file that is less than 80% the line count of the original, CHASSIS shows a warning and retries once with a "you dropped content" message before writing to disk. Risk: low — adds one optional retry on collapse; does not change non-modification builds.

---

## May 11, 2026 — Session 3j (Double Cost Estimate + New Project Modal Cosmetics)

- **Fix: Cost estimate modal appearing twice** — `chatPanelIntent.ts` line 426: `awaitCostConfirmation()` had no `skipComplex` guard. On the resumed build after new project creation, `skipComplex=true` but the cost modal still fired a second time. Fix: wrapped in `if (!skipComplex)` — consistent with all other gates in the same function.
- **Fix: New Project Setup modal white background** — `chatPanelScript.ts`: All New Project modal elements used hardcoded white (`#ffffff`, `#1e1e1e`, `#ccc`, `#0078d4`). Replaced throughout with dark theme: `#1e2740` card bg, `#1a2035` inputs, `#2d3a55` borders, `#e8edf8` text, `#8899bb` muted, blue gradient primary buttons. Covers both compact and full wizard modes.
- **Fix: Category icon garbled text in template wizard** — `chatPanelScript.ts` line 550: The `.replace()` chain on `cat.icon` was mangling `[WEB]` into `[[W][G]B]` by replacing substrings in wrong order. Replaced with a direct lookup map: `{'[WEB]':'[Web]','[GAME]':'[Game]','[APP]':'[App]','[API]':'[API]'}`. Clean ASCII labels, no corruption.

---

## May 11, 2026 — Session 3i (Wizard Regex + Enriched Task Format)

- **Fix: Template wizard silently skipping after scope answer** — `templateWizard.ts`, `templateScopeService.ts`: The `isTemplateRequest` regex required the type word (website/portfolio/etc) to appear immediately after the article `a/an`. Enriched tasks from scope answer like `"Build a medium portfolio website"` had adjectives in between and never matched, so wizard returned `{handled:false}` and AI invented everything. Fix: (1) regex now allows `[\w\s]{0,30}?` between article and type word; (2) added `\b(website|portfolio|dashboard|blog|game)\b` catch-all; (3) `parseScopeAnswer` now generates `"Build me a portfolio website (medium)"` which reliably hits the primary regex pattern.

---

## May 11, 2026 — Session 3h (Native Dialog + Placement Modal Fixes)

- **Fix: "CHASSIS IDE" native modal appearing instead of WebView modal** — `chatPanelIntent.ts` lines 449-464: The no-folder path for complex project builds was using `vscode.window.showInformationMessage({modal:true})` which renders as the native OS/VSCodium dialog with white background and "CHASSIS IDE" title. Replaced with the existing `show-placement-check` WebView modal (same as placement flow), which renders centered in the chat panel with dark theme. Buttons "Create New Folder/Open Existing Folder" → now "New Project/Cancel" consistent with the rest of the UI.
- **Fix: Placement modal white background** — `chatPanelScript.ts`: The `show-placement-check` WebView modal was using `var(--vscode-editor-background)` which renders white on light/default themes. Replaced all VS Code theme variable references with hardcoded dark theme colors matching the other modals (`#1e2740` bg, `#e8edf8` text, `#2d3a55` borders, blue gradient primary button).
- **Fix: Double user message bubble on scope answer** — `chatPanelIntent.ts`: Scope answer was being pushed to conversation inside `handleBuildRequest` after `send-message` already pushed it. Removed duplicate push.

---

## May 11, 2026 — Session 3g (Chat-First Scope Clarification)

- **Feature: 2-question scope clarification before template wizard** — `templateScopeService.ts` (new), `chatPanelIntent.ts`, `chatPanelMessages.ts`: When user says something vague like "build me a website" (no detail, <70 chars, no purpose keywords), CHASSIS now asks 2 questions in the chat before touching the wizard: (1) what it's for, (2) simple/medium/full. User's reply is intercepted BEFORE intent classification (so "portfolio for Jane Smith" resolves the scope question, not triggers a new build). `parseScopeAnswer()` extracts complexity + purpose from the reply and builds an enriched task string. The wizard then fires with that enriched task — pre-selecting the right category/subcategory and asking only the gap fields. Risk: low — timeout after 5 min falls through to original task.

---

## May 11, 2026 — Session 3f (Wizard Skip + Duplicate Panel Round 2)

- **Fix: Template wizard skipped when project already open** — `chatPanelBuild.ts`: The `if (!existingTarget)` guard was too broad — when a project was already open with an `index.html`, `existingTarget` was set and the wizard never ran even for fresh "build me a X" requests. Fix: replaced `!existingTarget` with `!isModificationTask` — a regex that matches modification verbs at the start of the task (`add`, `fix`, `update`, `change`, `remove`, etc.). Fresh project requests like "build me a portfolio website" now always trigger the wizard regardless of what files are open.
- **Fix: Duplicate panel auto-open timer — root cause** — `extension.ts`: The suppress check in the 500ms auto-open timer required BOTH `suppressPath === currentRoot` AND `pendingInit?.folder === currentRoot`. After a build (not a new-project wizard), `pendingInit` is `undefined`, so `suppressed` was always `false` even when `suppressAutoOpen` was correctly set. Fix: removed the `pendingInit` requirement — `suppressPath === currentRoot` alone is sufficient to suppress (covers both new-project AND post-build folder additions).

---

## May 11, 2026 — Session 3e (Template Registry Logging + Fingerprints)

- **Feature: Output channel logging for template fetches** — `templateRegistry.ts`: Added `vscode.window.createOutputChannel('CHASSIS Templates')`. `fetchTemplate()` now logs every attempt URL, HTTP status on failure, and byte count on success. View in VSCodium: View > Output > "CHASSIS Templates". Risk: none — logging only, no behavior change.
- **Feature: Provenance fingerprint markers in all 10 templates** — `chassis-templates` repo: All HTML templates got `<!-- CHASSIS:template=<id>:v1.0.0 -->` injected before `<!DOCTYPE html>`. CLI tool got `// CHASSIS:template=cli-tool:v1.0.0` at line 1. FastAPI got `# CHASSIS:template=fastapi-rest-api:v1.0.0` at line 1. Express got `// CHASSIS:template=express-rest-api:v1.0.0` at line 2. Pushed to GitHub main branch (commit 505d952).

---

## May 11, 2026 — Session 3d (Duplicate Panel on Build Complete)

- **Fix: Second CHASSIS Chat tab opening after build completes** — `extension.ts`: Root cause was a race condition in `onBuildFinished`. When `updateWorkspaceFolders` adds the built project folder, `onDidChangeWorkspaceFolders` fires synchronously, but `globalState.update('chassis.suppressAutoOpen')` is async — so the suppress flag wasn't written in time and `runAutoInit` → `ChatPanel.show()` spawned a second tab. Fix: added synchronous module-level `_suppressNextFolderAdd` boolean set to `true` immediately before `updateWorkspaceFolders`. The `onDidChangeWorkspaceFolders` handler checks this flag first (synchronous read, no await) before falling through to `globalState` check. Risk: low — flag is always cleared on first use.

---

## May 11, 2026 — Session 3c (Template Wizard Centered Modal)

- **Fix: Template wizard appearing as top command palette dropdown** — `templateWizard.ts`, `chatPanelScript.ts`, `chatPanelMessages.ts`, `chatPanelBuild.ts`: Replaced all `vscode.window.showQuickPick` and `showInputBox` calls with a centered WebView overlay modal. New flow: build pipeline posts `show-template-wizard` with all category data to WebView; WebView renders 3-step modal (category cards → subcategory cards → input fields) centered in the chat panel; user submits via `template-wizard-submit` message; `resolveTemplateWizard()` resolves the pending Promise and returns answers to the build pipeline. Fallback: if `postToWebview` not available, wizard returns `handled:false` and build continues normally. Risk: low — all paths guarded.

---

## May 11, 2026 — Session 3b (Template Wizard Bug Fix)

- **Fix: Template wizard stall on auto-matched tasks** — `templateWizard.ts`: Root cause was auto-resolving the Quick Pick silently when `matchTaskToTemplate()` found a match, then firing `showInputBox()` calls without the user ever seeing the category picker. This caused the spinner to run while invisible input boxes waited for answers. Fix: always show both Quick Pick dialogs — never auto-resolve. Also fixed: Escape on optional wizard questions now uses `continue` instead of falling through to `return { handled: false }`. Added 5-second `Promise.race` timeout on `fetchTemplate()` so a missing/slow registry never stalls the build. Fixed TS errors: typed Quick Pick items with explicit generics (`showQuickPick<CatItem>`, `showQuickPick<SubItem>`) to avoid implicit `any` errors on property access.

---

## May 11, 2026 — Session 3 (Code Consistency + Template Registry)

- **Fix: Duplicate user message in chat** — `chatPanelMessages.ts`, `chatPanel.ts`: Added dedup guard at all 4 user message push sites (send-message, fix-request, build-task, resumeBuildTask). Checks last message before pushing. Risk: none.

- **Fix: Panel disposal on stale workspace cleanup** — `extension.ts`: `onDidChangeWorkspaceFolders` now only closes panel if the removed folder matches the panel's active project root. Previously, VSCodium cleaning up stale workspace entries on startup killed the panel immediately after creation. Risk: low — panel stays open if folder is removed externally while it's not the active project.

- **Fix: Aborted build leaves duplicate conversation entries** — `chatPanelIntent.ts`: Both placement check blocks now trim assistant messages (vault cards etc) from conversation before routing to new-project wizard. Prevents double vault card + double user message on resume. Risk: none — only trims non-user messages.

- **Feature: Auto-open project in Explorer post-build** — `extension.ts` `onBuildFinished`: After build completes, if the built project folder isn't in the workspace, automatically calls `updateWorkspaceFolders` to add it. Sets suppress flag first to prevent `runAutoInit` re-trigger. Risk: low — happens only when folder not already in workspace.

- **Fix: Canvas animation background color bleed** — `routingService.ts` Supervisor spec, `guardianAI.ts` gotchas: Added `ctx.shadowBlur = 0` reset requirement after trail loop. Added missing `background-color` CSS requirement. Risk: none — spec/prompt change only.

- **Feature: Static code validator** — `src/services/codeValidator.ts` (new): Deterministic pre-delivery checks for HTML/canvas builds. Catches ageFactor/maxTrailLength, missing shadowBlur reset, hardcoded speed, colored fillRect, missing canvas.width, double rAF, const dx/dy. Auto-fixes where possible. Runs after Guardian before disk write. Risk: low — wrapped in try/catch, never blocks build.

- **Feature: Spec template pinning** — `src/services/specTemplates.ts` (new): `getSpecTemplate()` returns a pinned deterministic spec for matched patterns, skipping Supervisor AI. `getCodeTemplate()` returns verified working code, bypassing AI entirely. Canvas-trail-animation template added and verified. Risk: low — only fires on matched patterns, falls through on no match.

- **Feature: Vault seeder + starter patterns** — `src/services/vaultSeeder.ts`, `src/services/starterPatterns.ts` (new): 17 curated hand-verified patterns (debounce, throttle, deepClone, slugify, formatBytes, fetchWithRetry, apiClient, parseJwt, generateToken, binarySearch, memoize, groupBy, EventEmitter, singleton, tryCatch, validateEmail, loadEnv). Seeded on first install via `chassis.vaultSeeded.v1` global state key. Risk: low — deduplicates by content hash, never overwrites.

- **Feature: GitHub Knowledge Base refresh command** — `extension.ts`, `package.json`: `chassis.refreshKnowledgeBase` command added. Pulls MIT/Apache-licensed patterns from GitHub API. Progress notification. Optional `chassis.githubToken` setting for higher rate limits. Risk: low — all network calls in try/catch, never blocks extension.

- **Feature: Template Registry architecture** — `src/services/templateRegistry.ts`, `src/services/templateWizard.ts` (new): Detects project-type intent ("build me a website"), shows Quick Pick category/subcategory picker, collects wizard answers, fetches base template from remote registry, builds customization prompt for AI. Registry base URL: `https://raw.githubusercontent.com/smithkjnc-ux/chassis-templates/main`. Falls through to normal build on failure/offline. Risk: low — all remote calls guarded.

- **Docs: Template Registry guide** — `docs/CHASSIS_TEMPLATE_REGISTRY.md` (new): Complete registry repo structure, meta.json format, quality standards, contribution guide, custom registry config. Registry repo (`smithkjnc-ux/chassis-templates`) still needs to be created on GitHub.

---

## May 11, 2026 — Session 2 (AI Pipeline + Learning Loop)

- **Feature: Gemini 2.5 Pro for Supervisor and Guardian:** `routingProviders.ts` — Added optional `geminiModel` param to `callProvider()`. Supervisor and Guardian calls now use `gemini-2.5-pro`; Worker stays on `gemini-2.5-flash`. Same API key, better reasoning for planning and review passes. Risk: Pro is slower (~3-8s) and has tighter RPM limits on free tier.

- **Feature: Kimi upgraded from moonshot-v1-8k to moonshot-v1-32k:** `routingProviders.ts` — 4x larger context window. Kimi is now routed large-context tasks (>4000 tokens) so it handles multi-file and existing-content modifications better.

- **Feature: Task-aware Worker routing (Aces in Their Places):** `routingService.ts` — `routeByComplexity()` now routes by task shape not just complexity tier. Large prompts (>4000 tokens) → Kimi 32k. Short simple tasks (<1500 tokens) → Groq/Llama (fastest). Medium tasks → Gemini Flash. Each routing decision includes a human-readable `routingReason` string passed to the ledger.

- **Feature: "Who Did What & Why" card:** `buildLedgerService.ts`, `chatPanelStory.ts`, `chatPanelRenderer.ts`, `chatPanelBuild.ts`, `routingService.ts` — Added `reason` field to `LedgerEntry` and `LedgerSummaryLine`. Each AI action now records why it was chosen. Breakdown card is open by default, titled "Who Did What & Why", shows role badge, action tags, and routing reason in italic. Updated breakdown token format: `ai~role~actions~tokens~costUSD~hasFallback~reason`.

- **Fix: Duplicate CHASSIS Chat tab opened during builds:** `chatPanel.ts` — Root cause: `refresh()` was replacing `webview.html` on every `appendMsg()` call. VS Code interprets HTML replacement as a new panel, causing a duplicate tab. Fix: Added `_initialized` flag. First load sets full HTML once. All subsequent `refresh()` calls use `postMessage({type:'update-conversation', html})` to swap `#conversation` innerHTML in place. Added `update-conversation` handler in `chatPanelScript.ts`. Risk: any code path that needs a full reload must call `location.reload()` explicitly.

- **Feature: Reasoning-based Guardian prompt:** `guardianAI.ts` — Replaced 7-item numbered checklist with holistic senior engineer code review framing. Guardian now reasons about correctness, performance, spec compliance, and security without checking boxes. Domain gotchas (canvas trail inversion, double rAF, etc.) kept as reference hints not a checklist. Solo-mode warning updated to match new framing.

- **Feature: NeverDo learning loop:** `learnedMemoryService.ts`, `chatPanelBuild.ts`, `chatPanelMessages.ts`, `routingService.ts`, `chatPanelStory.ts`, `chatPanelRenderer.ts`, `chatPanelScript.ts` — Added `## Never Do` section to `learned.md`. `addNeverDo(text, context)` deduplicates by text and increments count. `getNeverDoForPrompt()` returns top 10 mistakes sorted by frequency. Guardian auto-writes each caught issue to NeverDo after correcting. Supervisor receives NeverDo list before every build via `supervisorPlan(neverDoContext)`. User feedback buttons (thumbs up/down + optional note) appear after every build — bad feedback writes to NeverDo. Risk: NeverDo grows unbounded; cap at 10 in prompt injection already in place.

- **Feature: Build feedback buttons:** `chatPanelStory.ts`, `chatPanelRenderer.ts`, `chatPanelScript.ts`, `chatPanelMessages.ts` — Added `feedbackId` param to `buildResultCard()`. Each build gets a `__BUILD_FEEDBACK__id|||END_FEEDBACK__` token. Renderer shows "[+] Yes, worked great" / "[-] Had problems" buttons. Bad feedback shows optional note input. Posts `build-feedback` message to extension. Handler in `chatPanelMessages.ts` writes bad feedback notes to NeverDo.

- **Fix: Mechanical phrase ticker not visible:** `chatPanelScript.ts` — Ticker was previously running on page load when `chassis-working` class may not yet be set. Moved ticker start/stop into `set-status` message handler. Added MutationObserver on `#conversation` to re-attach ticker when new bubbles appear mid-build. Ticker starts on `working`, stops cleanly on `ready`.

## May 11, 2026

- **Fix: Status bar shows "No Project" when project is open but blueprint `who` field is empty:** `statusBar.ts` — The else branch showed hardcoded "No Project" string instead of `name`. Fixed to show project name regardless of blueprint fill state. Risk: none.

- **Fix: "Close current project" opens file picker instead of closing:** `chatPanelIntent.ts` — Root cause: classifier prompt listed "close" under `chassis.openProject`, causing "close the current project" to route to the open-project picker. Fix 1: hardcoded regex override catches close/exit/leave patterns before AI classifier runs. Fix 2: removed "close" from `chassis.openProject` description in classifier prompt. `chatPanelMessages.ts` — Both the intent handler path and the `run-command` path now use `vscode.workspace.updateWorkspaceFolders(0, folders.length)` instead of `workbench.action.closeFolder` to avoid VSCodium's "open file" dialog post-close behavior.

- **Fix: Stale CHASSIS Chat panel left open after closing project:** `extension.ts` — Added `onDidChangeWorkspaceFolders` listener. When folders are removed, calls `ChatPanel.close()` to dispose the stale panel. Only fresh "Welcome to CHASSIS" panel remains.

- **Fix: "Open the vault" routes to file picker:** `chatPanelIntent.ts` — Added hardcoded regex overrides for all common commands: open vault, open blueprint, open map, start session, end session, save point, switch to project. These fire before the AI classifier to prevent misrouting. Also added `chassis.startSession` and `chassis.endSession` to the `AvailableCommand` union type.

- **Fix: Vault contained 5965 items from system-wide scans (pip packages, system paths):** `vaultStorage.ts` — Removed legacy Windsurf globalStorage reader (`~/.config/Windsurf/User/globalStorage/papajoe.chassis/vault`). CHASSIS now only reads from `~/.chassis-vault/`. Wiped all existing vault JSON files from both `~/.chassis-vault/` and the Windsurf globalStorage path.

- **Feature: Scan Project opens folder picker:** `vault.ts` — `chassis.scanVaultCodebase` now shows a `showOpenDialog` folder picker (defaults to current workspace or `~/projects`). User can scan any project — not just the currently open workspace.

- **Feature: Save to Vault saves pending scan results:** `vault.ts` — Added `_pendingScanItems` module-level cache. After Scan Project runs, results are stored pending user confirmation. Clicking "Save to Vault" shows a confirmation modal ("Save N items?"), then saves all items with proper duplicate detection. After saving, pending cache is cleared. Fallback: if no pending scan, saves from the currently open file as before.

- **Feature: AI context dramatically improved:** `chatPanelAI.ts` — `buildAIPrefix()` now includes: full conversation history (last 14 turns, both user and CHASSIS), project file tree (top 2 levels, 60 entries), active file (150 lines instead of 50), recent work log (last 20 lines from `.chassis/work_log.md`), full blueprint (all 5 W's). System prompt reframed as "senior developer pair-programming" instead of command listing.

- **[WARN] API keys stored in VS Code `settings.json` — wiped if workspace settings lost:** Keys come from `vscode.workspace.getConfiguration('chassis')` or env vars. If workspace `settings.json` is lost or a fresh install occurs, all keys must be re-entered via CHASSIS: AI API Setup.

---

## May 10, 2026

- **Fix: Build task silently dropped after new project creation + folder reload:** `init.ts` — `resumeBuildTask` used a fixed delay; `ChatPanel.currentPanel` was still null when called. Fixed with a polling loop (300ms retry, 8s max). `chatPanel.ts` — Changed `skipComplex=true` for replayed builds so they bypass placement/cost gates.

- **Fix: Vault scanner sweeping Python pip packages into vault:** `vaultScanner.ts` — Added to default `ignorePaths`: `site-packages`, `dist-packages`, `__pycache__`, `.venv`, `venv`, `env`, `.env`, `lib/python`, `lib64/python`, `.tox`, `eggs`, `.eggs`, `sdist`, `wheels`, `.mypy_cache`, `.pytest_cache`.

- **Feature: `chassis.vaultCleanupSystemPaths` command:** `vault.ts` — Scans existing vault items, finds any whose `sourceFile` contains a system/pip path signal, shows count + confirmation modal, then deletes them. Registered in `package.json`.

---

## May 9, 2026

- **Fix: GUARDIAN_PASS token appeared as visible text in chat panel:** `chatPanelRenderer.ts` — Added `.replace(/GUARDIAN_PASS\s*/g, ...)` to strip sentinel before rendering.

- **Feature: Multi-AI Roster Display:** `routingService.ts` — Added `buildRoster()` and `getRosterDisplay()`. `chatPanelHeader.ts`, `chatPanelHtml.ts`, `chatPanelStyles.ts` — Roster badges with role-based pills (Supervisor blue, Worker gray, Guardian gold). `usageCommands.ts` — Usage report shows all roster members.

- **Fix: Chat panel routing bugs:** Multiple intent classification fixes. Hardcoded pre-screen added for common commands. Classifier few-shot examples improved. Broader project name extraction. Project info request handler added.

---

## May 8, 2026 and earlier

- Architecture Map (chassis.showMap) — interactive force-directed graph, full-screen, click-to-drill
- Guardian Mentor — health scoring, risk scanning, ELI5 translation
- Vault auto-save after every build
- Vault-hit gate before builds (high-confidence match modal)
- Per-AI build cost breakdown in result card
- Supervisor/Worker AI orchestration
- Story Mode UX (NARRATOR lines, result cards, Undo Everything)
- Context menu integration (right-click in editor + explorer)
- Save Points (git-backed checkpoints)
- File Split Assistant
- Project Timeline
- Learned memory (AI-extracted permanent facts to `.chassis/learned.md`)
- Auto-chunking for complex builds
- Token counter (per-message + session/daily/weekly totals)
- Build from Vault pipeline
- Onboarding empty states (3 tiers: initialized, uninitialized, no workspace)
