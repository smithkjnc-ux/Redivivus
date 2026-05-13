// [SCOPE] Recommendations panel CSS styles
export const RECOMMENDATIONS_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 24px; max-width: 820px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 300; letter-spacing: 4px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 28px; }
  .section { margin-bottom: 24px; border: 1px solid var(--vscode-input-border, #334455); border-radius: 8px; overflow: hidden; }
  .section-header { padding: 12px 16px; font-size: 14px; font-weight: 600; }
  .overview { background: rgba(59,157,255,0.1); border-bottom: 1px solid var(--vscode-input-border, #334455); }
  .warn-header { background: rgba(245,166,35,0.1); border-bottom: 1px solid rgba(245,166,35,0.25); color: #f5a623; }
  .neutral-header { background: rgba(100,100,100,0.1); border-bottom: 1px solid var(--vscode-input-border, #334455); }
  .next-header { background: rgba(78,201,89,0.1); border-bottom: 1px solid rgba(78,201,89,0.25); color: #4ec959; }
  .section-why { padding: 12px 16px; font-size: 12px; color: var(--vscode-descriptionForeground); line-height: 1.6; border-bottom: 1px solid var(--vscode-input-border, #334455); }
  .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; background: var(--vscode-input-border, #334455); }
  .stat { background: var(--vscode-editor-background); padding: 16px 12px; text-align: center; }
  .stat.warn .stat-num { color: #f5a623; }
  .stat.ok .stat-num { color: #4ec959; }
  .stat-num { font-size: 26px; font-weight: 600; line-height: 1; margin-bottom: 4px; }
  .stat-label { font-size: 10px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.5px; }
  .item-list { padding: 8px 0; }
  .item-row { display: flex; align-items: center; gap: 10px; padding: 7px 16px; font-size: 12px; border-bottom: 1px solid var(--vscode-input-border, #334455); flex-wrap: wrap; }
  .item-row:last-child { border-bottom: none; }
  .item-row.col { flex-direction: column; align-items: flex-start; gap: 4px; }
  .item-file { font-family: monospace; font-size: 11px; color: var(--vscode-textLink-foreground); flex: 1; }
  .item-badge { padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; flex-shrink: 0; }
  .warn-badge { background: rgba(245,166,35,0.15); color: #f5a623; }
  .neutral-badge { background: rgba(100,100,100,0.15); color: var(--vscode-descriptionForeground); }
  .todo-line-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 2px 0; }
  .todo-line { font-family: monospace; font-size: 11px; color: var(--vscode-descriptionForeground); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-more { font-size: 11px; color: var(--vscode-descriptionForeground); padding: 4px 16px; font-style: italic; }
  .fix-btn { flex-shrink: 0; cursor: pointer; border: 1px solid rgba(59,157,255,0.4); background: rgba(59,157,255,0.08); color: var(--vscode-textLink-foreground); border-radius: 4px; padding: 3px 10px; font-size: 11px; font-family: inherit; transition: background 0.15s; white-space: nowrap; }
  .fix-btn:hover { background: rgba(59,157,255,0.18); }
  .fix-btn.working { border-color: rgba(245,166,35,0.5); background: rgba(245,166,35,0.15); color: #f5a623; }
  .fix-btn.done { border-color: rgba(78,201,89,0.5); background: rgba(78,201,89,0.1); color: #4ec959; }
  .fix-btn.failed { border-color: rgba(234,67,53,0.5); background: rgba(234,67,53,0.1); color: #ea4335; }
  .fix-btn.copied { border-color: rgba(78,201,89,0.5); background: rgba(78,201,89,0.1); color: #4ec959; }
  .fix-btn.pending { border-color: rgba(245,166,35,0.5); background: rgba(245,166,35,0.15); color: #f5a623; }
  .done-btn { flex-shrink: 0; cursor: pointer; border: 1px solid rgba(78,201,89,0.3); background: transparent; color: var(--vscode-descriptionForeground); border-radius: 4px; padding: 3px 10px; font-size: 11px; font-family: inherit; transition: all 0.15s; white-space: nowrap; margin-left: 2px; }
  .done-btn:hover { border-color: rgba(78,201,89,0.7); color: #4ec959; background: rgba(78,201,89,0.08); }
  .item-row.resolved { background: rgba(78,201,89,0.06); border-left: 3px solid #4ec959; opacity: 0.75; }
  .item-row.resolved .item-file { text-decoration: line-through; color: var(--vscode-descriptionForeground); }
  .resolved-badge { color: #4ec959; font-size: 12px; font-weight: 600; margin-left: 6px; flex-shrink: 0; }
  .next-list { padding: 10px 16px; list-style: none; }
  .next-list li { display: flex; align-items: center; gap: 10px; font-size: 13px; line-height: 1.7; padding: 6px 0; border-bottom: 1px solid var(--vscode-input-border, #334455); }
  .next-list li:last-child { border-bottom: none; }
  .next-list li span { flex: 1; }
  code { font-family: monospace; font-size: 11px; background: rgba(100,100,100,0.2); padding: 1px 5px; border-radius: 3px; }
  .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(78,201,89,0.15); border: 1px solid rgba(78,201,89,0.4); color: #4ec959; padding: 10px 20px; border-radius: 6px; font-size: 13px; display: none; z-index: 999; }
  .fix-all-bar { display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: rgba(59,157,255,0.04); border-bottom: 1px solid var(--vscode-input-border, #334455); }
  .fix-all-btn { cursor: pointer; border: 1px solid rgba(59,157,255,0.5); background: rgba(59,157,255,0.1); color: var(--vscode-textLink-foreground); border-radius: 5px; padding: 5px 14px; font-size: 12px; font-weight: 600; font-family: inherit; transition: background 0.15s; white-space: nowrap; }
  .fix-all-btn:hover { background: rgba(59,157,255,0.22); }
  .fix-all-btn.running { border-color: rgba(245,166,35,0.6); background: rgba(245,166,35,0.15); color: #f5a623; cursor: not-allowed; }
  .fix-all-btn.done { border-color: rgba(78,201,89,0.6); background: rgba(78,201,89,0.12); color: #4ec959; cursor: default; }
  .fix-all-status { font-size: 11px; color: var(--vscode-descriptionForeground); flex: 1; }
`;
