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
      align-self: flex-start; background: var(--c-surface); position: relative;
      border: 1px solid var(--c-border); border-radius: 4px 16px 16px 16px;
      padding: 11px 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .msg-fwd-bar { position: absolute; top: 6px; right: 8px; display: none; gap: 4px; }
    .assistant-bubble:hover .msg-fwd-bar { display: flex; }
    .msg-fwd-btn { background: var(--c-raised); border: 1px solid var(--c-border); color: var(--c-text-dim);
      border-radius: 5px; padding: 2px 7px; font-size: 11px; cursor: pointer; font-family: inherit;
      transition: all 0.12s; line-height: 1.6; }
    .msg-fwd-btn:hover { background: var(--c-border); color: var(--c-text); }
    .message-content { line-height: 1.6; white-space: pre-wrap; word-break: break-word; font-size: 13px; user-select: text; }
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
    .bpc-card {
      background: rgba(74,158,255,0.06); border: 1px solid rgba(74,158,255,0.28);
      border-radius: 10px; padding: 14px 16px; margin: 8px 0;
    }
    .bpc-header { font-size: 13px; font-weight: 600; color: var(--vscode-foreground); margin-bottom: 6px; }
    .bpc-legend { font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
    .bpc-fields { display: flex; flex-direction: column; gap: 6px; }
    .bpc-row { display: flex; align-items: center; gap: 10px; }
    .bpc-label { font-size: 11px; font-weight: 700; color: var(--vscode-descriptionForeground); width: 50px; flex-shrink: 0; }
    .bpc-input:focus { outline: none; border-color: #4a9eff !important; }
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

    /* ── Launcher: compact, no-scroll welcome screen ── */
    .launcher-root { padding: 16px 20px 10px !important; gap: 10px !important; justify-content: flex-start !important; }
    .launcher-hero { display: flex; align-items: center; gap: 12px; }
    .launcher-logo { font-size: 32px; filter: drop-shadow(0 3px 10px rgba(77,158,255,0.35)); }
    .launcher-hero-text { text-align: left; }
    .launcher-actions { display: flex; gap: 8px; justify-content: center; width: 100%; max-width: 440px; }
    .launcher-action-card {
      flex: 1; padding: 10px 8px 8px; background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 10px; cursor: pointer; text-align: center;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      transition: all 0.18s ease; font-family: inherit;
    }
    .launcher-action-card:hover { border-color: var(--c-accent); background: var(--c-accent-lo); transform: translateY(-1px); box-shadow: 0 3px 12px rgba(77,158,255,0.15); }
    .lac-icon { font-size: 18px; }
    .lac-label { font-size: 12px; font-weight: 700; color: var(--c-text); line-height: 1.3; }
    .lac-desc { font-size: 10px; color: var(--c-text-faint); line-height: 1.3; }

    .launcher-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: 100%; max-width: 440px; }
    .launcher-section { text-align: left; }
    .launcher-section-label { font-size: 10px; font-weight: 700; color: var(--c-text-faint); letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; padding-left: 2px; }
    .launcher-templates { display: flex; flex-direction: column; gap: 4px; }
    .launcher-tpl-pill {
      display: flex; align-items: center; gap: 6px; padding: 5px 10px;
      background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 14px;
      font-size: 11px; font-weight: 600; color: var(--c-text-dim); cursor: pointer;
      transition: all 0.15s; font-family: inherit;
    }
    .launcher-tpl-pill:hover { border-color: var(--c-accent); background: var(--c-accent-lo); color: var(--c-text); }
    .tpl-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

    .launcher-recent-list { display: flex; flex-direction: column; gap: 2px; }
    .launcher-recent-item {
      display: flex; align-items: center; gap: 6px; padding: 5px 8px;
      background: var(--c-surface); border: 1px solid transparent; border-radius: 6px;
      cursor: pointer; transition: all 0.15s;
    }
    .launcher-recent-item:hover { border-color: var(--c-accent); background: var(--c-accent-lo); }
    .lri-icon { font-size: 12px; flex-shrink: 0; }
    .lri-name { flex: 1; font-size: 12px; font-weight: 500; color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lri-time { font-size: 10px; color: var(--c-text-faint); flex-shrink: 0; }
    .launcher-empty-recent { padding: 6px; color: var(--c-text-faint); font-size: 11px; font-style: italic; }

    .launcher-bottom-bar {
      display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;
      width: 100%; max-width: 440px; padding-top: 8px; border-top: 1px solid var(--c-border);
    }
    .launcher-vault-status { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--c-accent); cursor: pointer; padding: 2px 6px; border-radius: 4px; transition: background 0.15s; }
    .launcher-vault-status:hover { background: var(--c-accent-lo); }
    .launcher-vault-empty { color: var(--c-text-faint); cursor: default; }
    .launcher-vault-empty:hover { background: transparent; }
    .lvs-icon { font-size: 12px; }
    .launcher-settings-gear { background: none; border: 1px solid var(--c-border); color: var(--c-text-faint); font-size: 13px; cursor: pointer; padding: 2px 5px; border-radius: 5px; transition: all 0.15s; line-height: 1; }
    .launcher-settings-gear:hover { border-color: var(--c-accent); color: var(--c-text); }
    .launcher-auto-popover { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 8px; padding: 8px 12px; max-width: 300px; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }
    .launcher-autostart { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: var(--c-text-dim); }
    .launcher-autostart input { cursor: pointer; accent-color: var(--c-accent); }
  `;
}
