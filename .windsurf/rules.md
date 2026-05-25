# Redivivus Enforcement Rules — Windsurf
> This file is auto-loaded by Windsurf at session start. These rules are NOT optional.
> They apply to every file touch in this project, no exceptions, no shortcuts.

---

## HARD STOP — DO THIS BEFORE WRITING A SINGLE LINE OF CODE

You are not allowed to modify any file in this project until you have completed ALL of the following steps in order. This is not a suggestion. This is a precondition.

### Pre-Flight Checklist (complete every item, every session)
- [ ] Read `REDIVIVUS_ROADMAP.md` in full — not skimmed, read.
- [ ] Read `.redivivus/rules.md` in full.
- [ ] Read `.redivivus/blueprint.md` to confirm your change fits the project scope.
- [ ] Read `.redivivus/dead_ends.md` — check if your approach has already been tried and failed.
- [ ] Read the `[SCOPE]` tag at the top of every file you plan to touch.
- [ ] Read every `[WARN]` tag in or near the code you plan to change.
- [ ] **CHECK FILE SIZE**: Check line count of every file you plan to edit (`wc -l <file>`). If over 200 lines, **split the file first** before adding any new code.

If you cannot confirm all seven steps, **stop and do them first.**

---

## HARD STOP — DO THIS AFTER EVERY SINGLE FILE CHANGE

After touching any file — one line, one comment, one variable rename — you must:

1. Open `REDIVIVUS_ROADMAP.md`
2. Add an entry under "Recent Fixes" that includes:
   - **File changed:** exact filename
   - **What changed:** specific description of the change
   - **Why:** the reason the change was made
   - **Risk:** any fragility introduced, or "none"
3. Update the `*Last updated:*` line with today's date and a one-line summary

**There is no change too small to skip this step. A typo fix gets logged. A comment reword gets logged. Everything gets logged.**

---

## File Size Hard Stop — NON-NEGOTIABLE

If any file you are editing is already at or over 200 lines:
- **Do not add a single line to it**
- Split it by responsibility BEFORE making your change
- Each new file needs a `[SCOPE]` tag at line 1
- Compile and verify before moving on
- Log the split in `REDIVIVUS_ROADMAP.md`

**`[NEXT]` is NOT a deferral pass.** It is a violation notice. It means the split is overdue and must happen at the START of the next session — not pushed further. Any AI that adds to a file already over 200 lines is violating this rule regardless of how small the addition is.

The correct sequence:
1. Check file size before editing
2. If over 200 → split first
3. Make your change in the correct file
4. Log everything

---

## Annotation Rules (non-negotiable)

| Situation | Required action |
|---|---|
| New file created | `[SCOPE]` at line 1 — no exceptions |
| New function written | Comment above it explaining what it does |
| Risky or fragile logic | `[WARN]` tag immediately above it |
| Work left incomplete | `[NEXT]` tag — never leave it without one |
| Approach tried and failed | `[DEAD]` tag with explanation |
| Task completed | Change `[TODO]` → `[DONE]` with what was done |
| Removing a code block | `[DEAD]` log explaining what was removed and why |

---

## Comment Syntax — Language-Specific (no exceptions)

| Language | Correct | Wrong |
|---|---|---|
| TypeScript / JavaScript / Go | `// [TAG]` | `# [TAG]` |
| Python / Shell / YAML / Ruby | `# [TAG]` | `// [TAG]` |
| HTML / XML / Svelte | `<!-- [TAG] -->` | `// [TAG]` |
| CSS / SCSS | `/* [TAG] */` | `// [TAG]` |

---

## What Happens If You Skip These Rules

You will corrupt the project history chain. Every future AI and every future human working on this project depends on the roadmap and annotations being accurate and complete. Skipping even one step degrades that chain for everyone who comes after you.

Redivivus exists specifically to prevent this. You are working inside a Redivivus project. Follow the rules.

---

*Removing or editing this file does not remove the rules. They exist in `CLAUDE.md`, `.redivivus/rules.md`, and the project memory system.*
