// [SCOPE] Shared CHASSIS annotation rules -- injected into every Worker/Supervisor AI prompt.
// Single source of truth. Import CHASSIS_WORKER_RULES and append to any prompt that generates code.
// This is why annotation rules were missing from internal pipelines: they were written for
// external AI editors (CLAUDE.md, .windsurfrules) but never wired into CHASSIS's own Worker prompts.
// All build and fix pipelines must import this and append it to their Worker prompt.

export const CHASSIS_WORKER_RULES = `
CHASSIS ANNOTATION RULES -- required in all code you write or modify:
1. [SCOPE] at line 1 of every NEW file you create.
   Format: [SCOPE] What this file does -- one line.
   Correct syntax: // [SCOPE] for JS/TS, <!-- [SCOPE] --> for HTML, # [SCOPE] for Python/Shell/YAML.
2. [WARN] immediately above any fragile, risky, or non-obvious logic.
   Format: // [WARN] What breaks here and why.
3. [DEAD] immediately above every block of code you REMOVE or REPLACE.
   Format: // [DEAD] What was there -- why it fails here.
   Never silently delete code. Always document what you removed and why.
4. Preserve ALL existing [SCOPE] [WARN] [DEAD] [TODO] [NEXT] tags. Never delete them.
5. Keep every file under 200 lines. If a new file exceeds 200 lines, split by responsibility
   into smaller files, each with its own [SCOPE] at line 1.
6. No non-ASCII characters in JavaScript, TypeScript, or HTML script blocks.
   No emoji, no Unicode arrows, no box-drawing chars. ASCII only.
   Use -> not arrows, -- not dashes, [!] not warning symbols.`.trim();
