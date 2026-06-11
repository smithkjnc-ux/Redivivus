# Redivivus — Architecture & Pre-Release Checklist
> [SCOPE] Source file map, design rules, known issues, and pre-release checklist.
> See REDIVIVUS_ROADMAP.md for the index.

---

*Last updated: Jun 11, 2026 — strengthened Design Rule 1 (Plain English / talk-to-the-human) into a full standing guideline.*

---

## Project Info
- **Version:** 0.3.84
- **Extension ID:** papajoe.redivivus
- **Engine compat:** `vscode ^1.70.0` (for Windsurf compatibility)
- **GitHub:** `https://github.com/smithkjnc-ux/Redivivus.git` (private)
- **Backend:** `https://redivivus-backend.fly.dev` (fly.dev — `redivivus-backend` repo, `fly deploy --now`)
- **Website:** `https://redivivus.dev` (Cloudflare Workers — `redivivus-web` repo, `npx wrangler deploy`)
- **Database:** Supabase (`nadcrknbzsbhpnnvhtir` instance)
- **Dogfood project:** `~/projects/doaidream/`

## Deployment (VSCodium ONLY)
```bash
# Compile + auto-deploy (postcompile-deploy.js handles copying to all extension locations)
cd ~/projects/redivivus && npm run compile

# Reload: Ctrl+Shift+P → Developer: Restart Extension Host
```

**Extension location in running IDE:** `~/.local/opt/redivivus/resources/app/extensions/redivivus/`
**VSCodium user settings:** `~/.local/opt/redivivus/data/User/settings.json`
**Stable symlink:** `~/.local/opt/redivivus` → `~/Downloads/redivivus-<version>/`

**[WARN] NEVER sync to `~/.windsurf/extensions/` or `~/.vscode/extensions/`**
The Windsurf 0.2.0 folder was accidentally overwritten — leave it alone.

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

### Build Pre-flight Pipeline (`src/core/ai/`)
These files run in sequence BEFORE any build fires. They gate the build on intent clarity and visual alignment.

| File | Purpose |
|------|---------|
| `src/core/ai/jobSizer.ts` | Classifies every build request into a job tier: **tell-them** (0 questions, just do it), **look-it-up** (1 factual gap), **offer-choices** (2-3 high-impact decisions), **explore-with-them** (vague/large — full 5 W's intake). Fast-path regex first, AI fallback. Controls how many clarify questions fire before the build starts. |
| `src/core/ai/decisionTriage.ts` | Splits clarify questions into 3 buckets: **ai-owns** (AI resolves from code — never asks user), **user-owns-ask** (preference/structural — ask user, capped by job tier), **user-owns-guess** (cheap preference — AI picks default, surfaces post-build). Prevents unnecessary questions reaching the user. |
| `src/core/ai/fiveWsDiagnostic.ts` | Pre-commit alignment check. After job-sizing and triage, before any build fires, makes a lightweight AI call to confirm the AI is solving the RIGHT problem. Returns `aligned/misaligned`, detected goal, requested action, and a **WHO experience score** (0.0–1.0: non-technical → technical) that calibrates response depth. |
| `src/core/ai/visualSpecService.ts` | Establishes a visual contract before any Worker generates UI code. Priority: extracted (theme/token files) > inferred (existing components) > defaulted (new project). Embeds locked palette, typography, and spacing values into routedText — Worker output is visually consistent without guessing. Also feeds the Visual Contract Editor. |
| `src/core/ai/modelTierList.ts` | Built-in capability ranking: `claude-opus-4-8=100` → `gemini-2.5-pro=83` → `gpt-4o=80` → `gemini-2.5-flash=70` → `claude-haiku-4-5=65` → … → fallback=30. Consumed by roleAssignmentService. User override via `redivivus.modelRankOverrides` VS Code setting. |
| `src/core/ai/roleAssignmentService.ts` | Maps configured providers to Supervisor/Guardian/Worker roles by tier rank. Highest-ranked active model = Supervisor AND Guardian. All others = Workers. Single-model mode (only 1 key configured) uses that model for all three roles. Call `assignRoles(buildRegistrations(keyMap))` to get the full assignment. |
| `src/core/ai/roleAssignmentFailover.ts` | Runtime failure tracking. 2+ failures on a model: marks it degraded, promotes next-ranked model to Supervisor, notifies user via Guardian voice. 3+ failures: model removed from active assignment. Recovery after 10 min: model restored and assignment re-evaluated. **[WARN] State is module-level — resets on extension host restart. Failures do not persist across sessions.** |

### AI Routing Services (`src/services/ai/` — additions)
| File | Purpose |
|------|---------|
| `src/services/ai/guardianAI.ts` | Guardian AI review layer. When 2+ providers configured AND `guardianEnabled=true`, the Guardian (highest-ranked model) reviews Worker output before it reaches the user. Catches: hallucinations, blueprint drift, off-track answers, bad code patterns. Returns pass/fail, corrected text (if any), issues list, and out-of-scope scope alerts. |
| `src/services/ai/routingServiceSupervisor.ts` | Supervisor plan with automatic failover. Wraps `supervisorPlanImpl()` — on null return, records failure, promotes next-ranked model, retries once. Callers set `svc.supervisorFailoverCallback` for plain-English role-change notifications. Extracted from routingService.ts (Rule 9 split). |
| `src/services/ai/secretKeyStore.ts` | OS keychain-backed AI provider key store (VS Code `SecretStorage`). Keys are encrypted at rest on the local device. Auto-migrates from legacy `chassis.*` / `redivivus.*` settings entries on first activation. Provides `getKeyCached()` for sync access and post-init callbacks for panels that load before init completes. **[WARN] `getKeyCached()` returns null before init — always call after activation event.** |

### Services
| File | Purpose |
|------|---------|
| `src/services/redivivusService.ts` | Core init, config load/save, paths |
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
| `src/services/diagnosticLogger.ts` | Debug log writer (`~/redivivus_debug.log`) |

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
1. **Plain English everywhere — talk to the human, not the compiler.** Redivivus serves non-technical builders with great ideas and zero coding background; the chat must *teach and reassure*, never intimidate. This applies to EVERY user-facing surface: chat replies, build/result cards, security & safety reports, agent narration, error messages, tooltips, button labels, notifications.
   - **Jargon lives in the code, not the chat.** No `innerHTML` / `textContent` / `DOMPurify` / `stop_reason` / stack traces in user text. Say what it *means* and *why it matters* in everyday words, then what to do about it.
   - **Don't cry wolf.** Never alarm the user about a non-problem. Calm, accurate framing ("Worth fixing before you share this" / "Minor — good to tidy up, not urgent") over scary labels ("3 CRITICAL — fix before shipping"). Verify it's a real issue before flagging it.
   - **Offer to explain.** End guidance with an opening like "...not sure what one means? Just ask and I'll explain it in plain terms."
   - **Experienced coders don't need this — but it never hurts them.** Plain English is the default; precision is not sacrificed, jargon is just translated.
   - **Canonical example:** `src/services/build/securityScanner.ts` (rewritten Jun 11 2026) — plain-English findings + context-aware checks that don't false-alarm on hardcoded strings. Use it as the model for any new user-facing message.
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

## AI Role Assignment Architecture

```
USER ADDS API KEYS (Redivivus Settings → stored in VS Code SecretStorage)
  └─ Each key = one provider (claude/gemini/openai/groq/xai/kimi)
  └─ At least 1 required for builds
  └─ More keys = more Workers = better parallelism

REDIVIVUS RANKS MODELS AUTOMATICALLY (src/core/ai/modelTierList.ts)
  └─ Built-in tier list per model ID (claude-opus-4-8=100, gemini-2.5-pro=83, etc.)
  └─ User override: redivivus.modelRankOverrides (Record<modelId, number>)

ROLE ASSIGNMENT (src/core/ai/roleAssignmentService.ts)
  └─ Rank 1 (highest) = Supervisor AND Guardian
  └─ Rank 2+ = Workers
  └─ Single-model mode: all three roles use same model (user notified)

FAILOVER (src/core/ai/roleAssignmentFailover.ts)
  └─ 2+ failures: model marked 'degraded', next model promoted to Supervisor
  └─ 3+ failures: model marked 'failed', removed from active assignment
  └─ Recovery: after 10 min, model restored to active and assignment re-evaluated
  └─ User notified via Guardian voice on every role change
```

**Key storage:**
- All AI provider keys stored in VS Code `SecretStorage` (encrypted)
- Auto-migrated from `settings.json` on first activation after upgrade
- Settings.json entries cleared after migration

## Known Issues
- Engine version must stay at `^1.70.0` for Windsurf compat (Windsurf 1.110.1)
- `@types/vscode` must match engine version (currently 1.70.0)
- AI review/restructure commands need API key — show clear stub when missing
- Several pre-existing files exceed 200 lines (Rule 9) — split required before editing them: `chatPanelBuildRunner.ts` (240), `chatPanelMessageRouterEarlyExits.ts` (229), `chatPanelMsgFix.ts` (220+), `extension.ts` (369), `extensionCommands.ts` (208), `agentTools.ts` (now fixed), `supervisorOrchestrator.ts` (248), `cloudBuildClient.ts` (280), `chatPanel.ts` (217), `chatPanelPublicAPI.ts` (227), `chatPanelRenderer.ts` (208), `chatPanelScriptActions.ts` (235)
- Supervisor can over-engineer fix prescriptions (e.g., recommending inline SVG for chess pieces instead of Unicode) — domain-specific guidance added to fix-supervisor prompt for known patterns; watch for similar issues in other domains
- Agent mode accumulates context across iterations — by iteration 6+ with large files in history, the backend `/execute` call can approach the 120s timeout. Mitigated by: `read_file_lines` tool (line-range reads instead of cat|tail), 120s timeout (up from 60s). For complex projects, prefer the standard fix pipeline over agent mode for pure code changes.
- `PLAIN:` line occasionally missing from Supervisor response — results in generic "Couldn't make the change automatically" message with no diagnostic text. Fix pipeline log (`chess-ai-game/.redivivus/logs/fix-pipeline-*.log`) always has full details.
- History title in build history was showing AI-rewritten task text instead of user's original message — fixed Jun 7, 2026 (handleFixRequest now receives original userText, not _claudeTask)

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
