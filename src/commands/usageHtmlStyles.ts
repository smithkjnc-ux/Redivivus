// [SCOPE] Usage report webview CSS — extracted from usageHtmlTemplate.ts
// Imported by getUsageHtml() in usageHtmlTemplate.ts.

export function getUsageCss(): string {
  return `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 20px; max-width: 700px; margin: 0 auto;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 24px; }
    .period-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px; margin-bottom: 24px;
    }
    .period-card {
      background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border);
      border-radius: 8px; padding: 16px;
    }
    .period-card.lifetime {
      background: linear-gradient(135deg, rgba(78,201,89,0.1), rgba(59,130,246,0.1));
      border-color: #4ec959;
    }
    .period-title { font-weight: 600; font-size: 14px; margin-bottom: 12px; color: var(--vscode-editor-foreground); }
    .period-stat { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
    .period-stat-label { color: var(--vscode-descriptionForeground); }
    .period-stat-value { font-weight: 500; }
    .period-stat-value.cost { color: #4ec959; }
    .ai-breakdown-container {
      margin-top: 12px; padding-top: 12px;
      border-top: 1px solid var(--vscode-input-border); font-size: 12px;
    }
    .ai-breakdown { display: flex; justify-content: space-between; margin-bottom: 4px; padding: 2px 0; }
    .ai-name { color: var(--vscode-descriptionForeground); }
    .ai-stats { color: var(--vscode-editor-foreground); font-family: monospace; }
    .lifetime-notice {
      background: rgba(78,201,89,0.1); border-left: 3px solid #4ec959;
      padding: 12px; border-radius: 0 4px 4px 0; margin-top: 16px; font-size: 13px;
    }
    .lifetime-notice strong { color: #4ec959; }
    .actions { margin-top: 24px; display: flex; gap: 8px; flex-wrap: wrap; }
    button {
      padding: 8px 16px; background: var(--vscode-button-background);
      color: var(--vscode-button-foreground); border: none; border-radius: 4px;
      cursor: pointer; font-size: 12px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
    }
    button.danger { background: rgba(255,83,79,0.2); color: #ff534f; }
    .tip {
      margin-top: 24px; padding: 12px; background: var(--vscode-input-background);
      border-radius: 6px; font-size: 12px; color: var(--vscode-descriptionForeground);
    }
  `;
}
