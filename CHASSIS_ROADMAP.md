# CHASSIS — Roadmap Index
> **Rule:** Every AI working on CHASSIS MUST read this file first AND update `docs/CHASSIS_FIXES.md` before ending any session. No exceptions.

*Last updated: May 15, 2026 — Session 4s: fixed Bug 8 — set-status:ready missing on no-root early returns*

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
