// [SCOPE] CSS styling strings for the Memory Panel webview
export function getMemoryPanelStyles(): string {
  return `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; max-width: 680px; margin: 0 auto; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .page-sub { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 24px; }
    .section { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; }
    .section-header { font-weight: 700; font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 10px; }
    .section-sub { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 4px 6px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    td:first-child { color: var(--vscode-descriptionForeground); width: 40%; }
    .count { opacity: 0.55; font-size: 11px; }
    .entry-list { list-style: none; padding: 0; margin: 0; }
    .entry-row { display: flex; align-items: baseline; gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px; line-height: 1.5; }
    .entry-row:last-child { border-bottom: none; }
    .neverdo-label { font-size: 10px; font-weight: 700; color: #ff534f; background: rgba(255,83,79,0.12); padding: 1px 6px; border-radius: 4px; white-space: nowrap; }
    .recent-row { opacity: 0.7; }
    .empty-note { font-size: 11px; color: var(--vscode-descriptionForeground); padding: 4px 0; font-style: italic; }
    .del-btn { margin-left: auto; flex-shrink: 0; background: transparent; border: 1px solid rgba(255,83,79,0.3); color: #ff534f; border-radius: 4px; padding: 1px 6px; font-size: 10px; cursor: pointer; transition: background 0.15s; }
    .del-btn:hover { background: rgba(255,83,79,0.15); }
    .secondary-btn { background: transparent; border: 1px solid var(--vscode-input-border); color: var(--vscode-descriptionForeground); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
    .secondary-btn:hover { border-color: var(--vscode-focusBorder); color: var(--vscode-foreground); }
    .rules-block { font-size: 11px; font-family: monospace; background: var(--vscode-editor-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 10px; white-space: pre-wrap; word-break: break-word; margin: 0; max-height: 200px; overflow-y: auto; }
    .add-row { display: flex; gap: 8px; margin-top: 10px; }
    .add-row input { flex: 1; padding: 6px 10px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; color: var(--vscode-input-foreground); font-size: 12px; font-family: inherit; }
    .add-row input:focus { outline: none; border-color: var(--vscode-focusBorder); }
    .add-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 6px 14px; font-size: 12px; cursor: pointer; white-space: nowrap; }
  `;
}
