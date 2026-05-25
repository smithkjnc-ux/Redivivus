# Redivivus UX Vision — The Human-First Coding Experience
> **This is the soul of the product. Read this before building ANY UI feature.**

---

## The Problem No One Has Solved

Every vibe editor (Cursor, Windsurf, Copilot) does the same thing:
1. User types what they want in a tiny sidebar
2. Code flies by at 100 lines per second — incomprehensible
3. A wall of green/red diff appears that means nothing to a non-coder
4. User hopes it works

That's terrifying for the 99% of people who don't write code. Engineers built these tools for engineers. Redivivus is built for EVERYONE.

**Redivivus philosophy: "Tell me what you want. I'll handle it. Here's what I made."**

---

## The Redivivus Chat Experience

### Step 1: The Ask (Centered Modal)
- Big, centered overlay — like Google's search bar. Not a tiny sidebar input.
- "What do you want to build?" — large text, no distractions, no code visible
- User types their request in plain English, hits Enter
- Modal disappears — the magic starts

### Step 2: The Story (Left Panel — Plain English Progress)
Instead of showing code streaming, show a HUMAN-READABLE narrative:

```
🔨 Building your countdown timer...

Looking through your vault for existing code...

Found a timer pattern from your last project! Reusing it.

Now I'm adding the three buttons you asked for — 
start, pause, and reset.

Adding the sound effect for when time runs out. 
I'll use a simple beep for now — you can change it later.

Almost done — just cleaning things up and making sure 
everything connects properly.

✅ Your countdown timer is ready!
```

- Each line is a sentence a human understands
- No jargon. No "compiling JSX." No "resolving dependencies."
- Progress feels like talking to a person who's building something for you
- The story scrolls at a READABLE pace — not code speed

### Step 3: The Code (Right Panel — Live, Synced)
- As each story line appears on the left, the corresponding code highlights on the right
- User sees "Adding the three buttons" → right panel scrolls to button code and gently highlights it
- They don't need to READ the code — but they can SEE it growing in sync with the story
- Like watching a house being built with a narrator explaining each step
- Power users who want to read code can focus here. Everyone else watches the story.

### Step 4: The Result (The "Ta-Da" Moment)
When done, show a summary card:

```
✅ Done! Created: countdown-timer.tsx

What I built:
• A timer that counts down from 5 minutes
• Start, pause, and reset buttons  
• Plays a sound when time is up

From vault: 2 pieces reused
New code: 3 sections generated
Cost: $0.002

[Preview] [Open File] [Undo Everything]
```

- **Preview** — shows the result visually if possible (rendered component, screenshot, or simplified view)
- **Open File** — opens in editor for power users who want to see/edit code
- **Undo Everything** — one button, instant rollback, zero fear
- Only show code if they ASK. Non-coders never need to see it.

---

## The Three Feelings

Every Redivivus interaction should make the user feel:

1. **Involved** — they're watching it happen in real time, in words they understand
2. **In control** — they asked for this, Redivivus is doing what they said
3. **Confident** — they can see progress, not mystery

Every other tool makes the user feel like a passenger.
Redivivus makes them feel like the architect watching their blueprint come to life.

---

## What This Means for Implementation

### The centered modal is NOT optional
- It's the first thing a user sees. It sets the tone.
- It says "this tool respects your attention" instead of "find the tiny input box"
- `Ctrl+L` opens it. Click anywhere outside closes it. Escape closes it.
- After typing, it transitions smoothly to the split view

### The story narration is NOT optional  
- Every AI action gets a plain English line BEFORE the code appears
- The story is generated alongside the code — it's part of the prompt to the AI
- Example prompt addition: "For each section you write, also provide a one-sentence plain English description of what you're doing and why, formatted as a comment starting with // NARRATOR:"
- Redivivus strips the narrator lines from the code and displays them in the story panel

### Code streaming speed is CONTROLLED
- Even if the AI returns code instantly, Redivivus reveals it at a readable pace
- Synced with the story — each story line triggers the corresponding code section
- The user never sees a wall of code appear all at once

### The summary card is NOT optional
- Every completed action gets a summary
- Plain English: what was done, what was reused, what it cost
- Always includes Undo. ALWAYS. The user must never feel trapped.

---

## The Analogy

A chef doesn't make you watch them chop onions. They bring you the dish.

A mechanic doesn't make you watch them torque bolts. They hand you the keys and say "here's what I fixed."

Redivivus doesn't make you watch code stream. It tells you what it's building, shows you when it's done, and lets you drive.

---

## Competitive Advantage

| Feature | Cursor/Windsurf | Redivivus |
|---------|----------------|---------|
| Input | Tiny sidebar box | Centered modal, full focus |
| Progress | Raw code streaming | Plain English story |
| Code view | The ONLY view | Optional, synced with narrative |
| Result | Diff view | Summary card with Preview/Undo |
| Target user | Engineers | Everyone |
| Feeling | "I hope this works" | "I just MADE that" |
| Cost per build | $0.01–$0.05 (paid AI only) | $0.0001–$0.001 (smart routing — free AI first) |
| Output structure | Raw code, no context | Annotated, documented, self-explaining |

No other tool does this. They never will — because their users are engineers who WANT to see code. Redivivus serves the other 99%.

### The Cost Reality for Non-Tech Users

A non-tech user building a side project will make dozens to hundreds of builds. At $0.01 per build with a standard AI editor, that's real money adding up fast — and still getting back raw code they can't understand or maintain.

Redivivus routes simple tasks to free/cheap AI automatically. The same build that costs $0.01 elsewhere costs **$0.0001 in Redivivus** — 100x cheaper. 50 builds = $0.005 instead of $0.50.

But the bigger win is the output itself. Redivivus code is **self-documenting by default** — every file has a `NARRATOR` comment, a `[SCOPE]` tag, and full JSDoc. A non-tech user can open that file 3 months later and understand exactly what they built and why. No other tool gives them that. The annotations aren't decoration — they're the user's mental model of their own project, baked directly into every file.

---

## One Sentence → Full Project Structure

No other editor does this. From a single plain-English sentence, Redivivus automatically creates:

```
your-project/
├── .redivivus/
│   ├── snapshots/
│   │   └── [timestamp]/
│   │       └── _meta.json    ← exact task, files built, timestamp — powers Undo Everything
│   └── debug.log             ← timestamped command audit trail
├── docs/
│   └── README.md             ← human-readable: what it does, how to run it, tech stack, file map
└── src/
    └── your_file.ts          ← annotated code: NARRATOR, [SCOPE], JSDoc, null guards
```

Cursor/Windsurf drop a file wherever the cursor is and stop. Redivivus builds a **project** — structured, documented, undoable, and self-explaining from day one.

The non-tech user doesn't have to know what a `src/` folder is or why docs matter. Redivivus just does it. Every project they build comes out organized the same way. Six months later when they come back, everything is where they expect it.

---

## Notes from the Session (PapaJoe, May 3 2026)

- "Watching the code is useless and even the dialog is so fast it's almost as useless"
- "Make the user actually feel like they're involved and making something"
- "They can read and see what is happening because Redivivus is telling them in plain English"
- "We can put the code on the other panel to actually see it working but most will be reading the dialog"
- "People that know nothing about coding look at that string of coding and stuff and get so overwhelmed it is not funny"

These are the founding insights. Every UI decision should be measured against them.

---

## Notes from the Session (PapaJoe, May 7 2026)

- "Look at this folder structure and files — I am pretty sure no other editors do this automatically"
- That folder structure screenshot IS the marketing. One sentence in → organized, documented, undoable project out. Show it side by side with what Cursor/Windsurf produce. No explanation needed.
- Redivivus is not just an extension — the plan is full integration. A standalone product, not a bolt-on.

---

## The Bigger Vision — Not Just an Extension

Redivivus starts as a VS Code extension to prove the concept. But the end goal is a **fully integrated product** — its own editor or standalone app where Redivivus IS the environment, not a plugin inside someone else's.

Why this matters:
- As an extension, VS Code controls the shell — sidebars, panels, shortcuts, UI chrome. Redivivus works around it.
- As an integrated product, Redivivus owns the entire experience — the centered modal IS the editor, the story panel IS the progress view, the project structure IS enforced by default, not by convention.
- No competing sidebars (Copilot, GitHub, etc.) — Redivivus is the only AI in the room.
- Pricing, routing, vault, blueprint — all first-class, not bolted on.

**The extension is the prototype. The integrated product is the destination.**

---

*Vision locked — Built by PapaJoe — May 3, 2026. Updated May 7, 2026.*
