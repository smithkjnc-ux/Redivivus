# Project Map — redivivus

*Last updated: 2026-06-22 (manual snapshot — run Redivivus Analyzer for live stats)*

---

## Overview

| Metric | Count |
|--------|-------|
| Total TS Files | 575 |
| Total Lines (src/) | ~59,000 |
| Large Files (>200 lines) | 35 |
| TODO items | 36 |
| Files without [SCOPE] | 1 (agentTools.ts — inputSchema field added, SCOPE present) |

## Key Agent Files (added/rewritten 2026-06-22)

| File | Purpose |
|------|---------|
| `src/services/ai/agentNativeCall.ts` | Native function calling — 3 dialects, public entry point |
| `src/services/ai/agentService.ts` | ReAct loop — native tool dispatch, guards, ledger |
| `src/services/ai/agentPrompt.ts` | System prompt — tool XML removed, behavioral rules only |
| `src/services/ai/agentTools.ts` | Built-in tools — all 7 now have `inputSchema` JSON Schema |
| `src/services/ai/agentToolsNetwork.ts` | Network tools — search_web, read_url, search_code |
| `src/services/ai/modelRegistry.ts` | Model list — contextK/outputK/thinking flags per model |

## Directory Structure

```
📁 scripts
📁 src
  📁 src/commands
  📁 src/services
    📁 src/services/ai       ← agent + native calling lives here
    📁 src/services/build
  📁 src/types
  📁 src/ui
    📁 src/ui/views
```

## Known Split Candidates (Rule 9: >200 lines)

- `agentNativeCall.ts` (~292 lines) — split dialect callers into `agentDialects/` subfolder when next touching it
- 34 other files flagged — see `recommendations.md`

