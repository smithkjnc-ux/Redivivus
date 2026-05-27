# Redivivus — Architecture & Pre-Release Checklist
> [SCOPE] Source file map, design rules, known issues, and pre-release checklist.
> See REDIVIVUS_ROADMAP.md for the index.

---

*Last updated: May 27, 2026 (Session 11BI)*

---

## Project Info
- **Version:** 0.3.19
- **Extension ID:** papajoe.redivivus
- **Engine compat:** `vscode ^1.70.0` (for Windsurf compatibility)
- **GitHub:** `https://github.com/smithkjnc-ux/Redivivus.git` (private)
- **Backend:** `https://redivivus-backend.pages.dev` (Cloudflare Pages)
- **Website:** `https://redivivus.dev` (Cloudflare Pages — `redivivus-web` repo)
- **Database:** Supabase (`nadcrknbzsbhpnnvhtir` instance)
- **Dogfood project:** `~/projects/doaidream/`

## Deployment (VSCodium ONLY)
```bash
# Compile
cd ~/projects/redivivus && npm run compile

# Deploy to VSCodium
cp -r ~/projects/redivivus/out/* ~/.vscode-oss/extensions/papajoe.redivivus-0.3.4/out/

# If package.json changed (new commands):
cp ~/projects/redivivus/package.json ~/.vscode-oss/extensions/papajoe.redivivus-0.3.4/package.json

# Reload: Ctrl+Shift+P → Developer: Restart Extension Host
```

**[WARN] NEVER sync to `~/.windsurf/extensions/` or `~/.vscode/extensions/`**
The Windsurf 0.2.0 folder was accidentally overwritten with 0.3.4 code — leave it alone.

---

## Key Source Files

### Entry Points
| File | Purpose |
|------|---------|
| `src/extension.ts` | Main entry, registers all commands, 90 lines |
| `src/commands/` | 9 command modules (init, session, blueprint, analysis, review, restructure, retrofit, vault, misc) |

### UI Layer
| File | Purpose |
|------|---------|
| `src/ui/chatPanel.ts` | Chat panel WebView — main AI interaction surface |
| `src/ui/chatPanelMessages.ts` | Message handler — routes all webview messages |
| `src/ui/chatPanelIntent.ts` | Intent classifier — hardcoded overrides + AI classification |
| `src/ui/chatPanelAI.ts` | System prompt builder, command card renderer, response processor |
| `src/ui/chatPanelBuild.ts` | Single-file build pipeline |
| `src/ui/chatPanelChunked.ts` | Multi-file chunked build pipeline |
| `src/ui/chatPanelHtml.ts` | Chat panel HTML/CSS template |
| `src/ui/chatPanelScript.ts` | Client-side webview JavaScript |
| `src/ui/chatPanelStory.ts` | NARRATOR extraction, result card builder |
| `src/ui/mapPanel.ts` | Architecture Map WebView |
| `src/ui/mapBuilderService.ts` | File node + import edge builder for the map |
| `src/ui/mapScriptEngine.ts` | [WARN] Shared canvas IIFE for all Architecture Map views |
| `src/ui/statusBar.ts` | Status bar items (project, session, tokens) |
| `src/ui/vaultBrowserRenderer.ts` | Vault Browser WebView HTML renderer |

### Services
| File | Purpose |
|------|---------|
| `src/services/chassisService.ts` | Core init, config load/save, paths |
| `src/services/routingService.ts` | Multi-AI routing, Supervisor/Worker/Guardian chain |
| `src/services/vaultService.ts` | Vault CRUD, categorization, duplicate detection |
| `src/services/vaultStorage.ts` | Vault file I/O — reads/writes `~/.redivivus-vault/` ONLY |
| `src/services/vaultScanner.ts` | Codebase scanner — extracts functions into vault items |
| `src/services/vaultAutoCapture.ts` | Auto-captures built files into vault after every build |
| `src/services/vaultContextService.ts` | Vault context injection for build prompts |
| `src/services/sessionService.ts` | Start/end sessions, exit interview |
| `src/services/blueprintService.ts` | Five W interview |
| `src/services/analyzerService.ts` | Project scanner — generates `project_map.md` |
| `src/services/guardianService.ts` | Health scoring, risk scanning, ELI5 translation |
| `src/services/learnedMemoryService.ts` | Permanent facts stored to `.redivivus/learned.md` |
| `src/services/snapshotService.ts` | File snapshots before every build (Undo Everything) |
| `src/services/buildLedgerService.ts` | Per-AI token/cost tracking for result card breakdown |
| `src/services/savePointService.ts` | Git-backed save point create/restore |
| `src/services/diagnosticLogger.ts` | Debug log writer (`~/chassis_debug.log`) |

### Data Files
| File | Purpose |
|------|---------|
| `.redivivus/config.json` | Project config (name, blueprint, session state) |
| `.redivivus/work_log.md` | Session history, AI actions |
| `.redivivus/dead_ends.md` | Failed approaches — don't repeat |
| `.redivivus/learned.md` | AI-extracted permanent user preferences/facts |
| `.redivivus/rules.md` | Universal Project Protocol master rules |
| `.redivivus/build_errors.log` | Build error log with full details |
| `~/.redivivus-vault/` | Global vault — shared across all projects |

---

## Design Rules
1. **Plain English everywhere** — no jargon in user-facing text
2. **Files under 200 lines** — split at natural boundaries, add `[NEXT]` tags
3. **[SCOPE] at top of every file** — read before touching
4. **[WARN] before fragile code** — understand why before changing
5. **After any paste from Claude chat** — run `python3 ~/bin/delink <filepath>`
6. **No Unicode in WebView injected scripts** — ASCII only (Rule 13)
7. **Map panel has 45KB `document.write()` hard limit** — serve JS files via `asWebviewUri()` (Rule 16)
8. **Never modify `mapScriptEngine.ts` IIFE** — new views use `window.setLayoutMode()` bridge only (Rule 14)
9. **Vault only reads from `~/.redivivus-vault/`** — never from Windsurf globalStorage or system paths
10. **Intent classifier hardcoded overrides run first** — never let AI misroute common commands

---

## Known Issues
- Engine version must stay at `^1.70.0` for Windsurf compat (Windsurf 1.110.1)
- `@types/vscode` must match engine version (currently 1.70.0)
- AI review/restructure commands need API key — show clear stub when missing
- API keys stored in VS Code `settings.json` — re-enter after forced extension reinstall

---

## What's Working — DO NOT BREAK
- [x] Blueprint form — dynamic project name, pre-populated data, locked/warning banners
- [x] Start Working / Done for Now — inline WebView forms
- [x] Switch AI — inline picker, badge updates
- [x] File picker commands (Check a File / AI Review / Clean Up File)
- [x] Vault tab — empty state, scan, save, browse
- [x] Scan Project — analyzerService works, generates `project_map.md` + `recommendations.md`
- [x] Redivivus Chat panel — WebView chat, context badges, build pipeline
- [x] Intent detection — build verbs → builder, questions → Q&A, commands → hardcoded overrides
- [x] Supervisor/Worker AI orchestration — highest AI plans+reviews, next-best executes
- [x] Vault-hit gate before builds — high-confidence match modal
- [x] Vault auto-save after every build
- [x] Story Mode — NARRATOR lines, result cards, Undo Everything
- [x] Architecture Map — force-directed graph, click-to-drill, 3 view modes
- [x] Token counter — per-message + session/daily/weekly/monthly/all-time
- [x] Auto-chunking for complex builds
- [x] Save Points — git-backed checkpoints
- [x] Learned memory — AI-extracted permanent facts
- [x] Close project — uses `updateWorkspaceFolders()`, no file picker
- [x] Vault — reads only from `~/.redivivus-vault/`, never from Windsurf globalStorage

---

## Pre-Release Checklist — Redivivus IDE v1.0

### MUST PASS — Blocks Release

#### Installation & First Launch
- [ ] Extension installs from `.vsix` without errors
- [ ] Redivivus status bar appears on first launch
- [ ] Chat panel opens via Ctrl+L
- [ ] No error notifications on fresh workspace

#### New User Flow (Non-Technical)
- [ ] Empty state shows welcome + demo pills
- [ ] Clicking demo pill fills textarea and focuses it
- [ ] First build from demo pill produces a working file
- [ ] Result card shows: file created, vault items, cost, time

#### Core Build Pipeline
- [ ] Single-file build works end-to-end
- [ ] Multi-file chunked build works end-to-end
- [ ] Undo Everything restores files
- [ ] Build error logging works

#### Vault Flywheel
- [ ] Auto-capture after build saves to `~/.redivivus-vault/`
- [ ] Vault browser shows saved items
- [ ] Vault-hit modal fires on high-confidence match
- [ ] "Use Vault" builds without AI (cost: $0)
- [ ] Scan Project opens folder picker, scans, shows results
- [ ] Save to Vault saves pending scan items with confirmation

#### Placement Guard
- [ ] "This sounds like a full project" gate fires correctly
- [ ] New project wizard flow works after placement choice
- [ ] Build resumes correctly after project creation + reload

#### Supervisor/Worker Chain
- [ ] Supervisor (highest AI) plans build
- [ ] Worker (next-best AI) executes
- [ ] Guardian reviews output
- [ ] Badge shows correct AI roles

#### Architecture Map
- [ ] Map opens in full width (chat panel closes)
- [ ] All files appear as nodes
- [ ] Import edges render correctly
- [ ] Click node → side panel shows SCOPE, stats, actions
- [ ] Double-click → opens file
- [ ] 3 view modes work (Network, Clustered, Hierarchy)

#### Save Points & History
- [ ] Save Point creates a git commit
- [ ] Restore Save Point prompts confirmation then rolls back

#### Open Existing Project
- [ ] Folder picker opens
- [ ] Redivivus-initialized project loads dashboard directly
- [ ] Non-initialized project shows Set It Up / Just Browse choice

#### Error Handling
- [ ] No API key → clear message, no crash
- [ ] Build timeout → "Timed out — retry?" not permanent freeze
- [ ] Vault write error → silent fail, no crash

### SHOULD PASS — Ship if possible

#### Performance
- [ ] Chat panel opens in < 500ms
- [ ] Map renders in < 3s for projects under 100 files
- [ ] Vault search returns in < 200ms with 500 items

#### Edge Cases
- [ ] Empty project (no files) — map shows empty state
- [ ] Single-file project — build + vault work correctly
- [ ] Project with no blueprint — status bar shows name (not "No Project")

#### Non-Technical User Language
- [ ] No error messages contain stack traces visible to user
- [ ] All action buttons use plain English (not command IDs)
- [ ] Cost shown as "$0.0003" not "0.00030000012"

### SMOKE TEST SEQUENCE
1. Install extension → open VSCodium → confirm status bar shows
2. No workspace → type "countdown timer" → confirm build runs
3. Open existing Redivivus project → confirm chat shows project context
4. Type "close the current project" → confirm closes without file picker
5. Type "open the vault" → confirm vault browser opens (no file picker)
6. Scan a project folder → confirm results shown → Save to Vault → confirm items saved
7. Build something → confirm vault auto-captures → open vault → verify item present
8. Create save point → make a change → restore save point → verify files restored
9. Open Architecture Map → click a node → verify side panel shows → double-click → verify file opens
