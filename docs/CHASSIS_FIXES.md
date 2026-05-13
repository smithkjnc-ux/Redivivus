# CHASSIS — Fix Log & Session History
> [SCOPE] Chronological record of all bug fixes, session changes, and technical decisions.
> See CHASSIS_ROADMAP.md for the index. See CHASSIS_FEATURES.md for planned work.
> **Rule:** Every change — no matter how small — gets an entry here before the session ends.

---

*Last updated: May 11, 2026 (Session 3: code consistency pipeline, vault seeder, template registry)*

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
