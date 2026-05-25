// [SCOPE] Provides a function to generate CSS styles for the Redivivus Dashboard WebView.

// [WARN] Embedding a large block of CSS as a string can be fragile and lacks tooling support for complex styles.
export function getStyles(): string {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { height: 100%; overflow-y: auto; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    padding: 10px 10px 40px 10px;
    min-height: 100%;
    overflow-y: visible;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--vscode-input-border, #333); }
  .header-left { display: flex; flex-direction: column; }
  .header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .header h1 { font-size: 14px; font-weight: 600; letter-spacing: 4px; margin-bottom: 2px; }
  .header .sub { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 1px; letter-spacing: 0.5px; }
  .header .project { font-size: 11px; color: var(--vscode-textLink-foreground); margin-top: 2px; }
  .chat-button {
    border: 1px solid var(--vscode-button-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 11px;
  }
  .chat-button:hover { background: var(--vscode-button-hoverBackground); }
  .badges { display: flex; justify-content: center; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
  .badge { padding: 2px 7px; border-radius: 8px; font-size: 10px; letter-spacing: 0.3px; }
  .green { background: rgba(78,201,89,0.12); color: #4ec959; }
  .yellow { background: rgba(245,166,35,0.12); color: #f5a623; }
  .blue { background: rgba(59,157,255,0.12); color: #3b9dff; }

  .tabs { display: flex; border-bottom: 1px solid var(--vscode-input-border, #333); margin-bottom: 12px; gap: 0; }
  .tab {
    flex: 1; padding: 6px 4px; border: none; background: none; cursor: pointer;
    font-size: 11px; color: var(--vscode-descriptionForeground);
    border-bottom: 2px solid transparent; transition: all 0.2s;
    font-family: inherit; text-align: center;
  }
  .tab:hover { color: var(--vscode-editor-foreground); }
  .tab.active { color: var(--vscode-textLink-foreground); border-bottom-color: var(--vscode-textLink-foreground); }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  .cards { display: flex; flex-direction: column; gap: 2px; }
  .cols-2, .cols-3 { display: flex; flex-direction: column; gap: 2px; }
  .card {
    background: transparent;
    border: none;
    border-radius: 4px; padding: 7px 8px; cursor: pointer;
    transition: background 0.1s; display: flex; gap: 8px; align-items: center;
  }
  .card:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
  .card.primary { background: rgba(59,157,255,0.08); border-left: 2px solid rgba(59,157,255,0.6); }
  .card-icon { font-size: 16px; flex-shrink: 0; width: 20px; text-align: center; }
  .card-title { font-size: 12px; font-weight: 600; line-height: 1.3; }
  .card-sub { font-size: 10px; color: var(--vscode-descriptionForeground); line-height: 1.3; margin-top: 1px; }
  .card-body { display: flex; flex-direction: column; }
  .card-desc { display: none; }

  .section-title { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin: 14px 0 4px 4px; }

  .alert { display: flex; gap: 12px; align-items: center; padding: 16px; border-radius: 8px; margin-bottom: 16px; background: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.3); }
  .alert-icon { font-size: 24px; }
  .alert-text { font-size: 13px; line-height: 1.5; }

  .session-bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; background: rgba(78,201,89,0.08); border: 1px solid rgba(78,201,89,0.2); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ec959; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  .empty-state { text-align: center; padding: 40px 20px; }
  .empty-icon { font-size: 36px; margin-bottom: 12px; }
  .empty-text { font-size: 13px; color: var(--vscode-descriptionForeground); line-height: 1.6; }

  .list { display: flex; flex-direction: column; gap: 6px; }
  .list-item { padding: 10px 14px; border-radius: 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, #333); font-size: 12px; line-height: 1.5; }

  .footer { text-align: center; margin-top: 16px; font-size: 9px; color: var(--vscode-descriptionForeground); letter-spacing: 0.5px; opacity: 0.6; }
`;
}