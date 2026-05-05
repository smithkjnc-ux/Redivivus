# CHASSIS Chat & Developer Experience Spec
> **Rule:** This is the design spec for CHASSIS's integrated chat and developer-first features. Read before implementing. Update after changes.

---

## Vision
CHASSIS turns plain VS Code into a complete AI coding environment that costs pennies, remembers everything, and gets smarter with every project. No subscription. No lock-in. Built from a coder's point of view.

**One sentence:** "The vibe editor that remembers."

---

## 1. CHASSIS Chat Panel

### Location
- VS Code sidebar panel (same position as Windsurf's Cascade)
- Own activitybar icon (the CHASSIS frame icon)
- `Ctrl+L` opens/focuses the chat (matches Windsurf muscle memory)
- Always visible when CHASSIS is active — no hunting for it

### UI Layout
```
┌─────────────────────────┐
│ CHASSIS Chat             │
│ ─────────────────────── │
│ 🟢 Session: Fix auth bug │
│ 📋 Do AI Dream · Gemini  │
│ ─────────────────────── │
│                          │
│ [conversation history]   │
│                          │
│ You: add a login screen  │
│                          │
│ CHASSIS: Found 3 vault   │
│ matches. Building...     │
│                          │
│ ✅ Created:               │
│   src/screens/Login.tsx   │
│   [Open] [Diff] [Undo]   │
│                          │
│ ─────────────────────── │
│ [Type what you want...]  │
│ [📎] [🔍 Vault] [Send]   │
│ ─────────────────────── │
│ Tokens: 1,247 · $0.002   │
└─────────────────────────┘
```

### Chat Features
- **Natural language input** — "add a login screen", "fix the bug in auth.ts", "explain this function"
- **Vault-first search** — before calling AI, CHASSIS checks the vault for matching code. Shows what it found vs what it needs to generate
- **File awareness** — automatically knows which file is open, includes it as context
- **Blueprint awareness** — every prompt includes the project's 5 W's so AI stays on scope
- **Token counter** — shows input/output tokens and cost per message. User always knows what they're spending
- **Conversation history** — persists in `.chassis/chat/` as JSON. Survives editor restarts
- **Undo button** — every file change from chat can be undone with one click. No fear of AI breaking things
- **Diff preview** — before applying changes, show what will change. User approves or rejects
- **Session context** — if a session is active, chat knows the current goal and stays focused on it
- **Multi-file awareness** — "refactor the auth flow" can touch multiple files. CHASSIS shows all changes as a batch

### Chat Commands (shortcuts in the input)
- `/vault search auth` — search vault without generating code
- `/plan add user profiles` — AI creates a plan but doesn't write code yet
- `/cost` — show total tokens/cost this session
- `/history` — show past chat sessions
- `/clear` — clear current conversation (history still saved)
- `/session` — show current session goal and progress

### What Makes This Different From Cursor/Windsurf Chat
1. **Vault search first** — they generate from scratch every time. CHASSIS reuses proven code
2. **Cost transparency** — they hide token usage. CHASSIS shows every penny
3. **Blueprint context** — they don't know what your project is FOR. CHASSIS does
4. **Session memory** — they forget between conversations. CHASSIS tracks progress
5. **Undo per-change** — they have global undo. CHASSIS has per-AI-change undo
6. **Gets cheaper over time** — they cost the same forever. CHASSIS costs less as vault grows

---

## 2. Built-in Git (No Terminal Needed)

### Concept
A non-coder should NEVER have to open a terminal to save their work. CHASSIS handles git automatically like a save system in a video game.

### Auto-Save Points
- **After every successful build** — CHASSIS auto-commits with a generated message
- **After every session end** — commit with session summary as the message
- **After every Build from Vault** — commit with "Built: [task description]"
- **After every AI edit** — commit with "AI: [what was changed]"
- **Manual save point** — user clicks "Save Point" or hits `Ctrl+Shift+S` and types a note

### Commit Message Format
```
[CHASSIS] {action}: {description}
```
Examples:
```
[CHASSIS] build: countdown timer with start/pause/reset
[CHASSIS] fix: auth token refresh not firing on app resume
[CHASSIS] session-end: Fixed avatar display, next: wire dashboard
[CHASSIS] save-point: before refactoring auth flow
```

### GitHub Integration (Built-in)
- **First time setup:** CHASSIS asks "Want to back up your code to GitHub?" → walks through token setup → creates repo → pushes
- **Auto-push** — every commit auto-pushes to GitHub (toggleable)
- **No terminal needed** — everything through the CHASSIS UI
- **Branch management** — CHASSIS creates branches for risky changes: "This is a big refactor. Working on a safety branch." Auto-merges when user approves
- **Conflict resolution** — plain English: "Two versions of this file exist. Here's what's different. Which one do you want to keep?"

### Save Point UI (in sidebar)
```
┌─────────────────────────┐
│ 💾 Save Points            │
│ ─────────────────────── │
│ 📌 5 min ago              │
│   "before auth refactor"  │
│   [Restore] [Compare]    │
│                          │
│ 📌 22 min ago             │
│   AI: fixed login bug     │
│   [Restore] [Compare]    │
│                          │
│ 📌 1 hour ago             │
│   Session end: dashboard  │
│   [Restore] [Compare]    │
│                          │
│ [Create Save Point]      │
└─────────────────────────┘
```

---

## 3. Project Timeline (Full History)

### Concept
Every project has a visual timeline showing everything that happened — every session, every AI change, every save point, every scan. Like a flight recorder for your code.

### Timeline View
```
┌──────────────────────────────────────┐
│ 📅 Project Timeline — Do AI Dream    │
│ ──────────────────────────────────── │
│                                      │
│ Today                                │
│ ├─ 9:52 PM  💬 Chat: built timer     │
│ ├─ 9:15 PM  🔍 Vault scan: 375 new  │
│ ├─ 9:10 PM  📊 Project scan          │
│ ├─ 8:17 PM  📋 Blueprint saved       │
│                                      │
│ Yesterday                            │
│ ├─ 11:52 PM ⏹️ Session ended         │
│ │   └─ completed: auth screen        │
│ │   └─ next: wire firebase           │
│ ├─ 11:47 PM ▶️ Session started       │
│ │   └─ goal: finish applying chassis │
│ ├─ 4:12 AM  🔧 Retrofit: dashboard  │
│ │   └─ 2594→2730 lines, +109 [WARN]  │
│                                      │
│ Apr 30                               │
│ ├─ 11:03 PM ▶️ First session         │
│ ├─ 11:01 PM 📋 Blueprint created     │
│ │   └─ confidence: medium            │
│                                      │
│ [Load older...]                      │
└──────────────────────────────────────┘
```

### Data Sources (already exist!)
- `.chassis/work_log.md` — session starts, ends, analyses, reviews, retrofits
- `.chassis/sessions/*.json` — detailed session data
- `.chassis/chat/` — conversation history (new)
- Git log — commits and save points
- Vault scan history — what was extracted and when

### What Makes This Different
No editor shows you the STORY of your project. They show files. CHASSIS shows the journey — when you started, what you tried, what failed, what worked, how the code evolved. For a solo developer, this is your memory. For a team, this is your documentation.

---

## 4. Context Menu Integration

### Right-click a file in Explorer
- "CHASSIS: Review this file" → AI review
- "CHASSIS: Clean up this file" → add annotations
- "CHASSIS: Save to vault" → extract reusable blocks
- "CHASSIS: Check file health" → guardian scan

### Right-click selected code in editor
- "CHASSIS: Explain this" → AI explains in chat
- "CHASSIS: Improve this" → AI suggests improvements
- "CHASSIS: Save to vault" → save selection as vault item
- "CHASSIS: Find similar in vault" → search vault for matching code

### Right-click a folder
- "CHASSIS: Scan folder" → analyze all files in folder
- "CHASSIS: Scan for vault" → extract vault items from folder

### Registration
All of these are `menus` contributions in `package.json` under `editor/context` and `explorer/context`. The commands already exist — they just need menu entries.

---

## 5. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+L` | Open/focus CHASSIS chat |
| `Ctrl+Shift+C` | Open CHASSIS dashboard |
| `Ctrl+Shift+S` | Create save point |
| `Ctrl+Shift+B` | Build from vault |
| `Ctrl+Shift+R` | Start/end session toggle |
| `Ctrl+Shift+V` | Open vault browser |

---

## 6. Status Bar (Always Visible)

```
🏗️ CHASSIS: Draft │ 🟢 Session: 47m │ ⚡ 1,247 tokens ($0.002) │ 💾 Auto-saved 3m ago
```

- **Blueprint status** — Draft/Locked (click to open blueprint)
- **Session timer** — how long current session has been running (click to end session)
- **Token counter** — running total for this session (click for detailed breakdown)
- **Save status** — last auto-save time (click to create manual save point)

---

## 7. Onboarding (First-Time User)

When CHASSIS is installed in plain VS Code for the first time:

1. **Welcome panel** — "Hey! I'm CHASSIS. I help you build software by remembering what works."
2. **API key setup** — "To talk to AI, I need a key. Gemini is free to start." → link to get key → paste → test → "Connected! That'll cost you about $0.01 per 10 conversations."
3. **First project** — "Open a folder or start a new project. I'll ask you 5 quick questions about what you're building."
4. **First chat** — "Try typing something like 'create a hello world page' in the chat."
5. **First save point** — "Nice! I just saved your work. You can always go back to this point."

No jargon. No git terminology. No "configure your workspace." Just: connect, describe, build, save.

---

## 8. What CHASSIS Does NOT Do (Stay in Lane)

- **No inline autocomplete** — that's Copilot's territory. CHASSIS is conversational, not predictive
- **No file editing UI** — VS Code's editor is perfect. Don't rebuild it
- **No terminal replacement** — VS Code's terminal works. CHASSIS just doesn't REQUIRE it
- **No package manager** — let npm/pip/cargo do their thing
- **No deployment** — that's a different tool entirely
- **No team collaboration** — v1.0 is for solo developers. Teams come later

---

## Implementation Priority

### Phase 1 — Ship This First
1. Chat panel in sidebar (basic: input, AI response, file creation)
2. Context menu entries (right-click commands)
3. Keyboard shortcuts
4. Status bar enhancements

### Phase 2 — Make It Smart
5. Vault-first search in chat
6. Token counter and cost tracking
7. Diff preview and per-change undo
8. Conversation history persistence

### Phase 3 — Make It Safe
9. Auto-commit on AI changes
10. Save points UI
11. GitHub integration (setup wizard, auto-push)
12. Branch management for risky changes

### Phase 4 — Make It Tell a Story
13. Project timeline view
14. Full history browser
15. Session replay (see what happened in any past session)

---

## The Pitch

**For the vibe coder who can't afford Cursor:**
"CHASSIS turns free VS Code into an AI coding studio for under $5 a year. And it gets smarter every time you use it."

**For the developer who's tired of AI amnesia:**
"Your AI forgets everything between sessions. CHASSIS doesn't. Blueprint, vault, work log, timeline — your project's entire history, always available."

**For the solo builder:**
"Stop re-explaining your project to AI every session. CHASSIS remembers the blueprint, knows the rules, and reuses what worked before."

---

*Spec locked — Built by PapaJoe*
