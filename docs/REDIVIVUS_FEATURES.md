# Redivivus — Planned Features & Phase Roadmap
> [SCOPE] All planned features, active work, phase targets, and TODO backlog.
> See REDIVIVUS_ROADMAP.md for the index. See REDIVIVUS_FIXES.md for completed work.

---

*Last updated: May 27, 2026 (Session 11BI)*

---

## Active Backlog — Work Top-to-Bottom

### 🔴 Priority 1 — Core Differentiators (Redivivus DNA)
- [x] **Build Narrator** — plain English story while building. AI emits `// NARRATOR:` lines. DONE
- [x] **Summary card after builds** — structured result card with files, vault pieces, cost, time. DONE
- [x] **Undo Everything** — snapshots before every build, red ↩ Undo button in result card. DONE

### 🟡 Priority 2 — Makes Chat Dramatically Smarter
- [x] **Active file context injection** — injects relative path + first 150 lines of open file. DONE (upgraded May 11)
- [x] **Full conversation history in AI context** — last 14 turns (user + Redivivus), not just 3 user messages. DONE (May 11)
- [x] **Project file tree in AI context** — top 2-level file tree injected into system prompt. DONE (May 11)
- [x] **Work log in AI context** — last 20 lines of `.redivivus/work_log.md` injected. DONE (May 11)
- [x] **Terminal error awareness** — `terminalErrorService.ts`, `Ctrl+Shift+E`, `redivivus.injectTerminalError` command. DONE (May 13)
- [x] **Gap 1: Auto-Save Missing** — `src/core/build/chatPanelAutoSave.ts`
- [x] **Gap 2: Build History Loop Ignored** — `getRecentBuildContext` injects recent builds
- [x] **Gap 3: Live Signal Blind Spot** — `terminalErrorService.ts` and IDE diagnostics injected into context
- [x] **Gap 4: Output Format Fragility** — Worker AI uses XML structured output. DONE (May 27)
- [x] **Gap 5: Supervisor Dead Air** — Chat UI parses and streams code generation chunks live
- [x] **Gap 6: Pipeline Monolith** — `chatPanelMsgFix.ts` split to comply with Rule 9
- [x] **Gap 7: Trivial Change Bloat** — Local routing, trivial fixes skip Guardian review

### 🟢 Priority 3 — Polish & Onboarding
- [x] **Better first-run onboarding** — 3 empty states: initialized / uninitialized / no workspace. DONE
- [x] **Learned memory** — AI-triggered permanent facts stored to `.redivivus/learned.md`. DONE

### ⚪ Priority 4 — Later / Low Urgency
- [ ] **Terminal awareness (full)** — Redivivus reads terminal output and reacts to errors automatically.
- [ ] **Multi-session vault intelligence** — vault search ranks results by recency + frequency of reuse.
- [ ] **Mobile-friendly wizard** — blueprint setup that works on phone/tablet.

---

## Active Work

### Redivivus AI — Intent Classifier Improvements
**Status:** ONGOING

Hardcoded regex overrides added (May 11) for common commands to prevent AI misclassification:
- close/exit project → `workbench.action.closeFolder`
- open vault → `redivivus.openVault`
- open blueprint → `redivivus.openBlueprint`
- open map → `redivivus.showMap`
- start/end session → `redivivus.startSession` / `redivivus.endSession`
- save point → `redivivus.savePoint`
- switch/open project → `redivivus.openProject`

[NEXT] Add hardcoded overrides for any new commands that get misrouted.

### Vault — Source Restriction
**Status:** DONE (May 11)

Vault only accepts items from:
1. Files Redivivus builds (auto-capture after build via `autoCaptureFile`)
2. Manual "Scan Project" on a user-selected folder (folder picker)
3. Manual file saves (`redivivus.saveToVault` on active file)

Never from system paths, pip packages, or Windsurf globalStorage.

### Universal Project Protocol (Editor Shims)
**Status:** DONE

During wizard init: generates `.redivivus/rules.md` + shim files at project root:
- `.cursorrules`, `.windsurfrules`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`

`saveBlueprint()` regenerates `.redivivus/rules.md` from current config on every save.

### Open Existing Project Flow
**Status:** DONE (May 13)

Non-Redivivus folders now show branching dialog with "Open Anyway" option. Existing Redivivus projects load dashboard directly.

---

## TODO — After Core Is Stable

### Natural Language VS Code Command Router
- [x] Phase 1: Local dictionary (`commands.json`) — DONE (May 13). Normalize + 2-pass match, friendly labels, Redivivus commands included.
- [ ] Phase 2: Gemini-backed fallback — free AI with VS Code command list as context
- [ ] Phase 3: Full agent chaining — "refactor, split, commit, update roadmap" as one instruction

### Redivivus Sidebar Chat Panel
- [x] Registered in Activity Bar with `redivivusSidebar` viewType. DONE (May 13).
- [x] Live status header: project name, blueprint badge, session badge, AI badge. DONE (May 13).
- [x] All commands wired correctly including `redivivus.openChatPanel`, `vaultDedup`, `injectTerminalError`. DONE (May 13).

### Guardian Mentor Pending Items
- [ ] Visual Blueprint Wizard — drag-and-drop goal interface for Five Ws
- [ ] Proactive Architectural Blocking — hard stops for functions >50 lines / files >500 lines
- [ ] Safety Stoplights — real-time Blueprint Health Score in status bar, turns RED on insecure logic
- [ ] Starter Redivivus Templates — "Secure AI Web Tool", "Local Database App", etc.

### AI Delegation Button
- [ ] "Delegate to AI" next to `[WARN]` and `[TODO]` tags in dashboard
- [ ] Generates a ready-made prompt with file path, line range, tag type, annotation text, 3 lines of context
- [ ] One-click: Redivivus writes the work order, editor AI executes it

### Built-in Git (No Terminal Needed)
- [ ] Auto-commit after every AI change, session end, Build from Vault
- [ ] GitHub integration wizard — setup, auto-push, branch management
- [ ] Conflict resolution in plain English
- [ ] Commit format: `[Redivivus] {action}: {description}`

### Retrofit Blueprint-from-Scan
- [ ] When applying Redivivus to existing project: scan code to auto-generate draft blueprint
- [ ] Infer 5 W's from structure, dependencies, README, patterns, imports, UI patterns, auth flows
- [ ] Present draft for user review/correction

### Guided Blueprint Mode
- [x] Inline gap detection before builds — `blueprintGapDetector.ts`. DONE (May 13).
- [x] Blue card with text inputs per missing W field, "Let's build" + "Skip" buttons. DONE (May 13).
- [x] Answers persisted to blueprint via `redivivus.saveConfig()`, build resumes automatically. DONE (May 13).
- [ ] "Help me think through this" AI follow-up button next to each W field (future)

### Scope Creep Detection
- [ ] Flag when code drifts from blueprint intent

### Duplicate Code Detection
- [ ] Find similar/identical logic across files

### Vault Intelligence
- [x] Deduplication + Merge Engine — `vaultDeduplicator.ts`, Jaccard similarity, chat preview + merge. DONE (May 13).
- [ ] Translation Engine — convert vault items to different languages (JS → Python, etc.)
- [ ] Language Recommendation Engine — suggest vault items based on project language patterns

---

## Phase Roadmap

### PHASE 2.5 — Guardian Mentor (Non-Coder Focus)
- [x] Guardian First Principle — health checks before any build
- [x] `guardianService.ts` — health scoring, file/function length enforcement, Level 4 Block
- [x] ELI5 integration — converts AI actions to plain English
- [x] Starter Redivivus Templates — 10 templates in `redivivus-templates` repo, all live. DONE (May 13).
- [ ] Visual Blueprint Wizard
- [ ] Proactive Architectural Blocking
- [ ] Safety Stoplights

### PHASE 4 — Visual Lens (Point-and-Click Context)
**Status:** FUTURE / CONCEPTUAL
- [ ] UI Inspector Bridge — browser-side script captures DOM element metadata on click
- [ ] Element-to-Source Mapper — translates clicked UI element to file + line number
- [ ] Visual Context Injection — wraps "Clicked Area" HTML/CSS as AI prompt context chip
- [ ] Guardian UI Filter — scrubs live user data before sending to AI
- [ ] Spatial Edit Mode — UI toggle to enable/disable the Lens

### PHASE 5 — Architecture Map Enhancements
**Status:** FUTURE / PLANNED
- [ ] Scope Bubbles — visual boundary that "pushes" blueprint-violating files outside central zone
- [ ] Dead End Lines — dashed gray connections visualizing failed paths from `dead_ends.md`
- [ ] Architectural Critique Panel — Sledgehammer Logic, Scenic Routes, Refactor Roadmap

### PHASE 6 — Multi-AI Orchestration & Monetization Tiers
**Status:** FUTURE / STRATEGIC

| Tier | Name | RAM | AI Mode | Price |
|------|------|-----|---------|-------|
| 1 | Scout | 16GB | API-only (Gemini/free) | Free |
| 2 | Hybrid | 32–48GB | Local model + API mix | $5–9/mo Pro |
| 3 | Suite | 64GB+ | 6+ parallel agents | Managed "Senior Architect" |

### PHASE 7 — P2P AI Network & Redivivus LLM (2027 Target)
See `REDIVIVUS_VISION.md` for full spec.

---

## Story Mode UX — Next Priority
**Status:** v1 DONE, v2 PLANNED

**v1 (done):** `// NARRATOR:` lines extracted from AI output → styled story lines in chat. Result cards. Undo Everything. Per-AI cost breakdown.

**v2 (planned):**
- Left panel: plain English narration scrolling at readable pace
- Right panel: code synced with story (corresponding code highlights as story line appears)
- Emotional goal: "I understand what's being built"

### Three Feelings Every Build Must Create
1. "I understand what's being built" — Story narration in plain English
2. "I'm in control" — Every change is reversible (Undo Everything)
3. "This is getting smarter" — Vault counter goes up, costs go down

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
- [x] Cloud vault API — `vault_items`, `templates`, `vault_community` in Supabase (Session 11BI)
- [x] Templates — 10 starters migrated from GitHub to Supabase (Session 11BI)

---

## Competitive Gap — Next Sprint
- [ ] **Deploy to Vercel** — detect workspace, run `vercel --prod`, post URL to chat
- [ ] **Single-key starter mode** — "Quick Start: paste one Claude key" path in Setup Hub
- [ ] **Supabase scaffold** — keyword trigger "add auth" / "add a database"
- [ ] **Screenshot-to-build** — dropped image → "build this UI"
- [ ] **Template library expansion** — grow from 10 → 50+ starters
- [ ] **Community vault** — opt-in sharing, admin-approved patterns, community pulls on install
- [ ] **Vault sync command** — `redivivus.syncVaultToCloud` wired to palette + Setup Hub
