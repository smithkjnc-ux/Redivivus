// [SCOPE] Redivivus API Setup Styles — CSS template for the API key configuration webview panel
// Extracted from apiSetupHtml.ts to maintain strict < 200 line constraint (Rule 9).

export const API_SETUP_CSS = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; max-width: 640px; margin: 0 auto; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    h1 { font-size: 24px; margin-bottom: 4px; color: var(--vscode-foreground); }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 8px; font-size:13px; }
    .free-tip { background: rgba(26,122,58,0.12); border:1px solid #1a7a3a50; border-radius:8px; padding:10px 14px; margin-bottom:18px; font-size:12px; color:var(--vscode-foreground); }
    .free-tip strong { color:#4ec959; }
    .provider { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; transition: opacity 0.2s, border-color 0.2s, box-shadow 0.2s; position: relative; }
    .provider-disabled { opacity: 0.65; border-color: rgba(255,165,0,0.25); }
    .provider-active {
      border-left: 4px solid var(--vscode-focusBorder);
      box-shadow: 0 0 10px rgba(0, 120, 212, 0.15);
    }
    .active-dot {
      width: 8px;
      height: 8px;
      background-color: #4ec959;
      border-radius: 50%;
      display: inline-block;
      box-shadow: 0 0 8px #4ec959;
      animation: pulse-green 2.5s infinite;
      flex-shrink: 0;
    }
    @keyframes pulse-green {
      0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(78, 201, 89, 0.7); }
      70% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(78, 201, 89, 0); }
      100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(78, 201, 89, 0); }
    }
    .provider-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap:wrap; gap:6px; }
    .provider-name { font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 8px; }
    .provider-type-badge { font-size:10px; font-weight:600; padding:1px 7px; border-radius:10px; vertical-align:middle; white-space:nowrap; }
    .provider-status { font-size: 12px; padding: 2px 8px; border-radius: 12px; white-space:nowrap; display: inline-flex; align-items: center; font-weight: 600; }
    .status-ok { background: rgba(78,201,89,0.2); color: #4ec959; }
    .status-disabled { background: rgba(255,165,0,0.2); color: #ffa500; }
    .status-missing { background: rgba(255,83,79,0.2); color: #ff534f; }
    
    .btn-toggle { padding: 4px 10px; font-size: 11px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; transition: opacity 0.2s; }
    .btn-toggle:hover { opacity: 0.85; }
    .btn-enable { background: rgba(78,201,89,0.2); color: #4ec959; border: 1px solid rgba(78,201,89,0.4); }
    .btn-disable { background: rgba(255,83,79,0.2); color: #ff534f; border: 1px solid rgba(255,83,79,0.4); }

    .provider-roles { display: flex; gap: 6px; margin-top: 10px; margin-bottom: 4px; flex-wrap: wrap; }
    .badge { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; }
    .badge-supervisor { background: rgba(0,120,212,0.15); color: #4fc1ff; border: 1px solid rgba(0,120,212,0.3); }
    .badge-worker { background: rgba(204,204,204,0.15); color: #cccccc; border: 1px solid rgba(204,204,204,0.3); }
    .badge-guardian { background: rgba(218,165,32,0.15); color: #daa520; border: 1px solid rgba(218,165,32,0.3); }

    .provider-desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; line-height:1.5; }
    input { width: 100%; box-sizing:border-box; padding: 7px 10px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; color: var(--vscode-input-foreground); font-family: monospace; font-size: 12px; }
    input:focus { outline: none; border-color: var(--vscode-focusBorder); }
    input:disabled { opacity: 0.6; cursor: not-allowed; }

    .provider-meta { display: flex; justify-content: space-between; font-size: 10px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--vscode-input-border); opacity: 0.85; }
    .provider-meta code { font-family: monospace; background: var(--vscode-editor-background); padding: 1px 4px; border-radius: 3px; }

    .actions { margin-top: 20px; display: flex; gap: 12px; justify-content: center; }
    button { padding: 9px 22px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; }
    button:hover { opacity:0.85; }
    button.secondary { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .apply-feedback { margin-top:14px; padding:10px 14px; background:rgba(78,201,89,0.1); border-left:3px solid #4ec959; border-radius:0 4px 4px 0; display:none; font-size:13px; }
    .apply-feedback.show { display:block; }
    .tip { margin-top:20px; padding:10px 14px; background:var(--vscode-input-background); border-radius:6px; font-size:11px; color:var(--vscode-descriptionForeground); }
`;
