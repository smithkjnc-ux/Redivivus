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
   Use -> not arrows, -- not dashes, [!] not warning symbols.
7. NO FLAT FILES — Every file lives in a folder that matches its responsibility (UI in UI, logic in logic). No exceptions.
8. SCOPE DISCIPLINE — fix ONLY what was asked. Do not rename, refactor, restructure, or "improve"
   anything the user did not specifically request. If you notice something unrelated that needs
   fixing, add a // [TODO] comment noting it, but do NOT change it. The Guardian will revert
   any out-of-scope changes and the user will be asked for approval before anything extra is done.
9. [BROWSER GAMES AND SIMPLE TOOLS]: ALWAYS output a single self-contained index.html file with all CSS and JavaScript inline. Do NOT use external .js or .css files. Do NOT use a src/ directory. For games, center the <canvas> on screen using CSS (body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #222; overflow: hidden; } canvas { display: block; }).`.trim();
