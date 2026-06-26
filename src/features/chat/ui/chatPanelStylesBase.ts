// [SCOPE] Chat Panel CSS chunk 1/3 — CSS variables, body, scrollbar, header, badges
// Imported by chatPanelStyles.ts assembler. Do not import directly.

export function buildChatCssBase(): string {
  return `
    :root {
      --c-bg:        #1a2035;
      --c-surface:   #1e2740;
      --c-raised:    #24304e;
      --c-border:    #2d3a55;
      --c-border-hi: #3d4f6e;
      --c-accent:    #4d9eff;
      --c-accent-lo: rgba(77,158,255,0.14);
      --c-accent-md: rgba(77,158,255,0.28);
      --c-text:      #e8edf8;
      --c-text-dim:  #8899bb;
      --c-text-faint:#4a5a7a;
      --c-green:     #34d399;
      --c-amber:     #fbbf24;
      --c-red:       #f87171;
      --c-purple:    #a78bfa;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--c-bg);
      color: var(--c-text);
      display: flex; flex-direction: column; height: 100vh; overflow: hidden;
      font-size: 13px; line-height: 1.5;
      position: relative;
    }
    #preview-view {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      display: none; flex-direction: column; background: var(--c-bg); z-index: 10;
    }
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--c-border-hi); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--c-text-faint); }
    .header {
      padding: 10px 14px 8px;
      border-bottom: 1px solid var(--c-border);
      display: flex; flex-direction: column; gap: 7px; flex-shrink: 0;
      background: linear-gradient(180deg, #1c2540 0%, var(--c-bg) 100%);
    }
    .header > div:first-child { display: flex; align-items: center; justify-content: space-between; }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .header-right { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .header-top { display: flex; align-items: center; justify-content: space-between; }
    .header-title { font-size: 13px; font-weight: 600; color: var(--c-text); }
    .header-actions { display: flex; gap: 8px; align-items: center; }
    .header strong { letter-spacing: 2px; font-size: 14px; font-weight: 700; }
    .header-btn, .clear-btn, .map-btn {
      background: var(--c-raised); border: 1px solid var(--c-border); color: var(--c-text-dim);
      padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 11px;
      font-family: inherit; transition: all 0.15s; white-space: nowrap;
    }
    .header-btn:hover, .clear-btn:hover, .map-btn:hover {
      background: var(--c-border); color: var(--c-text); border-color: var(--c-border-hi);
    }
    .header-btn--preview { border-color: var(--c-purple); color: var(--c-purple); }
    .header-btn--preview:hover { background: rgba(167,139,250,0.12); color: var(--c-purple); border-color: var(--c-purple); }
    /* ── Live Preview overlay ── */
    .preview-toolbar {
      display: flex; align-items: center; gap: 6px; padding: 5px 10px;
      border-bottom: 1px solid var(--c-border); background: var(--c-surface); flex-shrink: 0;
    }
    .preview-back {
      background: var(--c-raised); border: 1px solid var(--c-border); color: var(--c-text-dim);
      padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-family: inherit;
      transition: all 0.15s;
    }
    .preview-back:hover { background: var(--c-border); color: var(--c-text); }
    .preview-back.active { background: rgba(137,180,250,0.2); color: #89b4fa; border-color: #89b4fa; }
    .preview-device-group { display: flex; gap: 2px; margin: 0 4px; }
    .preview-device-btn {
      background: none; border: 1px solid transparent; color: var(--c-text-dim);
      padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 14px; transition: all 0.15s;
    }
    .preview-device-btn:hover { border-color: var(--c-border); color: var(--c-text); }
    .preview-device-btn.active { border-color: var(--c-accent); color: var(--c-accent); }
    .preview-status { font-size: 11px; color: var(--c-text-dim); white-space: nowrap; }
    .preview-url-bar {
      flex: 1; min-width: 0;
      background: var(--c-raised); border: 1px solid var(--c-border); color: var(--c-text);
      padding: 3px 8px; border-radius: 4px; font-size: 11px; font-family: monospace; outline: none;
    }
    .preview-url-bar:focus { border-color: var(--c-accent); }
    .preview-popout {
      background: var(--c-raised); border: 1px solid var(--c-border); color: var(--c-text-dim);
      padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-family: inherit;
      transition: all 0.15s; white-space: nowrap;
    }
    .preview-popout:hover { background: var(--c-border); color: var(--c-text); }
    .preview-frame-wrap {
      flex: 1; min-height: 0; position: relative; overflow: hidden; display: flex;
      justify-content: center; align-items: stretch; background: #fff;
    }
    .preview-loading {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 12px;
      color: var(--c-text-dim); z-index: 2; background: var(--c-bg);
    }
    .preview-spinner {
      width: 28px; height: 28px; border: 3px solid var(--c-border);
      border-top-color: var(--c-purple); border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    /* ── Preview + inline chat split layout ── */
    #preview-content { flex: 1; min-height: 0; display: flex; flex-direction: row; overflow: hidden; }
    #preview-main { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    #preview-chat-strip {
      flex-shrink: 0; display: flex; flex-direction: column; gap: 6px;
      padding: 8px 10px; background: var(--c-surface); border-top: 1px solid var(--c-border); height: 110px;
    }
    #preview-chat-last {
      flex: 1; overflow-y: auto; font-size: 11px; color: var(--c-text-dim); line-height: 1.4; min-height: 0;
    }
    #preview-chat-input-row { display: flex; gap: 6px; align-items: flex-end; }
    #preview-chat-input {
      flex: 1; background: var(--c-raised); border: 1px solid var(--c-border); color: var(--c-text);
      padding: 6px 8px; border-radius: 6px; font-size: 12px; font-family: inherit; resize: none; outline: none;
    }
    #preview-chat-input:focus { border-color: var(--c-accent); }
    #preview-chat-send-btn {
      background: var(--c-purple); border: none; color: #fff; width: 32px; height: 32px;
      border-radius: 6px; cursor: pointer; font-size: 16px; flex-shrink: 0;
    }
    #preview-chat-send-btn:hover { opacity: 0.85; }
    /* side-by-side layout reserved for future opt-in toggle */
    /* [DEAD] .capabilities-btn removed — replaced by context-sensitive Help button */
    .save-point-btn, .blueprint-btn {
      background: var(--c-accent-lo); border: 1px solid var(--c-accent); color: var(--c-accent);
      padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;
      transition: all 0.15s; font-family: inherit;
    }
    .save-point-btn:hover { background: var(--c-accent-md); color: #fff; }
    .blueprint-btn { border-color: var(--c-purple); color: var(--c-purple); background: rgba(167,139,250,0.12); }
    .blueprint-btn:hover { background: rgba(167,139,250,0.24); color: #fff; }
    .header-badges { display: flex; flex-wrap: wrap; gap: 5px; font-size: 11px; padding: 0 2px; }
    .badge { padding: 3px 8px; border-radius: 20px; font-size: 11px; border: 1px solid transparent; font-weight: 500; }
    .badge.ai.green  { background: rgba(52,211,153,0.12); color: var(--c-green);  border-color: rgba(52,211,153,0.3); }
    .badge.ai.yellow { background: rgba(251,191,36,0.12);  color: var(--c-amber);  border-color: rgba(251,191,36,0.3); }
    .badge.ai.red    { background: rgba(248,113,113,0.12); color: var(--c-red);    border-color: rgba(248,113,113,0.3); }
    .badge.project   { background: var(--c-accent-lo);     color: var(--c-accent); border-color: rgba(77,158,255,0.3); }
    .badge.roster.supervisor { background: var(--c-accent-lo); color: var(--c-accent); border-color: rgba(77,158,255,0.3); }
    .badge.roster.worker     { background: rgba(100,116,139,0.15); color: #94a3b8; border-color: rgba(100,116,139,0.3); }
    .badge.roster.guardian   { background: rgba(251,191,36,0.12);  color: var(--c-amber); border-color: rgba(251,191,36,0.3); }
    .badge.blueprint { background: rgba(167,139,250,0.12); color: var(--c-purple); border-color: rgba(167,139,250,0.3); }
    .badge.session   { background: rgba(52,211,153,0.12);  color: var(--c-green);  border-color: rgba(52,211,153,0.3); }
    .badge.time { opacity: 0.5; }
    .badge.clickable { cursor: pointer; }
    .badge.clickable:hover { opacity: 0.8; filter: brightness(1.1); }
    /* ── Inspector overlay ── */
    #inspector-overlay {
      position: absolute; bottom: 0; left: 0; right: 0; z-index: 20;
      background: var(--c-surface); border-top: 2px solid var(--c-purple);
      padding: 10px 12px; display: none; flex-direction: column; gap: 8px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
    }
    #inspector-el-tag {
      font-size: 11px; font-family: monospace; color: var(--c-purple);
      background: rgba(167,139,250,0.1); padding: 3px 8px; border-radius: 4px;
      border: 1px solid rgba(167,139,250,0.3); display: inline-block; max-width: 100%;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #inspector-input {
      background: var(--c-raised); border: 1px solid var(--c-border); color: var(--c-text);
      padding: 7px 10px; border-radius: 6px; font-size: 12px; font-family: inherit;
      resize: none; outline: none; width: 100%; line-height: 1.4;
    }
    #inspector-input:focus { border-color: var(--c-purple); }
    .inspector-actions { display: flex; gap: 6px; }
    .inspector-send-btn {
      background: var(--c-purple); border: none; color: #fff;
      padding: 5px 14px; border-radius: 6px; cursor: pointer; font-size: 12px;
      font-family: inherit; font-weight: 600; transition: opacity 0.15s;
    }
    .inspector-send-btn:hover { opacity: 0.85; }
    .inspector-cancel-btn {
      background: var(--c-raised); border: 1px solid var(--c-border); color: var(--c-text-dim);
      padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
      font-family: inherit; transition: all 0.15s;
    }
    .inspector-cancel-btn:hover { background: var(--c-border); color: var(--c-text); }
  `;
}
