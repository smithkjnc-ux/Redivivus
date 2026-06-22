# Redivivus Recommendations

*Last updated: 2026-06-22*

---

## [DONE 2026-06-22] Groq 32K Context Pruning

`pruneMessages()` is in `agentNativeCall.ts` and wired into `agentService.ts` via `msgsFor()`. Activated automatically for any model with contextK ≤ 32 (currently Groq llama-3.3-70b-versatile and Kimi moonshot-v1-32k). No further action needed.

---

## Structural Reminders

### File Size Discipline
`agentNativeCall.ts` is ~292 lines — approaching the 200-line target. Natural split point: move the three dialect callers into `agentDialects/anthropic.ts`, `agentDialects/gemini.ts`, `agentDialects/openaiCompat.ts` and keep `agentNativeCall.ts` as the thin public entry point.

### Entry Point Comments
All new agent files (`agentNativeCall.ts`, `agentService.ts`, `agentPrompt.ts`) have [SCOPE] tags. Maintain this for any new files added.
