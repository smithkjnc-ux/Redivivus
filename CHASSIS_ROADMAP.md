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
- Save useful functions and logic blocks for reuse across projects

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

---

*Last updated: May 2, 2026 — Session: Fixed scaffoldAt + self-annotation pass + split extension.ts + split wizardPanel.ts.*
