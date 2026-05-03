# CHASSIS v1.0 — Design Specification
### 🔒 Blueprint Locked — Built by PapaJoe
---

## What CHASSIS Is

CHASSIS is an AI-agnostic VS Code extension + Universal Project Protocol. It loads your structure/annotation standards into any project, routes to swappable AI backends (Claude/Gemini/Llama/etc), and enforces consistency regardless of which AI is doing the work. The AI is the engine. CHASSIS is the frame everything bolts to.

**Built around one question:** What actually works best for the person building?

## What CHASSIS Is Not

- Not another AI coding assistant competing with Claude or Gemini
- Not a replacement for Cursor or Windsurf — it works inside all of them
- Not opinionated about which AI you use — that choice belongs to the user
- Not a project management tool or task tracker
- Not built to lock anyone into anything

---

## 9 Core Principles

1. **AI-Agnostic** — Any AI slots in. Claude, Gemini, DeepSeek, Llama, whatever comes next. CHASSIS doesn't care. Your rules stay constant.
2. **User's Rules First** — The protocol enforces YOUR standards, not the AI's preferences. The AI provides horsepower, CHASSIS controls the transmission.
3. **No Lock-In** — Remove CHASSIS and your code still works. The annotations are comments. The WORK_LOG is markdown. Nothing proprietary.
4. **Measure Twice, Cut Once** — Two passes before finalizing. Pass 1: syntax check (missing brackets, typos, formatting). Pass 2: logic check (does it actually do what was intended?).
5. **Lazy User Principle** — Assume the user will give minimal information. CHASSIS adapts and asks smart follow-ups instead of demanding a perfect spec upfront.
6. **Breadcrumb Trail** — WORK_LOG.md is a living document. The AI appends what it did and what's next after every change. The codebase IS the AI's external memory.
7. **Scope Guardian** — CHASSIS detects feature creep. If the AI starts building something that wasn't in the blueprint, it flags it before writing code.
8. **Fail Forward** — Dead End Log tracks what didn't work and why. No repeated mistakes across sessions.
9. **Exit Clean** — Every session ends with an exit interview. What was done, what's pending, what to watch out for.
10. **Guardian First** — CHASSIS prioritizes architectural health and security over AI speed. If an AI suggests a "quick fix" that breaks modularity or safety, CHASSIS blocks and mentors the user on the correct path.

---

## Five W Blueprint Interview

Before any code is written, CHASSIS asks five questions. Each one gets a "here's why I'm asking" preamble so the user understands the purpose.

### WHO
*"Who is actually going to use this?"*
Not a name — picture the person. Teenager? Small business owner? Developer? Non-technical user? This shapes every decision about complexity, UI, and assumptions.

### WHAT
*"What does it actually need to do?"*
Core functionality only. Not the dream feature list — the minimum thing that makes this useful. What's the one sentence that describes success?

### WHERE
*"Where does this live and run?"*
Web? Mobile? Desktop? Server? Local? Cloud? This determines the entire technology stack and deployment model.

### WHEN
*"When does this need to work?"*
Timeline, but also: real-time? Batch? On-demand? Scheduled? This shapes architecture decisions around performance and responsiveness.

### WHY
*"Why does this need to exist?"*
What problem does it solve that isn't already solved? This is the gut check. If the answer is weak, CHASSIS flags it before anyone writes code.

---

## Assumption Flag System

Every decision in the blueprint gets tagged:

- ✅ **Confirmed** — User explicitly stated this
- 🔶 **Assumed** — CHASSIS inferred this from context, needs verification
- ❓ **Unknown** — Critical gap, must be resolved before building

### Blueprint Health Score
Before building starts, CHASSIS reports:
```
✅ X Confirmed · 🔶 Y Assumed · ❓ Z Unknown
Confidence: [High|Medium|Low] — [assessment]
```

Building proceeds only when confidence is High. Medium triggers clarifying questions. Low blocks until resolved.

---

## 5 Layers

### Layer 1 — Protocol Layer
The Universal Project Protocol. Standards for file structure, naming, documentation format. Lives in a `.chassis/` directory in the project root. Portable across projects.

**Contract:** Any project with a `.chassis/` folder follows the same rules regardless of AI or editor.

### Layer 2 — Annotation Layer
Six in-code tags that serve as breadcrumbs for both humans and AI:

| Tag | Purpose |
|-----|---------|
| `// [DONE]` | Task completed, verified |
| `// [NEXT]` | What to do next in this area |
| `// [TODO]` | Known incomplete work |
| `// [WARN]` | Something fragile or risky |
| `// [DEAD]` | Tried this, didn't work, here's why |
| `// [SCOPE]` | This is the boundary — don't expand beyond this |

**Contract:** These are plain comments. They work in any language, any editor, any AI. Removing CHASSIS doesn't break anything.

### Layer 3 — Control Layer
The WORK_LOG.md and session management system. Append-only log of what was done, what's next, what failed.

**Contract:** The AI reads WORK_LOG.md at session start and appends to it after every change. No context re-reading needed.

### Layer 4 — Routing Layer
AI backend selection. The user picks which AI handles the work. CHASSIS routes the request, injects the protocol context, and returns the result.

**Contract:** Swapping AI backends doesn't change the protocol, the annotations, or the work log. Only the engine changes.

### Layer 5 — Vault Layer (Phase 3)
Community-contributed blueprints, logic blocks, and solutions. Quality-gated: only CHASSIS-verified code can be uploaded. The extension is the gatekeeper.

**Contract:** Everything in the Vault has a paper trail — the Blueprint, the WORK_LOG, the exit interview. Bad code can't get a CHASSIS stamp.

---

## Control System

### WORK_LOG.md
```markdown
## [timestamp] — Session Start
- Blueprint: [reference]
- AI: [which model]
- Goal: [what we're doing this session]

## [timestamp] — Change
- File: [path]
- Action: [what was done]
- Result: [worked/failed/partial]
- Next: [what follows]

## [timestamp] — Session End
- Completed: [list]
- Pending: [list]
- Watch: [things to be careful about]
```

### Exit Interview
End of every session, CHASSIS prompts:
1. What was completed?
2. What's still in progress?
3. Any new risks or concerns?
4. What should the next session start with?

### Dead End Log
When something doesn't work:
```markdown
## [timestamp] — Dead End
- Attempted: [what was tried]
- Failed because: [why]
- Lesson: [what to do differently]
```

---

## Warning System

Three levels, escalating:

1. **Info** — "FYI, this file is getting long" / "This function has no error handling"
2. **Caution** — "You're about to modify a core service" / "This touches 3+ files"
3. **Stop** — "This is outside the blueprint scope" / "No tests exist for this area"
4. **Block** — Total stop on code generation. Triggered by security vulnerabilities (e.g., hardcoded API keys, unvalidated inputs) or extreme architectural drift (e.g., flat-file database, single-file monolith, no modularity). Requires explicit user Risk Acknowledgment to proceed.

---

## Measure Twice, Cut Once

Before any code is finalized:

**Pass 1 — Syntax Check**
- Missing brackets, quotes, semicolons
- Import errors
- Formatting inconsistencies
- The 25-30% of bugs that are just typos

**Pass 2 — Logic Check**
- Does it actually do what was intended?
- Edge cases considered?
- Error handling present?
- Does it match the blueprint?

---

## Scope Detection

CHASSIS monitors for feature creep:
- Compares current work against the blueprint
- Flags additions that weren't in the original plan
- Asks: "This wasn't in the blueprint. Add it, or stay focused?"
- User decides — CHASSIS just makes sure it's intentional

---

## Two-Tier Documentation

**Tier 1 — In-Code (Annotations)**
The six tags, inline comments, self-documenting code. Travels with the code.

**Tier 2 — External (WORK_LOG + Blueprint)**
The session history, decision log, and project spec. Lives in `.chassis/` directory.

---

## Security Layer

- API keys never stored in code or logs
- Routing layer handles auth to AI backends
- Vault submissions are extension-signed — no manual uploads
- No telemetry without explicit opt-in

---

## Progress Map

Visual indicator of project health:
- How many blueprint items are ✅ Done
- How many are 🔄 In Progress
- How many are ⬜ Not Started
- Overall completion percentage

---

## Build Phases

**Phase 1 — Core Extension**
CHASSIS VS Code extension with Protocol, Annotation, and Control layers. Blueprint Interview. WORK_LOG. Measure Twice. Works standalone with no AI routing.

**Phase 2 — Smart Routing**
AI backend selection and routing. Context injection. Model switching.

**Phase 3 — Community Vault**
Extension-gated contribution system. Quality verification. Shared blueprints and solutions.

---

## Dogfood Project

**"Do AI Dream?"** podcast — the first project built entirely under CHASSIS protocol to validate the system.

---

*🔒 Blueprint Locked — CHASSIS v1.0 — Built by PapaJoe*
