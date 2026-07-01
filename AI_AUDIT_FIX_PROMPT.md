# Task: Fix AI-layer audit findings in Redivivus

You are working in `/home/papajoe/projects/redivivus` — a TypeScript VSCodium extension. An audit of the AI layer (`src/features/ai/`, chat routing pipeline) found the issues below. Fix ONLY these numbered items, in order.

## Before you start

0. Create a working branch FIRST — all commits go on it, never on the default branch:
   `git checkout -b ai-audit-fixes`
1. Read `CLAUDE.md` in the repo root — the Redivivus annotation rules ([SCOPE], [WARN], [DEAD], etc.) are mandatory. Never delete or modify existing annotation tags except as those rules direct.
2. Read `.redivivus/work_log.md` for recent session context.
3. Verify the working tree state with `git status`. If there are pre-existing uncommitted changes, leave them alone and keep them out of your commits.
4. Build with `npm run compile`, lint with `npm run lint`. Run both after EVERY item before moving to the next.

## Hard constraints — read twice

- **Touch nothing outside the numbered items.** No opportunistic refactors, no renames, no formatting sweeps, no dependency changes, no version bumps.
- **Do not touch**: webview UI code, build pipeline prompts, vault logic, the `redivivus-backend` repo. Backend changes are OUT OF SCOPE — list needed backend follow-ups in your final summary instead of making them.
- **Preserve behavior everywhere not explicitly changed.** If a fix seems to require a design decision this prompt doesn't specify, SKIP that item and explain in the summary. Do not improvise.
- **Context for your judgment calls:** the long-term direction is that the Cloud Run backend becomes the single AI gateway and the client-side provider layer + fallback classifiers get retired in a later migration. So for the client-side reliability fixes below (especially items 4 and 8), keep changes minimal and surgical — they are interim hardening, not code to expand or generalize.
- Rule 9: keep every file under 200 lines. If a fix would push a file over, split per the project rules.
- When you remove code, add a `[DEAD]` tag explaining what was there and why (Rule 8).
- Commit each item separately with a conventional message (e.g. `fix(ai): ...`). Compile + lint must pass before each commit.
- Log every change to `docs/REDIVIVUS_FIXES.md` as you go (not batched at the end), and append a session entry to `.redivivus/work_log.md` when done.

## Items (ordered low-risk first)

### 1. Remove the dead-but-executing vague-request gate
`src/features/ai/logic/chatPanelIntent.ts` lines ~73–85 in `handleBuildRequest()`: the `isVagueProjectRequest` gate is marked `[DEAD]` ("replaced by JobSizer — this guard is now redundant") but the code below the comment still executes — a live AI call, and users can get scope-questioned twice (once by JobSizer, once here). Remove the executing block; keep and extend the `[DEAD]` comment as the audit trail. Also remove now-unused imports if nothing else uses them.

### 2. Remove the per-message file-listing classifier
`src/features/chat/logic/chatPanelMsgSendKeywords.ts` lines ~175–190: a blocking `routing.prompt(classifyPrompt, 12_000)` fires on EVERY message that doesn't match a keyword shortcut, before the main cloudChat classifier runs. This is the same anti-pattern the project already removed once — see the `[DEAD]` note about `looksLikeBugReport` in `chatPanelMsgSendPreCloud.ts` (~lines 69–72). Remove the classifier call. "Explain project files" requests will fall through to cloudChat / normal AI chat, which is acceptable. Add a `[DEAD]` tag citing the same rationale.

### 3. Narrow the greedy keyword-shortcut regexes
Same file (`chatPanelMsgSendKeywords.ts`): several regexes hijack ordinary sentences.
- Line ~89: `/list.*project|show.*project|...|open.*project|switch.*project/` matches "show me how this project handles errors" and pops the projects modal.
- Line ~17 (templates) and line ~44 (scan) are similarly greedy.

Narrow these so they only match short, imperative commands: anchor patterns (`^`), and/or require the whole message to be under ~6 words for the fuzzy ones. Exact fast-paths like `clear chat` and `run it` stay as-is. The test corpus in item 7 must prove the false positives no longer match while the legitimate phrasings still do.

### 4. Give `routeByComplexityImpl` the same failover safety as `promptImpl`
`src/features/ai/data/routingComplexity.ts` calls `callProvider` directly and bypasses all the reliability infrastructure that `src/features/ai/data/routingServicePrompt.ts` has. Add, matching `promptImpl`'s existing semantics:
- `getSkipInfo(provider)` check — skip quota-blocked providers instead of calling them;
- `recordQuotaError` / `recordUnavailable` (via `isSustainedFailure`) on failures;
- the `Promise.race` hard deadline (`timeoutMs + 3000`) — the `[FIX]` comment in `promptImpl` explains why AbortController alone is insufficient in Electron;
- `logAICall` on success.

Prefer extracting a small shared helper both files use, but ONLY if `promptImpl`'s behavior is provably unchanged (the item-7 failover tests must pass against it). If extraction gets invasive, duplicate the minimal logic in `routingComplexity.ts` instead and note it.

### 5. Fix the model registry dead entry and mismatched comment
- `src/features/ai/data/modelRegistry.ts`: remove the `llama-3.1-70b-versatile` entry — Groq decommissioned it; calls to it fail and pollute failover.
- `src/features/ai/data/guardianAI.ts`: the `AI_RANK` comment says "Llama 4 Maverick" but no such registry entry exists — correct the comment to match the registry.
- `src/features/ai/data/agentFailoverReason.ts`: check `isSustainedFailure` — a "model_decommissioned" / "model not found" error must NOT be treated as a provider-level sustained failure (it would block the whole provider for hours when only one model ID is dead). If it currently would be, exclude that error class. If the current handling is already correct, state so in the summary and change nothing.

### 6. Type-safety hygiene (no behavior change)
- Make `fetchWithTimeout` on `RoutingService` public (or expose a typed accessor), then remove the `(svc as any).fetchWithTimeout` / `(deps.routing as any).prompt` casts in `routingComplexity.ts:21`, `routeClassifier.ts`, `routingServicePrompt.ts:70`, and `chatPanelIntent.ts:93`.
- Replace in-function `require()` with typed static imports in `routingService.ts` (~109, 113) and `agentServiceLoop.ts` (~37, 140, 159) — UNLESS a require exists to break a circular dependency; in that case leave it and add a comment saying so. Verify no import cycles are introduced (compile must stay clean).

### 7. Add unit tests for the pure logic
The harness already exists (`src/tests/`, `__baselines__`, `__mocks__`, `nockHelper.ts`, mocha via `vscode-test`) but only one test file uses it. Add, following the existing `routing.test.ts` conventions:
- **(a)** A message-corpus test for the keyword-shortcut regexes and `fallbackClassify`: table of messages → expected route, including the item-3 false positives ("show me how this project handles errors" must NOT match a shortcut) and legitimate phrasings that must still match.
- **(b)** `commandInPlan` (in `toolGapEscalation.ts`): exact match, verb-phrase match, `npm ci` vs `npm install` non-match, empty plan → gap.
- **(c)** `promptImpl` failover with mocked providers via `nockHelper`: first provider fails → second succeeds with `usingFallback` set; quota-blocked provider is skipped; all providers fail → error result.
- **(d)** `jobSizer` fast-path tiers.

Run the tests; all must pass. If the vscode-test harness can't run headless in this environment, say so explicitly in the summary with the exact error — do not claim tests pass without running them.

### 8. Stop classifying transient overload as a quota error
`routingServicePrompt.ts` lines ~90–94: `isCapacityError` includes `'overloaded'` and `'capacity'` — Anthropic 529-style overload is transient (seconds), not a billing/quota problem, so it shouldn't feed `recordQuotaError` (the free-tier downshift detector). Before changing anything, read `providerTierState.ts` to confirm what `recordQuotaError` drives. If the fix is safe, exclude overload/capacity from the quota classification (failover already handles the retry). If the semantics are unclear, skip and explain.

### 9. Retry cloudChat once before falling back
`src/features/chat/logic/chatPanelMsgSendPreCloud.ts`: the `cloudChat(...)` call resolves to `null` on ANY failure (`.catch(() => null)`), which immediately drops the message into the null-fallback path (local AI classify, then regex). Cloud Run cold starts and network blips are seconds-scale and routine — a single transient failure should not route the user through the degraded path. Add ONE retry with a short backoff (~1.5–2s) before treating the result as null. Do not add more than one retry, do not add a retry loop, and keep the existing null-fallback behavior unchanged for the case where both attempts fail. Preserve the `recordRoutingCost` accounting (only record usage for the attempt that succeeded).

### 10. Classifier consolidation, phase 1 — ONLY if items 1–9 are done and green
Client-side only. The pipeline classifies each message multiple times with separate AI calls (cloudChat, jobSizer, adaptiveClassifier/`evaluateTaskComplexity`, and others). `TurnContext` (`createTurnContext` in `chatPanelMsgSendMessage.ts`) already exists as the per-turn scaffold. Thread the cloudChat classification result into `TurnContext`, and make `jobSizer` and `adaptiveClassifier` consult it FIRST — only making their own AI call when the turn context doesn't already answer their question (e.g. cloudChat returned null, or the needed field is absent). Do NOT delete any classifier module — they are the fallback path when cloudChat is down, which is a hard requirement (cross-AI / offline reliability). Do not touch the server. If this can't be done surgically in a few files, STOP, leave the code untouched, and write the implementation plan in your summary instead.

## When finished

Run `npm run compile`, `npm run lint`, and the test suite one final time.

Then produce a **summary of work** containing:
- Per-item status: fixed / skipped (with reason) — one line each, ✅ or ❌ at the end.
- Every file touched, grouped by item.
- Test results (actual output, not a claim).
- Any behavior changes a user could notice, and any risks you see.
- Backend follow-ups for the owner (out of scope here — do NOT start any of this in this pass; item 10's "do not delete classifier modules" stands until the backend gateway exists). The owner's chosen direction is that the backend becomes the single AI gateway, migrated in this order:
  1. Serve the model registry from the Cloud Run backend so model churn doesn't require an extension release.
  2. Extend the cloudClassify response schema to return `{intent, tier, jobSize, needsEnvironment, isVague}` in one call.
  3. Add a backend gateway endpoint for provider calls, then migrate the ~67 client call sites to it in batches.
  4. Add an explicit backend health check (the cached account token means the client currently can't detect backend-down until a call fails) plus retry-with-backoff as the resilience layer.
  5. Only THEN delete the client provider layer and fallback classifiers.

  In your summary, note anything you observed that would make this migration easier or harder.
- Anything you noticed but deliberately did not touch.

Update all `[NEXT]` tags with exactly where you stopped.
