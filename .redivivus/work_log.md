# WORK_LOG — redivivus

Auto-managed by Redivivus. Append-only session history.

---

## [2026-05-13]
- **Session Start** — ID: 20260513_fixbugs
- AI: Gemini
- Goal: Fix 3 critical bugs in CHASSIS extension

### Bug Fixes:
1. **Bug 1 — Raw __BUILD_RESULT__ token showing after builds**
   - **File:** `src/ui/chatPanelRenderer.ts:36-42`
   - **Fix:** Added regex parser to convert `__BUILD_RESULT__filename|||filepath|||END__` token into an "Open File" button
   - **Fallback:** Added second regex to strip any remaining raw BUILD_RESULT tokens to prevent chat blocking
   - **Testing:** Verify build results show Open File button instead of raw token

2. **Bug 2 — AI failover on Gemini API timeout**
   - **File:** `src/ui/chatPanelBuildWorker.ts:16-57`
   - **Fix:** Added `executeWorkerBuild()` retry logic that detects timeout errors and tries available fallback AIs
   - **User message:** Shows "⏱️ Gemini timed out — retrying with Kimi..." before each failover attempt
   - **Testing:** Temporarily lower timeout or block Gemini to verify failover chain works

3. **Bug 3 — Supervisor prompt ignores format preferences**
   - **File:** `src/services/routingService.ts:263-284`
   - **Fix:** Added `supervisorPlan()` logic to detect format preferences from user task:
     - HTML output: detects "html", "one html file", "single html"
     - Single file: detects "single file", "one file", "single output"
     - No build step: detects "no build", "no webpack", "vanilla js"
   - **Spec injection:** Format instructions added to supervisor prompt for worker spec
   - **Testing:** Request "single HTML file" and verify output is self-contained HTML

---

## [2026-05-06]
- Action: Major feature sprint + rule compliance audit
- Features shipped:
  - Build Narrator (live __STORY__ panel, ⚙️→✅ per file)
  - Summary card after builds (__RESULT_CARD__ token)
  - Undo Everything (snapshotService.ts — pre-build snapshots, one-click restore)
  - Active file context injection (chatPanelAI.ts — first 50 lines of open file in every prompt)
  - First-run onboarding (3-state empty screen — new user gets setup button)
  - Side panel drill-down (openFileAtSymbol — jumps to best matching symbol)
  - AI-triggered permanent memory (PREFERENCE_RE mid-chat detection → learned.md)
  - Map button fix (setTimeout defer to avoid mid-handler dispose)
- Rule compliance fixes:
  - Added [WARN] + [NEXT] split markers to 6 files over 200 lines
  - Added missing function comments to updateStory(), _pruneOld()
  - Added dead_ends.md check + file size pre-check to all 3 rules files
  - Strengthened [NEXT] language: explicitly NOT a deferral pass
- Violations noted this session: Rule 9 (file size), Rule 10 (blueprint/dead_ends not read at start), Rule 11 (missing function comments)
- Files over 200 lines that need splitting next session: chatPanelHtml.ts (889), mapScript.ts (372), chatPanel.ts (343)

---

## [2026-05-03 00:13:54]
- Action: Project Analysis
- Files scanned: 34
- Total lines: 10066
- Large files (>200 lines): 15
- TODOs found: 51
- Files needing comments: 0

## [2026-05-03 00:55:09]
- Action: Project Analysis
- Files scanned: 43
- Total lines: 10231
- Large files (>200 lines): 14
- TODOs found: 56
- Files needing comments: 0

## [2026-05-03 00:57:00]
- **Session Start** — ID: 20260503_uf3u
- AI: Gemini
- Goal: testing chassis

## [2026-05-03 00:57:47]
- **Session End** — ID: 20260503_uf3u
- Duration: 1m
- Completed: checked chassis for errors
- In Progress: a lot
- Risks: yes
- Next session: not sure

## [2026-05-03 01:23:57]
- Action: Project Analysis
- Files scanned: 52
- Total lines: 10251
- Large files (>200 lines): 15
- TODOs found: 52
- Files needing comments: 0

## [2026-05-03 19:09:19]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 12336
- Large files (>200 lines): 19
- TODOs found: 68
- Files needing comments: 0

## [2026-05-03 19:10:08]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 12336
- Large files (>200 lines): 19
- TODOs found: 68
- Files needing comments: 0

## [2026-05-03 19:14:00]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 12342
- Large files (>200 lines): 19
- TODOs found: 68
- Files needing comments: 0

## [2026-05-03 19:15:32]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 12342
- Large files (>200 lines): 19
- TODOs found: 68
- Files needing comments: 0

## [2026-05-03 19:15:53]
- Action: Retrofit
- File: scripts/postcompile.js
- AI: gemini-2.5-flash
- Lines: 84 → 97 (+13 / -0)
- Annotations added: [SCOPE] x1, [WARN] x13


## [2026-05-03 19:16:03]
- Action: Retrofit
- File: src/commands/analysis.ts
- AI: gemini-2.5-flash
- Lines: 85 → 85 (+0 / -0)
- Annotations added: [WARN] x1


## [2026-05-03 19:16:10]
- Action: Retrofit
- File: src/commands/blueprint.ts
- AI: gemini-2.5-flash
- Lines: 38 → 42 (+4 / -0)
- Annotations added: [WARN] x6


## [2026-05-03 19:16:13]
- Action: Retrofit
- File: src/commands/buildFromVault.ts
- AI: gemini-2.5-flash
- Lines: 16 → 15 (+0 / -1)
- Annotations added: none


## [2026-05-03 19:16:33]
- Action: Retrofit
- File: src/commands/init.ts
- AI: gemini-2.5-flash
- Lines: 193 → 194 (+1 / -0)
- Annotations added: [NEXT] x1, [WARN] x1


## [2026-05-03 19:16:44]
- Action: Retrofit
- File: src/commands/misc.ts
- AI: gemini-2.5-flash
- Lines: 174 → 179 (+5 / -0)
- Annotations added: [WARN] x6


## [2026-05-03 19:16:57]
- Action: Retrofit
- File: src/commands/restructure.ts
- AI: gemini-2.5-flash
- Lines: 140 → 143 (+3 / -0)
- Annotations added: [WARN] x5


## [2026-05-03 19:17:02]
- Action: Retrofit
- File: src/commands/retrofit.ts
- AI: gemini-2.5-flash
- Lines: 41 → 39 (+0 / -2)
- Annotations added: none


## [2026-05-03 19:17:12]
- Action: Retrofit
- File: src/commands/review.ts
- AI: gemini-2.5-flash
- Lines: 102 → 108 (+6 / -0)
- Annotations added: [WARN] x7


## [2026-05-03 19:17:17]
- Action: Retrofit
- File: src/commands/session.ts
- AI: gemini-2.5-flash
- Lines: 33 → 32 (+0 / -1)
- Annotations added: none


## [2026-05-03 19:17:26]
- Action: Retrofit
- File: src/commands/vault.ts
- AI: gemini-2.5-flash
- Lines: 68 → 67 (+0 / -1)
- Annotations added: none


## [2026-05-03 19:17:35]
- Action: Retrofit
- File: src/extension.ts
- AI: gemini-2.5-flash
- Lines: 97 → 98 (+1 / -0)
- Annotations added: [WARN] x2


## [2026-05-03 19:17:45]
- Action: Retrofit
- File: src/services/blueprintService.ts
- AI: gemini-2.5-flash
- Lines: 214 → 215 (+1 / -0)
- Annotations added: [WARN] x2


## [2026-05-03 19:17:58]
- Action: Retrofit
- File: src/services/measureTwiceService.ts
- AI: gemini-2.5-flash
- Lines: 185 → 185 (+0 / -0)
- Annotations added: [SCOPE] x1, [WARN] x4


## [2026-05-03 19:18:11]
- Action: Retrofit
- File: src/services/sessionService.ts
- AI: gemini-2.5-flash
- Lines: 225 → 242 (+17 / -0)
- Annotations added: [WARN] x22


## [2026-05-03 19:18:30]
- Action: Retrofit
- File: src/services/vaultContextService.ts
- AI: gemini-2.5-flash
- Lines: 144 → 154 (+10 / -0)
- Annotations added: [WARN] x18


## [2026-05-03 19:19:38]
- Action: Retrofit
- File: src/services/vaultService.ts
- AI: gemini-2.5-flash (chunked)
- Lines: 707 → 740 (+33 / -0)
- Annotations added: [SCOPE] x3, [TODO] x6, [NEXT] x2, [WARN] x24


## [2026-05-03 19:19:58]
- Action: Retrofit
- File: src/services/wizardService.ts
- AI: gemini-2.5-flash
- Lines: 229 → 232 (+3 / -0)
- Annotations added: [NEXT] x4


## [2026-05-03 19:20:06]
- Action: Retrofit
- File: src/types/index.ts
- AI: gemini-2.5-flash
- Lines: 72 → 71 (+0 / -1)
- Annotations added: none


## [2026-05-03 19:20:27]
- Action: Retrofit
- File: src/ui/messageRouter.ts
- AI: gemini-2.5-flash
- Lines: 428 → 429 (+1 / -0)
- Annotations added: [WARN] x2


## [2026-05-03 19:21:13]
- Action: Retrofit
- File: src/ui/scripts.ts
- AI: gemini-2.5-flash
- Lines: 421 → 450 (+29 / -0)
- Annotations added: [TODO] x2, [NEXT] x10, [WARN] x7


## [2026-05-03 19:21:23]
- Action: Retrofit
- File: src/ui/sidebarProvider.ts
- AI: gemini-2.5-flash
- Lines: 101 → 101 (+0 / -0)
- Annotations added: [WARN] x1


## [2026-05-03 19:21:30]
- Action: Retrofit
- File: src/ui/statusBar.ts
- AI: gemini-2.5-flash
- Lines: 67 → 66 (+0 / -1)
- Annotations added: none


## [2026-05-03 19:21:39]
- Action: Retrofit
- File: src/ui/styles.ts
- AI: gemini-2.5-flash
- Lines: 74 → 73 (+0 / -1)
- Annotations added: none


## [2026-05-03 19:22:02]
- Action: Retrofit
- File: src/ui/views/filesTab.ts
- AI: gemini-2.5-flash
- Lines: 146 → 151 (+5 / -0)
- Annotations added: [WARN] x6


## [2026-05-03 19:22:11]
- Action: Retrofit
- File: src/ui/views/historyTab.ts
- AI: gemini-2.5-flash
- Lines: 62 → 62 (+0 / -0)
- Annotations added: [WARN] x1


## [2026-05-03 19:22:50]
- Action: Retrofit
- File: src/ui/views/vaultTab.ts
- AI: gemini-2.5-flash
- Lines: 224 → 229 (+5 / -0)
- Annotations added: [NEXT] x2, [WARN] x4


## [2026-05-03 19:23:00]
- Action: Retrofit
- File: src/ui/views/welcomeView.ts
- AI: gemini-2.5-flash
- Lines: 61 → 60 (+0 / -1)
- Annotations added: none


## [2026-05-03 19:23:16]
- Action: Retrofit
- File: src/ui/views/wizardSteps.ts
- AI: gemini-2.5-flash
- Lines: 108 → 112 (+4 / -0)
- Annotations added: [WARN] x5


## [2026-05-03 19:23:30]
- Action: Retrofit
- File: src/ui/views/workTab.ts
- AI: gemini-2.5-flash
- Lines: 96 → 98 (+2 / -0)
- Annotations added: [WARN] x3


## [2026-05-03 19:23:46]
- Action: Retrofit
- File: src/ui/wizardPanel.ts
- AI: gemini-2.5-flash
- Lines: 190 → 189 (+0 / -1)
- Annotations added: none


## [2026-05-03 19:23:53]
- Action: Retrofit
- File: src.bak/extension.js
- AI: gemini-2.5-flash
- Lines: 59 → 60 (+1 / -0)
- Annotations added: [SCOPE] x1


## [2026-05-03 19:23:57]
- Action: Retrofit
- File: src.bak/extension.ts
- AI: gemini-2.5-flash
- Lines: 27 → 27 (+0 / -0)
- Annotations added: [SCOPE] x1


## [2026-05-03 19:23:57]
- Action: Project Retrofit
- Files processed: 33
- Successful: 33
- Failed: 0
- Backup: .chassis/backup/

## [2026-05-03 19:24:40]
- Action: Retrofit Confirmed
- Backup deleted

## [2026-05-03 19:24:49]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 12476
- Large files (>200 lines): 19
- TODOs found: 76
- Files needing comments: 0

## [2026-05-03 19:25:13]
- Action: Retrofit
- File: src/commands/buildFromVault.ts
- AI: gemini-2.5-flash
- Lines: 15 → 15 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:25:19]
- Action: Retrofit
- File: src/commands/retrofit.ts
- AI: gemini-2.5-flash
- Lines: 39 → 39 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:25:25]
- Action: Retrofit
- File: src/commands/session.ts
- AI: gemini-2.5-flash
- Lines: 32 → 32 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:25:35]
- Action: Retrofit
- File: src/commands/vault.ts
- AI: gemini-2.5-flash
- Lines: 67 → 78 (+11 / -0)
- Annotations added: [WARN] x8


## [2026-05-03 19:25:42]
- Action: Retrofit
- File: src/types/index.ts
- AI: gemini-2.5-flash
- Lines: 71 → 71 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:25:49]
- Action: Retrofit
- File: src/ui/statusBar.ts
- AI: gemini-2.5-flash
- Lines: 66 → 66 (+0 / -0)
- Annotations added: [WARN] x2


## [2026-05-03 19:25:56]
- Action: Retrofit
- File: src/ui/styles.ts
- AI: gemini-2.5-flash
- Lines: 73 → 73 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:26:01]
- Action: Retrofit
- File: src/ui/views/welcomeView.ts
- AI: gemini-2.5-flash
- Lines: 60 → 60 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:26:18]
- Action: Retrofit
- File: src/ui/wizardPanel.ts
- AI: gemini-2.5-flash
- Lines: 189 → 191 (+2 / -0)
- Annotations added: [WARN] x2


## [2026-05-03 19:26:24]
- Action: Retrofit
- File: src.bak/extension.js
- AI: gemini-2.5-flash
- Lines: 60 → 60 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:26:30]
- Action: Retrofit
- File: src.bak/extension.ts
- AI: gemini-2.5-flash
- Lines: 27 → 27 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:26:30]
- Action: Project Retrofit
- Files processed: 11
- Successful: 11
- Failed: 0
- Backup: .chassis/backup/

## [2026-05-03 19:26:40]
- Action: Retrofit Confirmed
- Backup deleted

## [2026-05-03 19:26:44]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 12489
- Large files (>200 lines): 19
- TODOs found: 76
- Files needing comments: 0

## [2026-05-03 19:27:22]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 12489
- Large files (>200 lines): 19
- TODOs found: 76
- Files needing comments: 0

## [2026-05-03 19:28:03]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 12489
- Large files (>200 lines): 19
- TODOs found: 76
- Files needing comments: 0

## [2026-05-03 19:49:34]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12800
- Large files (>200 lines): 19
- TODOs found: 84
- Files needing comments: 0

## [2026-05-03 19:50:27]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12800
- Large files (>200 lines): 19
- TODOs found: 84
- Files needing comments: 0

## [2026-05-03 19:50:47]
- Action: Retrofit
- File: src/commands/buildFromVault.ts
- AI: gemini-2.5-flash
- Lines: 15 → 15 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:50:52]
- Action: Retrofit
- File: src/commands/retrofit.ts
- AI: gemini-2.5-flash
- Lines: 39 → 39 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:50:58]
- Action: Retrofit
- File: src/commands/session.ts
- AI: gemini-2.5-flash
- Lines: 32 → 32 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:51:02]
- Action: Retrofit
- File: src/types/index.ts
- AI: gemini-2.5-flash
- Lines: 71 → 71 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:51:16]
- Action: Retrofit
- File: src/ui/chassisWebviewProvider.ts
- AI: gemini-2.5-flash
- Lines: 162 → 161 (+0 / -1)
- Annotations added: [WARN] x1


## [2026-05-03 19:51:25]
- Action: Retrofit
- File: src/ui/styles.ts
- AI: gemini-2.5-flash
- Lines: 70 → 70 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:51:30]
- Action: Retrofit
- File: src/ui/views/welcomeView.ts
- AI: gemini-2.5-flash
- Lines: 60 → 60 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:51:37]
- Action: Retrofit
- File: src.bak/extension.js
- AI: gemini-2.5-flash
- Lines: 60 → 60 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:51:42]
- Action: Retrofit
- File: src.bak/extension.ts
- AI: gemini-2.5-flash
- Lines: 27 → 27 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:51:42]
- Action: Project Retrofit
- Files processed: 9
- Successful: 9
- Failed: 0
- Backup: .chassis/backup/

## [2026-05-03 19:51:54]
- Action: Retrofit Confirmed
- Backup deleted

## [2026-05-03 19:52:02]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12799
- Large files (>200 lines): 19
- TODOs found: 84
- Files needing comments: 0

## [2026-05-03 19:52:45]
- Action: Retrofit
- File: src/commands/buildFromVault.ts
- AI: gemini-2.5-flash
- Lines: 15 → 15 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:52:49]
- Action: Retrofit
- File: src/commands/retrofit.ts
- AI: gemini-2.5-flash
- Lines: 39 → 39 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:52:55]
- Action: Retrofit
- File: src/commands/session.ts
- AI: gemini-2.5-flash
- Lines: 32 → 34 (+2 / -0)
- Annotations added: [WARN] x1


## [2026-05-03 19:53:02]
- Action: Retrofit
- File: src/types/index.ts
- AI: gemini-2.5-flash
- Lines: 71 → 71 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:53:18]
- Action: Retrofit
- File: src/ui/styles.ts
- AI: gemini-2.5-flash
- Lines: 70 → 71 (+1 / -0)
- Annotations added: [WARN] x1


## [2026-05-03 19:53:23]
- Action: Retrofit
- File: src/ui/views/welcomeView.ts
- AI: gemini-2.5-flash
- Lines: 60 → 60 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:53:29]
- Action: Retrofit
- File: src.bak/extension.js
- AI: gemini-2.5-flash
- Lines: 60 → 60 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:53:35]
- Action: Retrofit
- File: src.bak/extension.ts
- AI: gemini-2.5-flash
- Lines: 27 → 27 (+0 / -0)
- Annotations added: none


## [2026-05-03 19:53:35]
- Action: Project Retrofit
- Files processed: 8
- Successful: 8
- Failed: 0
- Backup: .chassis/backup/

## [2026-05-03 19:53:42]
- Action: Retrofit Confirmed
- Backup deleted

## [2026-05-03 19:57:38]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12805
- Large files (>200 lines): 19
- TODOs found: 33
- Files needing comments: 0

## [2026-05-03 19:58:14]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12805
- Large files (>200 lines): 19
- TODOs found: 33
- Files needing comments: 0

## [2026-05-03 20:00:14]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12805
- Large files (>200 lines): 19
- TODOs found: 33
- Files needing comments: 0

## [2026-05-03 20:00:43]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12805
- Large files (>200 lines): 19
- TODOs found: 33
- Files needing comments: 0

## [2026-05-03 20:04:09]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12850
- Large files (>200 lines): 19
- TODOs found: 40
- Files needing comments: 0

## [2026-05-03 20:05:32]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12850
- Large files (>200 lines): 19
- TODOs found: 40
- Files needing comments: 0

## [2026-05-03 20:06:54]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12850
- Large files (>200 lines): 19
- TODOs found: 38
- Files needing comments: 0

## [2026-05-03 20:08:12]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12850
- Large files (>200 lines): 19
- TODOs found: 38
- Files needing comments: 0

## [2026-05-03 20:12:11]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12855
- Large files (>200 lines): 19
- TODOs found: 38
- Files needing comments: 0

## [2026-05-03 20:12:27]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12855
- Large files (>200 lines): 19
- TODOs found: 10
- Files needing comments: 0

## [2026-05-03 20:12:39]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 12855
- Large files (>200 lines): 19
- TODOs found: 10
- Files needing comments: 0

## [2026-05-03 20:29:34]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 13027
- Large files (>200 lines): 19
- TODOs found: 37
- Files needing comments: 0

## [2026-05-03 20:29:49]
- Action: Project Analysis
- Files scanned: 58
- Total lines: 13027
- Large files (>200 lines): 19
- TODOs found: 37
- Files needing comments: 0

## [2026-05-03 20:32:25]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 9752
- Large files (>200 lines): 18
- TODOs found: 37
- Files needing comments: 0

## [2026-05-03 20:33:13]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 9752
- Large files (>200 lines): 18
- TODOs found: 37
- Files needing comments: 0

## [2026-05-03 21:07:18]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 9762
- Large files (>200 lines): 18
- TODOs found: 37
- Files needing comments: 0

## [2026-05-03 21:07:34]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 9762
- Large files (>200 lines): 18
- TODOs found: 37
- Files needing comments: 0

## [2026-05-03 21:11:49]
- Action: Project Analysis
- Files scanned: 57
- Total lines: 9779
- Large files (>200 lines): 18
- TODOs found: 37
- Files needing comments: 0

## [2026-05-03 21:16:10]
- Action: Project Analysis
- Files scanned: 14
- Total lines: 1191
- Large files (>200 lines): 2
- TODOs found: 0
- Files needing comments: 0

## [2026-05-03 21:33:27]
- Action: Project Analysis
- Files scanned: 14
- Total lines: 1225
- Large files (>200 lines): 2
- TODOs found: 0
- Files needing comments: 0

## [2026-05-03 21:33:44]
- Action: Project Analysis
- Files scanned: 14
- Total lines: 1225
- Large files (>200 lines): 2
- TODOs found: 0
- Files needing comments: 0

## [2026-05-03 21:49:01]
- Action: Project Analysis
- Files scanned: 14
- Total lines: 1225
- Large files (>200 lines): 2
- TODOs found: 0
- Files needing comments: 0

## [2026-05-03 21:57:33]
- Action: Project Analysis
- Files scanned: 60
- Total lines: 8729
- Large files (>200 lines): 15
- TODOs found: 24
- Files needing comments: 0

## [2026-05-03 22:01:47]
- Action: Project Analysis
- Files scanned: 60
- Total lines: 8732
- Large files (>200 lines): 15
- TODOs found: 2
- Files needing comments: 0

## [2026-05-03 22:05:09]
- Action: Project Analysis
- Files scanned: 60
- Total lines: 8732
- Large files (>200 lines): 15
- TODOs found: 0
- Files needing comments: 0

## [2026-05-03 22:05:10]
- Action: Project Analysis
- Files scanned: 60
- Total lines: 8732
- Large files (>200 lines): 15
- TODOs found: 0
- Files needing comments: 0

## [2026-05-03 22:18:40]
- Action: Project Analysis
- Files scanned: 60
- Total lines: 8738
- Large files (>200 lines): 15
- TODOs found: 0
- Files needing comments: 0

## [2026-05-03 23:14:14]
- Action: Project Analysis
- Files scanned: 60
- Total lines: 8744
- Large files (>200 lines): 15
- TODOs found: 0
- Files needing comments: 0

## [2026-05-03 23:22:06]
- Action: Project Analysis
- Files scanned: 60
- Total lines: 8732
- Large files (>200 lines): 15
- TODOs found: 0
- Files needing comments: 0

## [2026-05-03 23:48:56]
- Action: Project Analysis
- Files scanned: 65
- Total lines: 8856
- Large files (>200 lines): 13
- TODOs found: 0
- Files needing comments: 0

## [2026-05-04 00:03:06]
- Action: Project Analysis
- Files scanned: 77
- Total lines: 9075
- Large files (>200 lines): 11
- TODOs found: 0
- Files needing comments: 0

## [2026-05-04 00:13:58]
- Action: Project Analysis
- Files scanned: 82
- Total lines: 9213
- Large files (>200 lines): 10
- TODOs found: 0
- Files needing comments: 0

## [2026-05-04 00:57:46]
- Action: Project Analysis
- Files scanned: 113
- Total lines: 9457
- Large files (>200 lines): 0
- TODOs found: 0
- Files needing comments: 0

## [2026-05-08]
- Action: Governance file update — 5 new rules added across all AI editor config files
- Added .windsurfrules — Windsurf now reads CHASSIS governance rules on every edit. Added 5 new rules: WebView ASCII limit, document.write 45KB limit, map init protection, map view isolation testing, and causation-first debugging.
- Rules added to: .windsurfrules (Rules 13-17), .chassis/rules.md (Rules 13-17), CLAUDE.md (Rules 13-17)
- These rules were learned the hard way during the May 8 2026 Architecture Map Timeline debugging session — see CHASSIS_ROADMAP.md Recent Fixes for full history.

## [2026-06-22]
- **Session: Native Function Calling Overhaul — cross-AI reliability fix**
- Root cause identified: agent loop was using a custom `<tool_call>` XML text protocol that no model was trained on. Every AI had to "guess" the format from the system prompt, causing hallucinations, silent drops, and divergent output (Gemini emitting `<tool_code>`, DeepSeek ignoring tools, etc.). Windsurf uses native APIs and had no issues — Redivivus had to match that.
- **New file: `src/services/ai/agentNativeCall.ts`** — three dialect callers (Anthropic, Gemini, OpenAI-compat) + message converters + `AgentMessage`/`ToolSchema`/`NativeCallResult` types
- **`agentTools.ts` + `agentToolsNetwork.ts`** — added `inputSchema` (JSON Schema) to all 10 tools (7 built-in + 3 network)
- **`agentService.ts`** — rewired to use `nativeAgentCall` + structured `AgentMessage[]` history; all guards adapted to use `appendUserNote()`; token ledger recording restored
- **`agentPrompt.ts`** — removed the embedded `<tool_call>` XML tool protocol section; added [DEAD] annotation explaining why

### Model-specific fixes shipped this session:
1. **OpenAI o3/o4-mini** — `developer` role (not `system`), `max_completion_tokens` (not `max_tokens`), no `parallel_tool_calls`
2. **DeepSeek R1 (`deepseek-reasoner`)** — fail-fast before API call so failover moves to `deepseek-chat`
3. **Gemini SAFETY/MALFORMED_FUNCTION_CALL** — `finishReason` checked before reading `parts` to avoid silent empty-text loop
4. **`parallel_tool_calls: false`** — only sent to openai/xai/groq; omitted for kimi/deepseek to avoid 422
5. **Gemini 2.5 Pro thinking budget** — capped at 1024 tokens/turn (was dynamic, up to 24K); Flash set to 0
6. **Token usage tracking** — all three dialects now parse and return `usage`; Gemini includes `thoughtsTokenCount`; ledger records on every turn

### Known remaining issue:
- **Groq 32K context wall** — Llama 3.3 70B will hit the context limit around step 10-15 on file-heavy runs; failover catches it but wastes setup. Fix requires message pruning (keep first user msg + most recent N turn pairs, drop middle).

## [2026-06-22] Session 2 — Groq context pruning

### Fix shipped:
- **`agentNativeCall.ts`** — added `estimateTokens()` (private) and `pruneMessages()` (exported). Prunes the oldest middle turn pairs (keeping messages[0] + most recent `keepTurns*2` messages) when the estimated token count approaches a provider's input limit. Iterates tail size down in steps of 2 until it fits; hard-floors at 4 tail messages. Covers Groq `llama-3.3-70b-versatile` (contextK 32) AND Kimi `moonshot-v1-32k` (also contextK 32).
- **`agentService.ts`** — added `msgsFor(modelId)` closure before the ReAct loop. Looks up `contextK` and `outputK` from `MODEL_REGISTRY`, calls `pruneMessages` only for `contextK ≤ 32`, returns the original `messages` array for all other providers. Applied at both the primary call site and the failover loop — original `messages` array is never mutated so failover to a larger-context provider gets full history.

## [2026-05-13]
- Action: Critical iteration loop bug fixes (Session 4)
- **Bug 1 fixed:** Free-text follow-up after build was consumed by stale scope question resolver
  - Root cause: `hasPendingScopeQuestion()` in chatPanelMessages.ts intercepted ALL user input for 5 minutes after any scope question was asked, even if the build completed through another path
  - Fix: Added timestamp + length guards — only intercept if scope question was asked < 2 min ago AND reply is < 100 chars. Stale questions cleared immediately.
  - Files: templateScopeService.ts (added clearPendingScopeQuestion, getScopeQuestionTimestamp, timestamp tracking), chatPanelMessages.ts (updated guard logic)
- **Bug 2 fixed:** "Try Again with Fix" stalled after showing retry message
  - Root cause: handleBuildRequest(retryTask) called without skipComplex=true, sending the retry through vault/placement/cost gate modals the user could not see or interact with
  - Fix: Changed MessageHandlerDeps.handleBuildRequest signature to accept skipComplex?, wired through chatPanel.ts, pass true for retry builds
  - Files: chatPanelMessages.ts (interface + retry handler), chatPanel.ts (wiring)
- Documentation updated: dead_ends.md (2 new entries), CHASSIS_ROADMAP.md (Recent Fixes table), work_log.md
- **Bug 3 fixed:** Phantom imports in single-file generation
  - Root cause: AI was not explicitly told to embed all code in a single file for non-HTML generation
  - Fix: Updated `htmlRules` ternary in chatPanelBuild.ts to explicitly forbid `import`/`require` and enforce fully self-contained generation
- **Bug 4 fixed:** Dead "Open File" button after orchestrator build completion
  - Root cause: Orchestrator was injecting the project root directory path into the `__BUILD_RESULT__` token. `vscode.workspace.openTextDocument()` silently fails when given a directory instead of a file.
  - Fix: Removed `__BUILD_RESULT__` token from orchestrator's completion card. Also cleaned up duplicate event listeners in `chatPanelScript.ts` and standardized `data-open-browser`.
- **Bug 5 fixed:** New project builds showed "Fix complete!" instead of "Build complete!"
  - Root cause: `skipComplex` flag was overloaded. It meant "bypass UI gates" but `chatPanelIntent.ts` was interpreting it as "this is a fix request"
  - Fix: Added explicit `isFixRequest` argument to `handleBuildRequest`, passing `true` only for retries and explicit fix requests, decoupling it from `skipComplex`.
- **Bug 6 fixed:** Missing file contents in Worker AI prompt during modification requests
  - Root cause: `workspaceContext.ts` regex was matching against a lowercased task string (`taskLower.match(...)`), converting camelCase filenames like `mapBuilderService.ts` to `mapbuilderservice.ts`. The subsequent `find()` against `context.files` was case-sensitive, causing the file search to fail. The pipeline never found the file, so it didn't inject its contents.
  - Fix: Executed the regex against the original `task` string with the `/i` case-insensitive flag, preserving the original casing, and compared against `f.relativePath` using `.toLowerCase()`.
- **Bug 7 fixed:** Missing `chassis.helpMeRefine` command
  - Root cause: The orchestrator's "Help Me Refine This" button was pointing to an unregistered command.
  - Fix: Registered `chassis.helpMeRefine` in `extension.ts` to invoke `chassis.postToChat` with a refined prompt request.
