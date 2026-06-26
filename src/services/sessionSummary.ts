// [SCOPE] Session summary generator — produces a plain English closing card at end of session.
// Posts to the chat panel and appends to .redivivus/session_notes.md.
// Non-blocking: all failures are swallowed so session end is never interrupted.

import * as fs from 'fs';
import * as path from 'path';

export async function generateAndPostSessionSummary(): Promise<void> {
  try {
    const { ChatPanel } = await import('../features/chat/ui/chatPanel.js');
    const panel = ChatPanel.currentPanel;
    if (!panel) { return; }

    const conversation = panel.getConversation?.() || [];
    if (conversation.length < 2) { return; }

    const routing = panel.getRouting?.();
    if (!routing) { return; }

    const root = (await import('vscode')).workspace.workspaceFolders?.[0]?.uri.fsPath;

    // Build a compact conversation digest for the prompt (last 30 messages, capped at 3000 chars)
    const digest = conversation
      .slice(-30)
      .map((m: any) => `${m.role === 'user' ? 'User' : 'Redivivus'}: ${String(m.content).slice(0, 150)}`)
      .join('\n')
      .slice(0, 3000);

    const prompt =
      `A coding session just ended. Based on the conversation below, write a brief session summary.\n\n` +
      `Return ONLY a markdown block with these exact sections (skip any that have nothing to report):\n` +
      `**What we did:** (2-4 bullet points of concrete actions taken)\n` +
      `**Files touched:** (comma-separated list of filenames mentioned, or omit if none)\n` +
      `**Next time:** (one sentence about what was left unfinished or mentioned as future work, or omit)\n\n` +
      `Keep it short. Plain English. No jargon.\n\n` +
      `CONVERSATION:\n${digest}`;

    const result = await routing.promptCheap(prompt, 12_000).catch(() => null);
    if (!result?.success || !result.text?.trim()) { return; }

    const summaryBody = result.text.trim();

    // Count stats from conversation
    const fixCount = conversation.filter((m: any) => m.role === 'user' && /fix|bug|error|broken/i.test(m.content)).length;
    const buildCount = conversation.filter((m: any) => m.role === 'user' && /build|create|make|add/i.test(m.content)).length;
    const assistantMsgs = conversation.filter((m: any) => m.role === 'assistant');

    const statsLine = [
      fixCount > 0 ? `${fixCount} fix request${fixCount !== 1 ? 's' : ''}` : '',
      buildCount > 0 ? `${buildCount} build request${buildCount !== 1 ? 's' : ''}` : '',
      `${assistantMsgs.length} AI response${assistantMsgs.length !== 1 ? 's' : ''}`,
    ].filter(Boolean).join(' · ');

    const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const card =
      `## 📋 Session Summary — ${now}\n\n` +
      `${summaryBody}\n\n` +
      (statsLine ? `*${statsLine}*` : '');

    // Post to chat panel
    const conv = panel.getConversation?.();
    if (conv) {
      conv.push({ role: 'assistant', content: card, timestamp: Date.now() });
      panel.refresh?.();
    }

    // Persist to .redivivus/session_notes.md
    if (root) {
      try {
        const notesPath = path.join(root, '.redivivus', 'session_notes.md');
        const existing = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf-8') : '';
        fs.writeFileSync(notesPath, `${card}\n\n---\n\n${existing}`, 'utf-8');
      } catch { /* file write failure is non-fatal */ }
    }
  } catch { /* never surface summary errors */ }
}
