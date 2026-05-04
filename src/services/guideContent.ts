// [SCOPE] Guide content builder — buildGuide function generates the CHASSIS getting started guide markdown
// Called by guideService. No markdown parsing or webview logic here.

export function buildGuide(): string {
  let md = "# What is CHASSIS?\n\n";
  md += "CHASSIS is a helper that keeps your project organized while you build with AI. ";
  md += "It asks you a few questions up front, tracks what you do each session, and keeps notes inside your code. ";
  md += "Think of it as a job site clipboard — it holds the plan, the checklist, and the notes so nothing falls through the cracks.\n\n";
  md += "You do not need to be a programmer to use it. If you can describe what you want to build, CHASSIS can help keep it organized.\n\n";

  // ── BLUEPRINT ──
  md += "---\n\n";
  md += "## My Project Plan (Blueprint)\n\n";
  md += "The first thing CHASSIS asks you to do is answer five plain English questions about your project. ";
  md += "These are not technical. They are just about what you are building and why.\n\n";
  md += "**Who is going to use this?** Just you? Friends? Kids? Strangers? ";
  md += "This shapes what the finished thing needs to feel like.\n\n";
  md += "**What does it do?** Describe it like you'd tell a friend — one sentence is fine. ";
  md += "The simpler the better. You can always add more later.\n\n";
  md += "**Where does it run?** In a browser? On a phone? On your computer? Not sure is a valid answer.\n\n";
  md += "**What's your timeline?** A weekend experiment? Something for next month? No deadline? All fine.\n\n";
  md += "**Why do you want to build it?** \"Because it sounds fun\" counts. ";
  md += "Honest answers help your AI give better suggestions.\n\n";
  md += "### Locking Your Plan\n\n";
  md += "Once your answers feel right, you can lock the blueprint. ";
  md += "The form goes read-only and shows a green lock badge. ";
  md += "This is your way of saying: *this is the plan, I will not drift from it without thinking*. ";
  md += "You can unlock it anytime if things genuinely change.\n\n";

  // ── SESSIONS ──
  md += "---\n\n";
  md += "## Sessions — Your Daily Check-In\n\n";
  md += "Every time you sit down to work, click **Start Working** and type what you are doing today. ";
  md += "Just one sentence — \"Build the main menu\" or \"Fix the score counter.\" ";
  md += "Then pick which AI you are working with.\n\n";
  md += "When you stop, click **Done for Now**. CHASSIS asks four quick questions:\n\n";
  md += "1. What did you finish?\n";
  md += "2. What is still in progress?\n";
  md += "3. Any problems or risks?\n";
  md += "4. What should you start with next time?\n\n";
  md += "These answers go straight into your **Work Log**. Next time you open the project, ";
  md += "read the last entry and you will know exactly where you left off — no staring at the screen trying to remember.\n\n";

  // ── ANNOTATION TAGS ──
  md += "---\n\n";
  md += "## Annotation Tags — Sticky Notes in Your Code\n\n";
  md += "These are small labels you can drop into any code file. They look like comments, ";
  md += "so your code still runs normally — but CHASSIS and your AI can read them as signals.\n\n";
  md += "**[SCOPE]** — What this file does. Put one at the very top of every file. ";
  md += "It is the first thing you or your AI reads when opening a file cold.\n\n";
  md += "**[TODO]** — Work that still needs doing.\n\n";
  md += "**[NEXT]** — Where to pick up next time. Use it when you have to stop mid-thought.\n\n";
  md += "**[WARN]** — Something fragile or risky. A warning to yourself and your AI to be careful here.\n\n";
  md += "**[DEAD]** — Something you tried that did not work. Write a short note so nobody — including future you — repeats it.\n\n";
  md += "**[DONE]** — Finished and confirmed working. Helps you see what is truly complete.\n\n";
  md += "Examples:\n";
  md += "- JavaScript / TypeScript: `// [SCOPE] Handles the player score and win condition`\n";
  md += "- Python: `# [TODO] Add error handling when the file is missing`\n";
  md += "- HTML: `<!-- [WARN] This layout breaks on screens smaller than 400px -->`\n\n";

  // ── SCAN PROJECT ──
  md += "---\n\n";
  md += "## Scan Project — Health Check\n\n";
  md += "This reads through your whole project and writes a report. It tells you:\n\n";
  md += "- How many files you have and what types they are\n";
  md += "- Which files are getting too long (over 200 lines) — a sign they might need splitting\n";
  md += "- How many unfinished TODOs or FIXMEs are hiding in the code\n";
  md += "- Which files have no comments at all\n\n";
  md += "When the scan finds issues, a **Recommendations** panel opens automatically showing exactly what needs attention, ";
  md += "with one-click prompts you can paste straight into your AI chat to fix each problem.\n\n";
  md += "When everything looks clean, it just tells you so — no false alarms.\n\n";

  // ── FILE OPERATIONS ──
  md += "---\n\n";
  md += "## Tools — Three Ways to Work on a File\n\n";
  md += "These three tools all ask you to pick a file first. They work on any code file in your project.\n\n";
  md += "**Check a File** reads the file and reports what it finds instantly — no AI needed. ";
  md += "It counts annotation tags, flags old TODOs, and checks how well commented the file is. Good for a quick look.\n\n";
  md += "**AI Review** sends the file to your AI and asks for a second opinion. ";
  md += "The AI describes what the file does, spots risks, and suggests improvements. ";
  md += "The review is saved in your `.chassis/reviews/` folder so you can read it later.\n\n";
  md += "**Clean Up File** also uses AI, but this one actually edits the file. ";
  md += "It adds a [SCOPE] tag at the top, converts old TODO comments to CHASSIS format, ";
  md += "and flags risky spots with [WARN]. Before saving, CHASSIS shows you a diff so you can approve or reject the changes.\n\n";

  // ── WORK LOG & DEAD ENDS ──
  md += "---\n\n";
  md += "## Work Log and Dead Ends\n\n";
  md += "Two plain text files that CHASSIS keeps for you inside the `.chassis/` folder.\n\n";
  md += "**Work Log** (`work_log.md`) — an automatic diary. Every session start, ";
  md += "end, review, and scan gets written here with a timestamp. ";
  md += "Open it at the start of each day instead of trying to remember where you left off.\n\n";
  md += "**Dead Ends** (`dead_ends.md`) — a record of things you tried that did not work. ";
  md += "When you hit a wall, write down what you tried and why it failed. ";
  md += "This stops you — and your AI — from going down the same dead-end road twice.\n\n";

  // ── SWITCH AI ──
  md += "---\n\n";
  md += "## Switch AI — Pick Your Engine\n\n";
  md += "CHASSIS works with several AI providers. You can switch anytime from the **Project** tab.\n\n";
  md += "- **Gemini 2.5 Flash** — Free tier available. Fast. Good starting point.\n";
  md += "- **Groq (Llama 3)** — Free tier available. Very fast.\n";
  md += "- **Claude 3.5 Haiku** — Paid. Strong at understanding complex code.\n";
  md += "- **GPT-4o Mini** — Paid. Reliable and widely supported.\n";
  md += "- **Grok 3 Mini** — Paid. Good for reasoning tasks.\n";
  md += "- **Kimi** — Paid. Handles long files well.\n\n";
  md += "To connect an AI, go to **Project → API Keys**, paste your key, and click Save. ";
  md += "Gemini and Groq both have free tiers — no credit card needed to get started.\n\n";

  // ── VAULT ──
  md += "---\n\n";
  md += "## Snippets (Vault) — Save and Reuse Code\n\n";
  md += "The Vault is your personal code library. When you build something useful — a function, a pattern, a tricky bit of logic — ";
  md += "you can save it to the Vault and reuse it in future projects.\n\n";
  md += "To fill it, click **Snippets** and run a scan. CHASSIS walks through your project, ";
  md += "pulls out reusable blocks, and uses your AI to sort them into categories automatically.\n\n";

  // ── QUICK TIPS ──
  md += "---\n\n";
  md += "## Quick Tips\n\n";
  md += "- **Start every session with Start Working.** Five seconds now saves hours of confusion later.\n";
  md += "- **End every session with Done for Now.** Those four questions are your breadcrumb trail.\n";
  md += "- **Put [SCOPE] at the top of every file.** Future you will thank present you.\n";
  md += "- **Run Scan Project once a week** to catch files that are growing out of control.\n";
  md += "- **Read your Work Log at the start of each day** instead of staring at the screen trying to remember.\n";
  md += "- **Use [DEAD] freely.** Writing down what did not work is not failure — it is the smartest thing you can do.\n\n";

  return md;
}
