# Redivivus — Roadmap Index
> [SCOPE] **INDEX ONLY.** Session entries go in `docs/REDIVIVUS_FIXES.md`. Planned features go in `docs/REDIVIVUS_FEATURES.md`. Architecture/rules go in `docs/REDIVIVUS_ARCHITECTURE.md`.
>
> **RULE — NO EXCEPTIONS:**
> - New session fix entry? → `docs/REDIVIVUS_FIXES.md`
> - New planned feature / backlog item? → `docs/REDIVIVUS_FEATURES.md`
> - Architecture change / design rule? → `docs/REDIVIVUS_ARCHITECTURE.md`
> - This file stays under 80 lines. If you are about to make it longer, you are in the wrong file.

*Last updated:* 2026-06-08 — Stage 2 Re-Prescription: After Guardian rejection, Supervisor is called again with enriched dead ends (session failures + project dead ends). New prescription updates `currentDiagnosis`, enabling fresh strategies on retry instead of repeating same failed approach.

*Prior:* 2026-06-07 — failure message now shows prescription + green "Try this fix" button with specific suggested prompt

*Prior:* Jun 06, 2026 — FIXED: Agent Authentication Error (JSON.stringify dropping function-based API keys during payload construction) in agentService.ts and agentSupervisor.ts by using collectKeys().

---

## Documentation Map

| File | What goes here | What does NOT go here |
|---|---|---|
| **`REDIVIVUS_ROADMAP.md`** | YOU ARE HERE — index, last 3 sessions summary, doc pointers | Session fix tables, backlog items, design rules |
| **`docs/REDIVIVUS_FIXES.md`** | Every session entry — what changed, why, risk | Planned features, architecture specs |
| **`docs/REDIVIVUS_FEATURES.md`** | Backlog, planned work, What's Working, Competitive Gap | Fix history, architecture details |
| **`docs/REDIVIVUS_ARCHITECTURE.md`** | Design rules, project info, deployment steps, source file map | Fix history, planned features |
| **`docs/REDIVIVUS_VISION.md`** | Product vision, monetization, P2P/LLM strategy | Anything operational |

---

## Recent Sessions (last 3 — full entries in `docs/REDIVIVUS_FIXES.md`)

### Session 16 — Jun 3, 2026: Adaptive Blueprint Completion
- AI infers all 5 W's from any build request (confident/assumed/unknown per field)
- Confirmation card shown before every new project build — user sees assumptions before a line is written
- Only asks about genuine unknowns; confident/assumed fields are read-only (but editable via "Change something")
- Fallback: if inference fails, proceeds to direct build uninterrupted

### Session 14 — Jun 3, 2026: Build UX, AI Transparency, Auto-Continuation, Bug Prevention
- **AI breakdown card:** Every build result now shows "AI Used" with friendly model name (e.g. "Claude Haiku 4.5"), plain-English role ("Built your project"), and token count. Replaced technical jargon (`claude-haiku-4-5-20251001`, `Solo Builder`, pills) with readable one-liner per AI
- **Live code streaming on main build:** `chatPanelBuildRunner.ts` now accumulates chunks into a live code block — same real-time view previously only available on edits/fixes
- **Auto-continuation on token limit:** `cloudBuildClientAI.ts` detects `finish_reason: length/max_tokens` per provider (Claude, OpenAI, Gemini, Groq, xAI, Kimi) and automatically continues up to 3 times — no truncated files, no user intervention needed. `streamingProviders.ts` + `routingTypes.ts` updated to propagate `truncated` flag
- **Duplicate panel on project close fixed:** `workbench.action.closeFolder` caused window reload → second `activate()` → auto-open timer fired with `currentPanel=false` → duplicate tab. Fix: set `redivivus.userClosedProject` flag in `globalState` before close; auto-open timer checks and skips if set
- **Static validators (Checks 8 & 9):** `codeValidator.ts` now catches `const` array reassignment (auto-fixes to `let`) and `ctx.translate(0,0)` used as transform reset (auto-fixes to `ctx.setTransform(1,0,0,1,0,0)`) — both are AI-generated runtime crash patterns
- **Web:** "PapaJoe Smith" name fix on homepage. All changes deployed to Cloudflare

### Session 13 — Jun 1, 2026: Full Audit, Security Fixes, Auth Repair, Sidebar, Polish Prompt
- **Windows auth fixed end-to-end:** `signIn.ts` now opens `redivivus.dev/auth/ide` (not `redivivus-backend`); `auth/ide/route.ts` uses forwarded host headers; `auth/callback` same fix; login page GitHub OAuth now hits registered domain
- **Security:** Removed hardcoded CF + GH tokens from `release.sh` / `nightly-release.sh` — moved to `~/.bashrc`, scripts guard with `${VAR:?not set}`; both scripts source `~/.bashrc` for cron compatibility
- **`makeTimeout` bug fixed:** Custom timeout errors now set `err.name = 'TimeoutError'` so catch branch actually matches
- **Shell injection fixed:** `gitAutoCommitService.ts` switched to `execFileSync('git', ['commit', '-m', msg])` — no shell injection via backticks or `$()`
- **Port validation fixed:** `auth/ide/route.ts` now validates `1024 ≤ port ≤ 65535`
- **Sidebar `New Project` button fixed:** Was calling `redivivusSidebar.focus` (no-op) — now opens chat and calls `showNewProject()`
- **`Work Log` / `Dead Ends` buttons fixed:** No longer silently no-op when not initialized; auto-open chat panel instead of requiring it pre-open
- **Polished build prompt:** `buildPipeline.ts` Rule 9 now mandates gradient bg, styled score panel, Web Audio, animated overlay, localStorage HS, responsive layout by default for all game builds
- **Reports archive:** Fixed/wontfix reports hidden by default in admin panel; new `archived (N)` tab shows them on demand
- **`.dockerignore` fixed:** `.wrangler` (1.1GB), `.open-next`, `.dev.vars` added — Fly deploys now send ~2MB context instead of 1.17GB
- **Auto-open explorer fixed:** Cloud build path now auto-opens workspace after result card renders (500ms delay + `pendingBuildComplete` rescue)
- **`applySurgicalEdits` fallback now logs a warning** when silently falling back to full rewrite

### Session 11DX — May 31, 2026: AbortSignal Hang Fix — Indefinite Spinner Freeze
- `AbortSignal.timeout()` unreliable in Electron; replaced with `Promise.race` + `makeTimeout` on plan/build/complete fetches
- Split `cloudBuildClient.ts` (201 → 172 lines) by extracting `executeClientAI` + `createFetchWithTimeout` to new `cloudBuildClientAI.ts`
- Removed `updateWorkspaceFolders` from `processBuildResults` — it was restarting the extension host mid-build in multi-root workspaces, killing the result card before it rendered
- Stale working messages now filtered from `saveConversation` so they don't resurrect after host restarts
- Report button redesigned: in-IDE WebviewPanel with category + text + image upload + AI debug prompt generation (no more GitHub browser redirect dialog)

### Session 11DF — May 29, 2026: Build UX — Auto-reload, Game Quality, Result Card
- Removed forced `vscode.openFolder` after new-project builds — result card already has "Open Project" button; auto-reload fired before user could read anything
- Local fallback SYSTEM prompt now explicitly requires fully playable games (event handlers, game state, win conditions)
- Local fallback narration now shows Builder/Cloud/Cost clearly

### Session 11DE — May 29, 2026: Auto vs Guided Build Modes
- Renamed `'direct'`/`'plan'` → "Auto"/"Guided" across all UI (popover, badge, launcher cards, empty state)
- Added `redivivus.buildMode: "auto" | "guided"` VS Code setting — persists mode across sessions
- Pre-loads setting in message router so mode is applied from first message
- Guided interview: all 5 W questions rewritten (more detailed), style follow-up added, task string improved

### Session 11DD — May 29, 2026: Cloud Build Local Fallback (5xx → Local AI Build)
- Cloud `/build` returns 500 (server framework crash, empty body — unfixable from client)
- Solution: on `status >= 500`, call `runLocalBuild()` — builds using user's own AI keys directly
- `cloudBuildClient.ts` was 291 lines → split into 3 files (170 / 62 / 129)
- New: `cloudBuildResultProcessor.ts`, `cloudBuildLocalFallback.ts`

---

## Active Next Steps
> Full backlog in `docs/REDIVIVUS_FEATURES.md`
- [ ] **Vault sync command** — wire `vaultCloudSync.ts` to `redivivus.syncVaultToCloud` palette command
- [ ] **Live Preview** — `▶ Preview` tab with device toggle (IN PROGRESS)
- [ ] **Community vault** — admin approval flow for submitted patterns

---

## Routing: Where to Write

```
Made a code change this session?
  → docs/REDIVIVUS_FIXES.md  (add a table row)

Planning a future feature?
  → docs/REDIVIVUS_FEATURES.md  (add to backlog)

Changed a design rule or architecture decision?
  → docs/REDIVIVUS_ARCHITECTURE.md

Completed one of the active next steps above?
  → Update the checkbox here AND add entry to REDIVIVUS_FIXES.md
```
