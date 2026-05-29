# Redivivus — Roadmap Index
> [SCOPE] **INDEX ONLY.** Session entries go in `docs/REDIVIVUS_FIXES.md`. Planned features go in `docs/REDIVIVUS_FEATURES.md`. Architecture/rules go in `docs/REDIVIVUS_ARCHITECTURE.md`.
>
> **RULE — NO EXCEPTIONS:**
> - New session fix entry? → `docs/REDIVIVUS_FIXES.md`
> - New planned feature / backlog item? → `docs/REDIVIVUS_FEATURES.md`
> - Architecture change / design rule? → `docs/REDIVIVUS_ARCHITECTURE.md`
> - This file stays under 80 lines. If you are about to make it longer, you are in the wrong file.

*Last updated:* May 29, 2026 — Fix: FIX pipeline HTML guard stops 3-retry waste — Worker prompt + apply bypass (Session 11DB)

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

### Session 11DB — May 29, 2026: FIX Pipeline HTML Guard (Token Waste Fix)
- Initialized projects route modification requests to FIX pipeline — Worker chose SURGICAL for HTML → 3 retries, nothing written
- Worker prompt: explicit "HTML always uses `<content>` full file format" rule
- `applyFixContent`: `hasHtmlTarget` check skips surgical path → falls through to `parseFixResponse` → `<content>` tag handled
- Covers both prompt-side and apply-side so disobedient Workers are caught

### Session 11DA — May 29, 2026: HTML Bypass at Apply Step (Defensive Guard)
- Worker (GPT-4o) outputs XML surgical format regardless of prompt instruction — training pattern wins
- Added `!relPath.endsWith('.html')` guard in `applyCodeToFile` — HTML always falls through to full-file write
- Closes the gap: prompt-side (11CZ) + apply-side (11DA) together = reliable HTML handling

### Session 11CZ — May 29, 2026: HTML Files Skip Surgical Edit Mode
- Surgical SEARCH blocks hallucinated divider comments that don't exist in the file
- HTML files with inline JS are large — LLMs can't reliably reproduce exact blocks for SEARCH
- `buildWorkerPrompt`: `isModifying && !isHtml` — HTML always gets "Output the COMPLETE file."

### Session 11CY — May 29, 2026: Fix Surgical Edit Whitespace Matching
- Surgical edits failed when AI reproduced SEARCH blocks with tab/space or leading-indent drift
- Added Pass 3 to `applySurgicalEdits`: strips all leading+trailing whitespace per line, matches by content, replaces by line index
- Pass 1 (exact) → Pass 2 (trimEnd) → Pass 3 (full strip) — fallback chain catches all common AI whitespace variations

### Session 11CX — May 29, 2026: Fix cloudClassify Error Swallowing
- All classify API failures silently returned `question` — fallbackClassify in classifyIntent never fired
- "add a speed boost power-up" → Groq Q&A instead of build pipeline (found during test)
- Fix: removed try/catch from cloudClassify; errors now propagate to classifyIntent's fallback handler
- fallbackClassify correctly returns `build` for imperative verbs — pipeline now triggers on API failure

### Session 11CV — May 29, 2026: Similar Code Finder
- Worker had no awareness of similar logic in other project files — would reimplement existing functions
- New `similarCodeFinder.ts`: sync regex extraction + cheap AI relevance filter → up to 4 matched snippets
- Injected as `EXISTING SIMILAR CODE` block in Worker prompt, between exports map and existing content
- Three-layer defense now: export names (prevention) + function bodies (context) + Guardian (detection)

### Session 11CU — May 29, 2026: Cross-Session Build Decision Memory
- Implicit decisions from back-and-forth ("ok, use JWT") were never stored across sessions
- Added `extractBuildDecisions` to `LearnedMemoryService` — reviews full conversation post-build
- Wired into `runPostBuildActions` non-blocking — every successful build feeds `learned.md`
- Complements existing `extractFacts` (mid-chat explicit preferences) — now both paths are covered

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
