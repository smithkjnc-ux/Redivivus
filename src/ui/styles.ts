// [SCOPE] CHASSIS Dashboard styles — all CSS for the WebView panel

export function getStyles(): string {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    padding: 32px 40px;
    max-width: 860px;
    margin: 0 auto;
  }
  .header { text-align: center; margin-bottom: 24px; }
  .header h1 { font-size: 26px; font-weight: 300; letter-spacing: 6px; margin-bottom: 4px; }
  .header .sub { font-size: 12px; color: var(--vscode-descriptionForeground); }
  .header .project { font-size: 15px; color: var(--vscode-textLink-foreground); margin-top: 4px; }
  .badges { display: flex; justify-content: center; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
  .badge { padding: 3px 10px; border-radius: 10px; font-size: 10px; letter-spacing: 0.5px; }
  .green { background: rgba(78,201,89,0.12); color: #4ec959; }
  .yellow { background: rgba(245,166,35,0.12); color: #f5a623; }
  .blue { background: rgba(59,157,255,0.12); color: #3b9dff; }

  .tabs { display: flex; border-bottom: 1px solid var(--vscode-input-border, #333); margin-bottom: 20px; gap: 0; }
  .tab {
    padding: 10px 20px; border: none; background: none; cursor: pointer;
    font-size: 13px; color: var(--vscode-descriptionForeground);
    border-bottom: 2px solid transparent; transition: all 0.2s;
    font-family: inherit;
  }
  .tab:hover { color: var(--vscode-editor-foreground); }
  .tab.active { color: var(--vscode-textLink-foreground); border-bottom-color: var(--vscode-textLink-foreground); }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  .cards { display: grid; gap: 10px; }
  .cols-2 { grid-template-columns: 1fr 1fr; }
  .cols-3 { grid-template-columns: 1fr 1fr 1fr; }
  .card {
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, #333);
    border-radius: 8px; padding: 16px; cursor: pointer;
    transition: all 0.15s; display: flex; gap: 12px; align-items: flex-start;
  }
  .card:hover { border-color: var(--vscode-textLink-foreground); transform: translateY(-1px); }
  .card.primary { border-color: rgba(59,157,255,0.4); background: rgba(59,157,255,0.06); }
  .card-icon { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
  .card-title { font-size: 13px; font-weight: 600; margin-bottom: 3px; }
  .card-desc { font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.5; }

  .section-title { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin: 20px 0 10px 2px; }

  .alert { display: flex; gap: 12px; align-items: center; padding: 16px; border-radius: 8px; margin-bottom: 16px; background: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.3); }
  .alert-icon { font-size: 24px; }
  .alert-text { font-size: 13px; line-height: 1.5; }

  .session-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; background: rgba(78,201,89,0.08); border: 1px solid rgba(78,201,89,0.2); font-size: 12px; }
  .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ec959; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  .empty-state { text-align: center; padding: 40px 20px; }
  .empty-icon { font-size: 36px; margin-bottom: 12px; }
  .empty-text { font-size: 13px; color: var(--vscode-descriptionForeground); line-height: 1.6; }

  .list { display: flex; flex-direction: column; gap: 6px; }
  .list-item { padding: 10px 14px; border-radius: 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, #333); font-size: 12px; line-height: 1.5; }

  .footer { text-align: center; margin-top: 32px; font-size: 10px; color: var(--vscode-descriptionForeground); letter-spacing: 1px; }
`;
}
