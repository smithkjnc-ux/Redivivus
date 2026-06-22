# Redivivus Recommendations

*Last updated: 2026-06-22*

---

## Active Priority: Groq 32K Context Pruning

**Problem:** `llama-3.3-70b-versatile` has a 32K token context window shared between input and output. An agent run that reads several medium files accumulates task description + tool call/result pairs and hits the limit around step 10-15 on file-heavy tasks. Groq returns a 400, failover catches it, but the setup work is wasted.

**Fix needed:** A `pruneMessages(messages, maxTokens)` helper in `agentNativeCall.ts` that, when the estimated message size approaches 28K tokens, drops the oldest assistant+tool message pairs from the middle of the array while keeping:
- The first user message (task description + context)
- The most recent 4-6 turns (the model needs recent tool results)

Only needs to run for `provider === 'groq'` (contextK 32). Other providers have 64K-200K+ so this is Groq-specific today.

---

## Structural Reminders

### File Size Discipline
`agentNativeCall.ts` is ~292 lines — approaching the 200-line target. Natural split point: move the three dialect callers into `agentDialects/anthropic.ts`, `agentDialects/gemini.ts`, `agentDialects/openaiCompat.ts` and keep `agentNativeCall.ts` as the thin public entry point.

### Entry Point Comments
All new agent files (`agentNativeCall.ts`, `agentService.ts`, `agentPrompt.ts`) have [SCOPE] tags. Maintain this for any new files added.
