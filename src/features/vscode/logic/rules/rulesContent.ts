// [SCOPE] Rules content generator — builds the main Redivivus rules content for AI editor instruction files
// Called by rulesService. No file writing or AI-specific wrapping logic here.

export function buildRules(projectName: string): string {
  return `# Redivivus Project Rules — ${projectName}

## CRITICAL: Read Before Making ANY Changes

This project uses Redivivus, an AI-agnostic code structure protocol.
Every AI tool, editor, and assistant MUST follow these rules.

---

## Rule 1: NEVER Remove or Modify Annotations

This codebase contains structured comment tags. They are NOT optional comments.
They are the project's navigation system. NEVER delete, move, or modify them.

Tags you will see:

  # [SCOPE] — Describes what this file does. Always at the top. NEVER remove.
  # [TODO] — Work that needs to be done. Convert to [DONE] when finished.
  # [NEXT] — Where to pick up next. Update when you move forward.
  # [WARN] — Fragile or risky code. Read before touching.
  # [DEAD] — Something that was tried and failed. Learn from it.
  # [DONE] — Completed work. Leave it for the audit trail.

The comment character varies by language:
  Python/Shell/YAML/Ruby: # [TAG]
  JavaScript/TypeScript/Java/C/C++/Go/Rust: // [TAG]
  HTML/XML: <!-- [TAG] -->
  CSS: /* [TAG] */
  SQL/Lua: -- [TAG]

## Rule 2: Read [SCOPE] Before Modifying Any File

Every file starts with a [SCOPE] tag explaining what it does.
READ IT before making changes. If your change doesn't fit the scope,
you're probably in the wrong file.

## Rule 3: Read [WARN] Before Touching Flagged Code

[WARN] tags mark code that is fragile, has side effects, or needs
careful handling. If you see one, understand WHY before changing anything nearby.

## Rule 4: Follow [NEXT] Tags

[NEXT] tags tell you what should happen next in that area.
Follow them. Don't skip ahead. Don't go sideways.

## Rule 5: Don't Repeat Dead Ends

[DEAD] tags document approaches that were tried and failed.
Read them before proposing a solution — don't suggest something
that already didn't work.

## Rule 6: Update Tags When You Make Changes

- Finished a [TODO]? Change it to [DONE] with what you did.
- Found something fragile? Add a [WARN].
- Leaving work incomplete? Add a [NEXT] explaining where to continue.
- Tried something that failed? Add a [DEAD] explaining why.

## Rule 7: Correct Comment Syntax Per Language

ALWAYS use the correct comment character for the file type.
NEVER use // in Python files.
NEVER use # in JavaScript files.
This is the #1 cause of broken builds.

## Rule 8: Don't Remove Code Without [DEAD] Logging

If you remove or replace a block of code, add a [DEAD] tag
explaining what was there and why it was removed.
The next person (or AI) needs to know.

## Rule 9: Keep Files Under 200 Lines

If a file exceeds 200 lines, it should be split.
Add [NEXT] tags at natural split points.
Small files = better AI context = fewer bugs.

## Rule 10: Check .redivivus/ For Context

Before starting work, check these files:
- .redivivus/blueprint.md — What this project is about
- .redivivus/work_log.md — What happened recently
- .redivivus/project_map.md — File structure and health
- .redivivus/recommendations.md — Known issues to fix



## Rule 11: Annotate ALL New Code

When you write new code — whether a new file, function, or block — annotate it:

- New file? Add [SCOPE] at the top explaining what it does.
- New function? Add a comment above it explaining its purpose.
- Risky logic? Add [WARN] explaining what could break.
- Not finished? Add [TODO] describing what's left.
- Leaving for later? Add [NEXT] so the next session knows where to start.
- Temporary fix? Add [WARN] hacky — with explanation.

Every piece of code you write should be self-documenting.
The next person (or AI) reading this should understand it without asking.

## Rule 12: No Orphan Code

Never add code that isn't connected to the project structure:
- New files must have [SCOPE]
- New features must trace back to the blueprint
- If you're adding something outside the blueprint, flag it:
  [SCOPE] WARNING — This was not in the original blueprint. Added because: [reason]

## Rule 13: Comment Style Enforcement

When writing NEW comments or annotations:

  Python (.py):          # [TAG] description
  JavaScript (.js):      // [TAG] description
  TypeScript (.ts):      // [TAG] description
  HTML (.html):          <!-- [TAG] description -->
  CSS (.css):            /* [TAG] description */
  Shell (.sh):           # [TAG] description
  SQL (.sql):            -- [TAG] description
  Java (.java):          // [TAG] description
  C/C++ (.c/.cpp/.h):    // [TAG] description
  Ruby (.rb):            # [TAG] description
  Go (.go):              // [TAG] description
  Rust (.rs):            // [TAG] description

Using the wrong comment style WILL break the program. Double check.

## Rule 14: Log Your Changes

After every modification, mentally verify:
1. Did I update or add [SCOPE] if the file's purpose changed?
2. Did I convert completed [TODO] items to [DONE]?
3. Did I add [WARN] to anything fragile I wrote?
4. Did I add [NEXT] if I'm leaving work incomplete?
5. Did I use the correct comment character for this file type?

If the answer to any of these is no, go back and fix it before moving on.
---

*These rules are enforced by Redivivus v0.1.0*
*Removing this file does not remove the rules — they're in the code.*
`;
}
