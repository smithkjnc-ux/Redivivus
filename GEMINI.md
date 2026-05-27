# Redivivus Project Rules — redivivus
> Read by Gemini CLI. These rules apply before any file in this project is touched.
> Redivivus does not need to be installed. The rules are self-contained in this file.

---

## HARD STOP — BEFORE TOUCHING ANY FILE

You are not permitted to edit, create, or delete any file until you complete all of these:

1. Read `REDIVIVUS_ROADMAP.md` in full
2. Read `.redivivus/rules.md` in full
3. Read `.redivivus/blueprint.md` — confirm your change fits the project scope
4. Read the `[SCOPE]` tag at the top of every file you plan to touch
5. Read every `[WARN]` tag near code you plan to change
6. Check `.redivivus/dead_ends.md` for `[DEAD]` entries matching your planned approach

If any step is incomplete: stop. Finish it. Then proceed.

---

## HARD STOP — AFTER EVERY SINGLE FILE CHANGE

After any file touch — one line, one comment, one rename, anything:

1. Add an entry to `docs/REDIVIVUS_FIXES.md` (NOT `REDIVIVUS_ROADMAP.md`):
   - File changed, what changed, why, any risk introduced
2. Update the `*Last updated:*` line in `REDIVIVUS_ROADMAP.md` with today's date

A typo fix gets logged. A comment reword gets logged. No exceptions.

**Documentation routing:**
- Fix made this session -> `docs/REDIVIVUS_FIXES.md`
- Planned feature -> `docs/REDIVIVUS_FEATURES.md`
- Architecture/design rule -> `docs/REDIVIVUS_ARCHITECTURE.md`
- `REDIVIVUS_ROADMAP.md` -> INDEX ONLY, max 80 lines. If it grows past 80, you are in the wrong file.

---

## File Size Hard Stop

**File reaches 200 lines → stop immediately → split by responsibility → `[SCOPE]` on each new file → compile → log in roadmap.**

Using `[NEXT]` to defer splitting a 200-line file is a rule violation, not compliance.

---

## Project Blueprint
- **WHO:** Solo developers and vibe coders using AI editors
- **WHAT:** VS Code extension — Universal Project Protocol for AI-assisted projects
- **WHERE:** TypeScript, Node.js, VS Code WebView — no outside dependencies
- **WHY:** No standard exists for structuring AI-assisted projects. Redivivus gives every AI a frame so projects stay organized regardless of which tool is used.

---

## Annotation Tags (required in all files)
- `[SCOPE]` — what this file/section does. **Required at line 1 of every file.**
- `[TODO]` — work to be done
- `[WARN]` — fragile or risky code. Read before touching.
- `[NEXT]` — genuine future work only. NOT a workaround for Rule 9.
- `[DEAD]` — tried and failed. Do not repeat.
- `[DONE]` — completed. Leave for audit trail.

## Comment Syntax Per Language
```
TypeScript / JavaScript / Go:  // [TAG] description
Python / Shell / YAML / Ruby:  # [TAG] description
HTML / XML / Svelte:           <!-- [TAG] description -->
CSS / SCSS:                    /* [TAG] description */
```

---

## Rules Summary
1. Never remove annotation tags
2. Read [SCOPE] before modifying any file
3. Read [WARN] before touching flagged code
4. Follow [NEXT] tags in order
5. Check [DEAD] before proposing a solution
6. Update tags when you make changes ([TODO]→[DONE], add [WARN], [DEAD], [NEXT] as appropriate)
7. Correct comment syntax per language (above)
8. [DEAD] log required when removing any code block
9. **200-line hard stop** — split immediately, no exceptions
10. Read `.redivivus/` context before starting
11. New file → [SCOPE] at line 1, comments on new functions, [WARN] on risky logic
12. No orphan code — every file traces to the blueprint
13. **NO FLAT FILES** — Every file lives in a folder that matches its responsibility (UI in UI, logic in logic). No exceptions.

### Rule 20: Build & Deploy Protocol
- After any code change, always run: npm run compile
- When deploying to baked IDE, ALWAYS copy both out/ AND package.json:
  BAKED=~/projects/redivivus-build/VSCode-linux-x64/resources/app/extensions/redivivus
  cp -r out/* $BAKED/out/
  cp package.json $BAKED/package.json
- The Redivivus IDE is a full VS Code fork launched from a desktop icon at:
  ~/projects/redivivus-build/VSCode-linux-x64/redivivus  (via ~/.local/share/applications/redivivus-ide.desktop)
- DO NOT deploy to ~/.vscode/extensions/ — that path is NOT used by the running IDE
- Never copy out/ without package.json — commands, settings, and activation events live in package.json
- Version in package.json must match the current release (currently 0.3.6)
- When adding new commands, settings, or activation events, they MUST be registered in package.json contributes section or they will silently fail

---

*Rules enforced via: `CLAUDE.md` · `.windsurf/rules.md` · `.cursor/rules` · `.cursorrules` · `.github/copilot-instructions.md` · `GEMINI.md` · `.redivivus/rules.md`*
*Removing any one file does not remove the rules.*
