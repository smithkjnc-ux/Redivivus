# CHASSIS — Roadmap Index
> **Rule:** Every AI working on CHASSIS MUST read this file first AND update `docs/CHASSIS_FIXES.md` before ending any session. No exceptions.

*Last updated: May 13, 2026 — Session 4d: Added debug logging to open-existing-project handler to trace why folder picker isn't opening workspace*

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
- **Version:** 0.3.5
- **Extension ID:** papajoe.chassis
- **Engine compat:** `vscode ^1.70.0`
- **GitHub:** `https://github.com/smithkjnc-ux/CHASSIS.git` (private)
- **Deploy target:** VSCodium ONLY — `~/.vscode-oss/extensions/papajoe.chassis-0.3.5/`

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

### 🔴 Must Do
- [ ] **Terminal error awareness** — detect last terminal error, offer to inject into chat
- [ ] **Open Existing Project flow** — check for `.chassis/` and branch correctly

### 🟡 Should Do
- [ ] **Natural Language VS Code Command Router** — phase 1: local dictionary, zero AI cost
- [ ] **CHASSIS Sidebar Chat Panel** — embedded in Activity Bar, visible while editing

### 🟢 Polish
- [ ] **Vault deduplication + merge engine** — identify near-duplicate items
- [ ] **Guided Blueprint Mode** — AI conversational follow-ups per W field

### 🟢 New This Session
- [x] **Static code validator** — `codeValidator.ts` catches AI bugs before delivery
- [x] **Spec template pinning** — `specTemplates.ts` deterministic specs for known patterns
- [x] **Verified code templates** — canvas animation bypasses AI, zero variance
- [x] **Vault seeder + starter patterns** — 17 curated patterns seeded on first install
- [x] **GitHub Knowledge Base refresh** — `chassis.refreshKnowledgeBase` command
- [x] **Template Registry** — `templateRegistry.ts` + `templateWizard.ts` + `docs/CHASSIS_TEMPLATE_REGISTRY.md`
- [ ] **Create chassis-templates GitHub repo** — set up registry from docs/CHASSIS_TEMPLATE_REGISTRY.md
- [ ] **Build first 3 templates** — portfolio, business landing, arcade game

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
