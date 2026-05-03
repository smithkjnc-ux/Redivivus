# CHASSIS — Roadmap & TODO Tracker
> **Location:** `~/projects/chassis/CHASSIS_ROADMAP.md`
> **Rule:** Update this file after every edit session. Kimi, Claude, or any AI working on CHASSIS must read this first and update it before ending work.

---

## Project Info
- **Version:** 0.2.0
- **Extension ID:** papajoe.chassis
- **Engine compat:** `vscode ^1.70.0` (for Windsurf compatibility)
- **Build command:** `cd ~/projects/chassis && npm run compile && vsce package --allow-missing-repository && windsurf --install-extension chassis-0.2.0.vsix --force`
- **Reload after install:** `Ctrl+Shift+P` → `Developer: Reload Window`
- **Dogfood project:** `~/projects/doaidream/`

---

## Architecture — Key Source Files
| File | Purpose |
|------|---------|
| `src/extension.ts` | Main entry, registers all commands |
| `src/ui/wizardPanel.ts` | WebView dashboard — THE main UI |
| `src/ui/sidebarProvider.ts` | Minimal sidebar tree view |
| `src/services/sessionService.ts` | Start/end sessions, exit interview |
| `src/services/blueprintService.ts` | Five W interview (original modal version, now bypassed by WebView form) |
| `src/services/routingService.ts` | Multi-AI routing |
| `src/services/analyzerService.ts` | Project scanner |
| `src/services/guideService.ts` | Context-aware Getting Started guide |
| `src/services/chassisService.ts` | Core init, config load/save, paths |

---

## What's Working (DO NOT BREAK)
- [x] Blueprint form — dynamic project name, pre-populated data, locked/warning banners, readonly when locked
- [x] Start Working — inline WebView form (goal + AI picker + Let's Go/Cancel)
- [x] Done for Now — inline WebView exit interview (completed/in-progress/risks/next-start)
- [x] Switch AI — inline WebView picker, badge updates
- [x] Help/Guide — context-aware, opens in webview panel (not editor tab)
- [x] File picker commands (Check a File / AI Review / Clean Up File) — pass picked path to command
- [x] API key stub messages — clear message when no Gemini key is set
- [x] History tab — clickable items open source files
- [x] Vault tab — empty state renders cleanly
- [x] Scan Project — analyzerService works, generates project_map.md + recommendations.md
- [x] Work Log / Dead Ends — open .chassis/work_log.md and .chassis/dead_ends.md
- [x] Open Existing Project card on welcome screen
- [x] New Project Wizard — Steps 1-3 implemented (blueprint form → name+location → create+reload)
- [x] Linkification mitigation — `~/bin/delink` tool installed

---

## ACTIVE WORK — Universal Project Protocol (Editor Shims)
**Status:** DONE — wired into auto-init and saveBlueprint()

### Step 3 Integration
During wizard init (auto-init after reload), generate:
1. `.chassis/rules.md` — master rules file built from blueprint data
2. Shim files at project root (one line each, pointing to master):
   - `.cursorrules`
   - `.windsurfrules`
   - `CLAUDE.md`
   - `.github/copilot-instructions.md`

### saveBlueprint() Regeneration
Whenever `saveBlueprint()` runs in `wizardPanel.ts`, regenerate `.chassis/rules.md` from current config. Shims never change.

---

## ACTIVE WORK — Open Existing Project Flow
**Status:** NEEDS WORK

### Current behavior
- Opens folder picker, switches to that folder

### Target behavior
1. Open folder picker
2. Check if `.chassis/` exists
3. **If exists:** go straight to main dashboard with all data loaded
4. **If not exists:** show message "This project hasn't been set up with CHASSIS yet" with two options:
   - "Set It Up" → runs init + blueprint flow
   - "Just Browse" → dashboard in limited/read-only state

---

## TODO — After Wizard Is Fully Functional
> DO NOT implement any of these until the wizard flows above are complete and tested.

### 1. Auto AI Routing
- Tier tasks by complexity via `routingService.ts`
- **Tier 1 (free AI first: Gemini/Kimi):** file scanning, tag counting, project analysis, bulk annotation, dead end logging, session summaries
- **Tier 2 (paid AI: Claude):** AI code review, blueprint health assessment, scope creep detection, duplicate code detection
- If free AI fails/times out (15s), auto-escalate to Tier 2
- User can override with Switch AI to pin all tasks
- Never burn paid tokens on something `grep` could do

### 2. Retrofit Blueprint-from-Scan
- When applying CHASSIS to existing project, scan code to auto-generate draft blueprint
- Infer 5 W's from structure, dependencies, README, patterns, imports, UI patterns, auth flows
- Present draft to user for review/correction
- Misalignment between code and user intent = scope creep caught retroactively

### 3. Guided Blueprint Mode
- AI conversational follow-ups per W field
- Pushes back on vague answers, auto-fills polished summary
- Quick mode (plain form) stays default
- "Help me think through this" button next to each W

### 4. Sidebar Icon on Activitybar
- Needs proper activitybar contribution with custom icon

### 5. Vault Tab
- [x] Save useful functions and logic blocks for reuse across projects
- [x] Batch scan with AI categorization
- [x] Re-categorize saved items with AI (Fix Categories button)

### 6. Scope Creep Detection
- Flag when code drifts from blueprint intent

### 7. Duplicate Code Detection
- Find similar/identical logic across files

### 8. File Split Assistant
- Detect files that are too large, suggest split points

### 9. Guide Content Expansion
- Needs full sections on all features

### 10. AI Delegation Button
- "Delegate to AI" button next to `[WARN]` and `[TODO]` tags in the dashboard
- Generates a ready-made prompt from the annotation and surrounding context
- Prompt is pre-formatted for the editor's AI chat (Windsurf/Cursor/Copilot)
- One-click from finding a problem → assigning the fix
- CHASSIS writes the work order; the editor AI executes it
- Includes: file path, line range, tag type, existing annotation text, 3 lines of context above/below

### 11. Auto-commit on successful build
- [x] After every successful compile, CHASSIS prompts or auto-commits with a generated message
- [x] Options: "auto" (no prompt), "prompt" (pre-filled message box), "off" (manual)
- [x] Default: "prompt"
- [x] Message format: `CHASSIS checkpoint: {timestamp} — {active session goal or 'no session'}`
- [x] Configured via `autoCommit` field in `.chassis/config.json`
- [x] `postcompile.js` script handles packaging and Windsurf installation automatically

---

## PHASE 2.5 — The Guardian Mentor (Non-Coder Focus)
> Goal: Protect users with great ideas but no coding knowledge from building insecure or unmanageable "flat-file" projects.

- [ ] **Visual Blueprint Wizard:** Drag-and-drop goal interface that auto-populates the Five Ws and security standards into the blueprint.
- [ ] **Proactive Architectural Blocking:** "Hard stops" that prevent AI from writing functions >50 lines or files >500 lines without a mandatory "File Split" intervention.
- [ ] **ELI5 Work Log:** Parallel human-readable session log that translates technical actions (e.g., "OAuth callback update") into plain English outcomes (e.g., "Fixed the Login button").
- [ ] **Safety Stoplights:** Real-time Blueprint Health Score in the status bar that turns RED if AI proposes insecure logic (e.g., hardcoded keys), requiring explicit user "Risk Acknowledgment" to proceed.
- [ ] **Starter Chassis Templates:** Library of "Professional Skeletons" (e.g., "Secure AI Web Tool," "Local Database App") so users never start from a blank page.

---

## Design Rules
- **Plain English everywhere.** No jargon in user-facing text.
- **After any paste from Claude chat:** run `python3 ~/bin/delink <filepath>`
- **Base64 heredoc** for code injection with dotted property access from Claude
- **One atomic instruction at a time** during execution phases
- **Code first, explain after**

---

## Known Issues
- Engine version must stay at `^1.70.0` for Windsurf compat (Windsurf 1.110.1)
- `@types/vscode` must match engine version (currently 1.70.0)
- AI review/restructure commands need API key — show clear stub message when missing

## Recent Fixes
- `chassis.init` now offers a "Create a new subfolder" option when picking a project folder
- Main dashboard Work tab now includes **New Project** and **Open Project** cards for navigation without leaving the CHASSIS panel
- `initProject` now scaffolds `src/`, `tests/`, `docs/` folders, a starter `README.md`, and generates CHASSIS shim files immediately
- Fixed "blank progress indicator" by wrapping full init sequence in `withProgress` notifications with step-by-step messages
- Added PHASE 2.5 — The Guardian Mentor (Non-Coder Focus) spec items to roadmap
- Added Principle 10 (Guardian First) and Warning Level 4 (Block) to CHASSIS-SPEC.md
- Created `src/services/guardianService.ts` with Health Score computation, risk scanning, file metrics, ELI5 translation, and Risk Acknowledgment flow
- Changed Work tab card grid from `cols-2` to `cols-3` so New Project / Open Project cards are visible without scrolling
- **Full Vault implementation:** `src/services/vaultService.ts` — category-based storage (13 categories), auto-extraction from TS/JS/Python codebases, import into current project, scan and save workflows, global vault shared across all projects
- New commands: `chassis.saveToVault` (save current file blocks), `chassis.scanVaultCodebase` (scan entire project)
- Vault tab UI redesigned with category grid → item list → import/delete flow
- Fixed scaffoldAt() to write all files BEFORE vscode.openFolder reloads. Empty folder bug resolved.
- **Self-annotation pass:** Added [SCOPE], [WARN], [TODO] tags to wizardPanel.ts (1,252 lines), extension.ts (812 lines), vaultService.ts (503 lines). Flagged oversized functions and split targets.
- **Split extension.ts:** Extracted 23 command handlers into 9 modules under `src/commands/` (init, session, blueprint, analysis, review, restructure, retrofit, vault, misc). `extension.ts` reduced from 826 lines to 90 lines.
- **Split wizardPanel.ts:** Extracted view renderers into 6 modules under `src/ui/views/` (welcomeView, workTab, filesTab, historyTab, vaultTab, wizardSteps) plus `styles.ts`, `scripts.ts`, and `messageRouter.ts`. `wizardPanel.ts` reduced from 1,267 lines to 132 lines. View generation (~900 lines of HTML/CSS/JS) fully extracted.
- **Vault scan UX improvement:** Batch save with automatic duplicate detection. Scan results show summary count ("Found 47 extractable blocks across 23 files — 41 new · 6 already in vault"). Duplicates marked with "Already in vault" badge and excluded from save. Big green "Save All New" button saves everything non-duplicate in one click. Individual checkboxes allow cherry-picking. Report: "Saved 41 new blocks. Skipped 6 duplicates."
- **Vault AI categorization:** After scan, new items are sent to Gemini in batches of 20 to assign proper categories instead of defaulting to "other". `RoutingService.prompt()` added as a generic AI call method.
- **Vault Fix Categories button:** 🤖 Fix Categories button in vault header rescans all already-saved items and updates their tags using AI. Only items whose tags changed are written to disk. `VaultService.updateItemTags()` added.
- **Auto-commit on build:** `postcompile.js` runs after every `npm run compile`. In "prompt" mode (default) it shows the pre-filled commit message in terminal. In "auto" mode it commits silently. Configured via `.chassis/config.json` `autoCommit` field.
- **Build timestamp in header:** CHASSIS header shows "Built: HH:MM:SS" using `.chassis/build-info.json` written at compile time — confirms changes are deployed.
- **Vault scan command fix:** Was calling non-existent `chassis.openWizard`. Fixed to use correct `chassis.wizard` command.
- **Windsurf deployment:** Confirmed Windsurf uses its own extension directory `~/.windsurf/extensions/`. Must use `vsce package + windsurf --install-extension chassis-0.2.0.vsix --force` to deploy, NOT VS Code's `code --install-extension`.
- **Infinite loop fix:** `vscode:prepublish` must call `tsc` directly, NOT `npm run compile`. Calling `npm run compile` from `vscode:prepublish` causes `vsce package → prepublish → compile → vsce package → ...` loop. Fixed by changing `vscode:prepublish` to `"tsc -p ./"`.
- **Multi-AI expansion:** CHASSIS now supports 6 providers — Gemini 2.5 Flash (free), Groq Llama 3.3 (free), Claude 3.5 Haiku (paid), GPT-4o Mini (paid), Grok 3 Mini (paid), Kimi (paid). `RoutingService` auto-detects available keys, uses preferred AI, falls back to first available. Keys read from both CHASSIS settings and env vars.
- **API Keys UI:** New 🔑 API Keys card in Files & AI tab. Each provider row shows FREE/PAID badge, clickable "Sign up / Get key" button that opens browser, key input with Save/Remove. Keys saved to global VS Code settings. Clipboard fallback when no key set: copies prompt to clipboard and opens editor AI chat.
- **AI badge in header:** Shows current AI. If preferred AI has no key and fallback is used, badge turns yellow and shows `AI: GEMINI → using Groq (fallback)`. Red badge with "No AI Key Set" if nothing configured.
- **New `saveApiKey` message type** in `messageRouter.ts` saves/clears keys via `ConfigurationTarget.Global`.
- **`openExternal` message type** added to route webview link clicks through `vscode.env.openExternal` (required since webviews block `href` navigation).

## [2026-05-03 08:03] — Session End
- **Goal:** Make documentation protocol structural and CHASSIS-independent
- **Completed:** `chassisService.generateRules()` now embeds full rules into all 6 shim files (`.windsurfrules`, `.cursorrules`, `CLAUDE.md`, `GEMINI.md`, `.clinerules`, `.github/copilot-instructions.md`) instead of one-liner pointers. `sessionService` calls `chassis.appendRoadmap()` on both `endSession` and `endSessionWithData` paths — roadmap auto-updates on every "Done for Now". `rules.md` updated with MANDATORY documentation protocol section. `rulesService.ts` already had full content but was bypassed by `chassisService` — now unified under `buildRulesContent()`. All existing shim files in this repo regenerated with full content (93+ lines each).
- **In Progress:** Nothing — all changes compiled and committed
- **Next session starts with:** Install extension to Windsurf and verify Fix Categories button works with an API key set

---

## [2026-05-03 08:05] — Rule change
- **`chassisService.ts` `buildRulesContent()`:** Documentation protocol tightened — now explicitly states every change no matter how small requires a roadmap update. No exceptions language added.
- **`.chassis/rules.md`:** Same protocol update applied.
- **All shim files** (`.windsurfrules`, `.cursorrules`, `CLAUDE.md`, `.clinerules`, `.github/copilot-instructions.md`): Protocol section updated to match.

---

## [2026-05-03 08:19] — Vault uncategorized item handling
- **`vaultService.ts`:** Added `deleteItems(itemIds, global)` bulk delete method.
- **`messageRouter.ts` `vaultRecategorize` handler:** After AI categorization, items still tagged "other" are separated from successfully categorized items. User is shown a modal with a preview list (up to 5 names) and asked "Delete All Uncategorized" or "Keep Them". If deleted, `deleteItems()` is called and count is reported. Items AI genuinely couldn't place no longer silently remain in vault as dead weight.

---

## [2026-05-03 08:22] — Vault scan categorization bug fixes
- **Root cause identified:** Ryppel vault items saved as "other" because no API key was configured at scan time. `if (routingService && newItems.length > 0)` silently skipped AI when key was missing.
- **`vaultService.ts` `aiCategorize()`:** Fixed prompt typo — said "array of numbers" but meant "array of strings" (confusing AI). Added regex to extract JSON array from any surrounding text. Per-batch error logging with response preview on parse failure. Cleaner `continue` on failed batch instead of silent skip.
- **`messageRouter.ts` scan handler:** Now calls `getAvailableAI()` before categorizing. If no key, shows explicit warning: "found N items but no AI key set — all saved as 'other'. Add key then use Fix Categories." Also shows which AI is being used during categorization progress message.

---

## [2026-05-03 08:24] — Fix Categories rescan bug fixes
- **`messageRouter.ts` `vaultRecategorize`:** Fixed mutation bug — `original?.tags.sort()` was mutating the original tags array in place before comparison, causing `changed` to always be `false` even when AI did recategorize. Now uses spread copies: `[...original.tags].sort().join(',')` vs `[...item.tags].sort().join(',')`. This was silently preventing any vault updates from being written to disk even when AI returned correct categories.

---

## [2026-05-03 08:29] — Vault UI stale cache bug
- **Root cause:** After Fix Categories ran and wrote updated tags to disk, the UI stayed on `vaultView: 'items'` with `state.vaultItems` holding the old pre-categorization list. User clicked category cards and saw nothing because `state.vaultItems` was never refreshed.
- **`messageRouter.ts` `vaultRecategorize`:** After completion, resets `vaultView` to `'categories'`, clears `vaultCategory` and `vaultItems` — forces the grid to re-render with fresh counts from disk.
- **`messageRouter.ts` `vaultSetView`:** Now always re-reads from disk via `listByCategory()` when entering a category view. Never uses cached `state.vaultItems`. Stale state is cleared when returning to grid view.

---

## [2026-05-03 08:40] — Fix vault tag write root cause: shallow copy mutation
- **Root cause:** `aiCategorize()` does `result = [...items]` — a shallow copy. The objects inside are the same references as `otherItems`. When `aiCategorize` mutates `item.tags`, it also mutates `otherItems[idx].tags` simultaneously. The comparison `origSorted === newSorted` was always true because both sides pointed to the same already-mutated array. `updateItemTags` never fired.
- **`messageRouter.ts` `vaultRecategorize`:** Now snapshots `originalTags` into a `Map<id, string[]>` using spread copies BEFORE calling `aiCategorize`. Comparison uses the snapshot, not the live object reference.

---

## [2026-05-03 08:47] — Vault subcategory drill-down (3-level navigation)
- **`vaultService.ts`:** Added `subcategory` field to `VaultItem`. Added `listBySubcategory()`, `getSubcategoriesForCategory()`. Updated `aiCategorize()` prompt to return `{category, subcategory}` objects per item — subcategory is AI-inferred domain label (e.g. "p2p", "contacts", "listings", "notifications", "geolocation"). Not hardcoded — AI suggests from codebase context.
- **`vaultTab.ts`:** Full 3-level UI — Level 1: category grid with icons, Level 2: subcategory grid per category, Level 3: items list with breadcrumb. Back button is smart — knows which level to return to. "All [category]" tile on subcategory screen shows everything without subcategory filter.
- **`messageRouter.ts`:** Added `vaultSubcategory` to state. `vaultSetView` now handles `subcategories` view and routes `listBySubcategory` vs `listByCategory` based on whether subcategory is set.
- **`scripts.ts`:** Added `.vault-subcat-card` click handler. Smart back button reads `data-backview` attribute.
- **`wizardPanel.ts`:** State initialized with `vaultSubcategory: null`. Passes subcategory to `renderVaultTab`.

---

*Last updated: May 3, 2026 — Vault: 3-level drill-down with AI-inferred subcategories*
