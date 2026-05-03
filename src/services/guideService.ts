// [SCOPE] Getting Started guide — context-aware next steps

import * as vscode from 'vscode';
import { ChassisService } from './chassisService.js';
import { SessionService } from './sessionService.js';

export class GuideService {
  constructor(
    private chassis: ChassisService,
    private sessions: SessionService
  ) {}

  async showGuide(): Promise<void> {
    const content = this.buildGuide();
    const panel = vscode.window.createWebviewPanel(
      'chassisGuide',
      'What is CHASSIS?',
      vscode.ViewColumn.Two,
      { enableScripts: false }
    );
    panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #e6edf3; background: #0d1117; line-height: 1.6; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 16px; color: #58a6ff; }
  h2 { font-size: 16px; font-weight: 600; margin-top: 20px; margin-bottom: 8px; color: #e6edf3; }
  p  { margin-bottom: 10px; font-size: 13px; }
  ul, ol { margin-bottom: 12px; padding-left: 20px; }
  li { margin-bottom: 4px; font-size: 13px; }
  code { background: #21262d; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-family: 'SF Mono', monospace; }
  pre { background: #21262d; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 12px; font-size: 12px; }
  th, td { border: 1px solid #30363d; padding: 6px 10px; text-align: left; }
  th { background: #161b22; font-weight: 600; }
  hr { border: none; border-top: 1px solid #30363d; margin: 16px 0; }
</style>
</head>
<body>
${this.mdToHtml(content)}
</body>
</html>`;
  }

  private mdToHtml(md: string): string {
    // Minimal markdown-to-HTML for the guide
    let html = md
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h2>$1</h2>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/```[\s\S]*?```/g, (m) => '<pre>' + m.replace(/```/g, '').trim() + '</pre>')
      .replace(/^\*\*([^*]+)\*\*/gm, '<strong>$1</strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/^\|(.+)\|$/gm, (m) => {
        const cells = m.split('|').filter(c => c.trim() !== '').map(c => '<td>' + c.trim() + '</td>').join('');
        return '<tr>' + cells + '</tr>';
      })
      .replace(/<tr>(<td>[^<]+<\/td>)+<\/tr>/g, (m) => m.replace(/<td>([^<]+)<\/td>/g, '<th>$1</th>'));
    // wrap consecutive list items
    html = html.replace(/(<li>.*?<\/li>\n?)+/gs, (m) => '<ul>' + m.replace(/<\/li>\n<li>/g, '</li><li>') + '</ul>');
    // wrap consecutive table rows
    html = html.replace(/(<tr>.*?<\/tr>\n?)+/gs, (m) => '<table>' + m + '</table>');
    // line breaks for remaining plain text
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/^(?!<[hulpqt])(.+)$/gm, '<p>$1</p>');
    html = html.replace(/<\/p>\s*<p>/g, '</p>\n<p>');
    return html;
  }

  private buildGuide(): string {
    let md = "# What is CHASSIS?\n\n";
    md += "CHASSIS is a helper that keeps your project organized while you work with AI. ";
    md += "It asks you a few questions up front, tracks what you do, and keeps notes inside your code. ";
    md += "Think of it as a notebook, a project map, and a set of reminders all rolled into one.\n\n";

    // ── BLUEPRINT ──
    md += "---\n\n";
    md += "## Blueprint — Your Project\'s Foundation\n\n";
    md += "Before you start coding, CHASSIS asks you five simple questions. ";
    md += "These are not technical questions. They are about the people who will use your work, ";
    md += "what it needs to do, where it lives, when it needs to work, and why it matters.\n\n";
    md += "**Who** is going to use this?\n";
    md += "Picture the person. Are they technical? Are they in a hurry? This shapes every decision.\n\n";
    md += "**What** does it need to do?\n";
    md += "Not the dream version. The smallest useful version. This keeps scope creep in check.\n\n";
    md += "**Where** does this live and run?\n";
    md += "A phone app? A website? A server? This decides your entire tool stack.\n\n";
    md += "**When** does this need to work?\n";
    md += "A prototype in a week? A product in six months? This sets the pace.\n\n";
    md += "**Why** does this need to exist?\n";
    md += "If the answer is weak, it is better to know now than after fifty hours of work.\n\n";
    md += "### Locking Your Blueprint\n\n";
    md += "Once your answers feel right, you can lock the blueprint. ";
    md += "After that, the form goes read-only and shows a green banner. ";
    md += "Locking is your way of saying, \"This is the plan. I will not drift from it without thinking.\" ";
    md += "You can always unlock it later if the project truly needs to change direction.\n\n";

    // ── SESSIONS ──
    md += "---\n\n";
    md += "## Sessions — Track Your Work\n\n";
    md += "Every time you sit down to code, tell CHASSIS what you are working on. ";
    md += "This is called **Start Working**. You give your session a goal like \"Wire the login screen\" ";
    md += "and tell it which AI you are using — Claude, Gemini, Windsurf, Cursor, or manual.\n\n";
    md += "When you are done, click **Done for Now**. CHASSIS asks four quick questions:\n\n";
    md += "1. What did you get done?\n";
    md += "2. What is still in progress?\n";
    md += "3. Any risks or concerns?\n";
    md += "4. What should you start with next time?\n\n";
    md += "These answers go straight into your **Work Log** so you never lose track of where you were.\n\n";

    // ── ANNOTATION TAGS ──
    md += "---\n\n";
    md += "## Annotation Tags — Notes Inside Your Code\n\n";
    md += "As you work, drop little labels into your code. CHASSIS colors them automatically. ";
    md += "They are just comments with brackets, so your code still runs normally.\n\n";
    md += "**[SCOPE]** — Purple. What this file does. Put it at the top of every file. ";
    md += "It is the first thing you or an AI will read when opening a file cold.\n\n";
    md += "**[TODO]** — Yellow. Known work that still needs doing.\n\n";
    md += "**[NEXT]** — Blue. Where to pick up next time. Useful when you have to stop mid-thought.\n\n";
    md += "**[WARN]** — Orange. Fragile or risky code. Warns the next person — including future you — to be careful.\n\n";
    md += "**[DEAD]** — Gray. Something you tried that did not work. Write why, so nobody repeats the mistake.\n\n";
    md += "**[DONE]** — Green. Verified, finished work. Helps you see progress at a glance.\n\n";
    md += "You can use them in any language. JavaScript: `// [TODO] Add validation`. ";
    md += "Python: `# [SCOPE] Handles user authentication`. ";
    md += "HTML: `<!-- [WARN] This breaks on mobile -->`.\n\n";

    // ── SCAN PROJECT ──
    md += "---\n\n";
    md += "## Scan Project — Health Check\n\n";
    md += "This reads through your whole project and writes a report. It tells you:\n\n";
    md += "- How many files you have and what types they are\n";
    md += "- Which files are over 200 lines — a sign they might need splitting\n";
    md += "- How many old TODO, FIXME, or HACK comments are hiding in the code\n";
    md += "- Which files have no comments at all\n\n";
    md += "The output is a markdown file called **project_map.md** inside your `.chassis/` folder. ";
    md += "You can read it like a dashboard. If the numbers look scary, that is the point — ";
    md += "it helps you decide what to clean up first.\n\n";

    // ── FILE OPERATIONS ──
    md += "---\n\n";
    md += "## File Operations — Three Ways to Inspect Code\n\n";
    md += "These three tools all ask you to pick a file first. They work on any code file in your project.\n\n";
    md += "**Check a File** reads the file and reports what it finds. ";
    md += "It counts your annotation tags, flags old-style TODOs, and checks comment density. ";
    md += "Think of it as a quick physical. No AI involved, so it is instant.\n\n";
    md += "**AI Review** sends the file to an AI and asks for a second opinion. ";
    md += "The AI reports what the file does, spots bugs or risks, suggests improvements, ";
    md += "and says whether the file is too big. The review is saved as a markdown file ";
    md += "inside `.chassis/reviews/` so you can read it later.\n\n";
    md += "**Clean Up File** also sends the file to an AI, but this one actually changes it. ";
    md += "The AI adds `[SCOPE]` tags at the top, converts old TODO comments into CHASSIS format, ";
    md += "flags risky code with `[WARN]`, and suggests split points with `[NEXT]`. ";
    md += "Before anything is saved, CHASSIS shows you a side-by-side diff. You choose whether to apply it.\n\n";
    md += "All three use the AI engine you picked in **Switch AI**. If no API key is set, ";
    md += "CHASSIS tells you exactly how to add one.\n\n";

    // ── WORK LOG & DEAD ENDS ──
    md += "---\n\n";
    md += "## Work Log and Dead Ends\n\n";
    md += "These are two living documents inside your `.chassis/` folder.\n\n";
    md += "**Work Log** (`work_log.md`) is an automatic diary. Every session start, end, ";
    md += "AI review, and project scan gets appended here with a timestamp. ";
    md += "Read it at the start of each day to remember where you left off.\n\n";
    md += "**Dead Ends** (`dead_ends.md`) is where you record things that did not work. ";
    md += "When you hit a wall, write down what you tried and why it failed. ";
    md += "This stops you and your AI from trying the same broken path twice.\n\n";

    // ── SWITCH AI ──
    md += "---\n\n";
    md += "## Switch AI — Pick Your Engine\n\n";
    md += "CHASSIS does not care which AI you use. It works with all of them. ";
    md += "When you start a session or run an AI-powered file operation, ";
    md += "CHASSIS uses the engine you last picked.\n\n";
    md += "You can switch anytime from the dashboard. The current choices are:\n\n";
    md += "- **Gemini** — Fast and free for most tasks. Good default.\n";
    md += "- **Claude** — Strong at deep reasoning and complex files. Paid.\n";
    md += "- **Kimi** — Fast at bulk annotations across many files.\n\n";
    md += "To add a new engine, go to CHASSIS settings and paste in your API key. ";
    md += "You can also set the `GEMINI_API_KEY` environment variable.\n\n";

    // ── VAULT ──
    md += "---\n\n";
    md += "## Vault — Save Useful Code\n\n";
    md += "Coming soon. The Vault will let you save helpful functions and logic blocks ";
    md += "so you can reuse them across projects. Think of it as a personal toolbox.\n\n";

    // ── QUICK TIPS ──
    md += "---\n\n";
    md += "## Quick Tips\n\n";
    md += "- Start every coding session with **Start Working**. It takes five seconds and saves hours later.\n";
    md += "- End every session with **Done for Now**. The four questions are your breadcrumb trail.\n";
    md += "- Put `// [SCOPE]` at the top of every file. Future you will thank present you.\n";
    md += "- Run **Scan Project** once a week to catch files that are growing out of control.\n";
    md += "- Read your Work Log at the start of each day instead of staring at the screen trying to remember.\n";
    md += "- Use `[DEAD]` generously. It is not failure — it is shared knowledge.\n\n";

    return md;
  }
}
