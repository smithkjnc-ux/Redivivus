# Redivivus — Planned Features & Phase Roadmap
> [SCOPE] All planned features, active work, phase targets, and TODO backlog.
> See REDIVIVUS_ROADMAP.md for the index. See REDIVIVUS_FIXES.md for completed work.

---

*Last updated: June 10, 2026 — added macOS/Windows rebrand backlog, WM_CLASS verification, Gemini chip fix, unified /install endpoint, key rotation (deferred)*

---

## Active Backlog — Work Top-to-Bottom

### [DESIGN] Preview vs Run — two distinct, type-aware actions (PapaJoe, Jun 12 2026)
Two different things the user does with a build; keep them distinct:
- **Preview** = *in-editor* iteration. Lets the user tweak visuals/content and see changes **without leaving the window**. In-app webview over a local http server. (Web/HTML only.)
- **Run** = open the **actual program** and run it **as it would normally run, standalone** — the real end-product experience. **Type-aware:**
  - **web/HTML** → real browser, served over **http** (never `file://` — modular apps break there). *(fixed Jun 12)*
  - **.exe / binary** → launch the executable.
  - **Python / node-cli / shell** → run in a terminal.
  - (future types as needed)
**Principle:** Run must execute the build the way its type actually runs, so the user sees/uses it like a standalone app. `detectRunCommand`/`TOK_RUN_PROJECT` already covers non-web Run; web Run now goes through the http preview server. Future: unify the result-card buttons into a clear **Preview** (web, in-editor) + **Run** (type-aware, standalone) pair, and label them so the distinction is obvious.

### [DESIGN] In-project operation taxonomy — "fix" is too coarse (PapaJoe, Jun 12 2026)
Today the router is effectively binary: **new-project build** vs **fix** (surgical repair of existing files). But operations *inside* an existing project are not all fixes. PapaJoe's framing: **an edit inside a project may be an edit, an addition, or a subtraction — it all depends.** Real categories:
- **Add** — new file/feature/screen into an existing project (e.g. "add a high-score screen to my tetris"). Needs scaffolding NEW files — the fix pipeline can't, because **a fix never creates a folder or structure; it assumes everything already exists and just edits in place.**
- **Edit/Modify** — change existing behavior/content.
- **Subtract/Remove** — delete a feature/file.
- **Fix/Repair** — correct a bug in existing code (the only thing today's "fix" pipeline truly fits).

**Why it matters:** routing an *add* through the fix pipeline produces no new files/folders (it edits in place) → silent wrong output. Routing a *build* through fix is fatal for the same reason (observed Jun 12: misrouted Tetris build → "fix didn't apply", no folder). **Future work:** replace the binary build/fix split with an intent taxonomy (build / add / edit / remove / fix); give *add* the ability to scaffold new files inside an existing project (a hybrid of build + in-project placement). Relates to the build→fix classifier misroute (fixed tactically Jun 12 by routing confirmed blueprint cards straight to build).

### � Branding — macOS + Windows full rebrand (follow-on to Jun 10 Linux overhaul)
- [ ] **macOS**: rename `VSCodium.app` → `Redivivus.app`, `Contents/MacOS/VSCodium` → `Redivivus`; patch `Info.plist` via `plutil`; generate `.icns` via `iconutil`; ad-hoc re-sign (`codesign --force --deep --sign -`) + quarantine strip — **required for Apple Silicon launch**. Fix macOS VSIX CLI path (currently points at `VSCodium.app` pending full rebrand).
- [ ] **Windows**: switch from `VSCodiumSetup-x64.exe` (registry-polluting) to `.zip` extract; rename `VSCodium.exe` → `redivivus.exe`; patch `bin\codium.cmd` to `redivivus.cmd`; `product.json` patch (currently Linux-only); Start Menu shortcut; PATH entry; detect legacy `.exe` installs before proceeding.
- [ ] **Unified `/install` endpoint** (`redivivus-web/src/app/install/route.ts`): route by `User-Agent` — `PowerShell` → `.ps1`, `curl`/`Wget` → `.sh`. Update download page to show one command per detected OS.

### 🟡 Branding — Verification pending
- [ ] **WM_CLASS check**: after next install, run `xprop WM_CLASS`, click Redivivus window — must report `"Redivivus"`. If dock icons duplicate, `--class=Redivivus` flag isn't propagating.
- [ ] **Auto-updater end-to-end test**: confirm `resolveCliPath()` finds `bin/redivivus` in a real update cycle and installs VSIX successfully.
- [ ] **Gemini default provider chip**: bottom status bar shows "Gemini" as default provider even when no key is configured — should show nothing or "No AI".

### 🔒 Security — deferred
- [ ] **Rotate exposed API keys** (deferred by user — keys were briefly visible in logs).

### �� Admin — Reports: reporter identity + two-way follow-up (requested Jun 2, 2026)
Make /admin/reports a real triage tool, not just a read-only feed.

- [ ] **Show who sent it + timestamp** — display the reporter's email/identity and date-time prominently on each report card. **Prereq:** the IDE submission must include the signed-in user's email/id (now that the IDE is authed). Store reporter email on the `feedback` row (currently only nullable `user_id`).
- [ ] **Follow-up / messaging area per report** — admin can message the reporter: ask clarifying questions, give instructions ("try this", "test new build vX.Y"). Emails the reporter via Resend and records the thread on the report. Phase 1: admin → reporter (one-way email + logged note). Phase 2 (optional): reporter can reply.
- [ ] **Auto "it's fixed" email** — when a report's status is set to `fixed`, automatically email the reporter ("your report is fixed — in version X, please update/retest"). Resend, like the waitlist invite.
- **Notes:** All three depend on capturing the reporter's email on the report. Reuse the Resend pattern from `api/admin/waitlist/invite`. Consider a `report_messages` table (report_id, from, body, created_at) for the thread.

### 🔵 Auth — Enforce single session per user (WHEN PAID)
- [ ] **One active session per email** — enable Supabase **Authentication → Sessions → "Single session per user"** so signing in on a new device invalidates the previous device's session (limits beta-key sharing). **Blocked:** paid-plan feature — currently on Free. **Tradeoff:** legit testers using >1 machine get booted when switching, so weigh friction vs. anti-sharing before enabling. No app code change — it's a Supabase setting.

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
