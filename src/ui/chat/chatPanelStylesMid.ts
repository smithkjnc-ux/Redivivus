// [SCOPE] Chat Panel CSS chunk 2/3 — conversation, messages, story panel, code blocks, onboarding
// Imported by chatPanelStyles.ts assembler. Do not import directly.

export function buildChatCssMid(): string {
  return `
    #conversation {
      flex: 1; overflow-y: auto; padding: 18px 16px;
      display: flex; flex-direction: column; gap: 14px; background: var(--c-bg);
    }
    .message-bubble { display: flex; flex-direction: column; gap: 4px; max-width: 82%; word-wrap: break-word; }
    .user-bubble {
      align-self: flex-end;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #fff; border-radius: 16px 16px 4px 16px; padding: 10px 15px;
      box-shadow: 0 2px 12px rgba(37,99,235,0.35);
    }
    .assistant-bubble {
      align-self: flex-start; background: var(--c-surface);
      border: 1px solid var(--c-border); border-radius: 4px 16px 16px 16px;
      padding: 11px 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .message-content { line-height: 1.6; white-space: pre-wrap; word-break: break-word; font-size: 13px; }
    .message-meta { font-size: 10px; color: var(--c-text-faint); margin-top: 5px; }
    .story-panel { display: flex; flex-direction: column; gap: 5px; padding: 2px 0; }
    .story-header {
      font-size: 11px; font-weight: 700; color: var(--c-accent);
      margin-bottom: 6px; letter-spacing: 0.8px; text-transform: uppercase;
    }
    .story-line {
      display: flex; align-items: flex-start; gap: 9px;
      padding: 6px 10px; border-radius: 8px; font-size: 13px; line-height: 1.5;
      color: var(--c-text-dim); transition: all 0.2s;
    }
    .story-line.story-line-active {
      background: var(--c-accent-lo); border-left: 3px solid var(--c-accent);
      color: var(--c-text); font-weight: 500; padding-left: 8px;
    }
    .story-dot { flex-shrink: 0; font-size: 14px; margin-top: 1px; }
    .code-block {
      background: #111827; border: 1px solid var(--c-border); border-radius: 10px; margin: 10px 0; overflow: hidden;
    }
    .code-block pre { padding: 14px; overflow-x: auto; font-family: 'JetBrains Mono','Fira Code','Monaco','Courier New',monospace; font-size: 12px; }
    .code-block code { color: #c9d1d9; }
    .create-file-btn {
      background: var(--c-accent-lo); color: var(--c-accent); border: 1px solid var(--c-accent);
      padding: 5px 13px; margin: 7px 12px 11px 12px; border-radius: 6px; cursor: pointer;
      font-size: 11px; font-weight: 600; transition: all 0.15s; font-family: inherit;
    }
    .create-file-btn:hover { background: var(--c-accent-md); color: #fff; }
    .bp-gap-card {
      background: rgba(74,158,255,0.07); border: 1px solid rgba(74,158,255,0.3);
      border-radius: 10px; padding: 14px 16px; margin: 8px 0;
    }
    .bp-gap-title {
      font-size: 12px; font-weight: 700; color: #4a9eff;
      letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px;
    }
    .bp-gap-input:focus { outline: none; border-color: #4a9eff !important; }
    .terminal-error-card {
      background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.35);
      border-radius: 8px; padding: 10px 14px; margin: 8px 0;
    }
    .terminal-error-label {
      font-size: 11px; font-weight: 700; color: #f87171;
      letter-spacing: 0.5px; text-transform: uppercase;
    }
    .empty-state {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center;
    }
    .empty-state .icon { font-size: 44px; margin-bottom: 4px; filter: drop-shadow(0 4px 16px rgba(77,158,255,0.4)); }
    .onboarding-title {
      font-size: 20px; font-weight: 700; color: var(--c-text);
      background: linear-gradient(90deg, #7bc4ff, #e8edf8);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .onboarding-sub { font-size: 13px; color: var(--c-text-dim); margin-bottom: 4px; max-width: 280px; }
    .onboarding-examples { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 10px 0; }
    .onboarding-setup-btn {
      margin: 14px auto 4px; padding: 11px 26px;
      background: linear-gradient(135deg, #2563eb, #4d9eff);
      color: #fff; border-radius: 10px; font-size: 14px; font-weight: 700;
      cursor: pointer; display: inline-block; transition: opacity 0.15s;
      box-shadow: 0 4px 18px rgba(77,158,255,0.35); border: none; font-family: inherit;
    }
    .onboarding-setup-btn:hover { opacity: 0.9; }
    .onboarding-divider { font-size: 11px; opacity: 0.45; margin: 8px 0 5px; text-transform: uppercase; letter-spacing: 0.8px; }
    .onboarding-pill {
      background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 20px;
      padding: 7px 15px; font-size: 12px; cursor: pointer; color: var(--c-text-dim);
      transition: all 0.15s; user-select: none; font-family: inherit;
    }
    .onboarding-pill:hover { background: var(--c-accent-lo); border-color: var(--c-accent); color: var(--c-text); }
    .onboarding-hint { font-size: 11px; color: var(--c-text-faint); margin-top: 6px; }
  `;
}
