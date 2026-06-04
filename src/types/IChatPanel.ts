// [SCOPE] IChatPanel — stable interface for the ChatPanel. Import this instead of ChatPanel
// whenever you only need to post messages, append conversation, or trigger a refresh.
// Only extension.ts and extensionCommands.ts should import the real ChatPanel class directly.
//
// Benefits:
//   - Changing ChatPanel internals doesn't force recompilation of the 57 files that just need
//     to post a message or append text.
//   - New features can be tested against a mock without spinning up the full panel.
//   - Forces a clean boundary: if your code only needs IChatPanel, it can't accidentally
//     reach into panel internals.

export interface IChatPanel {
  /** Append a message to the conversation and re-render. */
  appendMessage(role: 'assistant' | 'user', content: string): void;

  /** Replace the last assistant message in conversation (used for progress updates). */
  updateLastMessage(content: string): void;

  /** Trigger a full webview re-render from the current conversation state. */
  refresh(): void;

  /** Send a typed message directly to the webview. Use sparingly — prefer appendMessage. */
  postToWebview(msg: Record<string, unknown>): void;

  /** Show a named sub-panel (work log, dead ends, etc.) inside the chat view. */
  showPanel(id: string, title: string, html: string): void;

  /** Show the new-project launcher screen. */
  showNewProject(suggestedParent?: string, prefillTask?: string, compact?: boolean): void;

  /** Handle an incoming message as if it came from the webview (used by commands). */
  handleMessage(msg: Record<string, unknown>): Promise<void>;

  /** Full read access to the conversation array (prefer appendMessage for writes). */
  getConversation(): Array<{ role: string; content: string; timestamp: number; tokens?: number; cost?: number }>;
}

// ── Adapter: wraps a real ChatPanel instance as IChatPanel ────────────────────────────────────
// Usage: const panel: IChatPanel = asChatPanel(ChatPanel.currentPanel)
// Returns null-safe adapter — all methods are no-ops if panel is null.
export function asChatPanel(panel: any): IChatPanel {
  return {
    appendMessage(role, content) {
      panel?.getConversation()?.push({ role, content, timestamp: Date.now() });
      panel?.refresh();
    },
    updateLastMessage(content) {
      const conv = panel?.getConversation?.();
      if (!conv || conv.length === 0) { panel?.getConversation()?.push({ role: 'assistant', content, timestamp: Date.now() }); panel?.refresh(); return; }
      const last = conv[conv.length - 1];
      if (last.role === 'assistant') { last.content = content; } else { conv.push({ role: 'assistant', content, timestamp: Date.now() }); }
      panel?.refresh();
    },
    refresh()                          { panel?.refresh?.(); },
    postToWebview(msg)                 { panel?.postToWebview?.(msg) ?? panel?._panel?.webview?.postMessage?.(msg); },
    showPanel(id, title, html)         { panel?.showPanel?.(id, title, html); },
    showNewProject(p, t, c)            { panel?.showNewProject?.(p, t, c); },
    handleMessage(msg)                 { return panel?.handleMessage?.(msg) ?? Promise.resolve(); },
    getConversation()                  { return panel?.getConversation?.() ?? []; },
  };
}
