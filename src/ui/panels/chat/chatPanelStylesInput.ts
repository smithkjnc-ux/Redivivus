// [SCOPE] Chat Panel CSS chunk 3/3 — input area, pills, send button, dynamic panels, functions panel, spinner
// Imported by chatPanelStyles.ts assembler. Do not import directly.

export function buildChatCssInput(): string {
  return `
    #input-area { padding: 10px 14px 13px; background: var(--c-bg); border-top: 1px solid var(--c-border); flex-shrink: 0; }
    #input-card {
      background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 14px; overflow: hidden;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    #input-card:focus-within { border-color: var(--c-accent); box-shadow: 0 0 0 3px var(--c-accent-lo); }
    #input-top { padding: 11px 15px 4px; }
    #message-input {
      width: 100%; background: transparent; color: var(--c-text);
      border: none; outline: none; font-family: inherit; font-size: 13px; resize: none;
      line-height: 1.5; min-height: 22px; max-height: 160px; overflow-y: auto;
      display: block; box-sizing: border-box;
    }
    #message-input::placeholder { color: var(--c-text-faint); }
    #input-bottom {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 9px 8px; gap: 6px;
    }
    #input-left { display: flex; align-items: center; gap: 4px; }
    #input-right { display: flex; align-items: center; gap: 6px; }
    .input-pill {
      display: flex; align-items: center; gap: 4px; padding: 4px 10px;
      background: transparent; color: var(--c-text-dim); border: 1px solid var(--c-border);
      border-radius: 20px; font-size: 11px; font-family: inherit;
      cursor: pointer; white-space: nowrap; transition: all 0.15s;
    }
    .input-pill:hover { background: var(--c-accent-lo); border-color: var(--c-accent); color: var(--c-text); }
    .input-pill--ai { color: var(--c-accent); border-color: rgba(77,158,255,0.3); background: var(--c-accent-lo); }
    .input-pill--ai:hover { background: var(--c-accent-md); }
    .input-pill--run { color: #4ec959; border-color: rgba(78,201,89,0.35); }
    .input-pill--run:hover { background: rgba(78,201,89,0.12); border-color: #4ec959; }
    .input-pill[data-cmd] { cursor: pointer; }
    #send-btn {
      width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer;
      background: linear-gradient(135deg, #2563eb, #4d9eff);
      color: #fff; font-size: 15px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; flex-shrink: 0; box-shadow: 0 2px 10px rgba(77,158,255,0.4);
    }
    #send-btn:hover { transform: scale(1.08); box-shadow: 0 4px 16px rgba(77,158,255,0.55); }
    #send-btn:disabled { opacity: 0.3; cursor: default; transform: none; box-shadow: none; }
    #stats { font-size: 10px; color: var(--c-text-faint); white-space: nowrap; cursor: default; user-select: none; }
    #getting-started, .dynamic-panel {
      background: var(--c-surface); border-bottom: 1px solid var(--c-border); flex-shrink: 0;
    }
    .gs-header, .dp-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 11px 16px; background: var(--c-raised); border-bottom: 1px solid var(--c-border);
    }
    .gs-title, .dp-title { font-weight: 700; font-size: 13px; color: var(--c-text); }
    .gs-close, .dp-close {
      background: transparent; border: none; color: var(--c-text-dim);
      font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1; transition: color 0.15s;
    }
    .gs-close:hover, .dp-close:hover { color: var(--c-text); }
    .gs-content, .dp-content { padding: 16px; max-height: 350px; overflow-y: auto; font-size: 13px; line-height: 1.5; }
    .gs-section { margin-bottom: 18px; }
    .gs-section h3 { font-size: 13px; font-weight: 700; margin-bottom: 8px; color: var(--c-text); }
    .gs-section p { font-size: 12px; line-height: 1.6; color: var(--c-text-dim); margin-bottom: 10px; }
    .gs-section ul, .gs-section ol { margin: 8px 0; padding-left: 18px; font-size: 12px; color: var(--c-text-dim); }
    .gs-section li { margin-bottom: 6px; line-height: 1.5; }
    .gs-section strong { color: var(--c-text); }
    .gs-tip {
      background: rgba(52,211,153,0.08); border-left: 3px solid var(--c-green);
      padding: 10px 13px; font-size: 12px; border-radius: 0 6px 6px 0; color: var(--c-text-dim);
    }
    #redivivus-functions {
      border-top: 1px solid var(--c-border); padding: 11px 15px;
      background: var(--c-surface); flex-shrink: 0;
    }
    .func-section { margin-bottom: 10px; }
    .func-section:last-child { margin-bottom: 0; }
    .func-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px;
      color: var(--c-text-faint); margin-bottom: 6px; display: block;
    }
    .func-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
    .func-btn {
      background: var(--c-accent-lo); color: var(--c-accent); border: 1px solid rgba(77,158,255,0.3);
      border-radius: 6px; padding: 6px 11px; font-size: 11px;
      cursor: pointer; display: flex; align-items: center; gap: 4px;
      transition: all 0.15s; font-family: inherit;
    }
    .func-btn:hover { background: var(--c-accent-md); color: #fff; border-color: var(--c-accent); }
    .func-btn.secondary { background: var(--c-raised); color: var(--c-text-dim); border: 1px solid var(--c-border); }
    .func-btn.secondary:hover { background: var(--c-border); color: var(--c-text); }
    #redivivus-status { font-size: 11px; color: var(--c-text-faint); }
    #redivivus-status.redivivus-working { color: var(--c-accent) !important; font-weight: 600; letter-spacing: 0.3px; }
    #redivivus-status.redivivus-working::before {
      content: ''; display: inline-block; width: 9px; height: 9px;
      border: 2px solid var(--c-accent-md); border-top-color: var(--c-accent);
      border-radius: 50%; animation: redivivus-spin 0.7s linear infinite;
      margin-right: 5px; vertical-align: middle;
    }
    @keyframes redivivus-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `;
}
